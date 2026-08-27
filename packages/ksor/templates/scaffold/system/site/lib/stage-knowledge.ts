import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  lstatSync,
  readdirSync,
  rmSync,
  // `statSync` is here for ONE caller, `publishSims`, and only because it walks
  // the STAGE — a tree this file wrote, which holds no symlink for stat to
  // follow. Everything that touches the RECORD uses `lstatSync` for the reason
  // recorded at `assetTarget`, and that rule is unchanged.
  statSync,
  watch,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { ATTACHMENT_SUFFIXES, isAttachment } from "./attachment-rule";
import { publicSimPath, SIM_SUFFIX } from "./sim-rule";
import { refuse, viewer } from "./audience";
import { overlaps } from "./audience-rule";
import { admitsLifecycle, lifecycleBadge } from "./lifecycle-rule";
import { assertLockCoversTree, readLock } from "./lock";
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
import { historicLedger } from "../record/git-ledger";
import { generateIndexes } from "../record/index-file";
import {
  inForce,
  denies,
  parseLedger,
  type LedgerBaseline,
  type LedgerBaselineEntry,
} from "../record/ledger";
import { loadRecord } from "../record/load";
import type { Refusal } from "../record/refusal";

const KNOWLEDGE = "knowledge/";
const LEDGER_PATH = ".ksor/takedowns.yaml";
const POLICY_PATH = ".ksor/governance.yaml";
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
 *
 * Neither does an ATTACHMENT, for the same reason one level down. An attachment is
 * staged with its parent or not at all — that is how it inherits its parent's
 * audience, lifecycle and takedown (decision 24) — and this function probes the
 * FILESYSTEM, which knows nothing about any of them. So a document linking
 * `./x.flashcards.yaml` reached the deck by a second path: harmless when `x`
 * was published too (the same bytes, staged twice, which is what made
 * `stageHolds` answer false forever), and a governance escape when it was not —
 * a link to a TAKEN-DOWN document's deck staged the deck, because the link
 * rules judge a companion by its parent's AUDIENCE and the ledger is not an
 * audience. Both reproduced, 2026-08-25.
 */
function assetTarget(recordDir: string, documentRel: string, target: string): string | null {
  const clean = target.split("#")[0] ?? "";
  const resolved = clean.startsWith("/")
    ? path.resolve(recordDir, clean.slice(1))
    : path.resolve(recordDir, path.dirname(documentRel), clean);
  if (!resolved.startsWith(recordDir + path.sep)) return null;
  if (/\.mdx?$/i.test(resolved)) return null;
  if (isAttachment(path.basename(resolved))) return null;
  try {
    // lstat, never stat: `statSync` FOLLOWS a symlink, and `readFileSync` below
    // follows it too, so `knowledge/guides/leak.png -> /etc/secret` published
    // whatever the build could read, under the record's own name. The checker
    // refuses a symlink under knowledge/ by name (`ksor-symlink`) and runs
    // before this, so the state is unreachable — this is the second lock on the
    // same door, and the one that is local to the code that would publish it.
    return lstatSync(resolved).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

/** The record-relative paths of every companion of `conceptPath` the record holds. */
function companionPathsOf(conceptPath: string, companions: ReadonlyMap<string, string>): string[] {
  const rel = conceptPath.slice(KNOWLEDGE.length);
  return ATTACHMENT_SUFFIXES.map(({ suffix }) => rel.replace(/\.md$/, "") + suffix)
    .filter((c) => companions.has(c))
    .map((c) => `${KNOWLEDGE}${c}`);
}

function planStage(recordDir: string, development: boolean): StagePlan {
  const record = loadRecord(projectRoot);

  const documents = new Map<string, string>();
  const companions = new Map<string, string>();
  // The COMMITTED indexes. Nothing else here reads them — the stage regenerates
  // its own — so they exist in this map for one reason: the lock says which
  // bytes `ksor build` wrote into them, and a build looking at different ones is
  // looking at a record nothing checked.
  const indexFiles = new Map<string, string>();
  for (const file of record.files.keys()) {
    if (!file.startsWith(KNOWLEDGE)) continue;
    const rel = file.slice(KNOWLEDGE.length);
    const name = path.basename(rel);
    // The CANONICAL rule, never a copy of it (decision 18). The regex that
    // used to be here was the fifth hand copy of the suffix list: it claimed
    // byte-identity with the checker, had stopped being that when the checker
    // moved to `attachmentKindOf`, and was missing `.summary.mdx` — so the
    // stage and the lock writer disagreed about the companion list.
    if (isAttachment(name)) companions.set(rel, path.join(recordDir, rel));
    else if (name === "index.md") indexFiles.set(rel, path.join(recordDir, rel));
    else if (name.endsWith(".md")) documents.set(rel, path.join(recordDir, rel));
  }
  // The lock covers every asset, because this build publishes its bytes — so
  // the stage's asset set must be the SET THE LOCK WAS BUILT FROM, not a second
  // opinion about it. It is therefore taken from the record the loader already
  // read, the same one `composeLock` reads. Re-walking the directory instead
  // was two walkers with two answers, and both differences were live bugs: the
  // loader skips OS junk, so a `.DS_Store` that Finder writes the first time an
  // adopter opens `knowledge/` was in the tree, never in the lock, and refused
  // `ksor-lock-stale` — unfixable, because the remedy that refusal prescribes
  // writes the identical lock. And the loader reads no symlink as bytes, so a
  // symlinked asset read stale here before ever reaching its own `ksor-symlink`.
  const assetFiles = new Map<string, string>();
  for (const file of record.assets.keys()) {
    if (!file.startsWith(KNOWLEDGE)) continue;
    const rel = file.slice(KNOWLEDGE.length);
    assetFiles.set(rel, path.join(recordDir, rel));
  }

  const draftsRequested = process.env.KSOR_DRAFTS === "show";
  // Three questions, in the order that makes each one answerable.
  //
  // FIRST the lock itself: is there one, can it be read, does it still describe
  // this instance's governance and this build's switches? It is read before the
  // checker because the checker needs one of the two `ksor-ledger-amended`
  // baselines out of it — the lock records each ledger entry's DIGEST, which is
  // the only thing that can see an entry retargeted in place (same id, same
  // actor, a different `stable_id`) — and `readLock` has already refused a
  // ledger the lock never saw, so the baseline is one the lock stands behind.
  const lock = development
    ? null
    : readLock(
        projectRoot,
        {
          instance: record.files.get("instance.md") ?? "",
          policy: record.files.get(POLICY_PATH) ?? "",
          ledger: record.files.get(LEDGER_PATH) ?? null,
        },
        { draftsRequested },
      );

  // THEN the record, by its own rules — ONE rule set: the same checker
  // `ksor build` and `ksor ingest` run, over the same in-memory tree. Staging
  // never depends on the checker having run elsewhere — a red record refuses
  // HERE, by its slug, before any byte moves.
  const checked = checkRecord(record, {
    mode: "build",
    ledgerBaselines: lock === null ? [] : ledgerBaselines(lock.ledger_entries),
  });
  if (checked.refusals.length > 0 || checked.policy === null) refuseRecord(checked.refusals);
  // LAST, whether the lock describes this tree file by file. A tree that is not
  // a legal record is not eligible for that question: it was refused above by
  // the rule it actually breaks (see `assertLockCoversTree`).
  if (lock !== null) {
    assertLockCoversTree(lock, {
      documents,
      companions,
      assets: assetFiles,
      indexes: indexFiles,
    });
  }
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

  // Keyed by the staged path, so ONE entry exists per file the stage holds
  // however many rules asked for it. `stageHolds` compares the plan's LENGTH
  // to the file count before it compares any bytes, so a path emitted twice
  // made it answer false forever — and that is not a lost optimisation, it is
  // the freshness check that stands between a build and the half-written stage
  // `withStageLock` records (27 of 48 runs, published short and silent). A rel
  // determines its own bytes, so collapsing by it can never pick a side.
  const entries = new Map<string, StageEntry>();
  const assets = new Set<string>();
  const pages: Record<string, StagePage> = {};
  const admitted: { id: string; title: string; description: string; order: number | null }[] = [];
  const copy = (rel: string, from: string): void => {
    entries.set(rel, { rel, bytes: () => readFileSync(from) });
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
    // The concept's own links AND its companions': the checker validates a
    // summary's links against the parent's audience (record/check.ts), so an
    // image referenced only from `<doc>.summary.md` is in the lock, inside
    // `build_id`, and demanded to exist — while the stage never copied it and
    // the export died with "Module not found" against a generated
    // `.staged-knowledge/*.js` path, naming no record file. The checker's link
    // set and the stage's copy set are the same set.
    const bodies = [concept.path, ...companionPathsOf(concept.path, companions)];
    for (const file of bodies) {
      const text = record.files.get(file) ?? "";
      const split = splitFrontmatter(text, file);
      for (const target of linkTargets(split.ok ? split.body : text)) {
        const asset = assetTarget(recordDir, rel, target);
        if (asset !== null) assets.add(asset);
      }
    }
  }
  for (const asset of assets) {
    copy(path.relative(recordDir, asset).split(path.sep).join("/"), asset);
  }

  // Three states, and only the middle one is a mistake. An empty RECORD is
  // refused upstream (`ksor-record-empty`). A record nobody has approved yet —
  // every concept a draft, which is where an owner lands after replacing the
  // samples with their own first documents — BUILDS, publishing nothing (build
  // spec §4, acceptance 4): the first governance act is one conversational turn
  // away and a wall here would meet the adopter before the record does. An
  // empty VIEWER over a record that HAS approved knowledge is the
  // misconfiguration, and it would otherwise surface as "the record has no
  // documents" against a record full of them.
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
  for (const [rel, text] of indexes) entries.set(rel, { rel, bytes: () => Buffer.from(text) });

  return {
    entries: [...entries.values()],
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

/**
 * BOTH baselines the ledger is judged against — the lock's, and git history's.
 *
 * The lock alone is not enough here, and the reason is the reason the emitted
 * checker reads history too: the lock is hand-editable and travels in the SAME
 * change as the ledger, so deleting an entry, recomputing `ledger_sha256` and
 * emptying `ledger_entries` leaves the two agreeing about a denial that is
 * gone. Walked: the denied document was staged again, exit 0.
 *
 * History it cannot read is SAID, not assumed away. A build that refused every
 * shallow CI checkout would be turned off, and `ksor build` refuses that state
 * outright — so this is a note beside the verdict, not a second refusal.
 */
function ledgerBaselines(fromLock: readonly LedgerBaselineEntry[]): LedgerBaseline[] {
  // Accepted: a passing `ksor build` wrote this lock, so its entries were
  // judged against the policy of the day and are history now. The git-history
  // baseline below stays unaccepted — committing is not passing.
  const lockBaseline: LedgerBaseline = {
    source: "build.lock.json",
    entries: fromLock,
    accepted: true,
  };
  const history = historicLedger(projectRoot);
  if (!history.repository) return [lockBaseline];
  if (history.entries === null) {
    console.error(
      "ksor-ledger-unverifiable: .ksor/takedowns.yaml — the ledger's history could not be read " +
        `(${history.unreadable === "shallow" ? "this is a shallow clone" : "git could not read the file's log"}), ` +
        "so this build checked the ledger against the committed lock alone — an artefact that travels in the same change.\n" +
        "  fix: `git fetch --unshallow` (or check out with fetch-depth: 0) and build again; `ksor build` refuses this state outright",
    );
    return [lockBaseline];
  }
  return [{ source: "git history", entries: history.entries }, lockBaseline];
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
/**
 * How long a lock may be held before a waiter stops believing in its holder.
 *
 * Enormously generous against the real contended case, which is what this bound
 * has to clear: the other holder is another evaluation of the SAME build,
 * staging the SAME record, and that is milliseconds for the records measured
 * here — seven overlapping evaluations of a 150-document record still finish
 * inside a second. Two minutes is not a guess at how long staging takes; it is
 * long enough that reaching it means the holder is not staging at all.
 */
const LOCK_GIVE_UP_MS = 120_000;

/** Synchronous, because everything on this path is: a bundler cannot await. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * What a signal-0 probe can honestly say about a pid. Three answers, because
 * the middle one is not proof of anything: EPERM says something with that id
 * exists and is not ours to signal, which is exactly what a RECYCLED pid owned
 * by another user looks like. Folding it into "alive" is what made a waiter
 * believe in a holder that had been dead for hours.
 */
type Liveness = "alive" | "not-ours" | "gone";

function probePid(pid: number): Liveness {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM" ? "not-ours" : "gone";
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
    if (Number.isInteger(pid) && pid > 0) return probePid(pid) === "gone";
    if (look === 0) sleepSync(LOCK_POLL_MS * 2);
  }
  return true;
}

/** How long this lock file says it has been held; 0 once it is gone. */
function lockHeldForMs(lockFile: string): number {
  try {
    return Math.max(0, Date.now() - statSync(lockFile).mtimeMs);
  } catch {
    // Released while we looked: the next acquire attempt takes it.
    return 0;
  }
}

/**
 * Stop waiting, and say everything that is known about why.
 *
 * NOT "break the lock and carry on", which is the obvious alternative and is
 * unsafe here: `fillStage` removes the stage and refills it IN PLACE, so a lock
 * broken under a holder that IS still working hands the next reader a stage
 * that is neither the old set nor the new one — the silent, published,
 * 27-of-48 partial stage this file exists to prevent. A refusal an operator can
 * act on is the honest end of an unbounded wait; publishing a short record is
 * not.
 */
function refuseStuckLock(lockFile: string, heldMs: number): never {
  let stamp = "";
  try {
    stamp = readFileSync(lockFile, "utf8").trim();
  } catch {
    // Released as we read it — say so rather than inventing a holder.
  }
  const pid = Number(stamp);
  const evidence =
    Number.isInteger(pid) && pid > 0
      ? {
          alive: `process ${pid} is alive to a signal-0 probe — but a RECYCLED pid is alive too, so that is not proof this holder is the one that took the lock`,
          "not-ours": `signalling process ${pid} raised EPERM: something with that id exists and is not ours to signal, which is also what a RECYCLED pid owned by another user produces`,
          gone: `process ${pid} is gone, and this lock should already have been broken`,
        }[probePid(pid)]
      : `the file records no usable pid (${stamp === "" ? "it is empty" : JSON.stringify(stamp)})`;
  refuse(
    "ksor-stage-locked",
    `${path.basename(lockFile)} has been held for ${Math.round(heldMs / 1000)}s`,
    `one evaluation writes the stage at a time, and a holder still holding after ${Math.round(LOCK_GIVE_UP_MS / 1000)}s is not staging — it was killed before it could release (Ctrl-C, a cancelled job, an OOM: none of them run the code that removes this file). The lock is not broken automatically because the stage is removed and refilled IN PLACE, so breaking one a live holder still holds would publish a half-written record. Evidence: ${evidence}`,
    `if no build is running, delete ${lockFile} and build again`,
  );
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
 * so a waiter can tell a live holder from a killed one. Only from a KILLED one,
 * though: a pid says nothing once it has been recycled, which is why the pid
 * decides whether to break the lock and the CLOCK decides when to give up.
 *
 * Waiting on a live holder is the point: it is another evaluation of the same
 * build, staging the same bytes from the same record, and this build is not
 * finished until it has. The wait is BOUNDED all the same, because a build tool
 * may not hang — and this one did, live, on `pnpm dev` against a lock whose
 * holder had been dead for hours (`LOCK_GIVE_UP_MS`, `refuseStuckLock`). A wait
 * long enough to look like a hang names what it is waiting for; a wait long
 * enough to BE one refuses and says what it knows.
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
      // EEXIST is "someone holds it". EPERM is the SAME THING on Windows: a
      // create against a path whose file is in the pending-delete state — the
      // window between another process calling `rmSync` and the filesystem
      // actually releasing the name — raises EPERM, not EEXIST. Rethrowing it
      // failed the build for the ordinary contended case, and only on Windows,
      // and only sometimes: green on five CI runs of this same code and red on
      // the next two, because it depends on landing inside a window a few
      // milliseconds wide (2026-08-25, `Init acceptance (Windows)`).
      //
      // Waiting is safe for both: a holder that has died leaves a lock
      // `lockIsAbandoned` breaks, so neither code can wait forever on a
      // process that is gone.
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "EPERM") throw error;
      if (lockIsAbandoned(lockFile)) {
        rmSync(lockFile, { force: true });
        continue;
      }
      // Two ways to have waited too long, and both are real: THIS build has
      // waited past the bound, or the lock has been held past it by a holder
      // that may have been gone before this build started.
      const held = lockHeldForMs(lockFile);
      if (waited >= LOCK_GIVE_UP_MS || held >= LOCK_GIVE_UP_MS) {
        refuseStuckLock(lockFile, Math.max(held, waited));
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
    // A sim is SERVED, not bundled: `public/` is where a framed page needs a
    // url. Published on both paths — a held stage still has to have them.
    publishSims(stageDir);
  });
}

/**
 * Dev only: carry edits AND ARRIVALS into the stage, so `pnpm dev` shows the
 * record as the owner is writing it rather than as it stood when the server
 * started — the regenerated indexes included, so a retitled document is
 * retitled in its folder's listing too.
 *
 * Adds and edits — never removals. The 2026-08-18 measurement this refused
 * adds on ("fumadocs' own watcher cannot see a dot-prefixed collection
 * directory") no longer holds: on fumadocs-mdx 15.3.0 a file written into
 * `.staged-knowledge` DOES regenerate the collection, twice-observed as
 * `[MDX] generated files` in the dev log. What actually kept a new document
 * off every surface was this function, which walked the STAGE and skipped
 * anything the stage did not already hold — so a plan entry with no file on
 * disk was never written, and the manifest that names what publishes never
 * learned about it either.
 *
 * Measured before and after, adding a document while `pnpm dev` ran:
 * `/docs/<new>/` 404 -> 200, sidebar 0 -> 1, `llms.txt` 0 -> 1. It worked
 * this way before the stage existed (0.0.40 serves an added document at 200),
 * so this is a regression repaired rather than a feature.
 *
 * REMOVALS still wait for the restart `pnpm dev` already needs for
 * instance.md: the same measurement found a deleted file leaves fumadocs'
 * generated imports pointing at something gone, which takes the dev server
 * down rather than showing a stale page. An arrival has no such failure mode
 * — nothing points at a file that has only just appeared.
 */
function refreshStage(recordDir: string, stageDir: string): void {
  // Under the lock like every other write here: a save landing while another
  // evaluation is refilling the stage is the same race from the other side.
  withStageLock(stageDir, () => {
    const plan = planStage(recordDir, true);
    // Drive from the PLAN, not from the stage. Walking the stage could only
    // ever find what was already there, which is exactly why an arrival was
    // invisible: it has no file to walk onto.
    for (const entry of plan.entries) {
      const staged = path.join(stageDir, entry.rel);
      const bytes = entry.bytes();
      let current: Buffer | null = null;
      try {
        current = readFileSync(staged);
      } catch {
        // Not staged yet — an arrival. Written below.
      }
      if (current !== null && current.equals(bytes)) continue;
      mkdirSync(path.dirname(staged), { recursive: true });
      writeFileSync(staged, bytes);
    }
    writeManifest(stageDir, plan.manifest);
  });
}

let watching = false;

/**
 * Watch the record in development, never in a build — and NEVER the reason a
 * process refuses to exit.
 *
 * `persistent: false` is what makes that true, and `unref()` alone did not.
 * On macOS and Windows a recursive watch is native and `unref()` unrefs the
 * one handle behind it; everywhere else — Linux, so every container and every
 * CI runner — Node substitutes a JS implementation
 * (`internal/fs/recursive_watch`) that opens one watcher PER DIRECTORY and
 * whose `unref()` walks a map of `Stats` objects unrefing anything that is
 * `instanceof StatWatcher`. Nothing in that map ever is, so `unref()` is a
 * silent no-op there and every one of those watchers — created `persistent`,
 * because that is `fs.watch`'s default — holds the event loop open forever.
 *
 * Measured as a build that never ends: an evaluation with NODE_ENV=development
 * exits in milliseconds on macOS and never exits on Linux, so `spawnSync`
 * waited on it and one CI job died at its 15-minute timeout with no file named
 * (2026-08-25). A non-persistent watcher still delivers every event while the
 * dev server holds the process open, which is the only time this runs.
 */
function watchRecord(recordDir: string, stageDir: string): void {
  if (process.env.NODE_ENV !== "development" || watching) return;
  watching = true;
  let pending: ReturnType<typeof setTimeout> | null = null;
  const watcher = watch(recordDir, { recursive: true, persistent: false }, () => {
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
 *
 * That fast path is gone (decision 27: no record is safe to serve raw once
 * drafts and lifecycle decide what publishes), so this now always walks the
 * STAGED directory — which means it inherits the audience filter AND the
 * staging plan's rule that only a REFERENCED asset ships. The level-0 caveat
 * this comment used to carry no longer has a case that reaches it.
 */
const PUBLIC_SIM_DIR = "./public/sims";

function publishSims(sourceDir: string): void {
  const target = path.resolve(process.cwd(), PUBLIC_SIM_DIR);
  /** Absolute paths this build publishes — everything else under `target` is last build's. */
  const published = new Set<string>();

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
      published.add(path.resolve(to));
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

  // The CALLER holds the stage lock, and this takes none of its own — for the
  // reason `withStageLock` records at length, plus one this change learned on
  // Windows: taking it a SECOND time per evaluation doubles the create/delete
  // churn on one lock file, and `wx` create against a file in Windows'
  // pending-delete state fails as `EPERM`, which is not `EEXIST` and so is
  // rethrown. Green on macOS and Linux, red on Windows CI, from a pass that
  // was correct about needing the lock and wrong about taking it again.
  walk(sourceDir, "");
  pruneSims(target, published);
}

/**
 * Everything under `public/sims/` that THIS build did not publish, removed.
 *
 * Copying without pruning made the directory cumulative, and it is the one
 * place where that is a governance leak rather than stale bytes: a build with
 * `KSOR_AUDIENCE=public,internal` publishes an internal document's sim, the
 * next plain `pnpm build` stages only public documents — correctly — and the
 * internal sim is still sitting in `public/`, which static export ships
 * verbatim, at a live URL. `.gitignore` hides the directory, so it accumulates
 * unseen, and every existing assertion read the STAGE, which was right in both
 * builds. Same shape for takedown: deny a document, rebuild, its published sim
 * survives. Found by the 2026-08-25 review and reproduced before this was
 * written.
 *
 * The directory is build-owned (`system/site/public/sims/` is gitignored, and
 * nothing else writes it), so what is not published now does not belong.
 */
function pruneSims(target: string, published: ReadonlySet<string>): void {
  const walk = (dir: string): boolean => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return true;
    }
    let empty = true;
    for (const entry of entries) {
      const here = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (walk(here)) rmSync(here, { recursive: true, force: true });
        else empty = false;
        continue;
      }
      if (published.has(path.resolve(here))) {
        empty = false;
        continue;
      }
      rmSync(here, { force: true });
    }
    return empty;
  };
  walk(target);
}

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
