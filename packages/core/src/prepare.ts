import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type { ScanListener } from "./scanner.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TargetType = "npm-package" | "source-code" | "url" | "web-app";

export interface PrepareResult {
  targetType: TargetType;
  resolvedTarget: string; // local path or URL
  packageInfo?: { name: string; version: string; path: string; tempDir: string };
  repoPath?: string;
  cleanup: () => void;
}

export interface PrepareOptions {
  packageVersion?: string;
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Target detection
// ---------------------------------------------------------------------------

export function detectTargetType(target: string): TargetType {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    if (
      target.startsWith("https://github.com/") ||
      target.startsWith("git@")
    ) {
      return "source-code";
    }
    return "url";
  }
  if (target.startsWith("./") || target.startsWith("/") || target === ".") {
    return "source-code";
  }
  if (/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*(@.*)?$/.test(target)) {
    return "npm-package";
  }
  return "source-code";
}

// ---------------------------------------------------------------------------
// Internal helpers (extracted from audit.ts and review.ts)
// ---------------------------------------------------------------------------

interface InstalledPackage {
  name: string;
  version: string;
  path: string;
  tempDir: string;
}

/**
 * Install an npm package in a temporary directory and return its metadata.
 * Extracted from audit.ts `installPackage()`.
 */
function installPackage(
  packageName: string,
  requestedVersion: string | undefined,
  emit: ScanListener,
): InstalledPackage {
  const tempDir = join(tmpdir(), `pwnkit-audit-${randomUUID().slice(0, 8)}`);
  mkdirSync(tempDir, { recursive: true });

  const spec = requestedVersion
    ? `${packageName}@${requestedVersion}`
    : `${packageName}@latest`;

  emit({
    type: "stage:start",
    stage: "discovery",
    message: `Installing ${spec}...`,
  });

  try {
    execFileSync("npm", ["init", "-y", "--silent"], {
      cwd: tempDir,
      timeout: 15_000,
      stdio: "pipe",
    });

    execFileSync(
      "npm",
      ["install", spec, "--ignore-scripts", "--no-audit", "--no-fund"],
      {
        cwd: tempDir,
        timeout: 120_000,
        stdio: "pipe",
      },
    );
  } catch (err) {
    rmSync(tempDir, { recursive: true, force: true });
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to install ${spec}: ${msg}`);
  }

  const pkgJsonPath = join(tempDir, "node_modules", packageName, "package.json");
  if (!existsSync(pkgJsonPath)) {
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error(
      `Package ${packageName} not found after install. Check the package name.`,
    );
  }

  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  const installedVersion = pkgJson.version as string;
  const packagePath = join(tempDir, "node_modules", packageName);

  emit({
    type: "stage:end",
    stage: "discovery",
    message: `Installed ${packageName}@${installedVersion}`,
  });

  return {
    name: packageName,
    version: installedVersion,
    path: packagePath,
    tempDir,
  };
}

/**
 * Resolve a repo path: if it's a URL, clone it; if local, use as-is.
 * Extracted from review.ts `resolveRepo()`.
 */
function resolveRepo(
  repo: string,
  emit: ScanListener,
): { repoPath: string; cloned: boolean; tempDir?: string } {
  const isUrl =
    repo.startsWith("https://") ||
    repo.startsWith("http://") ||
    repo.startsWith("git@") ||
    repo.startsWith("git://");

  if (!isUrl) {
    const absPath = resolve(repo);
    if (!existsSync(absPath)) {
      throw new Error(`Repository path not found: ${absPath}`);
    }
    return { repoPath: absPath, cloned: false };
  }

  const tempDir = join(tmpdir(), `pwnkit-review-${randomUUID().slice(0, 8)}`);
  mkdirSync(tempDir, { recursive: true });

  emit({
    type: "stage:start",
    stage: "discovery",
    message: `Cloning ${repo}...`,
  });

  try {
    execFileSync("git", ["clone", "--depth", "1", repo, `${tempDir}/repo`], {
      timeout: 120_000,
      stdio: "pipe",
    });
  } catch (err) {
    rmSync(tempDir, { recursive: true, force: true });
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to clone ${repo}: ${msg}`);
  }

  const repoPath = join(tempDir, "repo");

  emit({
    type: "stage:end",
    stage: "discovery",
    message: `Cloned ${basename(repo.replace(/\.git$/, ""))}`,
  });

  return { repoPath, cloned: true, tempDir };
}

/**
 * Validate that a URL is reachable (HEAD request with a short timeout).
 */
async function validateUrl(url: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`URL returned HTTP ${res.status}: ${url}`);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`URL unreachable (timeout): ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Main prepare() entry point
// ---------------------------------------------------------------------------

/**
 * Prepare a target for scanning. Handles npm packages, source repos, and URLs.
 *
 * Returns a `PrepareResult` containing the resolved local path (or URL), any
 * package/repo metadata, and a `cleanup()` function the caller must invoke
 * when done.
 */
export async function prepare(
  target: string,
  type: TargetType,
  opts: PrepareOptions,
  emit: ScanListener,
): Promise<PrepareResult> {
  switch (type) {
    case "npm-package": {
      // Strip trailing @version from the target string if present so
      // installPackage receives a clean package name.
      let packageName = target;
      let version = opts.packageVersion;
      const atIdx = target.startsWith("@")
        ? target.indexOf("@", 1)
        : target.indexOf("@");
      if (atIdx > 0) {
        packageName = target.slice(0, atIdx);
        version = version ?? target.slice(atIdx + 1);
      }

      const pkg = installPackage(packageName, version, emit);
      return {
        targetType: type,
        resolvedTarget: pkg.path,
        packageInfo: pkg,
        cleanup: () => {
          try {
            rmSync(pkg.tempDir, { recursive: true, force: true });
          } catch {
            // ignore
          }
        },
      };
    }

    case "source-code": {
      const { repoPath, cloned, tempDir } = resolveRepo(target, emit);
      return {
        targetType: type,
        resolvedTarget: repoPath,
        repoPath,
        cleanup: () => {
          if (cloned && tempDir) {
            try {
              rmSync(tempDir, { recursive: true, force: true });
            } catch {
              // ignore
            }
          }
        },
      };
    }

    case "url":
    case "web-app": {
      await validateUrl(target);
      emit({
        type: "stage:end",
        stage: "discovery",
        message: `URL reachable: ${target}`,
      });
      return {
        targetType: type,
        resolvedTarget: target,
        cleanup: () => {
          /* nothing to clean up */
        },
      };
    }

    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown target type: ${_exhaustive}`);
    }
  }
}
