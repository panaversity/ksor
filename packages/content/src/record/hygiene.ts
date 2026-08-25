/**
 * The hygiene rules the scaffold's hand-written checker carried and the
 * profile does not state: portable names, what a file may be, attachment
 * near-misses, image integrity, the instance's closed key set, and the shape
 * of the project around the record. Ported here (record spec §6) so the
 * emitted `check.mjs` is BUILT from one rule set instead of keeping a second
 * one by hand — nothing the old checker refused may become accepted silently.
 * Each rule keeps the scar that put it there.
 */
import { ATTACHMENT_SUFFIXES, nearMissOf } from "../lib/attachment-rule.js";
import { isSim, SIM_SUFFIX } from "../lib/sim-rule.js";
import type { Refusal } from "./refusal.js";

const KNOWLEDGE = "knowledge/";
const ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const COMPANION_SUFFIXES: readonly string[] = ATTACHMENT_SUFFIXES.map((e) => e.suffix);
const RESERVED = new Set(["index.md", "log.md", "README.md"]);

export interface HygieneTree {
  /** Record-relative paths of every `.md`/`.yaml` under `knowledge/`. */
  readonly textPaths: readonly string[];
  /** Record-relative paths of every other file under `knowledge/`, with its bytes. */
  readonly assets: ReadonlyMap<string, Uint8Array>;
  /** Record-relative directories under `knowledge/`. */
  readonly dirs: readonly string[];
  readonly symlinks: readonly string[];
  /** Bundle-relative ids of the concepts the profile accepted. */
  readonly conceptIds: ReadonlySet<string>;
}

export function checkHygiene(tree: HygieneTree): Refusal[] {
  const refusals: Refusal[] = [];
  const documents = tree.textPaths.filter(
    (p) =>
      p.endsWith(".md") &&
      !p.endsWith("/index.md") &&
      !p.endsWith("/log.md") &&
      !p.endsWith("/README.md") &&
      !COMPANION_SUFFIXES.some((s) => p.endsWith(s)),
  );
  if (documents.length === 0) {
    refusals.push({
      slug: "ksor-record-empty",
      path: KNOWLEDGE,
      why: "the record has no concept — a KSoR is never empty; the site has nothing to render and the record stands behind nothing",
      fix: "restore a document from git history, or add one: knowledge/<name>.md with the profile's frontmatter (record spec §2)",
    });
  }
  for (const path of tree.symlinks) {
    refusals.push({
      slug: "ksor-symlink",
      path,
      why: "the record must survive being copied anywhere — a symlink carries a machine-local path, and a dangling one is unreadable",
      fix: "replace the link with the file it points at",
    });
  }

  const everything = [...tree.textPaths, ...tree.assets.keys(), ...tree.dirs].sort();
  const seenLower = new Map<string, string>();
  for (const path of everything) {
    const base = path.slice(path.lastIndexOf("/") + 1);
    // A reserved name (`README.md`) is refused as such; naming its case too would be two problems for one cause.
    const unportable = RESERVED.has(base) ? null : nameProblem(base);
    if (unportable !== null) {
      refusals.push({
        slug: "ksor-name-unportable",
        path,
        why: unportable,
        fix: "use ascii lowercase letters, digits and hyphens; the title: key carries the document's real name in any language",
      });
    }
    const lower = path.toLowerCase();
    const earlier = seenLower.get(lower);
    if (earlier !== undefined && earlier !== path) {
      refusals.push({
        slug: "ksor-name-collides",
        path,
        why: `collides with \`${earlier}\` on case-insensitive filesystems — two paths that are one file on macOS or Windows cannot both be the record`,
        fix: "rename one of them",
      });
    }
    seenLower.set(lower, path);
  }
  const dirSet = new Set(tree.dirs);
  for (const path of documents) {
    const stem = path.slice(0, -".md".length);
    if (dirSet.has(stem)) {
      refusals.push({
        slug: "ksor-name-collides",
        path,
        why: `\`${stem}/\` is a directory beside it — both map to the same route, so one identity has two documents`,
        fix: "keep one: move the prose into the directory as a named concept, or rename the directory",
      });
    }
  }

  const typed = [...tree.textPaths.map((p) => [p, null] as const), ...tree.assets];
  for (const [path, bytes] of typed) {
    const base = path.slice(path.lastIndexOf("/") + 1);
    const near = nearMissOf(base);
    if (near !== null) {
      refusals.push({
        slug: "ksor-attachment-near-miss",
        path,
        why: `\`${near.is}\` is not an attachment extension — the site reads decks as YAML and accepts only \`.yaml\`; a near miss is not picked up, and fails the build naming the path but not the rule`,
        fix: `rename it to ${base.slice(0, -near.is.length)}${near.want}`,
      });
      continue;
    }
    const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
    // A sim is admitted by its SUFFIX, never by its extension: `.html` in
    // general stays refused, and only `<name>.sim.html` is a page the record
    // carries (lib/sim-rule.ts).
    const sim = isSim(base);
    if (base.endsWith(".mdx")) {
      refusals.push({
        slug: "ksor-file-type",
        path,
        why: "MDX in the record — knowledge/ is CommonMark only; framework grammar breaks the walk-away promise",
        fix: "convert to .md; components belong to the site, not the record",
      });
    } else if (base === "meta.json") {
      refusals.push({
        slug: "ksor-file-type",
        path,
        why: "a framework file in the record — knowledge/ is CommonMark only",
        fix: "delete it — reading order is the `order` frontmatter key",
      });
    } else if (ext === ".yaml" && !COMPANION_SUFFIXES.some((s) => base.endsWith(s))) {
      refusals.push({
        slug: "ksor-file-type",
        path,
        why: "a YAML file that is no companion — the record holds concepts, their companions and images; other formats cannot be governed or rendered",
        fix: "name it after its document (`<doc>.flashcards.yaml`, `<doc>.quiz.yaml`, `<doc>.slides.yaml`) or move it out of knowledge/",
      });
    } else if (bytes !== null && !sim && (ext === ".html" || ext === ".htm")) {
      // Split out of the refusal below because `.html` is the one extension an
      // author can get RIGHT and still have refused: a carried page is a real
      // thing here, and the only thing separating it from a stray export is a
      // marker nothing else would tell them about.
      refusals.push({
        slug: "ksor-file-type",
        path,
        why: `a page in the record that nothing can serve — a carried page is named \`<name>${SIM_SUFFIX}\`, and only that shape is published and framed`,
        fix: `rename it to <name>${SIM_SUFFIX} and link it from its document as [label](<name>${SIM_SUFFIX} "embed"), or move it out of knowledge/`,
      });
    } else if (bytes !== null && !sim && !ASSET_EXTENSIONS.has(ext)) {
      refusals.push({
        slug: "ksor-file-type",
        path,
        why: `unexpected file type \`${ext || base}\` — the record holds markdown, images and carried pages; other formats cannot be governed or rendered`,
        fix: "convert it to markdown (the add-sources skill does this) or move it out of knowledge/",
      });
    } else if (bytes !== null && ext === ".png") {
      const broken = firstBrokenPngChunk(bytes);
      if (broken !== null) {
        refusals.push({
          slug: "ksor-asset-corrupt",
          path,
          why: `corrupt PNG (${broken}) — a corrupt image can take the whole site down at build time with an error that never names this file (found live: one bad CRC 500'd every page)`,
          fix: "re-export or re-download the image; the bytes on disk are damaged",
        });
      }
    }
  }
  return refusals;
}

/** Why a base name is not a portable identity, or null when it is. */
function nameProblem(base: string): string | null {
  if (/\s/.test(base))
    return `"${base}" contains whitespace — spaces have to be escaped in every link`;
  if (/[<>:"|?*]/.test(base) || /[. ]$/.test(base) || WINDOWS_RESERVED.test(base)) {
    return `"${base}" is not a portable name — the path is the document's identity and its URL on every platform, and Windows rejects these characters, trailing dots and reserved device names outright`;
  }
  if (/[A-Z]/.test(base)) {
    return `"${base}" has uppercase — paths are identities; case-only differences collide on case-insensitive filesystems`;
  }
  // eslint-disable-next-line no-control-regex -- the point is the range
  if (/[^\x20-\x7E]/.test(base)) {
    return `"${base}" contains non-ASCII characters — site frameworks disagree on how to encode non-ASCII routes, so the same document gets a different address on each surface (found live: política.md exported two incompatible routes)`;
  }
  if (base.startsWith("_")) {
    return `"${base}" is underscore-prefixed — site frameworks treat _files as hidden partials, and the record has no hidden documents`;
  }
  // A path is also a URL, and `%` is what starts an escape in one. `50%-off.md`
  // is a malformed escape that kills the site build with a bare URIError naming
  // no file, and `50%20off.md` decodes to a DIFFERENT name — so the character
  // that is supposed to make a name unambiguous in a URL is the one that gives
  // this document two identities (found live, 2026-08-25).
  if (base.includes("%")) {
    return `"${base}" contains a percent sign — the path is the document's URL, where \`%\` opens an escape sequence, so this name means one thing on disk and another (or nothing at all) to anything that reads a route`;
  }
  if (/\(.*\)/.test(base)) {
    return `"${base}" is parenthesized — renderers strip parenthesized segments from routes, giving one document two identities`;
  }
  return null;
}

export const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i += 1) {
    c = ((CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** The first defect in a PNG file — signature and per-chunk CRC-32 — or null when every chunk checks out. */
export function firstBrokenPngChunk(bytes: Uint8Array): string | null {
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return "bad signature";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const dataEnd = offset + 8 + length;
    if (dataEnd + 4 > bytes.length) return `truncated ${name} chunk`;
    if (crc32(bytes, offset + 4, dataEnd) !== view.getUint32(dataEnd)) {
      return `CRC error in ${name} chunk`;
    }
    if (name === "IEND") return null;
    offset = dataEnd + 4;
  }
  return "missing IEND chunk";
}

export interface ScaffoldStructure {
  /** `CLAUDE.md`'s text, or null when absent. */
  readonly claudeMd: string | null;
  /** Skill-relative path → content digest, under `.agents/skills`. */
  readonly agentsSkills: ReadonlyMap<string, string>;
  /** The same under `.claude/skills`. */
  readonly claudeSkills: ReadonlyMap<string, string>;
  /** Record-relative `.md`/`.mdx` files found inside `system/site` (build output excluded). */
  readonly siteContentFiles: readonly string[];
}

/** The project around the record: pointer intact, skill copies identical both ways, no content in the site. */
export function checkScaffoldStructure(shape: ScaffoldStructure): Refusal[] {
  const refusals: Refusal[] = [];
  if (shape.claudeMd === null || shape.claudeMd.trim() !== "@AGENTS.md") {
    refusals.push({
      slug: "ksor-pointer-changed",
      path: "CLAUDE.md",
      why: "AGENTS.md is the single contract; a pointer that grows content forks it",
      fix: "restore CLAUDE.md to exactly one line: @AGENTS.md",
    });
  }
  for (const [rel, digest] of shape.agentsSkills) {
    const twin = shape.claudeSkills.get(rel);
    if (twin === digest) continue;
    refusals.push({
      slug: "ksor-skill-copy-diverged",
      path: `.claude/skills/${rel}`,
      why:
        twin === undefined
          ? "the skill copy is missing — Claude Code reads .claude/skills, and a skill without its copy is invisible there"
          : "the skill copy differs from the canonical .agents/skills version — two diverging copies means agents follow different rules by tool",
      fix: `copy .agents/skills/${rel} over .claude/skills/${rel}`,
    });
  }
  for (const rel of shape.claudeSkills.keys()) {
    if (shape.agentsSkills.has(rel)) continue;
    refusals.push({
      slug: "ksor-skill-copy-diverged",
      path: `.claude/skills/${rel}`,
      why: "the file exists only under .claude/skills — .agents/skills is canonical, and anything only the copy carries is a rule that never went through review",
      fix: `delete it, or add it to .agents/skills/${rel} and re-copy the tree`,
    });
  }
  for (const path of shape.siteContentFiles) {
    refusals.push({
      slug: "ksor-site-holds-content",
      path,
      why: "the site renders the record; it never holds it — content here silently forks the record",
      fix: "move the content to knowledge/ and delete this file",
    });
  }
  return refusals.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
