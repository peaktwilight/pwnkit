import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { URL } from "node:url";
import type { Command } from "commander";
import chalk from "chalk";
import type { FindingTriageStatus } from "@pwnkit/shared";

type DashboardOptions = {
  dbPath?: string;
  port?: string;
  host?: string;
  noOpen?: boolean;
};

type DBFindingRow = {
  id: string;
  scanId: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  status: string;
  fingerprint?: string | null;
  triageStatus?: string | null;
  triageNote?: string | null;
  timestamp: number;
  score?: number | null;
  confidence?: number | null;
  evidenceRequest: string;
  evidenceResponse: string;
  evidenceAnalysis?: string | null;
};

type DBScanRow = {
  id: string;
  target: string;
  depth: string;
  runtime: string;
  mode: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  summary?: string | null;
};

const VALID_TRIAGE_STATUSES = new Set<FindingTriageStatus>(["new", "accepted", "suppressed"]);

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  execFile(cmd, args, () => {});
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function text(res: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8"): void {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function normalizeTriageStatus(value?: string | null): FindingTriageStatus {
  return value && VALID_TRIAGE_STATUSES.has(value as FindingTriageStatus)
    ? value as FindingTriageStatus
    : "new";
}

function parseSummary(summary?: string | null): Record<string, number> {
  if (!summary) return {};
  try {
    return JSON.parse(summary) as Record<string, number>;
  } catch {
    return {};
  }
}

function summarizeScan(scan: DBScanRow) {
  const summary = parseSummary(scan.summary);
  return {
    id: scan.id,
    target: scan.target,
    depth: scan.depth,
    runtime: scan.runtime,
    mode: scan.mode,
    status: scan.status,
    startedAt: scan.startedAt,
    completedAt: scan.completedAt ?? null,
    durationMs: scan.durationMs ?? null,
    summary: {
      totalFindings: summary.totalFindings ?? 0,
      critical: summary.critical ?? 0,
      high: summary.high ?? 0,
      medium: summary.medium ?? 0,
      low: summary.low ?? 0,
      info: summary.info ?? 0,
    },
  };
}

function groupFindings(rows: DBFindingRow[]) {
  const map = new Map<string, DBFindingRow[]>();
  for (const row of rows) {
    const key = row.fingerprint ?? row.id;
    const list = map.get(key) ?? [];
    list.push({
      ...row,
      triageStatus: normalizeTriageStatus(row.triageStatus),
    });
    map.set(key, list);
  }

  return [...map.entries()]
    .map(([fingerprint, items]) => {
      const sorted = items.sort((a, b) => b.timestamp - a.timestamp);
      const latest = sorted[0];
      return {
        fingerprint,
        latest,
        count: sorted.length,
        scanCount: new Set(sorted.map((item) => item.scanId)).size,
      };
    })
    .sort((a, b) => b.latest.timestamp - a.latest.timestamp);
}

function renderDashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>pwnkit dashboard</title>
  <style>
    :root {
      --bg: #0a0c10;
      --panel: #11151c;
      --panel-2: #171d26;
      --line: #283244;
      --text: #eef2f7;
      --muted: #8a96ab;
      --accent: #ff4d5a;
      --green: #22c55e;
      --yellow: #eab308;
      --blue: #38bdf8;
      --orange: #fb923c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Outfit", "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top right, rgba(255,77,90,0.14), transparent 30%),
        radial-gradient(circle at bottom left, rgba(56,189,248,0.12), transparent 35%),
        var(--bg);
      color: var(--text);
    }
    .shell {
      display: grid;
      grid-template-columns: 320px 1fr;
      min-height: 100vh;
    }
    .sidebar {
      border-right: 1px solid var(--line);
      background: rgba(10,12,16,0.92);
      padding: 20px;
      backdrop-filter: blur(12px);
    }
    .main {
      padding: 20px;
      display: grid;
      grid-template-rows: auto auto 1fr;
      gap: 18px;
    }
    .brand {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: var(--accent);
      text-transform: lowercase;
    }
    .sub {
      color: var(--muted);
      margin-top: 6px;
      font-size: 14px;
    }
    .panel {
      background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent), var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.22);
    }
    .panel h2, .panel h3 {
      margin: 0 0 10px;
      font-size: 13px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(5, minmax(120px, 1fr));
      gap: 14px;
    }
    .stat {
      background: var(--panel-2);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
    }
    .stat .num {
      font-size: 28px;
      font-weight: 800;
      margin-top: 6px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.3fr 1fr;
      gap: 18px;
      min-height: 0;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: calc(100vh - 220px);
      overflow: auto;
      padding-right: 4px;
    }
    .item {
      width: 100%;
      text-align: left;
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: inherit;
      border-radius: 14px;
      padding: 14px;
      cursor: pointer;
    }
    .item.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px rgba(255,77,90,0.4); }
    .item:hover { transform: translateY(-1px); }
    .row { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
    .title { font-weight: 700; }
    .meta, .tiny { color: var(--muted); font-size: 12px; }
    .pill {
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.03);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .search {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #0b1016;
      color: var(--text);
      padding: 12px 14px;
      font: inherit;
    }
    .search-hint {
      margin-top: 8px;
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .sev-critical { color: #f87171; }
    .sev-high { color: #fb923c; }
    .sev-medium { color: #facc15; }
    .sev-low { color: #60a5fa; }
    .sev-info { color: #cbd5e1; }
    .triage-new { color: var(--blue); }
    .triage-accepted { color: var(--green); }
    .triage-suppressed { color: var(--muted); }
    .detail h1 {
      margin: 0 0 10px;
      font-size: 24px;
      line-height: 1.15;
    }
    .detail p {
      line-height: 1.5;
    }
    .detail pre {
      background: #0b1016;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px;
      overflow: auto;
      color: #cdd6e3;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .toolbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    button.action {
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--text);
      border-radius: 12px;
      padding: 10px 12px;
      cursor: pointer;
      font-weight: 600;
    }
    button.action.primary { border-color: rgba(34,197,94,0.4); }
    button.action.warn { border-color: rgba(251,146,60,0.4); }
    textarea.note {
      width: 100%;
      min-height: 82px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #0b1016;
      color: var(--text);
      padding: 10px 12px;
      resize: vertical;
    }
    .empty {
      color: var(--muted);
      padding: 20px 4px;
    }
    .palette-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(3, 6, 10, 0.72);
      backdrop-filter: blur(10px);
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding: 8vh 20px 20px;
      z-index: 20;
    }
    .palette-backdrop.open {
      display: flex;
    }
    .palette {
      width: min(760px, 100%);
      background: rgba(12, 16, 23, 0.98);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 22px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.45);
      overflow: hidden;
    }
    .palette-input {
      width: 100%;
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--line);
      color: var(--text);
      padding: 18px 20px;
      font: inherit;
      font-size: 15px;
      outline: none;
    }
    .palette-list {
      max-height: 60vh;
      overflow: auto;
      padding: 10px;
    }
    .palette-group {
      padding: 6px 0 10px;
    }
    .palette-group-title {
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 0 10px 8px;
    }
    .palette-item {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      text-align: left;
      background: transparent;
      border: 0;
      color: inherit;
      padding: 12px 10px;
      border-radius: 14px;
      cursor: pointer;
    }
    .palette-item.active,
    .palette-item:hover {
      background: rgba(255,255,255,0.05);
    }
    .palette-label {
      font-weight: 600;
    }
    .palette-meta {
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }
    @media (max-width: 1100px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar { border-right: 0; border-bottom: 1px solid var(--line); }
      .grid { grid-template-columns: 1fr; }
      .stats { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .list { max-height: none; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">pwnkit</div>
      <div class="sub">local mission control for scans, findings, and triage</div>
      <div class="panel" style="margin-top:18px;">
        <h2>Search</h2>
        <input id="search" class="search" type="search" placeholder="Filter scans and findings" />
        <div class="search-hint">Press / or Cmd/Ctrl+K for command palette</div>
      </div>
      <div class="panel" style="margin-top:18px;">
        <h2>Overview</h2>
        <div id="overview" class="tiny">Loading…</div>
      </div>
      <div class="panel" style="margin-top:18px;">
        <h2>Scans</h2>
        <div id="scans" class="list"></div>
      </div>
    </aside>
    <main class="main">
      <section class="panel">
        <h2>Finding Inbox</h2>
        <div class="stats" id="stats"></div>
      </section>
      <section class="grid">
        <section class="panel">
          <div class="row" style="margin-bottom:10px;">
            <h3 style="margin:0;">Grouped Findings</h3>
            <div class="tiny">family-level triage across scans</div>
          </div>
          <div id="findings" class="list"></div>
        </section>
        <section class="panel detail">
          <div id="detail" class="empty">Select a finding family to inspect evidence and triage it.</div>
        </section>
      </section>
    </main>
  </div>
  <div id="palette-backdrop" class="palette-backdrop">
    <div class="palette">
      <input id="palette-input" class="palette-input" type="search" placeholder="Jump to scans, findings, and actions" />
      <div id="palette-list" class="palette-list"></div>
    </div>
  </div>
  <script>
    const state = { scans: [], groups: [], selectedFingerprint: null, query: "", paletteOpen: false, paletteQuery: "", paletteIndex: 0 };

    function esc(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function sevClass(sev) { return "sev-" + sev; }
    function triageClass(status) { return "triage-" + (status || "new"); }
    function matchesQuery(value) {
      return String(value || "").toLowerCase().includes(state.query);
    }
    function filteredScans() {
      return state.scans.filter((scan) => {
        if (!state.query) return true;
        return [scan.target, scan.depth, scan.runtime, scan.mode, scan.status].some(matchesQuery);
      });
    }
    function filteredGroups() {
      return state.groups.filter((group) => {
        if (!state.query) return true;
        return [
          group.fingerprint,
          group.latest.title,
          group.latest.category,
          group.latest.severity,
          group.latest.status,
          group.latest.triageStatus,
        ].some(matchesQuery);
      });
    }
    function setSearchQuery(value) {
      const next = String(value || "");
      state.query = next.trim().toLowerCase();
      document.getElementById("search").value = next;
      renderScans();
      renderFindings();
    }
    function selectFinding(fingerprint) {
      state.selectedFingerprint = fingerprint;
      renderFindings();
      loadDetail(fingerprint);
    }
    function closePalette() {
      state.paletteOpen = false;
      state.paletteQuery = "";
      state.paletteIndex = 0;
      document.getElementById("palette-backdrop").classList.remove("open");
      document.getElementById("palette-input").value = "";
    }
    function openPalette() {
      state.paletteOpen = true;
      state.paletteIndex = 0;
      document.getElementById("palette-backdrop").classList.add("open");
      renderPalette();
      document.getElementById("palette-input").focus();
    }
    function isTypingTarget(target) {
      if (!target) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }
    function buildPaletteItems() {
      const q = state.paletteQuery.trim().toLowerCase();
      const newestNew = state.groups.find((group) => group.latest.triageStatus === "new") || null;
      const hottest = state.groups.find((group) => group.latest.severity === "critical" || group.latest.severity === "high") || null;
      const running = state.scans.find((scan) => scan.status === "running") || null;
      const sections = [
        {
          title: "Actions",
          items: [
            {
              id: "focus-filter",
              label: "Focus dashboard filter",
              meta: "/",
              run: () => {
                closePalette();
                document.getElementById("search").focus();
              },
            },
            {
              id: "clear-filter",
              label: "Clear active filter",
              meta: state.query || "all",
              run: () => {
                closePalette();
                setSearchQuery("");
              },
            },
            newestNew ? {
              id: "jump-newest-new",
              label: "Jump to newest untriaged family",
              meta: newestNew.latest.title,
              run: () => {
                closePalette();
                selectFinding(newestNew.fingerprint);
              },
            } : null,
            hottest ? {
              id: "jump-hottest",
              label: "Jump to critical/high family",
              meta: hottest.latest.severity,
              run: () => {
                closePalette();
                selectFinding(hottest.fingerprint);
              },
            } : null,
            running ? {
              id: "focus-running",
              label: "Filter to active scans",
              meta: running.target,
              run: () => {
                closePalette();
                setSearchQuery("running");
              },
            } : null,
          ].filter(Boolean),
        },
        {
          title: "Finding Families",
          items: state.groups.slice(0, 12).map((group) => ({
            id: "finding-" + group.fingerprint,
            label: group.latest.title,
            meta: group.latest.severity + " • " + group.latest.triageStatus,
            haystack: [group.latest.title, group.latest.category, group.latest.severity, group.latest.triageStatus, group.fingerprint].join(" "),
            run: () => {
              closePalette();
              selectFinding(group.fingerprint);
            },
          })),
        },
        {
          title: "Scans",
          items: state.scans.slice(0, 10).map((scan) => ({
            id: "scan-" + scan.id,
            label: scan.target,
            meta: scan.status + " • " + scan.depth + " • " + scan.runtime,
            haystack: [scan.target, scan.status, scan.depth, scan.runtime, scan.mode].join(" "),
            run: () => {
              closePalette();
              setSearchQuery(scan.target);
            },
          })),
        },
      ];

      return sections
        .map((section) => ({
          title: section.title,
          items: section.items.filter((item) => {
            if (!q) return true;
            return [item.label, item.meta, item.haystack].filter(Boolean).join(" ").toLowerCase().includes(q);
          }),
        }))
        .filter((section) => section.items.length > 0);
    }
    function flatPaletteItems() {
      return buildPaletteItems().flatMap((section) => section.items);
    }
    function renderPalette() {
      const root = document.getElementById("palette-list");
      const sections = buildPaletteItems();
      const items = sections.flatMap((section) => section.items);
      if (state.paletteIndex >= items.length) {
        state.paletteIndex = Math.max(0, items.length - 1);
      }
      if (items.length === 0) {
        root.innerHTML = '<div class="empty">No matching commands.</div>';
        return;
      }
      let cursor = 0;
      root.innerHTML = sections.map((section) => {
        const html = section.items.map((item) => {
          const isActive = cursor === state.paletteIndex;
          const index = cursor;
          cursor += 1;
          return '<button class="palette-item ' + (isActive ? 'active' : '') + '" data-palette-index="' + index + '">' +
            '<span class="palette-label">' + esc(item.label) + '</span>' +
            '<span class="palette-meta">' + esc(item.meta || '') + '</span>' +
          '</button>';
        }).join("");
        return '<div class="palette-group"><div class="palette-group-title">' + esc(section.title) + '</div>' + html + '</div>';
      }).join("");
      root.querySelectorAll("button[data-palette-index]").forEach((button) => {
        button.addEventListener("click", () => {
          const index = parseInt(button.getAttribute("data-palette-index"), 10);
          const item = flatPaletteItems()[index];
          if (item) item.run();
        });
      });
    }

    async function loadOverview() {
      const res = await fetch("/api/dashboard");
      const data = await res.json();
      state.scans = data.scans;
      state.groups = data.groups;
      renderOverview(data);
      renderScans();
      renderStats(data);
      renderFindings();
    }

    function renderOverview(data) {
      const running = data.scans.filter((scan) => scan.status === "running").length;
      document.getElementById("overview").innerHTML = \`
        <div><strong>\${data.scans.length}</strong> scans tracked</div>
        <div><strong>\${running}</strong> scans currently running</div>
        <div><strong>\${data.groups.length}</strong> grouped finding families</div>
        <div><strong>\${data.groups.filter((group) => group.latest.triageStatus === "new").length}</strong> new families need triage</div>
      \`;
    }

    function renderStats(data) {
      const counts = {
        new: data.groups.filter((group) => group.latest.triageStatus === "new").length,
        accepted: data.groups.filter((group) => group.latest.triageStatus === "accepted").length,
        suppressed: data.groups.filter((group) => group.latest.triageStatus === "suppressed").length,
        running: data.scans.filter((scan) => scan.status === "running").length,
        highRisk: data.groups.filter((group) => ["critical", "high"].includes(group.latest.severity)).length,
      };
      document.getElementById("stats").innerHTML = [
        ["new families", counts.new, "var(--blue)"],
        ["accepted", counts.accepted, "var(--green)"],
        ["suppressed", counts.suppressed, "var(--muted)"],
        ["active scans", counts.running, "var(--accent)"],
        ["critical/high", counts.highRisk, "var(--orange)"],
      ].map(([label, value, color]) => \`<div class="stat"><div class="tiny">\${label}</div><div class="num" style="color:\${color}">\${value}</div></div>\`).join("");
    }

    function renderScans() {
      const root = document.getElementById("scans");
      const scans = filteredScans();

      if (scans.length === 0) {
        root.innerHTML = '<div class="empty">No scans match this filter.</div>';
        return;
      }

      root.innerHTML = scans.map((scan) => \`
        <div class="item" style="cursor:default;">
          <div class="row">
            <div class="title">\${esc(scan.target)}</div>
            <span class="pill">\${esc(scan.status)}</span>
          </div>
          <div class="meta">\${esc(scan.depth)} • \${esc(scan.runtime)} • \${esc(scan.mode)}</div>
          <div class="tiny">\${scan.summary.critical} critical • \${scan.summary.high} high • \${scan.summary.totalFindings} total</div>
        </div>
      \`).join("");
    }

    function renderFindings() {
      const root = document.getElementById("findings");
      const groups = filteredGroups();

      if (groups.length === 0) {
        root.innerHTML = '<div class="empty">No finding families match this filter.</div>';
        return;
      }

      root.innerHTML = groups.map((group) => \`
        <button class="item \${state.selectedFingerprint === group.fingerprint ? "active" : ""}" data-fp="\${group.fingerprint}">
          <div class="row">
            <div class="title \${sevClass(group.latest.severity)}">\${esc(group.latest.title)}</div>
            <span class="pill \${triageClass(group.latest.triageStatus)}">\${esc(group.latest.triageStatus || "new")}</span>
          </div>
          <div class="meta">\${esc(group.latest.category)} • \${group.count} hits across \${group.scanCount} scans</div>
          <div class="tiny">\${esc(group.latest.severity)} • latest \${esc(group.latest.status)}</div>
        </button>
      \`).join("");

      root.querySelectorAll("button[data-fp]").forEach((button) => {
        button.addEventListener("click", () => {
          selectFinding(button.getAttribute("data-fp"));
        });
      });
    }

    async function loadDetail(fingerprint) {
      const res = await fetch("/api/finding-family/" + encodeURIComponent(fingerprint));
      if (!res.ok) {
        document.getElementById("detail").innerHTML = '<div class="empty">Unable to load finding detail.</div>';
        return;
      }

      const data = await res.json();
      const latest = data.latest;
      const detail = document.getElementById("detail");
      detail.innerHTML = \`
        <div class="toolbar">
          <button class="action primary" data-action="accepted">Accept</button>
          <button class="action warn" data-action="suppressed">Suppress</button>
          <button class="action" data-action="new">Reopen</button>
        </div>
        <h1 class="\${sevClass(latest.severity)}">\${esc(latest.title)}</h1>
        <div class="row" style="justify-content:flex-start; gap:8px; margin-bottom:12px;">
          <span class="pill \${sevClass(latest.severity)}">\${esc(latest.severity)}</span>
          <span class="pill">\${esc(latest.status)}</span>
          <span class="pill \${triageClass(latest.triageStatus)}">\${esc(latest.triageStatus || "new")}</span>
          <span class="pill">\${data.rows.length} occurrences</span>
        </div>
        <div class="tiny" style="margin-bottom:12px;">fingerprint: \${esc(data.fingerprint)}</div>
        <p>\${esc(latest.description)}</p>
        <h3 style="margin-top:18px;">Triage Note</h3>
        <textarea id="triage-note" class="note" placeholder="Optional operator note">\${esc(latest.triageNote || "")}</textarea>
        <h3 style="margin-top:18px;">Evidence Request</h3>
        <pre><code>\${esc(latest.evidenceRequest)}</code></pre>
        <h3 style="margin-top:18px;">Evidence Response</h3>
        <pre><code>\${esc(latest.evidenceResponse)}</code></pre>
        \${latest.evidenceAnalysis ? '<h3 style="margin-top:18px;">Evidence Analysis</h3><pre><code>' + esc(latest.evidenceAnalysis) + '</code></pre>' : ''}
        <h3 style="margin-top:18px;">Occurrences</h3>
        <div class="list" style="max-height:260px;">\${data.rows.map((row) => \`
          <div class="item" style="cursor:default;">
            <div class="row">
              <div class="title">\${esc(row.id.slice(0, 8))}</div>
              <span class="pill">\${esc(row.status)}</span>
            </div>
            <div class="meta">scan:\${esc(row.scanId.slice(0, 8))} • \${new Date(row.timestamp).toISOString()}</div>
          </div>
        \`).join("")}</div>
      \`;

      detail.querySelectorAll("button[data-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const triageStatus = button.getAttribute("data-action");
          const triageNote = document.getElementById("triage-note").value;
          await fetch("/api/finding-family/" + encodeURIComponent(fingerprint) + "/triage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ triageStatus, triageNote }),
          });
          await loadOverview();
          await loadDetail(fingerprint);
        });
      });
    }

    document.getElementById("search").addEventListener("input", (event) => {
      setSearchQuery(event.target.value);
    });
    document.getElementById("palette-input").addEventListener("input", (event) => {
      state.paletteQuery = event.target.value;
      state.paletteIndex = 0;
      renderPalette();
    });
    document.getElementById("palette-backdrop").addEventListener("click", (event) => {
      if (event.target.id === "palette-backdrop") closePalette();
    });
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (state.paletteOpen) closePalette();
        else openPalette();
        return;
      }
      if (!state.paletteOpen && event.key === "/" && !isTypingTarget(event.target)) {
        event.preventDefault();
        openPalette();
        return;
      }
      if (!state.paletteOpen) return;
      if (event.key === "Escape") {
        closePalette();
        return;
      }
      const items = flatPaletteItems();
      if (items.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        state.paletteIndex = (state.paletteIndex + 1) % items.length;
        renderPalette();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        state.paletteIndex = (state.paletteIndex - 1 + items.length) % items.length;
        renderPalette();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const item = items[state.paletteIndex];
        if (item) item.run();
      }
    });

    loadOverview();
    setInterval(loadOverview, 15000);
  </script>
</body>
</html>`;
}

function parseFindingFamilyPath(pathname: string): { fingerprint: string; action?: string } | null {
  const match = pathname.match(/^\/api\/finding-family\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return null;
  return {
    fingerprint: decodeURIComponent(match[1]),
    action: match[2],
  };
}

export function registerDashboardCommand(program: Command): void {
  program
    .command("dashboard")
    .description("Run a local mission-control dashboard for scans and findings")
    .option("--db-path <path>", "Path to SQLite database")
    .option("--port <port>", "Port to bind", "48123")
    .option("--host <host>", "Host to bind", "127.0.0.1")
    .option("--no-open", "Do not auto-open a browser")
    .action(async (opts: DashboardOptions) => {
      const host = opts.host ?? "127.0.0.1";
      const port = parseInt(opts.port ?? "48123", 10);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error(`Invalid port: ${opts.port ?? "48123"}`);
      }

      const { pwnkitDB } = await import("@pwnkit/db");

      const server = createServer(async (req, res) => {
        const requestUrl = new URL(req.url ?? "/", `http://${host}:${port}`);

        try {
          if (requestUrl.pathname === "/") {
            text(res, 200, renderDashboardHtml(), "text/html; charset=utf-8");
            return;
          }

          if (requestUrl.pathname === "/api/dashboard") {
            const db = new pwnkitDB(opts.dbPath);
            try {
              const scans = db.listScans(100) as DBScanRow[];
              const findings = db.listFindings({ limit: 5000 }) as DBFindingRow[];
              json(res, 200, {
                scans: scans.map(summarizeScan),
                groups: groupFindings(findings),
              });
            } finally {
              db.close();
            }
            return;
          }

          const familyPath = parseFindingFamilyPath(requestUrl.pathname);
          if (familyPath) {
            const db = new pwnkitDB(opts.dbPath);
            try {
              if (req.method === "POST" && familyPath.action === "triage") {
                const body = (await readJson(req)) as { triageStatus?: string; triageNote?: string };
                db.updateFindingTriageByFingerprint(
                  familyPath.fingerprint,
                  normalizeTriageStatus(body.triageStatus),
                  typeof body.triageNote === "string" ? body.triageNote : undefined,
                );
                json(res, 200, { ok: true });
                return;
              }

              const rows = (db.getRelatedFindings(familyPath.fingerprint) as DBFindingRow[]).map((row) => ({
                ...row,
                triageStatus: normalizeTriageStatus(row.triageStatus),
              }));

              if (rows.length === 0) {
                json(res, 404, { error: "Not found" });
                return;
              }

              json(res, 200, {
                fingerprint: familyPath.fingerprint,
                latest: rows[0],
                rows,
              });
            } finally {
              db.close();
            }
            return;
          }

          json(res, 404, { error: "Not found" });
        } catch (err) {
          json(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });

      server.listen(port, host, () => {
        const url = `http://${host}:${port}`;
        console.log(chalk.red.bold("  \u25C6 pwnkit") + chalk.gray(" dashboard"));
        console.log(chalk.gray(`  ${url}`));
        console.log(chalk.gray("  Ctrl+C to stop"));
        if (!opts.noOpen) openBrowser(url);
      });

      process.once("SIGINT", () => {
        server.close(() => process.exit(0));
      });
    });
}
