import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  watch,
} from "node:fs";
import path from "node:path";

import { audienceModel, buildAudience, refuse, visibleInBuild } from "./audience";

// Both relative to the site directory — the directory every build runs from
// (`pnpm build` is `pnpm -C system/site build`), which is also how fumadocs
// resolves a collection's `dir`.
const RECORD_DIR = "../../knowledge";
const STAGE_DIR = "./.staged-knowledge";

// ONE frontmatter boundary, the checker's exactly: BOM stripped, CRLF
// normalized, lax close (a `----` line closes — review finding 2026-08-19:
// two boundaries in one file meant a doc one regex saw and the other
// didn't, and the strict one published a restricted document).
function frontmatterBlock(text: string): string {
  const normalized = text.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  return /^---\n([\s\S]*?)\n---/.exec(normalized)?.[1] ?? "";
}

/** Exclusion sentinel: present-but-unreadable ranks below every tier. */
const UNREADABLE = "\u0000ksor-unreadable";

/**
 * A document's declared tier: null when the key is absent (default applies),
 * UNREADABLE when the key is present but carries no scalar — a block-list
 * `visibility:` read as absence took the DEFAULT tier and shipped public
 * (review finding, 2026-08-19: the one malformed shape that failed open).
 */
function visibilityOf(text: string): string | null {
  const block = frontmatterBlock(text);
  const match = /^visibility:[ \t]*(.*)$/m.exec(block);
  if (match === null) return null;
  const raw = (match[1] ?? "").replace(/\s+#.*$/, "").trim();
  const value = /^(['"])(.*)\1$/.exec(raw)?.[2] ?? raw;
  return value === "" ? UNREADABLE : value;
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(p) : [p];
  });
}

/**
 * Code is prose about links, never links — the same rule `pnpm check`
 * applies, so the checker and the stage agree on what a reference is.
 * Strips fenced blocks and inline code spans (per paragraph: CommonMark
 * spans may cross lines, and a document-wide strip lets one stray backtick
 * pair with another pages later).
 */
function stripCode(text: string): string {
  const kept: string[] = [];
  let fence: { char: string; length: number } | null = null;
  let blank = true;
  let indented = false;
  for (const line of text.replaceAll("\r\n", "\n").split("\n")) {
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1]?.[0] === fence.char && (close[1]?.length ?? 0) >= fence.length) {
        fence = null;
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (open?.[1]) {
      fence = { char: open[1][0] as string, length: open[1].length };
      continue;
    }
    // An indented run opened after a blank line is a code block — unless it
    // starts a list item, which sits at exactly this indent and carries real
    // links.
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
  return kept
    .join("\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/(`+)[^`]*?\1/g, " "))
    .join("\n\n");
}

// Every shape CommonMark gives a link destination — inline (bare or
// <angle-bracketed>, with a title) and the reference definitions that
// `[text][label]` links point at. `![alt](img.png)` is the same shape.
const INLINE_LINK =
  /\[[^\]]*\]\(\s*(<[^<>\n]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const REFERENCE_DEFINITION =
  /^[ \t]{0,3}\[[^\]]+\]:[ \t]*(<[^<>\n]*>|\S+)[ \t]*(?:"[^"]*"|'[^']*'|\([^)]*\))?[ \t]*$/gm;

function linkTargets(body: string): string[] {
  const raw: string[] = [];
  for (const match of body.matchAll(INLINE_LINK)) if (match[1]) raw.push(match[1]);
  for (const match of body.matchAll(REFERENCE_DEFINITION)) if (match[1]) raw.push(match[1]);
  // <…> exists so a destination may contain spaces; the brackets are syntax.
  return raw.map((t) => (t.startsWith("<") && t.endsWith(">") ? t.slice(1, -1).trim() : t));
}

/**
 * The asset a link points at, or null when it points anywhere else: out of
 * the record, at another document, at a heading, or off the web entirely.
 */
function assetTarget(recordDir: string, documentPath: string, target: string): string | null {
  if (target === "" || target.startsWith("#") || target.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
  const resolved = path.resolve(path.dirname(documentPath), target.split("#")[0] as string);
  if (!resolved.startsWith(recordDir + path.sep)) return null;
  // .md AND .mdx: both render as pages, so neither may ride in as an
  // "asset" — a restricted plan.mdx staged that way published untiered
  // (review finding, 2026-08-18). The record bans .mdx, but staging never
  // depends on the checker having run.
  if (/\.mdx?$/i.test(resolved)) return null;
  try {
    return statSync(resolved).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

/**
 * Everything this build may publish: the permitted documents, and ONLY the
 * assets those documents reference. An image referenced by nothing published
 * ships its filename and its bytes into every build that copies the record
 * wholesale (research/visibility.md §7) — so the references decide.
 */
interface StagePlan {
  /** Documents and assets to copy, in that order. */
  readonly files: readonly string[];
  readonly documents: number;
  /** Every document in the record, whatever its tier. */
  readonly total: number;
}

function planStage(recordDir: string): StagePlan {
  const documents: string[] = [];
  const assets = new Set<string>();
  let total = 0;
  for (const file of walkFiles(recordDir)) {
    if (!file.toLowerCase().endsWith(".md")) continue;
    total += 1;
    const text = readFileSync(file, "utf8");
    // An undeclared tier reads as a restriction and the document appears in
    // no build at all — fail closed here, and `pnpm check` (which CI runs) is
    // what names the typo.
    if (!visibleInBuild(visibilityOf(text))) continue;
    documents.push(file);
    // Body only: frontmatter carries no links in the record grammar, and
    // scanning it here while the other shell strips it staged different
    // asset sets from one record (review finding, 2026-08-18).
    const block = frontmatterBlock(text);
    const body = block === "" ? text : text.slice(text.indexOf(block) + block.length);
    for (const target of linkTargets(stripCode(body))) {
      const asset = assetTarget(recordDir, file, target);
      if (asset !== null) assets.add(asset);
    }
  }
  return { files: [...documents, ...assets], documents: documents.length, total };
}

/** Fill a clean stage with exactly the set this build may publish. */
function fillStage(recordDir: string, stageDir: string): void {
  // The old stage goes first, before any refusal can throw: a refused build
  // that leaves the previous, more permissive stage on disk hands the next
  // careless build a filtered copy nothing governs (review finding,
  // 2026-08-19).
  rmSync(stageDir, { recursive: true, force: true });
  const plan = planStage(recordDir);
  // An empty record is its own problem, reported by the page that renders it;
  // an empty AUDIENCE is a misconfiguration that would otherwise surface as
  // "the record has no documents" against a record full of them.
  if (plan.documents === 0 && plan.total > 0) {
    refuse(
      "ksor-audience-empty",
      `no document in the record is visible to the ${buildAudience} build (${plan.total} document${plan.total === 1 ? "" : "s"}, all above that tier)`,
      "a site with nothing on it is a deploy that looks successful and serves nobody — and the record is not empty, this audience's slice of it is",
      "build a wider audience with KSOR_AUDIENCE, lower default_visibility in instance.md, or give at least one document this tier",
    );
  }
  for (const from of plan.files) {
    const to = path.join(stageDir, path.relative(recordDir, from));
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
}

/**
 * With no audience model, `visibility:` is a promise nothing keeps: every
 * document publishes, including one whose author marked it restricted. The
 * checker refuses this record-wide; the build refuses it too, because a
 * deleted or mistyped `audiences:` block would otherwise publish every
 * restricted document on a green build (vis-docusaurus, 2026-08-18).
 */
function refuseVisibilityWithoutAudiences(recordDir: string): void {
  for (const file of walkFiles(recordDir)) {
    if (!file.toLowerCase().endsWith(".md")) continue;
    const visibility = visibilityOf(readFileSync(file, "utf8"));
    if (visibility === null) continue;
    refuse(
      "ksor-visibility-without-audiences",
      `${path.relative(recordDir, file)} declares visibility: ${visibility}, but instance.md declares no audiences`,
      "without a model every document is published — this build would publish a document its author restricted, and the key saying otherwise would be the only trace",
      "declare the model in instance.md (audiences: least-restricted first, plus default_visibility:), or remove the visibility: key",
    );
  }
}

/**
 * Dev only: carry edits into the documents the stage already holds, so
 * `pnpm dev` shows the record as the owner is writing it rather than as it
 * stood when the server started.
 *
 * Edits only — never adds, never removals. fumadocs' own watcher cannot see
 * a dot-prefixed collection directory (measured 2026-08-18: adding a file to
 * the stage regenerated nothing, and removing one left the generated imports
 * pointing at a file that was gone), so a document that ARRIVES or changes
 * tier needs the restart `pnpm dev` already needs for instance.md. Leaving
 * that to a restart keeps dev honest in the direction that matters: the
 * published build is always staged from scratch.
 */
function refreshStage(recordDir: string, stageDir: string): void {
  const permitted = new Set(planStage(recordDir).files);
  for (const staged of walkFiles(stageDir)) {
    const from = path.join(recordDir, path.relative(stageDir, staged));
    if (!permitted.has(from)) continue;
    if (readFileSync(from).equals(readFileSync(staged))) continue;
    copyFileSync(from, staged);
  }
}

let watching = false;

/**
 * Watch the record in development, never in a build — and unref'd, so this
 * can never be the reason a process refuses to exit.
 */
function watchRecord(recordDir: string, stageDir: string): void {
  if (process.env.NODE_ENV !== "development" || watching) return;
  watching = true;
  let pending: ReturnType<typeof setTimeout> | null = null;
  const watcher = watch(recordDir, { recursive: true }, () => {
    if (pending !== null) clearTimeout(pending);
    // Debounced: one save is several filesystem events.
    pending = setTimeout(() => {
      try {
        refreshStage(recordDir, stageDir);
      } catch {
        // An editor saving atomically, or a file being moved, is a record
        // that is briefly incomplete — the next event re-runs this, and a
        // dev-only refresh must never take the dev server down with it.
      }
    }, 50);
    pending.unref();
  });
  watcher.unref();
}

/**
 * The directory the docs collection reads: the record itself when this
 * instance declares no audiences (exactly the behaviour of every instance
 * written before the key existed), a staged per-audience copy when it does.
 *
 * Every surface reads the record through that one collection, so filtering
 * the directory behind it filters all of them at once — pages, page tree,
 * search index, llms.txt, llms-full.txt, and any consumer this site grows
 * later. That is why the filter is a directory and not a predicate: a reader
 * nobody remembered still cannot read what is not on disk, where a
 * per-request filter leaked on the fifth and sixth consumer of the record
 * its own author had not enumerated (research/visibility.md §4–§5).
 */
export function knowledgeSourceDir(): string {
  const stageDir = path.resolve(process.cwd(), STAGE_DIR);
  const recordDir = path.resolve(process.cwd(), RECORD_DIR);
  if (audienceModel === null) {
    // A stage left behind by an earlier model would be a filtered copy of the
    // record nothing governs any more — removed before the refusal below can
    // throw, so a refused build never leaves one behind either.
    rmSync(stageDir, { recursive: true, force: true });
    refuseVisibilityWithoutAudiences(recordDir);
    return RECORD_DIR;
  }
  fillStage(recordDir, stageDir);
  watchRecord(recordDir, stageDir);
  return STAGE_DIR;
}
