#!/usr/bin/env node
// The record's format rules as a program — dependency-free Node, owned by
// this repository. Every failure states what is wrong, why the rule exists,
// and how to fix it, so anyone (human or agent) self-corrects without a
// reviewer. Run as `pnpm check` or directly: node .agents/skills/format-checker/check.mjs

import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
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

// PNG integrity, dependency-free: signature + per-chunk CRC-32. A damaged
// image beside a document is a check-time problem with the file named, never
// a build-time 500 with no filename in it.
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes, start, end) {
  let c = 0xffffffff;
  for (let i = start; i < end; i += 1) {
    c = (CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** The first defect in a PNG file, or null when every chunk checks out. */
function firstBrokenPngChunk(file) {
  const bytes = readFileSync(file);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8 || signature.some((b, i) => bytes[i] !== b)) {
    return "bad signature";
  }
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const name = bytes.toString("latin1", offset + 4, offset + 8);
    const dataEnd = offset + 8 + length;
    if (dataEnd + 4 > bytes.length) return `truncated ${name} chunk`;
    const stored = bytes.readUInt32BE(dataEnd);
    if (crc32(bytes, offset + 4, dataEnd) !== stored) return `CRC error in ${name} chunk`;
    if (name === "IEND") return null;
    offset = dataEnd + 4;
  }
  return "missing IEND chunk";
}
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
  const quoted = new Set();
  const malformedQuote = new Map();
  const malformed = [];
  const duplicates = [];
  const tightColons = [];
  const tabIndents = [];
  let current = null;
  for (const raw of match[1].split("\n")) {
    const line = raw.replace(/[ \t]+$/, "");
    if (line === "") continue;
    // YAML requires a space after the colon and refuses tab indentation —
    // both parsed here fine and failed the build (review findings, 2026-08-18).
    if (/^[A-Za-z_][\w-]*:\S/.test(line)) tightColons.push(line);
    if (line.startsWith("	")) tabIndents.push(line);
    const top = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (top) {
      current = top[1];
      // A Map silently keeps the last write; YAML refuses the document
      // (review finding, 2026-08-18: green check, red build).
      if (keys.has(current)) duplicates.push(current);
      const rawValue = top[2].trim();
      if (/^"(?:[^"\\]|\\.)*"$/.test(rawValue) || /^'[^']*'$/.test(rawValue)) {
        quoted.add(current);
      } else if (/^["']/.test(rawValue)) {
        // Starts like a quote but is not one clean quoted string — YAML
        // refuses it, and unquote() below hides the evidence (review
        // finding, 2026-08-18: `"a" and "b"` slipped every danger test).
        malformedQuote.set(current, rawValue);
      }
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
  return { keys, children, quoted, malformedQuote, duplicates, malformed, tightColons, tabIndents };
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
  // Spans bounded to one line: a stray unpaired backtick once paired with
  // the next backtick pages later and silently exempted every link between
  // them from the dead-link rules (review finding, 2026-08-18).
  return kept.join("\n").replace(/(`+)[^`\n]*?\1/g, " ");
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
  const allEntries = walkFiles(knowledgeDir).filter((p) => !OS_JUNK.has(path.basename(p)));
  const files = [];
  for (const p of allEntries) {
    // The record is plain files: a symlink breaks the walk-away copy, and a
    // dangling one crashed the checker with a raw ENOENT before any other
    // problem was reported (review finding, 2026-08-18).
    if (lstatSync(p).isSymbolicLink()) {
      problem(
        path.relative(root, p),
        "symlink in the record",
        "the record must survive being copied anywhere — a symlink carries a machine-local path, and a dangling one is unreadable",
        "replace the link with the file it points at",
      );
      continue;
    }
    files.push(p);
  }
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
    // eslint-disable-next-line no-control-regex -- the point is the range
    if (/[^\x20-\x7E]/.test(base)) {
      problem(
        rel,
        `"${base}" contains non-ASCII characters`,
        "the path is the document's URL, and site frameworks disagree on how to encode non-ASCII routes — the same document gets a different address on each surface (found live: política.md exported two incompatible routes)",
        "use ascii lowercase letters, digits and hyphens; the title: key carries the document's real name in any language",
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
    if (files.includes(p) && path.extname(p) === ".png") {
      const brokenChunk = firstBrokenPngChunk(p);
      if (brokenChunk !== null) {
        problem(
          rel,
          `corrupt PNG (${brokenChunk})`,
          "a corrupt image can take the whole site down at build time with an error that never names this file (found live: one bad CRC 500'd every page)",
          "re-export or re-download the image; the bytes on disk are damaged",
        );
      }
    }
    if (base.startsWith("_")) {
      // found live 2026-08-18: one shell's framework treats _files as hidden
      // partials and skips them, the other publishes them — the same record,
      // one document present on one surface and dead-linked on the other.
      problem(
        rel,
        "underscore-prefixed name",
        "site frameworks treat _files as hidden partials — the record has no hidden documents; every document is published or it is not in the record",
        "rename without the leading underscore",
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
      for (const line of fm.tightColons) {
        problem(
          rel,
          `missing space after the colon: ${line}`,
          "YAML needs `key: value` — without the space the build fails after this check passed",
          "add a space after the colon",
        );
      }
      for (const line of fm.tabIndents) {
        problem(
          rel,
          `tab-indented frontmatter: ${JSON.stringify(line)}`,
          "YAML refuses tabs as indentation — the build fails after this check passed",
          "indent with spaces",
        );
      }
      for (const dup of fm.duplicates) {
        problem(
          rel,
          `duplicate frontmatter key: ${dup}`,
          "YAML refuses a repeated key, so the build would fail after this check passed — and only one of the two values can be the truth",
          `keep one ${dup}: line`,
        );
      }
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
      for (const [key, value] of fm.keys) {
        // The site parses this block with a real YAML parser; values it
        // rejects must be refused HERE with a remedy, not later as a raw
        // YAMLException from inside node_modules (found live 2026-08-18:
        // an unquoted colon in a title killed both site builds after a
        // green check).
        if (fm.malformedQuote.has(key)) {
          problem(
            rel,
            `frontmatter quoting is malformed: ${key}: ${fm.malformedQuote.get(key)}`,
            "the value starts like a quoted string but is not one clean quoted string — YAML refuses it, so the build would fail after this check passed",
            `quote the whole value exactly once: ${key}: "..."`,
          );
        } else if (
          !fm.quoted.has(key) &&
          (value.includes(": ") ||
            value.endsWith(":") ||
            value.includes(" #") ||
            // A complete [flow, list] is valid YAML; only a value that STARTS
            // like one without finishing it is broken (review finding,
            // 2026-08-18: a valid flow provenance was refused with a remedy
            // that was itself malformed).
            (value.startsWith("[") && !/^\[.*\]$/.test(value)) ||
            /^[{>|&*!%@`'"]/.test(value) ||
            /^-(\s|$)/.test(value))
        ) {
          problem(
            rel,
            `frontmatter value needs quoting: ${key}: ${value}`,
            "the site reads this block as YAML: unquoted colons and leading [ { > | & * ! % @ ` fail the build after this check passed, and ` #` starts a YAML comment — the page would carry a silently truncated value",
            `quote it: ${key}: "${value}"`,
          );
        }
      }
      // provenance is a LIST — the site's schema enforces it at build, so a
      // scalar value passing here failed there with a schema error naming
      // neither file nor rule (review finding, 2026-08-18).
      for (const [key, value] of fm.keys) {
        if (key !== "provenance" && /^\[.*\]$/.test(value)) {
          problem(
            rel,
            `${key} is one value, not a list: ${value}`,
            "YAML reads [..] as a list, and the site's schema wants a single value here — the build would fail after this check passed",
            `write it plain (or quoted): ${key}: "${value}"`,
          );
        }
      }
      const provenance = fm.keys.get("provenance");
      if (provenance !== undefined && provenance !== "" && !/^\[.*\]$/.test(provenance)) {
        problem(
          rel,
          `provenance is a list, not a value: ${provenance}`,
          "each source is one entry so citations can point at exactly one of them",
          `write it as list items:\n      provenance:\n        - ${provenance}`,
        );
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
    const instanceName = fm.keys.get("name") ?? "";
    if (instanceName === "") {
      problem(
        "instance.md",
        "missing frontmatter key: name",
        "the name identifies this SoR to agents — it is the authority in every future citation",
        "add name: <this-sor>",
      );
    } else if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(instanceName)) {
      // The same grammar `ksor init` enforces at birth: round 3 made this
      // file the single identity source for every surface, so the guard on
      // it has to hold for life, not only at init (review finding,
      // 2026-08-18: an edited name published exactly what init refuses).
      problem(
        "instance.md",
        `name "${instanceName}" does not match ^[a-z0-9][a-z0-9-]{0,62}$`,
        "the name is the future ksor://<name>/ authority and every surface's identity — the grammar that binds it at init binds it forever",
        "use ascii lowercase letters, digits and hyphens",
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
  // exitCode, never exit(): exit() drops queued pipe writes, truncating the
  // report mid-word for any reader slower than a file (review finding,
  // 2026-08-18 — 800 problems arrived as 309 through a pipe).
  process.exitCode = 1;
} else {
  console.log("format-checker: ok — the record is well-formed");
}
