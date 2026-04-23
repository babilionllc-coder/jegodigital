#!/usr/bin/env node
/**
 * notion_session_log_append.mjs
 *
 * Appends a single Session Log entry to the Notion page whenever a notable
 * commit lands on `main`. Called from `.github/workflows/notion-session-log.yml`.
 *
 * Required env:
 *   NOTION_INTEGRATION_TOKEN   Internal integration token (Notion UI → Settings → Connections)
 *   NOTION_SESSION_LOG_PAGE_ID Page ID of the "📚 Session Log — Ship History" page
 *                              (currently 34bf21a7-c6e5-812e-9f5b-e93657eb25ca)
 *   COMMIT_SHA                 Full SHA of the triggering commit (from GITHUB_SHA)
 *   COMMIT_MESSAGE             Full multi-line commit message (from git log)
 *   COMMIT_AUTHOR              Author name (from git log)
 *   COMMIT_URL                 https://github.com/…/commit/<sha>
 *
 * Triggers on commit subjects matching:  ^(feat|fix|ship|perf)(\([^)]+\))?!?:
 * Docs-only (docs:/chore:/refactor:) commits are skipped on purpose — Session
 * Log is for things that moved revenue/ops, not internal plumbing.
 */

const NOTION_VERSION = "2022-06-28";
const API = "https://api.notion.com/v1";

const {
  NOTION_INTEGRATION_TOKEN,
  NOTION_SESSION_LOG_PAGE_ID,
  COMMIT_SHA,
  COMMIT_MESSAGE,
  COMMIT_AUTHOR,
  COMMIT_URL,
} = process.env;

function die(msg, code = 1) {
  console.error(`❌ ${msg}`);
  process.exit(code);
}

if (!NOTION_INTEGRATION_TOKEN) die("Missing NOTION_INTEGRATION_TOKEN env.");
if (!NOTION_SESSION_LOG_PAGE_ID) die("Missing NOTION_SESSION_LOG_PAGE_ID env.");
if (!COMMIT_SHA || !COMMIT_MESSAGE) die("Missing COMMIT_SHA or COMMIT_MESSAGE env.");

// ---- Parse conventional commit subject ----
const firstLine = COMMIT_MESSAGE.split("\n")[0].trim();
const bodyLines = COMMIT_MESSAGE.split("\n").slice(1)
  .map((l) => l.trim()).filter(Boolean);

const CONVENTIONAL = /^(feat|fix|ship|perf)(\(([^)]+)\))?(!)?:\s*(.+)$/i;
const match = firstLine.match(CONVENTIONAL);
if (!match) {
  console.log(`ℹ️  Commit subject "${firstLine}" does not match notable-ship pattern. Skipping.`);
  process.exit(0);
}
const [, type, , scope, breakingBang, subject] = match;
const isBreaking = !!breakingBang || bodyLines.some((l) => /^BREAKING CHANGE:/i.test(l));

// ---- Bucket inference (HR-3) ----
// Default to "B" since most feat/fix commits move the lead pipeline forward.
// feat(website|ui|landing|audit|trojan|cold-email|cold-call) → B
// fix(deploy|workflow|infra|ci) → D
// perf|ship → A (usually a "close-this-week" win)
let bucket = "B — generate qualified leads";
if (type === "perf" || type === "ship") bucket = "A — close paying clients this week";
else if (type === "fix" && /deploy|workflow|infra|ci|build|gcf/i.test(scope || "" + firstLine)) {
  bucket = "D — unblock future revenue";
}

// ---- Date header ----
const now = new Date();
const cdmx = now.toLocaleString("en-US", { timeZone: "America/Mexico_City" });
const isoDate = new Date(cdmx).toISOString().slice(0, 10);
const tod = new Date(cdmx).getHours();
const phase = tod < 12 ? "AM" : tod < 17 ? "PM" : "evening";
const headerText = `🗓️ ${isoDate} ${phase} — ${subject}${isBreaking ? " (BREAKING)" : ""}`;

// ---- Build Notion blocks (rich_text format) ----
const rt = (text, opts = {}) => ({
  type: "text",
  text: { content: text, link: opts.link ? { url: opts.link } : null },
  annotations: {
    bold: !!opts.bold,
    italic: !!opts.italic,
    strikethrough: false,
    underline: false,
    code: !!opts.code,
    color: opts.color || "default",
  },
});

const shortSha = COMMIT_SHA.slice(0, 8);
const scopeLabel = scope ? ` · \`${scope}\`` : "";
const bodyPreview = bodyLines.slice(0, 3).join(" · ").slice(0, 400);

const blocks = [
  { object: "block", type: "heading_3", heading_3: { rich_text: [rt(headerText)] } },
  {
    object: "block", type: "paragraph", paragraph: {
      rich_text: [
        rt("Bucket: ", { bold: true }),
        rt(bucket),
        rt(" · Type: ", { bold: true }),
        rt(type, { code: true }),
        ...(scope ? [rt(" · Scope: ", { bold: true }), rt(scope, { code: true })] : []),
      ],
    },
  },
  ...(bodyPreview ? [{
    object: "block", type: "paragraph", paragraph: {
      rich_text: [rt("Summary: ", { bold: true }), rt(bodyPreview)],
    },
  }] : []),
  {
    object: "block", type: "paragraph", paragraph: {
      rich_text: [
        rt("Proof: ", { bold: true }),
        rt(`commit ${shortSha}`, { code: true, link: COMMIT_URL }),
        ...(COMMIT_AUTHOR ? [rt(` · author: ${COMMIT_AUTHOR}`)] : []),
      ],
    },
  },
  { object: "block", type: "divider", divider: {} },
];

// ---- Fetch current page children so we can prepend (insert at top) ----
async function notion(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_INTEGRATION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) die(`Notion API ${method} ${path} → ${res.status}\n${text}`);
  return text ? JSON.parse(text) : {};
}

(async () => {
  // Fetch first page of existing children
  const first = await notion("GET", `/blocks/${NOTION_SESSION_LOG_PAGE_ID}/children?page_size=1`);
  const firstChildId = first.results?.[0]?.id;

  // Append new entry AFTER the intro paragraph (not at the very top),
  // so entries sit newest-first BELOW the "rolling log of what Claude + Alex shipped" line.
  // If firstChildId exists, use `after`; otherwise, append to end.
  const payload = { children: blocks };
  if (firstChildId) payload.after = firstChildId;

  const res = await notion("PATCH", `/blocks/${NOTION_SESSION_LOG_PAGE_ID}/children`, payload);
  console.log(`✅ Appended Session Log entry. ${res.results?.length ?? blocks.length} block(s) added.`);
  console.log(`   Header: ${headerText}`);
})().catch((e) => die(`Unhandled: ${e.stack || e.message}`));
