#!/usr/bin/env node
// The record's format rules as a program — dependency-free Node, owned by
// this repository. Every failure states what is wrong, why the rule exists,
// and how to fix it, so anyone (human or agent) self-corrects without a
// reviewer. Run as `pnpm check` or directly: node .agents/skills/format-checker/check.mjs

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const knowledgeDir = path.join(root, "knowledge");
const problems = [];

function problem(where, what, why, fix) {
  problems.push(`${where}\n    problem: ${what}\n    why: ${why}\n    fix: ${fix}`);
}

// ---------------------------------------------------------------------------
// knowledge/: CommonMark .md + assets only, governed frontmatter, safe names
// ---------------------------------------------------------------------------
const ALLOWED_KEYS = new Set([
  "title",
  "description",
  "status",
  "owner",
  "provenance",
  "effective",
  "superseded",
  "superseded_by",
  "order",
]);
const REQUIRED_KEYS = ["title", "status"]; // level 0 — the ladder, not a gate
const STATUS_VALUES = new Set(["draft", "review", "approved", "superseded"]);
const ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function walkFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(p) : [p];
  });
}

function walkDirs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? [p, ...walkDirs(p)] : [];
  });
}

function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text.replaceAll("\r\n", "\n"));
  if (!match) return null;
  const entries = {};
  for (const line of match[1].split("\n")) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) entries[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return entries;
}

if (!existsSync(knowledgeDir)) {
  problem(
    "knowledge/",
    "the record directory is missing",
    "a Knowledge System of Record without knowledge/ is not one",
    "restore knowledge/ from git history",
  );
} else {
  const files = walkFiles(knowledgeDir);
  const dirs = walkDirs(knowledgeDir);
  const all = [...files, ...dirs];
  const mdFiles = files.filter((p) => p.endsWith(".md"));

  // names: windows-safe, lowercase-stable, no framework files
  const seenLower = new Map();
  for (const p of all) {
    const rel = path.relative(root, p);
    const base = path.basename(p);
    if (base === "meta.json" || base.endsWith(".mdx")) {
      problem(
        rel,
        base.endsWith(".mdx") ? "MDX file in the record" : "framework file in the record",
        "knowledge/ is CommonMark markdown only — framework grammar breaks the walk-away promise",
        base.endsWith(".mdx")
          ? "convert to .md; components belong to the site, not the record"
          : "delete it — sidebar order is the `order` frontmatter key",
      );
    }
    if (/[<>:"|?*]/.test(base) || /[. ]$/.test(base) || WINDOWS_RESERVED.test(base)) {
      problem(
        rel,
        `"${base}" is not a portable filename`,
        "the path is the document's identity on every platform — Windows rejects this name",
        "use lowercase letters, digits, hyphens; no trailing dots/spaces; avoid reserved device names",
      );
    }
    if (/[A-Z]/.test(base)) {
      problem(
        rel,
        "uppercase in filename",
        "paths are identities; case-only differences collide on case-insensitive filesystems",
        "rename to lowercase",
      );
    }
    const lower = path.relative(root, p).toLowerCase();
    if (seenLower.has(lower) && seenLower.get(lower) !== rel) {
      problem(
        rel,
        `collides with ${seenLower.get(lower)} on case-insensitive filesystems`,
        "two documents that are one file on macOS/Windows cannot both be the record",
        "rename one of them",
      );
    }
    seenLower.set(lower, rel);
    if (files.includes(p) && !p.endsWith(".md") && !ASSET_EXTENSIONS.has(path.extname(p))) {
      problem(
        rel,
        `unexpected file type "${path.extname(p) || base}"`,
        "the record holds markdown and images; other formats cannot be governed or rendered",
        "convert it to markdown (the add-sources skill does this) or move it out of knowledge/",
      );
    }
    if (/\(.*\)/.test(base)) {
      problem(
        rel,
        "parenthesized name",
        "renderers strip parenthesized segments from routes, giving one document two identities",
        "rename without parentheses",
      );
    }
  }

  // foo.md vs foo/index.md route collisions
  for (const p of mdFiles) {
    const sibling = p.replace(/\.md$/, "");
    if (existsSync(path.join(sibling, "index.md"))) {
      problem(
        path.relative(root, p),
        `route collision with ${path.relative(root, path.join(sibling, "index.md"))}`,
        "both map to the same URL — one identity, two documents",
        "keep one; merge the content",
      );
    }
  }

  // frontmatter + links per document
  for (const p of mdFiles) {
    const rel = path.relative(root, p);
    const text = readFileSync(p, "utf8");
    const fm = frontmatter(text);
    if (fm === null) {
      problem(
        rel,
        "no frontmatter",
        "a document without identity and lifecycle is ungoverned",
        "start the file with ---\\ntitle: ...\\nstatus: draft\\n---",
      );
      continue;
    }
    for (const key of REQUIRED_KEYS) {
      if (!(key in fm) || fm[key] === "") {
        problem(
          rel,
          `missing frontmatter key: ${key}`,
          "title names the document; status places it in the governance lifecycle",
          `add ${key}: to the frontmatter`,
        );
      }
    }
    for (const key of Object.keys(fm)) {
      if (!ALLOWED_KEYS.has(key)) {
        problem(
          rel,
          `unknown frontmatter key: ${key}`,
          key === "id" || key === "name"
            ? "identity derives from the file path — an authored id gives one document two identities"
            : "the frontmatter key set is closed so every key means one thing everywhere",
          `remove "${key}:" (allowed: ${[...ALLOWED_KEYS].join(", ")})`,
        );
      }
    }
    if ("status" in fm && fm.status !== "" && !STATUS_VALUES.has(fm.status)) {
      problem(
        rel,
        `status "${fm.status}" is not one of ${[...STATUS_VALUES].join(" | ")}`,
        "the lifecycle is a closed set; free-form states cannot be gated on",
        "pick the closest lifecycle state",
      );
    }
    if (fm.status === "superseded" && !fm.superseded_by) {
      problem(
        rel,
        "superseded without superseded_by",
        "a replaced document must point at its successor or readers dead-end on stale truth",
        "add superseded_by: ./<successor>.md",
      );
    }
    // links: resolve, and never escape the record
    const body = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    for (const match of body.matchAll(/\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const resolved = path.resolve(path.dirname(p), target.split("#")[0]);
      if (!resolved.startsWith(knowledgeDir + path.sep) && resolved !== knowledgeDir) {
        problem(
          rel,
          `link escapes the record: ${target}`,
          "the record must survive without the system — outward links break the walk-away promise",
          "move the asset into knowledge/ beside the document, or use an absolute URL",
        );
      } else if (!existsSync(resolved)) {
        problem(
          rel,
          `dead link: ${target}`,
          "a record with dead internal links serves different truths by path",
          "fix the path or remove the link",
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// structure: pointer intact, skill copies identical, no content in the site
// ---------------------------------------------------------------------------
const claudeMd = path.join(root, "CLAUDE.md");
if (!existsSync(claudeMd) || readFileSync(claudeMd, "utf8").trim() !== "@AGENTS.md") {
  problem(
    "CLAUDE.md",
    "the pointer file changed",
    "AGENTS.md is the single contract; a pointer that grows content forks it",
    "restore CLAUDE.md to exactly one line: @AGENTS.md",
  );
}

const agentsSkills = path.join(root, ".agents", "skills");
const claudeSkills = path.join(root, ".claude", "skills");
if (existsSync(agentsSkills)) {
  for (const skill of readdirSync(agentsSkills)) {
    const canonical = path.join(agentsSkills, skill);
    const copy = path.join(claudeSkills, skill);
    if (!existsSync(copy)) {
      problem(
        `.claude/skills/${skill}`,
        "missing skill copy",
        "Claude Code reads .claude/skills; a skill without its copy is invisible there",
        `copy .agents/skills/${skill} to .claude/skills/${skill}`,
      );
      continue;
    }
    for (const file of walkFiles(canonical)) {
      const relFile = path.relative(canonical, file);
      const twin = path.join(copy, relFile);
      if (!existsSync(twin) || !readFileSync(file).equals(readFileSync(twin))) {
        problem(
          `.claude/skills/${skill}/${relFile}`,
          "skill copy differs from the canonical .agents/skills version",
          "two diverging copies means agents follow different rules by tool",
          `re-copy .agents/skills/${skill} over .claude/skills/${skill}`,
        );
      }
    }
  }
}

const siteDir = path.join(root, "system", "site");
if (existsSync(siteDir)) {
  const offenders = walkFiles(siteDir)
    .filter((p) => !p.includes(`${path.sep}node_modules${path.sep}`))
    .filter(
      (p) =>
        !p.includes(`${path.sep}.next${path.sep}`) &&
        !p.includes(`${path.sep}.source${path.sep}`) &&
        !p.includes(`${path.sep}out${path.sep}`),
    )
    .filter((p) => p.endsWith(".md") || p.endsWith(".mdx"));
  for (const p of offenders) {
    problem(
      path.relative(root, p),
      "content file inside the site",
      "the site renders the record; it never holds it — content here silently forks the record",
      "move the content to knowledge/ and delete this file",
    );
  }
}

if (problems.length > 0) {
  console.error(`format-checker: ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}
console.log("format-checker: ok — the record is well-formed");
