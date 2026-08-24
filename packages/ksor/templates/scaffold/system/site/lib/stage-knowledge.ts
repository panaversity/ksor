import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { ATTACHMENT_SUFFIXES, isAttachment, parentDocumentOf } from "./attachment-rule";
import { audienceModel, buildAudience, refuse, visibleInBuild } from "./audience";
import { isDenied, recordPathFrom, stableIdFrom, type DenylistManifest } from "./denial-rule";
import { publicSimPath, SIM_SUFFIX } from "./embed-rule";
import { appName, instanceFrontmatter } from "./shared";

// Both relative to the site directory — the directory every build runs from
// (`pnpm build` is `pnpm -C system/site build`), which is also how fumadocs
// resolves a collection's `dir`.
const RECORD_DIR = "../../knowledge";
const STAGE_DIR = "./.staged-knowledge";
// Served, not bundled. Next copies public/ into the export as-is.
const PUBLIC_SIM_DIR = "./public/sims";

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

/**
 * The suffixes staging probes for — DERIVED from the shared rule, so a new
 * attachment kind cannot be added there and forgotten here.
 */
const ATTACHMENT_SUFFIXES_FOR_STAGE: readonly string[] = ATTACHMENT_SUFFIXES.map((e) => e.suffix);

function planStage(recordDir: string, denied: DenylistManifest): StagePlan {
  const documents: string[] = [];
  const assets = new Set<string>();
  let total = 0;
  for (const file of walkFiles(recordDir)) {
    // An attachment is not a document: it is neither counted nor filtered on
    // its own terms. It rides in below, with the parent that survived — which
    // is the whole of governance inheritance, obtained by POSITION rather than
    // by a second rule that could disagree with this one.
    if (isAttachment(path.basename(file))) continue;
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
    // The parent survived BOTH filters, so its attachments may be published.
    // Reached only here: a filtered or denied parent never gets this far, so
    // there is no path on which an attachment is staged without its parent.
    for (const suffix of ATTACHMENT_SUFFIXES_FOR_STAGE) {
      const attachment = file.replace(/\.mdx?$/i, "") + suffix;
      if (existsSync(attachment)) assets.add(attachment);
    }
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

/** How often a waiter looks again. */
const LOCK_POLL_MS = 25;
/** How long a wait goes unexplained. A build that looks hung must say why. */
const LOCK_ANNOUNCE_MS = 10_000;

/** Synchronous, because everything on this path is: a bundler cannot await. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM is a process that exists and is not ours to signal.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Is this lock abandoned — stamped with a process that no longer exists?
 *
 * Blank is the one ambiguous read: the holder writes its pid in the same call
 * that creates the file, so a blank lock is either a holder caught between the
 * two (microseconds) or one that died there (forever). Looking twice tells
 * them apart, and only the second look may break a lock.
 */
function lockIsAbandoned(lockFile: string): boolean {
  for (const look of [0, 1]) {
    let stamp: string;
    try {
      stamp = readFileSync(lockFile, "utf8").trim();
    } catch {
      // Released while we read it; the next acquire attempt takes it.
      return false;
    }
    const pid = Number(stamp);
    if (Number.isInteger(pid) && pid > 0) return !isAlive(pid);
    if (look === 0) sleepSync(LOCK_POLL_MS * 2);
  }
  return true;
}

/**
 * Hold the stage lock for the duration of `work`: ONE evaluation writes the
 * stage at a time, and this file says which.
 *
 * A build evaluates `source.config.ts` in more than one process — SEVEN of
 * them staged the record in one measured `next build` of a scaffolded site
 * (2026-08-23) — and staging was destructive on every evaluation: delete the
 * whole stage, refill it. Two of those overlapping is not a rare interleaving,
 * it is what seven of them do — six concurrent evaluations of a 150-document
 * record failed 42 of 48 runs, in four shapes: `ENOENT` and `EINVAL` out of `copyFileSync` (the reported one,
 * issue #100), `ENOTEMPTY` out of `rmSync` *with* its retries already in
 * place, and — 27 of the 48, the majority — no error at all: staging returned
 * success and handed the build a stage a third of the record short.
 *
 * The silent shape is why this is a lock and not another retry. A crash fails
 * a build; a short stage PUBLISHES one, with documents missing from /docs,
 * llms.txt and the search index, and nothing anywhere saying so.
 *
 * `wx` is the whole primitive: create-if-absent, atomically, on every
 * filesystem Node supports — and it stamps the holder's pid in the same call,
 * so a waiter can tell a live holder from a killed one.
 *
 * Waiting on a LIVE holder is unbounded on purpose: it is another evaluation
 * of the same build, staging the same bytes from the same record, and this
 * build is not finished until it has. Unbounded is not silent, though — a wait
 * long enough to look like a hang names what it is waiting for.
 */
function withStageLock<T>(stageDir: string, work: () => T): T {
  const lockFile = `${stageDir}.lock`;
  let waited = 0;
  let announced = false;
  for (;;) {
    try {
      writeFileSync(lockFile, String(process.pid), { flag: "wx" });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (lockIsAbandoned(lockFile)) {
        rmSync(lockFile, { force: true });
        continue;
      }
      sleepSync(LOCK_POLL_MS);
      waited += LOCK_POLL_MS;
      if (waited >= LOCK_ANNOUNCE_MS && !announced) {
        announced = true;
        console.warn(
          `[ksor] waiting on ${path.basename(lockFile)} — another evaluation of this build is ` +
            "staging the record. Delete that file if no build is running.",
        );
      }
    }
  }
  try {
    return work();
  } finally {
    rmSync(lockFile, { force: true });
  }
}

/**
 * Remove the stage, asking for the retries this exact failure needs.
 *
 * Callers hold the stage lock, so no OTHER evaluation is writing here — but
 * `force: true` suppresses ENOENT and does NOT retry anything, and Node
 * retries EBUSY / EMFILE / ENFILE / ENOTEMPTY / EPERM only when `maxRetries`
 * is set (it defaults to zero). Those are what a Windows indexer or an
 * antivirus scanner holding a handle looks like — not ksor, and not something
 * the lock can serialise. Losing that race is safe: the stage is a
 * deterministic function of the record and the denylist, so redoing it
 * produces the same bytes.
 */
function removeStage(stageDir: string): void {
  rmSync(stageDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

/**
 * Does the stage already hold EXACTLY this plan, byte for byte?
 *
 * The wipe-and-refill is the destructive half of staging, and it is pure waste
 * whenever the answer is yes — which is every evaluation after the first in
 * one build, since the plan is a deterministic function of the record and the
 * denylist. Skipping it is not an optimisation: while a wipe is running there
 * is a window in which the stage is not the record, and an evaluation that has
 * already returned is reading it. The lock stops two writers colliding; this
 * stops the second writer existing at all.
 *
 * Bytes, not names and not timestamps: the alternative is serving a previous
 * build's copy of a document that has since been edited.
 */
function stageHolds(recordDir: string, stageDir: string, plan: StagePlan): boolean {
  let staged: string[];
  try {
    staged = walkFiles(stageDir);
  } catch {
    return false;
  }
  if (staged.length !== plan.files.length) return false;
  const expected = new Map(
    plan.files.map((from) => [path.join(stageDir, path.relative(recordDir, from)), from]),
  );
  for (const file of staged) {
    const from = expected.get(file);
    if (from === undefined) return false;
    if (!readFileSync(from).equals(readFileSync(file))) return false;
  }
  return true;
}

/** Fill a clean stage with exactly the set this build may publish. */
function fillStage(recordDir: string, stageDir: string, denied: DenylistManifest): void {
  withStageLock(stageDir, () => {
    let plan: StagePlan;
    try {
      plan = planStage(recordDir, denied);
      // An empty record is its own problem, reported by the page that renders
      // it; an empty AUDIENCE is a misconfiguration that would otherwise
      // surface as "the record has no documents" against a record full of them.
      if (plan.documents === 0 && plan.total > 0) {
        refuse(
          "ksor-audience-empty",
          `no document in the record is visible to the ${buildAudience} build (${plan.total} document${plan.total === 1 ? "" : "s"}, all above that tier)`,
          "a site with nothing on it is a deploy that looks successful and serves nobody — and the record is not empty, this audience's slice of it is",
          "build a wider audience with KSOR_AUDIENCE, lower default_visibility in instance.md, or give at least one document this tier",
        );
      }
    } catch (error) {
      // No refusal may leave the previous, more permissive stage on disk: it
      // hands the next careless build a filtered copy nothing governs (review
      // finding, 2026-08-19). The removal used to lead this function, which is
      // why nothing could ask whether the stage was already correct.
      removeStage(stageDir);
      throw error;
    }
    if (stageHolds(recordDir, stageDir, plan)) return;
    removeStage(stageDir);
    for (const from of plan.files) {
      const to = path.join(stageDir, path.relative(recordDir, from));
      mkdirSync(path.dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
  });
}

/**
 * With no audience model, `visibility:` is a promise nothing keeps: every
 * document publishes, including one whose author marked it restricted. The
 * checker refuses this record-wide; the build refuses it too, because a
 * deleted or mistyped `audiences:` block would otherwise publish every
 * restricted document on a green build (vis-docusaurus, 2026-08-18).
 */
/**
 * Attachments the record cannot publish, refused at the BUILD.
 *
 * Staging never depends on the checker having run, so both rules need a home
 * here as well as in `pnpm check` — the checker is where they get a good
 * message, this is where they are guaranteed.
 *
 * Runs on every path, including the level-0 fast path that stages nothing:
 * an orphan is a governance hole whether or not this record declares
 * audiences.
 */
function assertAttachmentsWellFormed(recordDir: string): void {
  for (const file of walkFiles(recordDir)) {
    const base = path.basename(file);
    if (!isAttachment(base)) continue;
    const rel = path.relative(recordDir, file);

    const parent = parentDocumentOf(base);
    if (parent !== null && !existsSync(path.join(path.dirname(file), parent))) {
      refuse(
        "ksor-attachment-orphan",
        `${rel} is an attachment of ${parent}, which is not in the record`,
        "an attachment inherits its parent's governance — with no parent there is nothing to inherit, so it would be published under no tier and covered by no takedown",
        `add ${path.join(path.dirname(rel), parent)}, or remove ${rel}`,
      );
    }

    // No frontmatter, at all. One rule kills the whole widening class:
    // no `visibility:` claiming a tier the parent does not have, no `sor_id:`
    // escaping the parent's takedown, no `status:`/`owner:` claiming
    // governance a thing with no id cannot carry.
    if (base.toLowerCase().endsWith(".md") || base.toLowerCase().endsWith(".mdx")) {
      const text = readFileSync(file, "utf8")
        .replace(/^\uFEFF/, "")
        .replaceAll("\r\n", "\n");
      if (text.startsWith("---\n")) {
        refuse(
          "ksor-attachment-frontmatter",
          `${rel} declares frontmatter`,
          "an attachment is part of its parent and carries none of its own governance — a key here would look like it governs something and would govern nothing",
          `remove the frontmatter block from ${rel}; ${parent ?? "its parent"} is what carries the governance`,
        );
      }
    }
  }
}

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
  // Under the lock like every other write here: a save landing while another
  // evaluation is refilling the stage is the same race from the other side.
  withStageLock(stageDir, () => {
    const permitted = new Set(planStage(recordDir, denied).files);
    for (const staged of walkFiles(stageDir)) {
      const from = path.join(recordDir, path.relative(stageDir, staged));
      if (!permitted.has(from)) continue;
      if (readFileSync(from).equals(readFileSync(staged))) continue;
      copyFileSync(from, staged);
    }
  });
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

/**
 * A sim is the one asset that has to be SERVED rather than bundled: it is a
 * page, and a page needs a url before anything can frame it. Next copies
 * `public/` into the export as-is, so that is where it goes.
 *
 * A PASS OF ITS OWN, over the directory the collection actually reads — not a
 * rider on staging. Staging runs only for a record that declares `audiences:`
 * or carries a takedown, and most records declare neither, so a sim hung off
 * it published for the rare record and silently vanished for the common one
 * (found live 2026-08-24: nothing reached `public/` on the level-0 path).
 * Reading the SOURCE dir inherits the filtering when there is any, and works
 * when there is none. What it does NOT inherit at level 0 is the staging
 * plan's rule that only a REFERENCED asset ships: a record with no audiences
 * and no takedowns publishes every document anyway, so an unreferenced sim
 * ships its bytes there. Said rather than fixed, because the moment either
 * governance exists the staged dir is what this walks and the rule applies.
 */
function publishSims(sourceDir: string, lockDir: string): void {
  const target = path.resolve(process.cwd(), PUBLIC_SIM_DIR);

  const walk = (dir: string, rel: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const from = path.join(dir, entry.name);
      const next = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(from, next);
        continue;
      }
      if (!entry.name.endsWith(SIM_SUFFIX)) continue;
      const to = path.join(target, publicSimPath(next));
      // Same size AND same mtime is this file's own definition of unchanged
      // (see `stageHolds`). Skipping the write is what keeps the common
      // build from touching the tree at all.
      try {
        const source = statSync(from);
        const published = statSync(to);
        if (published.size === source.size && published.mtimeMs >= source.mtimeMs) continue;
      } catch {
        // Not published yet, which is the ordinary first-build case.
      }
      mkdirSync(path.dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
  };

  // UNDER THE LOCK, for the reason `withStageLock` records at length: a build
  // evaluates this file in seven processes, and a destructive pass run by two
  // of them at once fails as `ENOENT`/`EINVAL` out of `copyFileSync`. Walked
  // into directly while prototyping this (2026-08-24) — the same four shapes,
  // from a pass that had not yet learned the lesson beside it.
  withStageLock(lockDir, () => walk(sourceDir, ""));
}

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
    // throw, so a refused build never leaves one behind either. Under the lock,
    // because two evaluations removing one tree is the `ENOTEMPTY` shape of the
    // same race; the existence check keeps a record that never stages from
    // taking a lock on every build.
    if (existsSync(stageDir)) withStageLock(stageDir, () => removeStage(stageDir));
    refuseVisibilityWithoutAudiences(recordDir);
    assertAttachmentsWellFormed(recordDir);
    publishSims(recordDir, recordDir);
    return RECORD_DIR;
  }
  if (audienceModel === null) refuseVisibilityWithoutAudiences(recordDir);
  assertAttachmentsWellFormed(recordDir);
  fillStage(recordDir, stageDir, denied);
  watchRecord(recordDir, stageDir);
  publishSims(stageDir, stageDir);
  return STAGE_DIR;
}
