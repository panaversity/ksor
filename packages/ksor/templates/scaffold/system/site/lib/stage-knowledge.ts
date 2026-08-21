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
import { isDenied, recordPathFrom, stableIdFrom, type DenylistManifest } from "./denial-rule";
import { appName, instanceFrontmatter } from "./shared";

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

/**
 * The stable_ids this build must NOT publish.
 *
 * A takedown lives in the database, and the site compiles `knowledge/` from
 * disk — so a denied document stayed published on the human surface,
 * `llms.txt` included, the file written specifically for AI crawlers. The
 * database's answer is EXPORTED to this manifest (`ksor takedown --export`)
 * rather than opened here, because `pnpm dev` must keep working without a
 * database at all.
 *
 * It fails CLOSED on the one ambiguity that matters. A manifest saying
 * `source: "none"` is a project that declares no database — nothing can be
 * denied, publish everything. A manifest that is MISSING means nobody asked
 * the database, and this build cannot tell "no takedowns" from "the export
 * never ran" — so a project that HAS a database refuses rather than guessing.
 */
/** No database, or a dev server without an export: nothing is denied. */
const NOTHING_DENIED: DenylistManifest = { source: "none", denied: [], denied_subtrees: [] };

/** Where `ksor takedown --export` writes, relative to the project root. */
const DENYLIST_FILE = ".ksor-denylist.json";

/**
 * Does this project declare a database at all? A level-0 record does not.
 *
 * Reads through `instanceFrontmatter()`, which finds instance.md by WALKING UP
 * from the cwd, and which THROWS when it cannot find it. Both halves matter:
 * this used to join `../../` onto the cwd and answer `false` on any read
 * failure, so a build run from anywhere but exactly `system/site` — a host with
 * a configured root directory, an adopter who moved the site they own
 * (decision 4), a permissions error — silently reported "no database". That
 * turned the whole fail-closed takedown gate off: a MISSING manifest became
 * "nothing denied" instead of a refusal, and a `source: "none"` manifest
 * skipped the not-from-database refusal. Both are the fail-open paths this
 * function exists to close (round-9 review of #43).
 *
 * A record whose identity cannot be found is an ERROR, never a `false`.
 */
function declaresDatabase(): boolean {
  return /^database:/m.test(instanceFrontmatter());
}

function deniedStableIds(recordDir: string): DenylistManifest {
  const manifestPath = path.join(recordDir, "..", DENYLIST_FILE);
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch {
    if (!declaresDatabase()) return NOTHING_DENIED;
    // `pnpm dev` never runs the export (it needs a live DSN), so refusing here
    // stopped the site running locally at all for any record with a database —
    // a governance guard that broke the everyday loop (round-1 review of #43).
    // Development warns and shows everything; a BUILD, which is what publishes,
    // still refuses.
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[ksor] ${DENYLIST_FILE} is absent, so this dev server shows the record UNFILTERED by ` +
          `takedowns. Run \`ksor takedown --instance instance.md --export ${DENYLIST_FILE}\` ` +
          "to see what a build would publish.",
      );
      return NOTHING_DENIED;
    }
    refuse(
      "ksor-denylist-missing",
      `instance.md declares a database but ${DENYLIST_FILE} is not there`,
      "a takedown is recorded in the database and the site builds from disk, so without the export this build cannot tell 'nothing is denied' from 'nobody asked' — and publishing a withdrawn document is the failure that matters",
      `run: ksor takedown --instance instance.md --export ${DENYLIST_FILE}`,
    );
  }
  let parsed: DenylistManifest;
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    refuse(
      "ksor-denylist-unreadable",
      `${DENYLIST_FILE} is not valid JSON`,
      "an unreadable denylist is indistinguishable from an empty one, and the difference is whether a withdrawn document gets published",
      `re-export it: ksor takedown --instance instance.md --export ${DENYLIST_FILE}`,
    );
  }
  // The `source` field is the manifest's own account of WHO answered, and
  // until round 4 of the #43 review nothing read it — so file presence was the
  // entire fail-closed gate, and any path that created a file defeated it. A
  // record that declares a database can only be answered BY that database:
  // `source: "none"` here is a contradiction, and it is precisely the shape a
  // build host with no DSN used to write before exiting 0.
  // WHOSE record is this? The manifest names its corpus and nothing checked
  // it, so a file exported against a different instance — or copied between two
  // records in one repo — passed the fail-closed gate and applied the wrong
  // denial set: this record's withdrawn documents published while unrelated ids
  // were filtered (round-5 review of #43).
  const expected = appName;
  if (parsed.corpus_id !== undefined && parsed.corpus_id !== expected) {
    refuse(
      "ksor-denylist-wrong-record",
      `${DENYLIST_FILE} was exported for ${JSON.stringify(parsed.corpus_id)}, but this record is ${JSON.stringify(expected)}`,
      "denials are identities within ONE record, so another record's list filters the wrong documents and publishes this record's withdrawn ones",
      `re-export it for this record: ksor takedown --instance instance.md --export ${DENYLIST_FILE}`,
    );
  }
  if (parsed.format !== undefined && parsed.format !== 1) {
    refuse(
      "ksor-denylist-format",
      `${DENYLIST_FILE} declares format ${JSON.stringify(parsed.format)}, which this site cannot read`,
      "a manifest shape this build does not understand cannot be trusted to say what is withdrawn",
      "upgrade the site, or re-export with a matching ksor version",
    );
  }
  if (parsed.source !== "database" && declaresDatabase()) {
    refuse(
      "ksor-denylist-not-from-database",
      `${DENYLIST_FILE} reports source=${JSON.stringify(parsed.source ?? "(absent)")}, but instance.md declares a database`,
      "a takedown lives in that database, so a manifest that did not come from it cannot say what is withdrawn — and a manifest claiming nothing is denied is exactly what a build host with no DSN would write",
      `export the DSN for this build and re-export: ksor takedown --instance instance.md --export ${DENYLIST_FILE}`,
    );
  }
  return parsed;
}

/**
 * Is this document denied? Exact ids, plus the directories a `--subtree`
 * takedown governs.
 *
 * `ksor takedown --export` expands a `--subtree` denial to its actual
 * descendants by walking parent_id, where the tree lives. Interpreting SCOPE
 * here meant prefix-matching stable_ids, and a section's stable_id ends in
 * `/index` (or `#section`), so the prefix never matched its children and every
 * descendant kept publishing — the failure decision 14 records as the reason
 * its own walk uses parent_id rather than a prefix (round-2 review of #43).
 *
 * But an expanded list can only name what the ACTIVE GENERATION contains, and
 * this build reads DISK. A document added under a withdrawn section after the
 * last ingest is on disk and not in the database, so it published to /docs and
 * llms.txt under a section that had been explicitly withdrawn — while decision
 * 14 states outright that a subtree deny must cover descendants a future
 * re-ingest adds (round-5 review of #43).
 *
 * So subtree denials also arrive as DIRECTORIES. That is not the rejected
 * prefix match: these paths come from `sources.origin_path`, so they are real
 * locations on disk, and a document's location cannot be decoupled from itself
 * by a frontmatter `sor_id:` the way its id can.
 */
/**
 * The record's stable_id and its record-frame path, for the denial check.
 *
 * The RULE itself lives in `./denial-rule`, a leaf with no imports — these
 * wrappers only supply what this module knows: where the record directory is.
 */
function relativeToRecord(recordDir: string, file: string): string {
  return path.relative(recordDir, file).split(path.sep).join("/");
}

function recordPathOf(recordDir: string, file: string): string {
  return recordPathFrom(path.basename(recordDir), relativeToRecord(recordDir, file));
}

function stableIdOf(recordDir: string, file: string, text: string): string {
  return stableIdFrom(
    path.basename(recordDir),
    relativeToRecord(recordDir, file),
    frontmatterBlock(text),
  );
}

function planStage(recordDir: string, denied: DenylistManifest): StagePlan {
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
    // A takedown beats every other consideration, on every surface.
    if (isDenied(denied, stableIdOf(recordDir, file, text), recordPathOf(recordDir, file)))
      continue;
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

/**
 * Remove the stage, asking for the retries this exact failure needs.
 *
 * `force: true` suppresses ENOENT; it does NOT retry anything. Node retries
 * EBUSY / EMFILE / ENFILE / ENOTEMPTY / EPERM only when `maxRetries` is set,
 * and it defaults to zero. The build evaluates `source.config.ts` more than
 * once when the bundler wants it in more than one place, so two runs can
 * overlap: one removing the stage while the other is still copying into it.
 * That surfaced as `ENOTEMPTY` out of `rmSync` and failed the whole site build
 * (CI, 2026-08-21) — a race that is safe to lose, because the stage is a
 * deterministic function of the record and the denylist, so redoing it produces
 * the same bytes.
 */
function removeStage(stageDir: string): void {
  rmSync(stageDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

/** Fill a clean stage with exactly the set this build may publish. */
function fillStage(recordDir: string, stageDir: string, denied: DenylistManifest): void {
  // The old stage goes first, before any refusal can throw: a refused build
  // that leaves the previous, more permissive stage on disk hands the next
  // careless build a filtered copy nothing governs (review finding,
  // 2026-08-19).
  removeStage(stageDir);
  const plan = planStage(recordDir, denied);
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
function refreshStage(recordDir: string, stageDir: string, denied: DenylistManifest): void {
  const permitted = new Set(planStage(recordDir, denied).files);
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
        refreshStage(recordDir, stageDir, deniedStableIds(recordDir));
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
  // A TAKEDOWN is not an audience concern: it must be honoured whether or not
  // this record declares `audiences:`, and most records do not. Staging used to
  // run only for an audience model, so putting the denial filter inside it
  // silently skipped it for exactly the common case (found live: a denied
  // document still built into /docs and llms.txt on a record with no
  // audiences).
  const denied = deniedStableIds(recordDir);
  if (audienceModel === null && (denied.denied ?? []).length === 0) {
    // Nothing to filter — serve the record itself, the level-0 fast path.
    // A stage left behind by an earlier model would be a filtered copy of the
    // record nothing governs any more — removed before the refusal below can
    // throw, so a refused build never leaves one behind either.
    removeStage(stageDir);
    refuseVisibilityWithoutAudiences(recordDir);
    return RECORD_DIR;
  }
  if (audienceModel === null) refuseVisibilityWithoutAudiences(recordDir);
  fillStage(recordDir, stageDir, denied);
  watchRecord(recordDir, stageDir);
  return STAGE_DIR;
}
