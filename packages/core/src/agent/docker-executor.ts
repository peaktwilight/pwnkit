/**
 * Docker executor — runs agent bash commands inside a Kali Linux container.
 *
 * Provides a full pentesting toolset (nmap, sqlmap, metasploit, nikto, etc.)
 * in an isolated environment, similar to BoxPwnr's approach.
 *
 * Usage:
 *   const docker = DockerExecutor.getInstance();
 *   await docker.ensureRunning();
 *   const result = await docker.exec("nmap -sV target.com", 60);
 *   await docker.stop();
 */

import { execSync, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const KALI_IMAGE = "kalilinux/kali-rolling";
const CONTAINER_PREFIX = "pwnkit-kali";

/** Packages to install inside the Kali container on first boot. */
const PENTEST_PACKAGES = [
  "nmap",
  "sqlmap",
  "nikto",
  "gobuster",
  "dirb",
  "hydra",
  "john",
  "whatweb",
  "wfuzz",
  "ffuf",
  "seclists",
  "curl",
  "wget",
  "netcat-openbsd",
  "python3",
  "python3-pip",
];

export interface DockerExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export class DockerExecutor {
  private static instance: DockerExecutor | null = null;

  private containerId: string | null = null;
  private containerName: string;
  private ready = false;
  private targetEnv: string = "";

  private constructor() {
    this.containerName = `${CONTAINER_PREFIX}-${randomUUID().slice(0, 8)}`;
  }

  /** Singleton — one container per process. */
  static getInstance(): DockerExecutor {
    if (!DockerExecutor.instance) {
      DockerExecutor.instance = new DockerExecutor();
    }
    return DockerExecutor.instance;
  }

  /** Reset the singleton (for testing). */
  static resetInstance(): void {
    DockerExecutor.instance = null;
  }

  /** Set the TARGET environment variable inside the container. */
  setTarget(target: string): void {
    this.targetEnv = target;
  }

  /** Start the Kali container if not already running, install tools. */
  async ensureRunning(): Promise<void> {
    if (this.ready && this.containerId && this.isContainerAlive()) {
      return;
    }

    this.assertDockerAvailable();

    // Pull image if not present (best-effort, may already be cached)
    try {
      execSync(`docker image inspect ${KALI_IMAGE} > /dev/null 2>&1`, {
        timeout: 5_000,
      });
    } catch {
      // Image not found locally — pull it
      execSync(`docker pull ${KALI_IMAGE}`, {
        timeout: 300_000, // 5 min for pull
        stdio: "pipe",
      });
    }

    // Start the container with:
    //  - shared /tmp/pwnkit-shared volume for file exchange
    //  - host networking so it can reach targets
    //  - long-running sleep to keep it alive
    const runCmd = [
      "docker",
      "run",
      "-d",
      "--name",
      this.containerName,
      "--network",
      "host",
      "-v",
      "/tmp/pwnkit-shared:/shared",
      "-e",
      `TARGET=${this.targetEnv}`,
      KALI_IMAGE,
      "sleep",
      "infinity",
    ];

    const id = execFileSync(runCmd[0], runCmd.slice(1), {
      timeout: 30_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    this.containerId = id;

    // Install pentest tools
    const installCmd = `apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ${PENTEST_PACKAGES.join(" ")}`;
    this.dockerExecSync(installCmd, 600_000); // 10 min for install

    this.ready = true;
  }

  /**
   * Execute a command inside the Kali container.
   * Returns structured result with stdout, stderr, exit code, and timeout flag.
   */
  async exec(command: string, timeoutSec: number = 30): Promise<DockerExecResult> {
    if (!this.containerId || !this.ready) {
      await this.ensureRunning();
    }

    const timeoutMs = timeoutSec * 1000;

    try {
      const stdout = execFileSync(
        "docker",
        ["exec", "-e", `TARGET=${this.targetEnv}`, this.containerId!, "bash", "-c", command],
        {
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024, // 1MB
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      return {
        stdout: stdout ?? "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      };
    } catch (err: any) {
      if (err.killed) {
        return {
          stdout: (err.stdout as string) ?? "",
          stderr: (err.stderr as string) ?? "",
          exitCode: -1,
          timedOut: true,
        };
      }

      return {
        stdout: (err.stdout as string) ?? "",
        stderr: (err.stderr as string) ?? "",
        exitCode: err.status ?? 1,
        timedOut: false,
      };
    }
  }

  /** Stop and remove the container. */
  async stop(): Promise<void> {
    if (!this.containerId) return;

    try {
      execSync(`docker rm -f ${this.containerId}`, {
        timeout: 15_000,
        stdio: "pipe",
      });
    } catch {
      // Best-effort cleanup
    }

    this.containerId = null;
    this.ready = false;
    DockerExecutor.instance = null;
  }

  /** Check if container is still running. */
  private isContainerAlive(): boolean {
    if (!this.containerId) return false;
    try {
      const status = execSync(
        `docker inspect -f '{{.State.Running}}' ${this.containerId}`,
        { timeout: 5_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
      return status === "true";
    } catch {
      return false;
    }
  }

  /** Run a command inside the container synchronously (used during setup). */
  private dockerExecSync(command: string, timeoutMs: number): string {
    return execFileSync(
      "docker",
      ["exec", this.containerId!, "bash", "-c", command],
      {
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  }

  /** Throw if Docker CLI is not available. */
  private assertDockerAvailable(): void {
    try {
      execSync("docker info > /dev/null 2>&1", { timeout: 10_000 });
    } catch {
      throw new Error(
        "Docker is not available. Install Docker and ensure the daemon is running to use --docker mode.",
      );
    }
  }
}

/**
 * Convenience function for use in the tool executor.
 * Matches the same interface pattern as shellExec.
 */
export async function execInDocker(
  command: string,
  timeout: number,
  target?: string,
): Promise<{ output: string; timedOut: boolean; exitCode: number }> {
  const docker = DockerExecutor.getInstance();
  if (target) docker.setTarget(target);
  await docker.ensureRunning();

  const result = await docker.exec(command, timeout);
  const output = (result.stdout + "\n" + result.stderr).trim();

  return {
    output,
    timedOut: result.timedOut,
    exitCode: result.exitCode,
  };
}
