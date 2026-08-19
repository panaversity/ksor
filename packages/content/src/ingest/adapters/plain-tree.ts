/**
 * The plain-tree corpus adapter — ANY folder of Markdown becomes a corpus.
 * Converted from the oracle (sor-agentfactory @ b554f91,
 * ingest/adapters/plain_tree.py); the kernel cannot tell this manifest from
 * any other adapter's.
 *
 * Conventions (deliberately minimal — an operator can satisfy them with a bare
 * folder):
 *   - directories become `section` nodes; `.md`/`.mdx` files become `document`
 *     nodes;
 *   - `index.md` (or `README.md`) inside a directory is that SECTION's own
 *     content, not a child;
 *   - ordering: frontmatter `position` (or `sidebar_position`) wins, else name
 *     sort;
 *   - titles: frontmatter `title`, else the filename humanized;
 *   - stable ids: frontmatter `sor_id`, else the tree-relative path;
 *   - hidden entries (leading `.` or `_`) and ALL symlinks are skipped LOUDLY
 *     (reported through `onSkip`, console by default — never silent); symlinks
 *     are never followed, so a link cannot walk out of the tree or cycle it;
 *   - a directory carrying MORE than one index-named file (index.md +
 *     README.md …) fails loud: which one is the section's own content is
 *     ambiguous, and silently dropping the loser is exactly the corpus
 *     corruption this adapter must never commit.
 *
 * The oracle's `publish_bundle` (deterministic tgz staging) is a separate
 * slice and is not converted here.
 */

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import {
  type Manifest,
  ManifestError,
  type ManifestFile,
  type ManifestNode,
  manifestFile,
  manifestNode,
  manifestToJson,
  parseManifest,
} from "../manifest.js";

const INDEX_NAMES: readonly string[] = ["index.md", "index.mdx", "README.md"];
/** Frontmatter-position fallback for entries that declare none (oracle plain_tree.py:107,114). */
const POSITION_FALLBACK = 10_000;

export interface TreeFile {
  readonly kind: "file";
  readonly name: string;
  readonly text: string;
}

export interface TreeDir {
  readonly kind: "dir";
  readonly name: string;
  readonly entries: readonly TreeEntry[];
}

/** Never followed and never read — the walk only reports it. */
export interface TreeSymlink {
  readonly kind: "symlink";
  readonly name: string;
}

export type TreeEntry = TreeFile | TreeDir | TreeSymlink;

export interface PlainTreeOptions {
  readonly corpusId: string;
  readonly sourceCommit: string;
  /** Where "skipped loudly" goes; defaults to console.log — a skip is REPORTED, never silent. */
  readonly onSkip?: (line: string) => void;
}

export interface BuildFromTreeOptions extends PlainTreeOptions {
  /** Display path of the root, used in skip messages and `sources` values; defaults to the root's name. */
  readonly rootPath?: string;
}

export interface PlainTreeResult {
  readonly manifest: Manifest;
  /** manifest path → source file path (bundle staging input). */
  readonly sources: ReadonlyMap<string, string>;
}

/** Walk a directory on disk → manifest + sources. Fail-loud on emptiness and ambiguity. */
export async function buildManifest(
  treeRoot: string,
  options: PlainTreeOptions,
): Promise<PlainTreeResult> {
  const rootPath = treeRoot.length > 1 ? treeRoot.replace(/\/+$/, "") : treeRoot;
  let isDir = false;
  try {
    isDir = (await stat(rootPath)).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) throw new ManifestError(`plain-tree root ${rootPath} is not a directory`);
  const tree = await readTree(rootPath);
  return buildManifestFromTree(tree, { ...options, rootPath });
}

/**
 * Load a directory into an in-memory tree. lstat semantics throughout: a
 * symlink is represented as a symlink — even one named `index.md` — never
 * followed, never read (the oracle's docstring contract; its `_index_of`
 * incidentally followed a symlinked index via `is_file()`, which this port
 * deliberately does not reproduce). Non-markdown files are invisible to the
 * walk, exactly as the oracle's suffix filter makes them.
 */
export async function readTree(dirPath: string): Promise<TreeDir> {
  const dirents = await readdir(dirPath, { withFileTypes: true });
  const entries: TreeEntry[] = [];
  for (const d of dirents) {
    if (d.isSymbolicLink()) entries.push({ kind: "symlink", name: d.name });
    else if (d.isDirectory()) entries.push(await readTree(join(dirPath, d.name)));
    else if (d.isFile() && isDoc(d.name)) {
      entries.push({
        kind: "file",
        name: d.name,
        text: await readFile(join(dirPath, d.name), "utf8"),
      });
    }
  }
  return { kind: "dir", name: basename(dirPath), entries };
}

/** The pure walk: tree → manifest + {manifest path → source path}. */
export function buildManifestFromTree(
  root: TreeDir,
  options: BuildFromTreeOptions,
): PlainTreeResult {
  const rootName = root.name;
  const rootPath = options.rootPath ?? rootName;
  const onSkip = options.onSkip ?? ((line: string): void => console.log(line));
  const nodes: ManifestNode[] = [];
  const files: ManifestFile[] = [];
  const sources = new Map<string, string>();
  const skipped: string[] = [];

  const fullPath = (relSegs: readonly string[], name: string): string =>
    `${rootPath}/${[...relSegs, name].join("/")}`;

  const addFile = (nodeSid: string, fileSegs: readonly string[]): void => {
    const rel = fileSegs.join("/");
    const manifestPath = `${rootName}/${rel}`;
    files.push(manifestFile({ path: manifestPath, node: nodeSid }));
    sources.set(manifestPath, `${rootPath}/${rel}`);
  };

  const walk = (dir: TreeDir, relSegs: readonly string[], parentSid: string | null): void => {
    const entries = [...dir.entries].sort((a, b) =>
      codePointCompare(a.name.toLowerCase(), b.name.toLowerCase()),
    );
    const docs: TreeFile[] = [];
    const dirs: TreeDir[] = [];
    for (const e of entries) {
      if (e.kind === "symlink") skipped.push(`${fullPath(relSegs, e.name)} (symlink)`);
      else if (e.kind === "file" && isDoc(e.name)) docs.push(e);
      else if (e.kind === "dir") dirs.push(e);
    }

    const ordered: { position: number; nameLower: string; entry: TreeFile | TreeDir }[] = [];
    for (const f of docs) {
      if (f.name.startsWith(".") || f.name.startsWith("_")) {
        skipped.push(fullPath(relSegs, f.name));
        continue;
      }
      if (INDEX_NAMES.includes(f.name)) continue; // the parent section's own content — handled by the caller
      ordered.push({
        position: positionOf(frontmatterMeta(f.text), POSITION_FALLBACK),
        nameLower: f.name.toLowerCase(),
        entry: f,
      });
    }
    for (const d of dirs) {
      if (d.name.startsWith(".") || d.name.startsWith("_")) {
        skipped.push(fullPath(relSegs, d.name));
        continue;
      }
      const index = indexOf(d, fullPath(relSegs, d.name));
      const dirMeta = index === null ? {} : frontmatterMeta(index.text);
      ordered.push({
        position: positionOf(dirMeta, POSITION_FALLBACK),
        nameLower: d.name.toLowerCase(),
        entry: d,
      });
    }

    ordered.sort((x, y) => x.position - y.position || codePointCompare(x.nameLower, y.nameLower));
    let position = 0;
    for (const { entry } of ordered) {
      position += 1;
      if (entry.kind === "dir") {
        const dirSegs = [...relSegs, entry.name];
        const index = indexOf(entry, fullPath(relSegs, entry.name));
        const meta = index === null ? {} : frontmatterMeta(index.text);
        const sid =
          index === null
            ? // "#section" keeps an index-less shell distinct from a sibling FILE of the same
              // name (docs/foo.md + docs/foo/ would otherwise collide on "docs/foo")
              `${rootName}/${dirSegs.join("/")}#section`
            : stableIdOf(rootName, [...dirSegs, index.name], meta);
        nodes.push(
          manifestNode({
            stable_id: sid,
            slug: slugify(entry.name),
            title: titleOf(meta, entry.name),
            kind: "section",
            parent: parentSid,
            position,
          }),
        );
        if (index !== null) addFile(sid, [...dirSegs, index.name]);
        walk(entry, dirSegs, sid);
      } else {
        const meta = frontmatterMeta(entry.text);
        const stem = stemOf(entry.name);
        const sid = stableIdOf(rootName, [...relSegs, entry.name], meta);
        nodes.push(
          manifestNode({
            stable_id: sid,
            slug: slugify(stem),
            title: titleOf(meta, stem),
            kind: "document",
            parent: parentSid,
            position,
          }),
        );
        addFile(sid, [...relSegs, entry.name]);
      }
    }
  };

  const rootIndex = indexOf(root, rootPath);
  if (rootIndex !== null) {
    // the corpus's own landing document — a root node of its own
    const meta = frontmatterMeta(rootIndex.text);
    const sid = stableIdOf(rootName, [rootIndex.name], meta);
    nodes.push(
      manifestNode({
        stable_id: sid,
        slug: slugify(rootName),
        title: titleOf(meta, rootName),
        kind: "document",
        position: 0,
      }),
    );
    addFile(sid, [rootIndex.name]);
  }
  walk(root, [], null);
  // reported before any emptiness error, so an all-skips tree explains itself
  for (const s of skipped) onSkip(`plain-tree: skipped ${s}`);
  if (files.length === 0)
    throw new ManifestError(`plain-tree root ${rootPath} contains no Markdown`);

  const manifest: Manifest = {
    format: 1,
    corpus_id: options.corpusId,
    source_commit: options.sourceCommit,
    nodes,
    files,
  };
  parseManifest(JSON.stringify(manifestToJson(manifest))); // never emit what ingest would refuse
  return { manifest, sources };
}

/** Python `p.suffix in (".md", ".mdx")` parity: a dotfile named exactly ".md" has NO suffix. */
function isDoc(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  const suffix = name.slice(dot);
  return suffix === ".md" || suffix === ".mdx";
}

function indexOf(dir: TreeDir, dirPath: string): TreeFile | null {
  const present: TreeFile[] = [];
  for (const name of INDEX_NAMES) {
    const hit = dir.entries.find((e): e is TreeFile => e.kind === "file" && e.name === name);
    if (hit !== undefined) present.push(hit);
  }
  if (present.length > 1) {
    const names = present.map((p) => `'${p.name}'`).join(", ");
    throw new ManifestError(`ambiguous section index in ${dirPath}: [${names}] — keep exactly one`);
  }
  return present[0] ?? null;
}

function stableIdOf(
  rootName: string,
  fileSegs: readonly string[],
  meta: Record<string, unknown>,
): string {
  const sid = meta["sor_id"];
  if (typeof sid === "string" && sid.trim() !== "") return sid.trim();
  return `${rootName}/${withoutSuffix(fileSegs.join("/"))}`;
}

/** Python Path.with_suffix("") parity: strip the LAST suffix only; a dotfile has none. */
function withoutSuffix(rel: string): string {
  const slash = rel.lastIndexOf("/");
  const name = rel.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return rel;
  return rel.slice(0, slash + 1) + name.slice(0, dot);
}

function stemOf(name: string): string {
  return withoutSuffix(name);
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug !== "") return slug;
  // a non-Latin name slugs to nothing — derive a stable slug, never crash
  return "x-" + createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);
}

const CASED = /\p{Cased}/u;

/**
 * Python str.title() parity (the oracle's `_humanize`): a cased character
 * following an uncased one uppercases, following a cased one lowercases —
 * apostrophe quirk included ("rock'n'roll" → "Rock'N'Roll"). Node titles are
 * carry-forward join keys, so the quirk is load-bearing, not cosmetic.
 */
function humanize(stem: string): string {
  const spaced = stem.replace(/[-_]+/g, " ").trim();
  let out = "";
  let prevCased = false;
  for (const ch of spaced) {
    const cased = CASED.test(ch);
    out += cased ? (prevCased ? ch.toLowerCase() : ch.toUpperCase()) : ch;
    prevCased = cased;
  }
  return out;
}

/** Python `str(meta.get("title") or _humanize(...))` — falsy titles fall back. */
function titleOf(meta: Record<string, unknown>, fallbackStem: string): string {
  const t = meta["title"];
  if (t === undefined || t === null || t === "" || t === 0 || t === false)
    return humanize(fallbackStem);
  return String(t);
}

function positionOf(meta: Record<string, unknown>, fallback: number): number {
  for (const key of ["position", "sidebar_position"]) {
    const val = meta[key];
    // booleans never parse as positions; int() truncation parity via trunc
    if (typeof val === "number" && Number.isFinite(val)) return Math.trunc(val);
  }
  return fallback;
}

/** Python compares strings by code point; JS `<` compares UTF-16 units — they differ on astral names. */
function codePointCompare(a: string, b: string): number {
  const as = [...a];
  const bs = [...b];
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const d = (as[i]?.codePointAt(0) ?? 0) - (bs[i]?.codePointAt(0) ?? 0);
    if (d !== 0) return d;
  }
  return as.length - bs.length;
}

// ^\uFEFF? — a BOM-prefixed file must not serve its YAML as a chunk
// (review finding, 2026-08-19).
const FRONTMATTER = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

const YAML_BOOLS: Record<string, boolean> = {
  yes: true,
  Yes: true,
  YES: true,
  no: false,
  No: false,
  NO: false,
  true: true,
  True: true,
  TRUE: true,
  false: false,
  False: false,
  FALSE: false,
  on: true,
  On: true,
  ON: true,
  off: false,
  Off: false,
  OFF: false,
};

/**
 * Minimal PyYAML-compatible frontmatter reader for the FOUR scalar keys this
 * adapter consumes (`title`, `position`, `sidebar_position`, `sor_id`) — the
 * kernel discards every other frontmatter key at build time (taxonomy comes
 * from the manifest), so a YAML dependency would buy nothing (guard rule 5).
 * Scope, deliberately narrow pending a shared markdown module: top-level
 * `key: scalar` pairs only; nested/indented structure is ignored. Mirroring
 * the oracle's error path (`parse_frontmatter` catches YAMLError → `{}`), a
 * document PyYAML would refuse — an UNQUOTED value containing ": ", a block
 * scalar, an anchor/alias/tag, a non-mapping line — yields an EMPTY meta, so
 * titles fall back to the humanized filename instead of a half-read mapping.
 */
export function frontmatterMeta(text: string): Record<string, unknown> {
  const block = FRONTMATTER.exec(text)?.[1];
  if (block === undefined) return {};
  const meta: Record<string, unknown> = {};
  for (const line of block.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (/^[ \t]/.test(line)) continue; // nested structure — no top-level scalar to read
    const kv = /^([^\s:]+):(?:[ \t]+(.*))?$/.exec(line);
    const key = kv?.[1];
    if (key === undefined) return {}; // PyYAML would fail the whole document here
    const parsed = scalarValue((kv?.[2] ?? "").trim());
    if (!parsed.ok) return {}; // poison: the oracle's YAMLError path empties the meta
    meta[key] = parsed.value;
  }
  return meta;
}

interface ScalarResult {
  readonly ok: boolean;
  readonly value: unknown;
}

function scalarValue(raw: string): ScalarResult {
  if (raw === "") return { ok: true, value: null };
  const dq = /^"(.*)"$/.exec(raw);
  if (dq !== null)
    return { ok: true, value: (dq[1] ?? "").replace(/\\"/g, '"').replace(/\\\\/g, "\\") };
  const sq = /^'(.*)'$/.exec(raw);
  if (sq !== null) return { ok: true, value: (sq[1] ?? "").replace(/''/g, "'") };
  const plain = raw.replace(/[ \t]+#.*$/, "").trim(); // a trailing comment ends a plain scalar
  if (Object.hasOwn(YAML_BOOLS, plain)) return { ok: true, value: YAML_BOOLS[plain] };
  if (plain === "~" || /^(?:null|Null|NULL)$/.test(plain)) return { ok: true, value: null };
  if (/^[-+]?[0-9][0-9_]*$/.test(plain)) {
    return { ok: true, value: Number.parseInt(plain.replaceAll("_", ""), 10) };
  }
  if (/^[-+]?(?:\.[0-9]+|[0-9][0-9_]*\.[0-9_]*)(?:[eE][-+]?[0-9]+)?$/.test(plain)) {
    return { ok: true, value: Number.parseFloat(plain.replaceAll("_", "")) };
  }
  // PyYAML refuses these in a plain value position; anything it would instead
  // read as a non-scalar (flow map/seq) is equally outside this reader's scope.
  if (/:[ \t]/.test(plain) || plain.endsWith(":")) return { ok: false, value: null };
  if (/^[|>&*!{[]/.test(plain)) return { ok: false, value: null };
  return { ok: true, value: plain };
}
