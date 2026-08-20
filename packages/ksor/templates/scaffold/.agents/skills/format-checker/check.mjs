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
  "visibility",
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
 * and `audiences:` have list items, collected under the key above them).
 * Returns null when there is no block at all, and collects every line that is
 * neither `key: value`, a list item, an indented continuation, nor blank —
 * those mean the block was never closed.
 */
function parseFrontmatter(text) {
  // An editor's byte-order mark is invisible to the author; it must not be
  // the reason a document reads as ungoverned.
  const normalized = text.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  const match = /^---\n([\s\S]*?)\n---/.exec(normalized);
  if (!match) return null;
  const keys = new Map();
  const children = new Map();
  const lists = new Map();
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
      if (/^"(?:[^"\\]|\\.)*"$/.test(rawValue) || /^'(?:[^']|'')*'$/.test(rawValue)) {
        quoted.add(current);
      } else if (/^["']/.test(rawValue)) {
        // Starts like a quote but is not one clean quoted string — YAML
        // refuses it, and unquote() below hides the evidence (review
        // finding, 2026-08-18: `"a" and "b"` slipped every danger test).
        malformedQuote.set(current, rawValue);
      }
      keys.set(current, unquote(top[2]));
      children.set(current, new Map());
      lists.set(current, []);
      continue;
    }
    const nested = /^[ \t]+([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (nested && current !== null) {
      // Same hazard as the top-level duplicate above, one level down: this Map
      // keeps the LAST write while the surfaces read the FIRST occurrence, so
      // the check validates one value and the build publishes the other
      // (found 2026-08-20: `governance: nope` then `governance: false` passed
      // the check and crashed the build).
      if (children.get(current).has(nested[1])) duplicates.push(`${current}.${nested[1]}`);
      children.get(current).set(nested[1], unquote(nested[2]));
      continue;
    }
    // A list item belongs to the key above it: audiences: is a list of
    // audiences, and the rules that read it need the entries, not their count.
    const item = /^[ \t]*-[ \t]+(.*)$/.exec(line);
    if (item && current !== null) {
      // YAML ends a plain scalar at ` #` — the comment is not part of the
      // entry, and reading it as one refuses the documents instead of the
      // list (found live 2026-08-18: `- public # the default` made every
      // public document's visibility undeclared).
      const value = /^["']/.test(item[1]) ? item[1] : item[1].replace(/\s+#.*$/, "");
      lists.get(current).push(unquote(value));
      continue;
    }
    // A dash glued to its value (`-internal`) is a list item to nobody —
    // the indented-continuation escape below swallowed it while the build
    // scanners stopped reading the list there: one green record, two
    // different audience lists (review finding, 2026-08-19).
    if (/^[ \t]*-\S/.test(line)) {
      malformed.push(line.trim());
      continue;
    }
    if (/^[ \t]*-([ \t]|$)/.test(line) || /^[ \t]+\S/.test(line)) continue;
    malformed.push(line.trim());
  }
  return {
    keys,
    children,
    lists,
    quoted,
    malformedQuote,
    duplicates,
    malformed,
    tightColons,
    tabIndents,
  };
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
  // Spans stripped per PARAGRAPH: CommonMark code spans may cross lines, so
  // a line bound flagged links inside real multi-line spans — while a
  // document-wide strip let one stray backtick pair with another pages
  // later and silently exempt every link between them. A paragraph bounds
  // both failure modes (review findings, 2026-08-18, both rounds).
  return kept
    .join("\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/(`+)[^`]*?\1/g, " "))
    .join("\n\n");
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

/** Reports a broken target; returns the record document it resolves to, if any. */
function checkLinkTarget(rel, docPath, target) {
  // Anything with a URI scheme (https:, mailto:, tel:, ftp:, …) or a
  // protocol-relative // host leaves the record on purpose — only relative
  // paths are the record's own links (review finding 2026-08-18: tel: was
  // reported as a dead file and //host as an escape).
  if (target === "" || target.startsWith("#") || target.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
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
  } else if (resolved.endsWith(".md")) {
    return resolved;
  }
  return null;
}

// ---------------------------------------------------------------------------
// the audience model: who may read a document, declared in instance.md
// ---------------------------------------------------------------------------
const instanceMd = path.join(root, "instance.md");

/**
 * The declared audiences, ordered least- to most-restricted, or null when the
 * record declares none — and then every visibility rule below stays inert, so
 * a record without an audience model behaves exactly as it did before the key
 * existed. Read before the record itself: who may read what is a property of
 * the whole record, which no single document can answer.
 */
function readAudienceModel() {
  if (!existsSync(instanceMd)) return null;
  const fm = parseFrontmatter(readFileSync(instanceMd, "utf8"));
  const audiences = fm?.lists.get("audiences") ?? [];
  if (audiences.length === 0) return null;
  return { audiences, defaultVisibility: scalarValue(fm, "default_visibility") ?? "" };
}

/**
 * A plain scalar ends at ` #` — the rule the list items above already follow
 * and both build scanners apply. The checker not applying it to values let
 * `default_visibility: public # the default` build fine and fail `pnpm check`
 * (review finding, 2026-08-19).
 */
function scalarValue(fm, key) {
  const value = fm.keys.get(key);
  if (value === undefined || fm.quoted.has(key)) return value;
  return value.replace(/\s+#.*$/, "").trim();
}

const audienceModel = readAudienceModel();

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
  const visibilityByPath = new Map();
  const documentPaths = new Set();
  const crossings = [];
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
        if (key !== "provenance" && !fm.quoted.has(key) && /^\[.*\]$/.test(value)) {
          problem(
            rel,
            `${key} is one value, not a list: ${value}`,
            "YAML reads [..] as a list, and the site's schema wants a single value here — the build would fail after this check passed",
            `write it plain (or quoted): ${key}: "${value}"`,
          );
        }
      }
      const provenance = fm.keys.get("provenance");
      if (
        provenance !== undefined &&
        provenance !== "" &&
        (fm.quoted.has("provenance") || !/^\[.*\]$/.test(provenance))
      ) {
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
      if (successor && status !== "superseded") {
        problem(
          rel,
          `superseded_by on a document that is status: ${status || "(none)"}`,
          "the two keys are one statement — a successor pointer says this document was replaced, so a record that keeps the pointer while calling the document current contradicts itself, and the site publishes a Superseded notice over a live document",
          "set status: superseded, or remove superseded_by if this document is still current",
        );
      }
      // superseded_by must be a document pointer, and EVERY successor is
      // validated. This was gated behind a shape test until 2026-08-20, so a
      // value matching neither shape (`hr/refunds-2026`) skipped existence,
      // escape-the-record AND the cross-audience rule — and then the site
      // published the raw pointer, naming a document a lower tier must not know
      // exists.
      if (successor && !successor.split("#")[0].toLowerCase().endsWith(".md")) {
        problem(
          rel,
          `superseded_by is not a document pointer: ${successor}`,
          "unless it names a markdown document this check cannot tell whether the successor exists, stays inside the record, or is readable by this document's audience — and the site publishes the raw text of it",
          "write it as a relative path to the successor, e.g. superseded_by: ./<successor>.md",
        );
      } else if (successor) {
        const resolved = path.resolve(path.dirname(p), successor.split("#")[0]);
        if (!resolved.startsWith(knowledgeDir + path.sep)) {
          problem(
            rel,
            `superseded_by leaves the record: ${successor}`,
            "the successor is what readers are sent to instead — outside knowledge/ it is not a governed document",
            "point superseded_by at a document inside knowledge/",
          );
        } else if (!existsSync(resolved) || !lstatSync(resolved).isFile()) {
          problem(
            rel,
            `superseded_by points at a document that does not exist: ${successor}`,
            "a replaced document must hand the reader its successor — a broken pointer dead-ends them on stale truth",
            "fix the path (it resolves relative to this document), or write the successor first",
          );
        } else {
          crossings.push({ kind: "superseded_by", rel, from: p, to: resolved, target: successor });
        }
      }
      // `effective` is the DAY a document takes effect. Written unquoted with a
      // time, YAML makes it a timestamp, and normalizing that to a UTC day
      // prints the day before the record's for any positive offset (found
      // 2026-08-20: `2026-04-01 00:00:00 +05:00` rendered 2026-03-31).
      const effective = fm.keys.get("effective");
      if (
        effective !== undefined &&
        !fm.quoted.has("effective") &&
        /^\d{4}-\d{2}-\d{2}[T ]./.test(effective)
      ) {
        problem(
          rel,
          `effective carries a time: ${effective}`,
          "a timestamp is read in a timezone, and the day it lands on is not always the day written here — the page would show the day before this one",
          `write the date alone (effective: ${effective.slice(0, 10)}), or quote it to keep it as text`,
        );
      }
      // visibility: one audience per document, from the set instance.md declares
      const visibility = fm.keys.get("visibility");
      const listed = fm.lists.get("visibility") ?? [];
      // A flow list ([a, b]) is already named by the shape rule above.
      const flowList = !fm.quoted.has("visibility") && /^\[.*\]$/.test(visibility ?? "");
      if (listed.length > 0) {
        problem(
          rel,
          "visibility is one value, not a list",
          "a list makes every document a set-membership question, and set intersection is where access-control bugs live — one document belongs to exactly one audience",
          `write a single audience: visibility: ${audienceModel?.audiences.at(-1) ?? "<audience>"}`,
        );
      } else if (visibility !== undefined && !flowList) {
        if (audienceModel === null) {
          problem(
            rel,
            `visibility: ${visibility} — the record declares no audience model`,
            "who may read a document is governance, not a comment: with no audiences: in instance.md nothing constrains this value, and every surface publishes the document to everyone regardless",
            "add audiences: to instance.md (ordered least- to most-restricted, public first) with default_visibility:, or remove the visibility: key",
          );
        } else if (!audienceModel.audiences.includes(visibility)) {
          problem(
            rel,
            `visibility "${visibility}" is not a declared audience`,
            "the audience set is closed in instance.md — a value outside it names a build that does not exist, so the document reaches either nobody or everybody",
            `use one of: ${audienceModel.audiences.join(", ")} — or remove the key to take the default (${audienceModel.defaultVisibility})`,
          );
        }
      }
      documentPaths.add(p);
      if (audienceModel !== null) {
        visibilityByPath.set(p, visibility ?? audienceModel.defaultVisibility);
      }
    }
    // links: resolve, and never escape the record
    for (const target of linkTargets(stripCode(text))) {
      const to = checkLinkTarget(rel, p, target);
      if (to !== null) crossings.push({ kind: "link", rel, from: p, to, target });
    }
  }

  for (const { kind, rel, to, target } of crossings) {
    if (kind !== "superseded_by" || documentPaths.has(to)) continue;
    problem(
      rel,
      `superseded_by does not name a document in the record: ${target}`,
      "it resolves to a file the record does not govern — on a case-insensitive filesystem a mis-typed capitalisation resolves happily here and then misses every rule keyed by the real path, the cross-audience check included",
      "match the successor's path exactly as it appears under knowledge/ (ascii lowercase)",
    );
  }

  // Pointers across audiences: the leak no single build can catch, because the
  // build that publishes the pointer has already dropped its target and cannot
  // know it ever existed. Only the whole record sees both ends.
  if (audienceModel !== null) {
    const audienceOf = (file) => visibilityByPath.get(file) ?? audienceModel.defaultVisibility;
    const tier = (file) => audienceModel.audiences.indexOf(audienceOf(file));
    for (const { kind, rel, from, to, target } of crossings) {
      const here = tier(from);
      const there = tier(to);
      // An undeclared audience at either end is already reported; comparing
      // against a tier that does not exist would invent a second problem.
      if (here === -1 || there === -1 || there <= here) continue;
      const relTo = path.relative(root, to);
      const both = `${relTo} is ${audienceOf(to)}, this document is ${audienceOf(from)}`;
      if (kind === "link") {
        problem(
          rel,
          `link to a more restricted document: ${target} — ${both}`,
          "the build that publishes this link has already dropped its target: the link text and URL ship to readers who cannot open them, naming a document they were never meant to know exists",
          `raise this document to ${audienceOf(to)}, widen ${relTo} to ${audienceOf(from)}, or remove the link`,
        );
      } else {
        problem(
          rel,
          `superseded_by points at a more restricted document: ${target} — ${both}`,
          "it strands the very readers the supersession exists to redirect: they are told this document is replaced, by a successor their build does not contain",
          `widen ${relTo} to ${audienceOf(from)}, raise this document to ${audienceOf(to)}, or supersede it with a document its readers can reach`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// instance.md: the identity of this SoR — format 1, closed key set
// ---------------------------------------------------------------------------
// The identity/site keys this checker owns, PLUS the four kernel config groups
// (database/embedding/retrieval/budgets) that `ksor serve`/`ingest` read. The
// groups are optional — a level-0 project that only runs `pnpm dev` declares
// none, and the default scaffold ships none (init stays database-free). They
// must be ALLOWED here so a project climbing to the served rung is not fought
// by its own CI: the kernel's instance parser (packages/content/src/instance.ts)
// REQUIRES `database:` to serve and is authoritative for the VALUES inside each
// group (dsn_env grammar, dim range, the vector_floor states). This checker
// only guards the key NAMES so a misspelled group or field is still caught.
const INSTANCE_KEYS = new Set([
  "format",
  "name",
  "ksor",
  "site",
  "audiences",
  "default_visibility",
  "database",
  "embedding",
  "retrieval",
  "budgets",
]);
const INSTANCE_KSOR_KEYS = new Set(["requires", "scaffolded"]);
const INSTANCE_SITE_KEYS = new Set(["url", "governance"]);
// Nested field names mirror the kernel's instance schema; the kernel validates
// their values (this checker stays dependency-free and cannot import it).
const INSTANCE_DATABASE_KEYS = new Set(["dsn_env", "tenant_id"]);
const INSTANCE_EMBEDDING_KEYS = new Set(["provider", "model", "dim"]);
const INSTANCE_RETRIEVAL_KEYS = new Set(["vector_floor", "keyword_floor"]);
const INSTANCE_BUDGETS_KEYS = new Set(["maximum_response_characters"]);

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
    // The same YAML-shape rules the record's documents get: a duplicated
    // name: here passed while the shells published the OTHER occurrence
    // (review finding, 2026-08-18).
    for (const line of fm.tightColons) {
      problem(
        "instance.md",
        `missing space after the colon: ${line}`,
        "YAML needs `key: value` — without the space the build fails after this check passed",
        "add a space after the colon",
      );
    }
    for (const line of fm.tabIndents) {
      problem(
        "instance.md",
        `tab-indented frontmatter: ${JSON.stringify(line)}`,
        "YAML refuses tabs as indentation — the build fails after this check passed",
        "indent with spaces",
      );
    }
    for (const dup of fm.duplicates) {
      problem(
        "instance.md",
        `duplicate frontmatter key: ${dup}`,
        "YAML refuses a repeated key — and the surfaces publish one occurrence while this check validated the other",
        `keep one ${dup}: line`,
      );
    }
    for (const [key, raw] of fm.malformedQuote) {
      problem(
        "instance.md",
        `frontmatter quoting is malformed: ${key}: ${raw}`,
        "the value starts like a quoted string but is not one clean quoted string — YAML refuses it",
        `quote the whole value exactly once: ${key}: "..."`,
      );
    }
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
    // the audience model: ordered, public first, and never without its default
    const audiences = fm.lists.get("audiences") ?? [];
    const defaultVisibility = scalarValue(fm, "default_visibility") ?? "";
    if (fm.keys.has("audiences") && audiences.length === 0) {
      const value = fm.keys.get("audiences");
      problem(
        "instance.md",
        value === ""
          ? "audiences: declares no audiences"
          : `audiences is a list, not a value: ${value}`,
        "the audience list is the record's whole access model, ordered least- to most-restricted — with nothing in it, no document's visibility: can be answered",
        "write it as list items:\n      audiences:\n        - public\n        - internal",
      );
    } else if (audiences.length > 0) {
      if (audiences[0] !== "public") {
        problem(
          "instance.md",
          `audiences: does not start with public (it starts with "${audiences[0]}")`,
          "the order is the restriction level, and that ordering is what makes an internal build mean public-and-internal with no further configuration — public is the least restricted tier by definition",
          "list public first, then each narrower audience in turn",
        );
      }
      const seen = new Set();
      for (const audience of audiences) {
        if (seen.has(audience)) {
          problem(
            "instance.md",
            `duplicate audience: ${audience}`,
            "an audience's position in the list is its restriction level — named twice, it has two levels and neither can be trusted",
            `keep one ${audience} entry`,
          );
        }
        seen.add(audience);
      }
      if (defaultVisibility === "") {
        problem(
          "instance.md",
          "audiences: without default_visibility:",
          "there is no safe inference for a document that declares no audience: guessing the widest leaks the first document whose key is forgotten, guessing the narrowest hides the record from everyone it was written for",
          `add default_visibility: — one of ${audiences.join(", ")} — the audience a document belongs to when it declares none`,
        );
      } else if (!audiences.includes(defaultVisibility)) {
        problem(
          "instance.md",
          `default_visibility "${defaultVisibility}" is not one of the declared audiences`,
          "every document without a visibility: key takes this value — a default outside the list puts most of the record in an audience that does not exist",
          `use one of: ${audiences.join(", ")}`,
        );
      }
    } else if (fm.keys.has("default_visibility")) {
      problem(
        "instance.md",
        "default_visibility: without audiences:",
        "a default audience with no audience list is a setting with nothing to select from — the owner believes the record has a visibility model while every surface publishes every document to everyone",
        "add audiences: (ordered least- to most-restricted, public first), or remove default_visibility:",
      );
    }
    // A group written as a flow mapping (`site: { governance: false }`) lands
    // as a scalar with NO children, so every nested rule below — the closed key
    // set included — silently skips it: the owner's setting is dropped without
    // a word (found 2026-08-20). The groups are block mappings, always.
    for (const parent of ["ksor", "site", "database", "embedding", "retrieval", "budgets"]) {
      const inline = fm.keys.get(parent);
      if (inline !== undefined && inline !== "") {
        problem(
          "instance.md",
          `${parent}: has an inline value: ${inline}`,
          "a group written on one line is not read as a group — every key inside it is skipped by this check AND by the surfaces, so the settings the owner wrote are silently dropped",
          `write it as an indented block:\n      ${parent}:\n        <key>: <value>`,
        );
      }
    }
    for (const [parent, allowed] of [
      ["ksor", INSTANCE_KSOR_KEYS],
      ["site", INSTANCE_SITE_KEYS],
      ["database", INSTANCE_DATABASE_KEYS],
      ["embedding", INSTANCE_EMBEDDING_KEYS],
      ["retrieval", INSTANCE_RETRIEVAL_KEYS],
      ["budgets", INSTANCE_BUDGETS_KEYS],
    ]) {
      for (const key of fm.children.get(parent)?.keys() ?? []) {
        // site.governance is a switch, so its VALUE is checked here: a typo
        // that silently defaulted would publish the governance the owner asked
        // to hide, or hide what they asked to publish.
        if (parent === "site" && key === "governance") {
          const raw = (fm.children.get("site")?.get("governance") ?? "").trim();
          const value = (/^["']/.test(raw) ? raw : raw.replace(/\s+#.*$/, ""))
            .trim()
            .replace(/^(['"])(.*)\1$/, "$2");
          if (value !== "true" && value !== "false") {
            problem(
              "instance.md",
              `site.governance is "${value}" — it must be true or false`,
              "it decides whether pages show the owner, effective date and sources each document declares; a value nobody can read is a setting the owner believes is in effect",
              'write "governance: false" to keep pages plain, or remove the key (the default shows them)',
            );
          }
        }
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
        // The per-audience stage: generated copies of the record a build makes
        // for one audience, never authored content (specs/ksor/visibility).
        !p.includes(`${path.sep}.staged-knowledge${path.sep}`) &&
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
