/**
 * Nightfang Badge Service
 *
 * Generates SVG badges for repos scanned by Nightfang.
 *
 * Routes:
 *   /badge/<owner>/<repo>         — scan status badge
 *   /badge/<owner>/<repo>.svg     — same, explicit SVG
 *   /badge/<owner>/<repo>/shield  — shields.io JSON endpoint
 *
 * The badge checks the GitHub Actions "Self-Scan" workflow status
 * and returns a styled SVG badge showing the result.
 */

interface Env {
  // Optional: KV namespace for caching badge data
  BADGE_CACHE?: KVNamespace;
}

interface BadgeData {
  label: string;
  message: string;
  color: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  lastScan?: string;
}

// Cache badge data for 5 minutes
const CACHE_TTL = 300;

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const pathParts = url.pathname
    .replace(/^\/badge\//, "")
    .replace(/\.svg$/, "")
    .split("/")
    .filter(Boolean);

  // Expect: owner/repo or owner/repo/shield
  if (pathParts.length < 2) {
    return renderBadge({
      label: "nightfang",
      message: "invalid",
      color: "#999",
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    });
  }

  const owner = pathParts[0];
  const repo = pathParts[1];
  const isShield = pathParts[2] === "shield";

  // Try to get badge data
  const data = await getBadgeData(owner, repo, context.env);

  if (isShield) {
    // Shields.io endpoint JSON format
    return new Response(
      JSON.stringify({
        schemaVersion: 1,
        label: data.label,
        message: data.message,
        color: data.color.replace("#", ""),
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${CACHE_TTL}`,
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  return renderBadge(data);
};

async function getBadgeData(
  owner: string,
  repo: string,
  env: Env,
): Promise<BadgeData> {
  const cacheKey = `badge:${owner}/${repo}`;

  // Check KV cache
  if (env.BADGE_CACHE) {
    const cached = await env.BADGE_CACHE.get(cacheKey, "json");
    if (cached) return cached as BadgeData;
  }

  // Fetch from GitHub Actions — check for nightfang self-scan workflow
  try {
    const workflowRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "nightfang-badge/1.0",
        },
      },
    );

    if (!workflowRes.ok) {
      return makeUnknownBadge();
    }

    const workflows = (await workflowRes.json()) as {
      workflows: Array<{ id: number; name: string; path: string }>;
    };

    // Find nightfang-related workflows
    const nightfangWorkflow = workflows.workflows.find(
      (w) =>
        w.name.toLowerCase().includes("nightfang") ||
        w.name.toLowerCase().includes("self-scan") ||
        w.path.includes("nightfang"),
    );

    if (!nightfangWorkflow) {
      return makeUnknownBadge();
    }

    // Get latest run
    const runsRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${nightfangWorkflow.id}/runs?per_page=1&status=completed`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "nightfang-badge/1.0",
        },
      },
    );

    if (!runsRes.ok) {
      return makeUnknownBadge();
    }

    const runs = (await runsRes.json()) as {
      workflow_runs: Array<{
        conclusion: string;
        updated_at: string;
        html_url: string;
      }>;
    };

    const latestRun = runs.workflow_runs[0];
    if (!latestRun) {
      return makeUnknownBadge();
    }

    // Try to get scan results from README (parse the SELF-SCAN markers)
    const readmeRes = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`,
      { headers: { "User-Agent": "nightfang-badge/1.0" } },
    );

    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    if (readmeRes.ok) {
      const readme = await readmeRes.text();
      const scanMatch = readme.match(
        /<!-- SELF-SCAN-START -->([\s\S]*?)<!-- SELF-SCAN-END -->/,
      );
      if (scanMatch) {
        const scanBlock = scanMatch[1];
        const summaryMatch = scanBlock.match(
          /(\d+)\s*critical.*?(\d+)\s*high.*?(\d+)\s*medium/i,
        );
        if (summaryMatch) {
          critical = parseInt(summaryMatch[1], 10);
          high = parseInt(summaryMatch[2], 10);
          medium = parseInt(summaryMatch[3], 10);
        }
      }
    }

    const success = latestRun.conclusion === "success";
    const hasFindings = critical > 0 || high > 0;

    let message: string;
    let color: string;

    if (!success) {
      message = "error";
      color = "#e05d44"; // red
    } else if (critical > 0) {
      message = `${critical} critical`;
      color = "#e05d44"; // red
    } else if (high > 0) {
      message = `${high} high`;
      color = "#fe7d37"; // orange
    } else if (medium > 0) {
      message = `${medium} issues`;
      color = "#dfb317"; // yellow
    } else {
      message = "verified";
      color = "#3fb950"; // green
    }

    const data: BadgeData = {
      label: "nightfang",
      message,
      color,
      critical,
      high,
      medium,
      low,
      lastScan: latestRun.updated_at,
    };

    // Cache the result
    if (env.BADGE_CACHE) {
      await env.BADGE_CACHE.put(cacheKey, JSON.stringify(data), {
        expirationTtl: CACHE_TTL,
      });
    }

    return data;
  } catch {
    return makeUnknownBadge();
  }
}

function makeUnknownBadge(): BadgeData {
  return {
    label: "nightfang",
    message: "not scanned",
    color: "#999",
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
}

function renderBadge(data: BadgeData): Response {
  // Measure text widths (approximate: 6.5px per char at 11px font)
  const labelWidth = data.label.length * 6.5 + 12;
  const messageWidth = data.message.length * 6.5 + 12;
  const totalWidth = labelWidth + messageWidth;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${data.label}: ${data.message}">
  <title>${data.label}: ${data.message}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#0a0a0a"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${data.color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(data.label)}</text>
    <text x="${labelWidth / 2}" y="14">${escapeXml(data.label)}</text>
    <text aria-hidden="true" x="${labelWidth + messageWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(data.message)}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${escapeXml(data.message)}</text>
  </g>
  <!-- nightfang fang icon -->
  <g transform="translate(2, 2) scale(0.65)">
    <path d="M8 4 L12 1 L16 4 L16 10 L14 13 L12 10 L10 13 L8 10Z" fill="none" stroke="#DC2626" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="10.5" cy="7" r="0.8" fill="#DC2626"/>
    <circle cx="13.5" cy="7" r="0.8" fill="#DC2626"/>
  </g>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
