import {
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

import { ATTACHMENT_SUFFIXES } from "./attachment-rule";
import { refuse, viewer } from "./audience";
import { overlaps } from "./audience-rule";
import { admitsLifecycle, lifecycleBadge } from "./lifecycle-rule";
import { readLock } from "./lock";
import { appDescription, appName, appTitle, projectRoot } from "./shared";
import {
  STAGE_DIR,
  STAGE_MANIFEST,
  type StageManifest,
  type StagePage,
  type StageStamps,
} from "./stage-manifest";
import { checkRecord } from "../record/check";
import { linkTargets } from "../record/citations";
import { splitFrontmatter } from "../record/frontmatter";
import { generateIndexes } from "../record/index-file";
import { inForce, denies, parseLedger } from "../record/ledger";
import { loadRecord } from "../record/load";
import type { Refusal } from "../record/refusal";

const KNOWLEDGE = "knowledge/";
const LEDGER_PATH = ".ksor/takedowns.yaml";
const POLICY_PATH = ".ksor/governance.yaml";
// Byte-for-byte the checker's set (`record/check.ts`): one answer to "what is
// a companion" across the checker, the lock and the stage. `.summary.mdx` was
// in this one and not in that one, so the two would have disagreed about the
// lock's companion list — a permanent `ksor-lock-stale` had the record checker
// not refused `.mdx` first.
const COMPANION = /\.(summary\.md|flashcards\.yaml|quiz\.yaml|slides\.yaml)$/;

/**
 * Everything this build may publish, as bytes at bundle-relative paths: the
 * admitted concepts (copied), their companions (copied), ONLY the assets those
 * concepts reference (copied — an image referenced by nothing published would
 * otherwise ship its bytes into every build, research/visibility.md §7), and
 * every directory's `index.md` REGENERATED from this filtered tree — never the
 * committed one, which lists every status and every audience (record spec §1).
 */
interface StageEntry {
  readonly rel: string;
  readonly bytes: () => Buffer;
}

interface StagePlan {
  readonly entries: readonly StageEntry[];
  readonly manifest: StageManifest;
}

/** The checker's refusals, printed the way every refusal here is: slug first, then the remedy. */
function refuseRecord(refusals: readonly Refusal[]): never {
  const lines = refusals.map((r) => `${r.slug}: ${r.path} — ${r.why}\n  fix: ${r.fix}`);
  throw new Error(lines.join("\n"));
}

/**
 * The asset a link points at, or null when it points anywhere else. Both OKF
 * §6.1 link forms: bundle-absolute against `knowledge/`, relative against the
 * document's directory. `.md`/`.mdx` never ride in as assets — both render as
 * pages, and a restricted `plan.mdx` staged that way once published untiered
 * (review finding, 2026-08-18).
 */
function assetTarget(recordDir: string, documentRel: string, target: string): string | null {
  const clean = target.split("#")[0] ?? "";
  const resolved = clean.startsWith("/")
    ? path.resolve(recordDir, clean.slice(1))
    : path.resolve(recordDir, path.dirname(documentRel), clean);
  if (!resolved.startsWith(recordDir + path.sep)) return null;
  if (/\.mdx?$/i.test(resolved)) return null;
  try {
    return statSync(resolved).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

function planStage(recordDir: string, development: boolean): StagePlan {
  const record = loadRecord(projectRoot);

  const documents = new Map<string, string>();
  const companions = new Map<string, string>();
  for (const file of record.files.keys()) {
    if (!file.startsWith(KNOWLEDGE)) continue;
    const rel = file.slice(KNOWLEDGE.length);
    const name = path.basename(rel);
    if (COMPANION.test(name)) companions.set(rel, path.join(recordDir, rel));
    else if (name.endsWith(".md") && name !== "index.md")
      documents.set(rel, path.join(recordDir, rel));
  }
  // A yaml companion beside a document is a file the record reader does not
  // load (it reads `.md` and `.yaml` alike, but the lock lists every companion).
  for (const file of walkFiles(recordDir)) {
    const rel = path.relative(recordDir, file).split(path.sep).join("/");
    if (COMPANION.test(path.basename(rel)) && !companions.has(rel)) companions.set(rel, file);
  }

  const draftsRequested = process.env.KSOR_DRAFTS === "show";
  // The lock is read BEFORE the checker runs, because the checker needs one of
  // the two `ksor-ledger-amended` baselines out of it: the lock records each
  // ledger entry's DIGEST, which is the only thing that can see an entry
  // retargeted in place (same id, same actor, a different `stable_id`).
  const lock = development
    ? null
    : readLock(
        projectRoot,
        {
          documents,
          companions,
          control: {
            instance: record.files.get("instance.md") ?? "",
            policy: record.files.get(POLICY_PATH) ?? "",
            ledger: record.files.get(LEDGER_PATH) ?? null,
          },
        },
        { draftsRequested },
      );

  // ONE rule set: the same checker `ksor build` and `ksor ingest` run, over
  // the same in-memory tree. Staging never depends on the checker having run
  // elsewhere — a red record refuses HERE, by its slug, before any byte moves.
  const checked = checkRecord(record, {
    mode: "build",
    ledgerBaselines:
      lock === null ? [] : [{ source: "build.lock.json", entries: lock.ledger_entries }],
  });
  if (checked.refusals.length > 0 || checked.policy === null) refuseRecord(checked.refusals);
  const policy = checked.policy;
  // Lifecycle is evaluated at the lock's `as_of` for a build (staleness leaves
  // the open web on the next build; a scheduled rebuild is the operator's
  // obligation) and at now in development, where nothing is published.
  const asOf = lock === null ? Date.now() : Date.parse(lock.as_of);
  const drafts: "hidden" | "shown" = lock === null ? "shown" : lock.drafts;
  const registry = lock === null ? policy.audiences : lock.audiences.registry;
  const stamps: StageStamps =
    lock === null
      ? { build_id: null, source_commit: null, dirty: false, ksor_version: null, unstamped: true }
      : {
          build_id: lock.build_id,
          source_commit: lock.source_commit,
          dirty: lock.dirty,
          ksor_version: lock.ksor_version,
          unstamped: false,
        };

  const audiences = viewer();
  for (const id of audiences) {
    if (id === "public" || registry.includes(id)) continue;
    refuse(
      "ksor-viewer-unregistered",
      `KSOR_AUDIENCE names "${id}", which the record's registry does not declare (registered: ${registry.join(", ") || "none"})`,
      "an unknown identifier is a typo, and a typo in a viewer would silently build the public site under a name that promised more",
      `build with public and registered audiences only, or register "${id}" in .ksor/governance.yaml and run ksor build`,
    );
  }

  // Denials from the ledger, in ledger order: in force and unrevoked. The
  // checker already validated every entry's actor against the policy.
  const ledger = parseLedger(record.files.get(LEDGER_PATH) ?? null, LEDGER_PATH);
  if (!ledger.ok) refuseRecord(ledger.refusals);
  const denials = inForce(ledger.ledger);

  const entries: StageEntry[] = [];
  const assets = new Set<string>();
  const pages: Record<string, StagePage> = {};
  const admitted: { id: string; title: string; description: string; order: number | null }[] = [];
  const copy = (rel: string, from: string): void => {
    entries.push({ rel, bytes: () => readFileSync(from) });
  };

  for (const concept of checked.concepts) {
    // A takedown beats every other consideration, on every surface and for
    // every viewer; then the overlap rule; then the §2.5 table.
    if (denies(denials, concept.id)) continue;
    if (!overlaps(audiences, concept.audience)) continue;
    const doc = {
      status: concept.status,
      effectiveFrom: concept.effectiveFrom,
      staleAfter: concept.staleAfter,
    };
    if (!admitsLifecycle(doc, "human", asOf, drafts)) continue;

    const rel = concept.path.slice(KNOWLEDGE.length);
    copy(rel, path.join(recordDir, rel));
    pages[rel] = {
      machine: admitsLifecycle(doc, "machine", asOf, drafts),
      badge: lifecycleBadge(doc, asOf),
      status: concept.status,
      supersededBy: concept.supersededBy,
      audience: concept.audience,
    };
    admitted.push({
      id: concept.id,
      title: concept.title,
      description: concept.description,
      order: concept.order,
    });
    // The parent survived every filter, so its companions may be published.
    // Reached only here: there is no path on which a companion is staged
    // without its parent — governance inheritance obtained by POSITION.
    for (const { suffix } of ATTACHMENT_SUFFIXES) {
      const companion = rel.replace(/\.md$/, "") + suffix;
      if (companions.has(companion)) copy(companion, companions.get(companion)!);
    }
    const body = splitFrontmatter(record.files.get(concept.path) ?? "", concept.path);
    for (const target of linkTargets(body.ok ? body.body : "")) {
      const asset = assetTarget(recordDir, rel, target);
      if (asset !== null) assets.add(asset);
    }
  }
  for (const asset of assets) {
    copy(path.relative(recordDir, asset).split(path.sep).join("/"), asset);
  }

  // Three states, and only the middle one is a mistake. An empty RECORD is
  // refused upstream (`ksor-record-empty`). A record nobody has approved yet is
  // the emitted starter on day one — every concept a draft, which is what R25
  // forces at `ksor init` — and it BUILDS, publishing nothing (build spec §4,
  // acceptance 4): the first governance act is one conversational turn away and
  // a wall here would meet the adopter before the record does. An empty VIEWER
  // over a record that HAS approved knowledge is the misconfiguration, and it
  // would otherwise surface as "the record has no documents" against a record
  // full of them.
  const approved = checked.concepts.some((c) => c.status === "stable");
  if (admitted.length === 0 && checked.concepts.length > 0 && approved) {
    refuse(
      "ksor-audience-empty",
      `no concept in the record is admitted for the [${audiences.join(", ")}] viewer at ${new Date(asOf).toISOString()} (${checked.concepts.length} concept${checked.concepts.length === 1 ? "" : "s"}, none stable, effective, in-audience and undenied)`,
      "a site with nothing on it is a deploy that looks successful and serves nobody — and the record is not empty, this viewer's slice of it is",
      "build a wider viewer with KSOR_AUDIENCE, approve a draft, or check the ledger",
    );
  }

  const indexes = generateIndexes({
    title: appTitle,
    concepts: admitted,
    dirs: record.dirs.filter((d) => d.startsWith(KNOWLEDGE)).map((d) => d.slice(KNOWLEDGE.length)),
  });
  for (const [rel, text] of indexes) entries.push({ rel, bytes: () => Buffer.from(text) });

  return {
    entries,
    manifest: {
      format: 1,
      name: appName,
      title: appTitle,
      description: appDescription,
      viewer: [...audiences],
      asOf: lock === null ? new Date(asOf).toISOString() : lock.as_of,
      drafts,
      stamps,
      pages,
    },
  };
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(p) : [p];
  });
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
 * record failed 42 of 48 runs, in four shapes: `ENOENT` and `EINVAL` out of
 * `copyFileSync` (the reported one, issue #100), `ENOTEMPTY` out of `rmSync`
 * *with* its retries already in place, and — 27 of the 48, the majority — no
 * error at all: staging returned success and handed the build a stage a third
 * of the record short.
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
 * deterministic function of the record, the ledger and the lock, so redoing it
 * produces the same bytes.
 */
function removeStage(stageDir: string): void {
  rmSync(stageDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  rmSync(path.resolve(path.dirname(stageDir), STAGE_MANIFEST), { force: true });
}

/**
 * Does the stage already hold EXACTLY this plan, byte for byte?
 *
 * The wipe-and-refill is the destructive half of staging, and it is pure waste
 * whenever the answer is yes — which is every evaluation after the first in
 * one build, since the plan is a deterministic function of its inputs.
 * Skipping it is not an optimisation: while a wipe is running there is a
 * window in which the stage is not the record, and an evaluation that has
 * already returned is reading it. The lock stops two writers colliding; this
 * stops the second writer existing at all.
 *
 * Bytes, not names and not timestamps: the alternative is serving a previous
 * build's copy of a document that has since been edited.
 */
function stageHolds(stageDir: string, plan: StagePlan): boolean {
  let staged: string[];
  try {
    staged = walkFiles(stageDir);
  } catch {
    return false;
  }
  if (staged.length !== plan.entries.length) return false;
  const expected = new Map(plan.entries.map((e) => [path.join(stageDir, e.rel), e] as const));
  for (const file of staged) {
    const entry = expected.get(file);
    if (entry === undefined) return false;
    if (!entry.bytes().equals(readFileSync(file))) return false;
  }
  return true;
}

function writeManifest(stageDir: string, manifest: StageManifest): void {
  writeFileSync(
    path.resolve(path.dirname(stageDir), STAGE_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

/** Fill a clean stage with exactly the set this build may publish. */
function fillStage(recordDir: string, stageDir: string, development: boolean): void {
  withStageLock(stageDir, () => {
    let plan: StagePlan;
    try {
      plan = planStage(recordDir, development);
    } catch (error) {
      // No refusal may leave the previous, more permissive stage on disk: it
      // hands the next careless build a filtered copy nothing governs (review
      // finding, 2026-08-19).
      removeStage(stageDir);
      throw error;
    }
    if (!stageHolds(stageDir, plan)) {
      removeStage(stageDir);
      for (const entry of plan.entries) {
        const to = path.join(stageDir, entry.rel);
        mkdirSync(path.dirname(to), { recursive: true });
        writeFileSync(to, entry.bytes());
      }
    }
    // The manifest carries `as_of`, which moves in development, so it is
    // written on every evaluation — cheap, and never the reason a stage is.
    writeManifest(stageDir, plan.manifest);
  });
}

/**
 * Dev only: carry edits into the files the stage already holds, so
 * `pnpm dev` shows the record as the owner is writing it rather than as it
 * stood when the server started — the regenerated indexes included, so a
 * retitled document is retitled in its folder's listing too.
 *
 * Edits only — never adds, never removals. fumadocs' own watcher cannot see
 * a dot-prefixed collection directory (measured 2026-08-18: adding a file to
 * the stage regenerated nothing, and removing one left the generated imports
 * pointing at a file that was gone), so a document that ARRIVES or changes
 * audience needs the restart `pnpm dev` already needs for instance.md. Leaving
 * that to a restart keeps dev honest in the direction that matters: the
 * published build is always staged from scratch.
 */
function refreshStage(recordDir: string, stageDir: string): void {
  // Under the lock like every other write here: a save landing while another
  // evaluation is refilling the stage is the same race from the other side.
  withStageLock(stageDir, () => {
    const plan = planStage(recordDir, true);
    const permitted = new Map(plan.entries.map((e) => [path.join(stageDir, e.rel), e] as const));
    for (const staged of walkFiles(stageDir)) {
      const entry = permitted.get(staged);
      if (entry === undefined) continue;
      const bytes = entry.bytes();
      if (bytes.equals(readFileSync(staged))) continue;
      writeFileSync(staged, bytes);
    }
    writeManifest(stageDir, plan.manifest);
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
 * The directory the docs collection reads: ALWAYS a staged projection of the
 * record for this build's viewer, never the record itself. The level-0 fast
 * path that served `knowledge/` raw is gone, because no record is safe to
 * serve raw any more: every one has drafts, a ledger, and indexes that list
 * what this viewer may not see (build spec §3).
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
  const recordDir = path.join(projectRoot, "knowledge");
  if (!existsSync(recordDir)) {
    refuse(
      "ksor-record-missing",
      `${recordDir} does not exist`,
      "the record is the bundle under knowledge/; a site with nothing to project has nothing to build",
      "restore knowledge/ from git history, or add the first document",
    );
  }
  const development = process.env.NODE_ENV === "development";
  fillStage(recordDir, stageDir, development);
  watchRecord(recordDir, stageDir);
  return STAGE_DIR;
}
