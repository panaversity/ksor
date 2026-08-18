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
// Files the operating system writes behind the author's back. Ignored, never
// reported: the .gitignore already keeps them out of git.
const OS_JUNK = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

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

function unquote(value) {
  return value.trim().replace(/^(["'])(.*)\1$/, "$2");
}

/**
 * The frontmatter block, two levels deep (`ksor:` has children; `provenance:`
 * has list items). Returns null when there is no block at all, and collects
 * every line that is neither `key: value`, a list item, an indented
 * continuation, nor blank — those mean the block was never closed.
 */
function parseFrontmatter(text) {
  // An editor's byte-order mark is invisible to the author; it must not be
  // the reason a document reads as ungoverned.
  const normalized = text.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  const match = /^---\n([\s\S]*?)\n---/.exec(normalized);
  if (!match) return null;
  const keys = new Map();
  const children = new Map();
  const malformed = [];
  let current = null;
  for (const raw of match[1].split("\n")) {
    const line = raw.replace(/[ \t]+$/, "");
    if (line === "") continue;
    const top = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (top) {
      current = top[1];
      keys.set(current, unquote(top[2]));
      children.set(current, new Map());
      continue;
    }
    const nested = /^[ \t]+([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (nested && current !== null) {
      children.get(current).set(nested[1], unquote(nested[2]));
      continue;
    }
    if (/^[ \t]*-([ \t]|$)/.test(line) || /^[ \t]+\S/.test(line)) continue;
    malformed.push(line.trim());
  }
  return { keys, children, malformed };
}

/**
 * Code is prose about links, never links. Strips fenced blocks (``` and ~~~,
 * closed by a run of the same character at least as long as the opener) and
 * inline code spans of any backtick-run length.
 */
function stripCode(text) {
  const kept = [];
  let fence = null;
  let blank = true;
  let indented = false;
  for (const line of text.replaceAll("\r\n", "\n").split("\n")) {
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (open) {
      fence = { char: open[1][0], length: open[1].length };
      continue;
    }
    // Indented code blocks: a 4-space/tab-indented run opened after a blank
    // line is treated as code (review finding 2026-08-18 — links inside
    // code samples were checked as real). An indented line that STARTS a
    // list item stays content: nested lists sit at exactly this indent and
    // carry real links (second review finding, same day) — code that
    // happens to open with a markdown bullet is the rarer beast.
    if (/^(?: {4}|\t)/.test(line) && !/^[ \t]+(?:[-*+]|\d+[.)])\s/.test(line)) {
      if (blank || indented) {
        indented = true;
        continue;
      }
    } else if (line.trim() !== "") {
      indented = false;
    }
    blank = line.trim() === "";
    kept.push(line);
  }
  return kept.join("\n").replace(/(`+)[^`]*?\1/g, " ");
}

// Every shape CommonMark gives a link destination: inline (bare or
// <angle-bracketed>, with a "double", 'single' or (paren) title) and the
// reference definitions that inline `[text][label]` links point at.
const INLINE_LINK =
  /\[[^\]]*\]\(\s*(<[^<>\n]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const REFERENCE_DEFINITION =
  /^[ \t]{0,3}\[[^\]]+\]:[ \t]*(<[^<>\n]*>|\S+)[ \t]*(?:"[^"]*"|'[^']*'|\([^)]*\))?[ \t]*$/gm;

function linkTargets(body) {
  const raw = [];
  for (const match of body.matchAll(INLINE_LINK)) raw.push(match[1]);
  for (const match of body.matchAll(REFERENCE_DEFINITION)) raw.push(match[1]);
  // <…> exists so a destination may contain spaces; the brackets are syntax.
  return raw.map((t) => (t.startsWith("<") && t.endsWith(">") ? t.slice(1, -1).trim() : t));
}

function checkLinkTarget(rel, docPath, target) {
  // Anything with a URI scheme (https:, mailto:, tel:, ftp:, …) or a
  // protocol-relative // host leaves the record on purpose — only relative
  // paths are the record's own links (review finding 2026-08-18: tel: was
  // reported as a dead file and //host as an escape).
  if (target === "" || target.startsWith("#") || target.startsWith("//")) return;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return;
  const resolved = path.resolve(path.dirname(docPath), target.split("#")[0]);
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

if (!existsSync(knowledgeDir)) {
  problem(
    "knowledge/",
    "the record directory is missing",
    "a Knowledge System of Record without knowledge/ is not one",
    "restore knowledge/ from git history",
  );
} else {
  const files = walkFiles(knowledgeDir).filter((p) => !OS_JUNK.has(path.basename(p)));
  const dirs = walkDirs(knowledgeDir);
  const all = [...files, ...dirs];
  const mdFiles = files.filter((p) => p.endsWith(".md"));

  if (mdFiles.length === 0) {
    problem(
      "knowledge/",
      "the record has no documents",
      "a KSoR is never empty — the site has nothing to render and the record stands behind nothing",
      "restore a document from git history, or add one: knowledge/<name>.md with title + status frontmatter",
    );
  }

  // names: windows-safe, lowercase-stable, no spaces, no framework files
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
    const unportable = /[<>:"|?*]/.test(base) || /[. ]$/.test(base) || WINDOWS_RESERVED.test(base);
    const spaced = /\s/.test(base);
    if (unportable || spaced) {
      problem(
        rel,
        spaced && !unportable
          ? `"${base}" contains whitespace`
          : `"${base}" is not a portable name`,
        "the path is the document's identity and its URL on every platform — spaces have to be escaped in every link, and Windows rejects these characters outright",
        "use lowercase letters, digits and hyphens; no spaces; no trailing dots; avoid reserved device names",
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
    const fm = parseFrontmatter(text);
    if (fm === null) {
      problem(
        rel,
        "no frontmatter",
        "a document without identity and lifecycle is ungoverned",
        "start the file with ---\\ntitle: ...\\nstatus: draft\\n---",
      );
      continue;
    }
    if (fm.malformed.length > 0) {
      problem(
        rel,
        `unclosed or malformed frontmatter — this is not a frontmatter line: "${fm.malformed[0]}"`,
        "an unclosed block swallows the body: the checker reads prose as governance, and the site renders a document with no title",
        "close the block with --- on its own line; every line inside it is `key: value` or a `- list item` — no prose, no comments",
      );
    } else {
      for (const key of REQUIRED_KEYS) {
        if (!fm.keys.has(key) || fm.keys.get(key) === "") {
          problem(
            rel,
            `missing frontmatter key: ${key}`,
            "title names the document; status places it in the governance lifecycle",
            `add ${key}: to the frontmatter`,
          );
        }
      }
      for (const key of fm.keys.keys()) {
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
      const status = fm.keys.get("status");
      if (status !== undefined && status !== "" && !STATUS_VALUES.has(status)) {
        problem(
          rel,
          `status "${status}" is not one of ${[...STATUS_VALUES].join(" | ")}`,
          "the lifecycle is a closed set; free-form states cannot be gated on",
          "pick the closest lifecycle state",
        );
      }
      const successor = fm.keys.get("superseded_by");
      if (status === "superseded" && !successor) {
        problem(
          rel,
          "superseded without superseded_by",
          "a replaced document must point at its successor or readers dead-end on stale truth",
          "add superseded_by: ./<successor>.md",
        );
      }
      // A successor that names a path must be a document that exists: the
      // pointer is the whole value of marking something superseded.
      if (successor && (/^\.{1,2}\//.test(successor) || successor.toLowerCase().endsWith(".md"))) {
        const resolved = path.resolve(path.dirname(p), successor.split("#")[0]);
        if (!resolved.startsWith(knowledgeDir + path.sep)) {
          problem(
            rel,
            `superseded_by leaves the record: ${successor}`,
            "the successor is what readers are sent to instead — outside knowledge/ it is not a governed document",
            "point superseded_by at a document inside knowledge/",
          );
        } else if (!existsSync(resolved)) {
          problem(
            rel,
            `superseded_by points at a document that does not exist: ${successor}`,
            "a replaced document must hand the reader its successor — a broken pointer dead-ends them on stale truth",
            "fix the path (it resolves relative to this document), or write the successor first",
          );
        }
      }
    }
    // links: resolve, and never escape the record
    for (const target of linkTargets(stripCode(text))) checkLinkTarget(rel, p, target);
  }
}

// ---------------------------------------------------------------------------
// instance.md: the identity of this SoR — format 1, closed key set
// ---------------------------------------------------------------------------
const INSTANCE_KEYS = new Set(["format", "name", "ksor", "site"]);
const INSTANCE_KSOR_KEYS = new Set(["requires", "scaffolded"]);
const INSTANCE_SITE_KEYS = new Set(["url"]);

const instanceMd = path.join(root, "instance.md");
if (!existsSync(instanceMd)) {
  problem(
    "instance.md",
    "the instance identity file is missing",
    "instance.md says what this SoR is authoritative for — without it nothing states the record's scope, and the future agent surface has no system prompt",
    "restore instance.md from git history, or run the intake-interview skill to write it",
  );
} else {
  const fm = parseFrontmatter(readFileSync(instanceMd, "utf8"));
  if (fm === null) {
    problem(
      "instance.md",
      "no frontmatter",
      "the format stamp is how any ksor version knows how to read this project",
      "start the file with ---\\nformat: 1\\nname: <this-sor>\\n---",
    );
  } else if (fm.malformed.length > 0) {
    problem(
      "instance.md",
      `unclosed or malformed frontmatter — this is not a frontmatter line: "${fm.malformed[0]}"`,
      "an unclosed block swallows the identity prose and turns it into unreadable configuration",
      "close the block with --- on its own line; every line inside it is `key: value` — the identity prose belongs below it",
    );
  } else {
    const format = fm.keys.get("format");
    if (format === undefined) {
      problem(
        "instance.md",
        "missing frontmatter key: format",
        "the format stamp is how any ksor version knows how to read this project",
        "add format: 1",
      );
    } else if (format !== "1") {
      problem(
        "instance.md",
        `format "${format}" is not 1`,
        "format 1 is the only shape this project's tooling can read",
        "set format: 1 (a newer format means you need a newer ksor)",
      );
    }
    if (!fm.keys.has("name") || fm.keys.get("name") === "") {
      problem(
        "instance.md",
        "missing frontmatter key: name",
        "the name identifies this SoR to agents — it is the authority in every future citation",
        "add name: <this-sor>",
      );
    }
    for (const key of fm.keys.keys()) {
      if (!INSTANCE_KEYS.has(key)) {
        problem(
          "instance.md",
          `unknown top-level key: ${key}`,
          "the instance key set is closed so a key never means two things — and a misspelled key must never be silently ignored",
          `remove "${key}:" (allowed: ${[...INSTANCE_KEYS].join(", ")}); identity prose belongs in the body, below the frontmatter`,
        );
      }
    }
    for (const [parent, allowed] of [
      ["ksor", INSTANCE_KSOR_KEYS],
      ["site", INSTANCE_SITE_KEYS],
    ]) {
      for (const key of fm.children.get(parent)?.keys() ?? []) {
        if (!allowed.has(key)) {
          problem(
            "instance.md",
            `unknown key under ${parent}: ${key}`,
            "the instance key set is closed at every level — an ignored key is a setting the owner believes is in effect",
            `remove "${key}:" (allowed under ${parent}: ${[...allowed].join(", ")})`,
          );
        }
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
// The mirror holds in both directions: a file only Claude Code can see is an
// instruction no other agent obeys and no reviewer reads twice.
if (existsSync(claudeSkills)) {
  for (const file of walkFiles(claudeSkills)) {
    const relFile = path.relative(claudeSkills, file);
    if (!existsSync(path.join(agentsSkills, relFile))) {
      problem(
        `.claude/skills/${relFile.split(path.sep).join("/")}`,
        "file exists only under .claude/skills",
        ".agents/skills is canonical — anything only the copy carries is a rule that never went through review",
        `delete it, or add it to .agents/skills/${relFile.split(path.sep).join("/")} and re-copy the tree`,
      );
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
    .filter((p) => p.toLowerCase().endsWith(".md") || p.toLowerCase().endsWith(".mdx"));
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
