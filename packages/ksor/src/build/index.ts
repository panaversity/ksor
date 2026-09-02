/**
 * `ksor build` (build spec §1): generate every index in memory, run the
 * record checker, and only on green write the indexes whose bytes changed
 * and `build.lock.json`. Database-free, network-free. A refusal leaves the
 * tree exactly as it found it, with the slug on the first stderr line.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  admittedViewersOf,
  canonicalViewers,
  checkChangeControl,
  checkRecord,
  composeLock,
  formatRefusal,
  inForce,
  loadRecord,
  parseInstant,
  parseLedger,
  parseLock,
  resolveInstanceDir,
  sortRefusals,
  type LedgerBaseline,
} from "@panaversity/ksor-content/record";

import {
  attachmentKindOf,
  dirtyNotice,
  parseInstanceDocument,
  provenanceGap,
  provenanceNotice,
} from "@panaversity/ksor-content";

import { exitCodes } from "../index.js";
import { bundleDigest, planBundles, type Bundle } from "./bundles.js";
import { gitFacts, ignoredGovernance, type GitFacts } from "./git.js";
import { lifecycleNotice } from "./lifecycle-notice.js";

export interface BuildIo {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

export interface BuildOptions {
  readonly version: string;
  /** `KSOR_DRAFTS=show` admits drafts to human surfaces; recorded in the lock. */
  readonly drafts: "hidden" | "shown";
}

export const BUILD_USAGE = `Usage: ksor build [--instance <path>] [--as-of <instant>] [--strict] [--allow-unverifiable-ledger] [--bundles]

Generates every knowledge/**/index.md in memory, runs the record checker, and
on green writes the indexes whose bytes changed plus build.lock.json — the
committed record of what was published, from which commit, with which
toolchain. A refusal (exit 1, slug first on stderr) writes nothing.

  --instance <path>   instance.md, or a directory at or below the record root
                      (default: the nearest ancestor instance.md of the cwd)
  --as-of <instant>   the instant lifecycle is evaluated at (default: now);
                      pin it to make two builds byte-identical
  --strict            refuse when an input is uncommitted (ksor-build-dirty)
  --allow-unverifiable-ledger
                      build on a shallow clone, where the ledger's history
                      cannot be checked for deleted entries
  --bundles           also write one OKF bundle per viewer under
                      .ksor/out/bundles/<viewer>/ — public, and [public, X]
                      for each registered audience X — holding only what that
                      viewer's machine surfaces publish, with its indexes
                      regenerated for that tree; any OKF consumer reads it
                      with no ksor in the loop. The lock beside them names
                      the build. The directory is replaced on every run.
`;

/** What `--bundles` writes, record-relative. Gitignored by the scaffold's `.ksor/*` rule. */
const BUNDLES_DIR = ".ksor/out/bundles";
const LOCK_NAME = "build.lock.json";
/**
 * An audience identifier that can be a directory name. The policy admits any
 * non-empty string as a registry key, and every other surface uses one only as
 * a token — `--bundles` is the first to use it as a PATH, so `../x` written as
 * given would land outside the output directory. The first character must be a
 * letter or a digit, which is what stops `.`, `..`, a dotfile and a name a
 * shell reads as a flag; `-`, `_` and `.` are fine after it.
 *
 * The LAST character may not be a `.`. Win32 path normalization strips a
 * trailing dot from a path segment, so `internal.` and `internal` are two
 * viewers in the policy and ONE directory on Windows — the case rule's merge
 * exactly, and the case fold cannot see it. Refused on every platform, for the
 * reason that rule gives: a record must not build here and leak there. A `.`
 * INSIDE the name (`v1.2`) is untouched; nothing normalizes it away.
 */
const PATH_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/;
/** {@link PATH_SEGMENT} in words, in ONE place, so the refusal and the docs cannot drift from the regex. */
const PATH_SEGMENT_PROSE =
  "a letter or a digit first, then letters, digits, `-`, `_` and `.`, and never a `.` last";

interface Parsed {
  readonly instance: string | null;
  readonly asOf: number | null;
  readonly strict: boolean;
  readonly allowUnverifiable: boolean;
  readonly bundles: boolean;
}

function parseArgs(args: readonly string[]): Parsed | string {
  let instance: string | null = null;
  let asOf: number | null = null;
  let strict = false;
  let allowUnverifiable = false;
  let bundles = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--instance" || arg === "--as-of") {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("-")) return `${arg} needs a value`;
      i += 1;
      if (arg === "--instance") instance = value;
      else {
        const ms = parseInstant(value);
        if (ms === null)
          return `--as-of must be an ISO 8601 instant with an offset (e.g. 2026-08-25T12:00:00Z), got "${value}"`;
        asOf = ms;
      }
    } else if (arg === "--strict") strict = true;
    else if (arg === "--allow-unverifiable-ledger") allowUnverifiable = true;
    else if (arg === "--bundles") bundles = true;
    else return `unknown argument "${arg}"`;
  }
  return { instance, asOf, strict, allowUnverifiable, bundles };
}

/**
 * What this build can say about the commit it published from — the SAME
 * sentences `ksor ingest` prints, because it is the same missing fact.
 *
 * Build used to say `(dirty)` and nothing else, and write `"source_commit":
 * null` into the lock without a word about why (first-hour walkthrough,
 * 2026-08-26). It is not a refusal — a provenance-less build is legitimate, and
 * `--strict` exists for anyone who wants it refused — but principle 6 makes
 * provenance load-bearing, and a guarantee that goes missing silently is the
 * failure mode "honest absence, never silent weakness" is written against.
 *
 * The four states are distinguished HERE rather than by re-asking git, because
 * the build already knows three of them; only "outside a repository" needs the
 * extra question of whether git is installed at all, and `provenanceGap`
 * answers that one.
 */
function provenanceLine(facts: GitFacts, root: string): string {
  if (facts.sourceCommit !== null) {
    return facts.dirty ? dirtyNotice(facts.sourceCommit) : `source: ${facts.sourceCommit}`;
  }
  if (!facts.repository) return provenanceNotice(provenanceGap(root), "build");
  return provenanceNotice(facts.born ? "no-input-commit" : "no-commit", "build");
}

function refuse(io: BuildIo, slug: string, why: string, fix: string): number {
  io.err(`error: ${slug}\n${why}\n  fix: ${fix}\n`);
  return exitCodes.refused;
}

/** A refusal a viewer set earns before any of it is planned, or `null`. */
interface ViewerRefusal {
  readonly slug: string;
  readonly why: string;
  readonly fix: string;
}

/**
 * What every canonical viewer name has to be for `.ksor/out/bundles/<name>/`
 * to hold what the lock says it holds.
 *
 * Run on EVERY build, not only under `--bundles`, because `bundles[]` is in
 * the lock on every build: a plain build that let `../escape` through would
 * commit a digest for a directory the tool refuses to write — provenance for
 * something that cannot exist (invariant: provenance is load-bearing). The
 * alternative considered was omitting unbuildable viewers from `bundles[]`;
 * it keeps the lock honest too, but leaves the record broken and the owner
 * unwarned until their first exchange, which is the weaker guarantee. Here
 * the owner learns at the build they already run.
 */
function viewerRefusal(viewers: readonly string[]): ViewerRefusal | null {
  const list = (ids: readonly string[]): string => ids.map((v) => JSON.stringify(v)).join(", ");
  const unsafe = viewers.filter((v) => !PATH_SEGMENT.test(v) || v.toLowerCase() === LOCK_NAME);
  if (unsafe.length > 0) {
    return {
      slug: "ksor-audience-identifier-invalid",
      why: `the audience identifier${unsafe.length === 1 ? "" : "s"} ${list(unsafe)} cannot name a bundle directory: --bundles writes each viewer's bundle to ${BUNDLES_DIR}/<identifier>/ beside a copy of ${LOCK_NAME}, so an identifier that is not a plain path segment would land somewhere else, one ending in \`.\` names a DIFFERENT directory on Windows (which strips a trailing dot from a path segment, merging it into the name without one), and one named ${LOCK_NAME} would collide with the lock. build.lock.json records that bundle's digest on EVERY build, flag or not, so this is refused here rather than only under --bundles`,
      fix: `name audiences in plain words (${PATH_SEGMENT_PROSE}) in .ksor/governance.yaml and in every \`ksor.audience\` list, then rebuild`,
    };
  }
  // Two identifiers that differ only in case are two viewers in the policy and
  // ONE directory on macOS and on Windows, whose filesystems are
  // case-insensitive by default: the second bundle written merges into the
  // first, so the surviving directory holds concepts the viewer named on it may
  // not read, and the lock's digest for that viewer stops describing what is on
  // disk. That is R5 — no byte of an excluded concept — failing on the one
  // projection that leaves the building, from a state the checker accepts. So
  // it is refused where the bundle set is computed, on every platform alike: a
  // record must not build here and leak there.
  const byFold = new Map<string, string[]>();
  for (const v of viewers) {
    const fold = v.toLowerCase();
    byFold.set(fold, [...(byFold.get(fold) ?? []), v]);
  }
  const collided = [...byFold.values()].filter((group) => group.length > 1);
  if (collided.length > 0) {
    return {
      slug: "ksor-audience-identifier-collides",
      why: `${collided.map((g) => list(g)).join("; ")} differ only in case, so each set is several viewers naming ONE directory: --bundles writes ${BUNDLES_DIR}/<identifier>/ per viewer, and on a case-insensitive filesystem (macOS and Windows, by default) the later bundle merges into the earlier one — leaving a directory that holds concepts the viewer named on it may not read, and a digest in build.lock.json that no longer describes it. build.lock.json records each of those digests on EVERY build, flag or not, so this is refused here rather than only under --bundles`,
      fix: `give each audience in .ksor/governance.yaml a name that differs by more than case — \`public\` is reserved, casefolded too — and update every \`ksor.audience\` list that named the one you dropped, then rebuild`,
    };
  }
  return null;
}

export function runBuild(
  args: readonly string[],
  cwd: string,
  io: BuildIo,
  options: BuildOptions,
): number {
  if (args.includes("--help") || args.includes("-h")) {
    io.out(BUILD_USAGE);
    return 0;
  }
  const parsed = parseArgs(args);
  if (typeof parsed === "string") {
    io.err(`error: bad-args\n${parsed}\n${BUILD_USAGE}`);
    return exitCodes.refused;
  }
  const start =
    parsed.instance === null
      ? cwd
      : existsSync(parsed.instance) && statSync(parsed.instance).isFile()
        ? path.dirname(path.resolve(cwd, parsed.instance))
        : path.resolve(cwd, parsed.instance);
  const root = resolveInstanceDir(start);
  if (root === null) {
    return refuse(
      io,
      "ksor-instance-missing",
      `no instance.md at or above ${start} — the record root is the directory holding it`,
      "run from inside the record, or pass --instance <path>",
    );
  }

  const facts = gitFacts(root);
  if (facts.repository && facts.historicLedger === null && !parsed.allowUnverifiable) {
    return refuse(
      io,
      "ksor-ledger-unverifiable",
      facts.historyUnreadable === "shallow"
        ? "this is a shallow clone: the takedown ledger is append-only, and without history a deleted entry cannot be told from one that never existed"
        : "git could not read the takedown ledger's history (`git log -- .ksor/takedowns.yaml` failed, and this is not a shallow clone): the ledger is append-only, and without history a deleted entry cannot be told from one that never existed",
      facts.historyUnreadable === "shallow"
        ? "fetch full history (`git fetch --unshallow`; in CI, `fetch-depth: 0`), or pass --allow-unverifiable-ledger to build anyway"
        : "check that `git log` works in this checkout, or pass --allow-unverifiable-ledger to build anyway",
    );
  }
  const ignored = facts.repository ? ignoredGovernance(root) : [];
  if (ignored.length > 0) {
    return refuse(
      io,
      "ksor-governance-ignored",
      `git ignores ${ignored.join(" and ")}, so ${ignored.length === 1 ? "it is" : "they are"} in no commit — the policy and the takedown ledger ARE the record, and a clone (your CI, your deploy) would build without ${ignored.length === 1 ? "it" : "them"}`,
      "un-ignore them in .gitignore — the directory form `.ksor/` cannot be negated, so use `.ksor/*` plus `!.ksor/governance.yaml`, `!.ksor/people.yaml` and `!.ksor/takedowns.yaml` — then commit them (`ksor migrate` offers that edit)",
    );
  }
  if (parsed.strict && facts.dirty) {
    return refuse(
      io,
      "ksor-build-dirty",
      facts.repository
        ? "an input (knowledge/, instance.md, .ksor/governance.yaml, .ksor/people.yaml, .ksor/takedowns.yaml) differs from its last commit, and --strict stamps only committed content"
        : "the record is not in a git repository, so no input is committed",
      "commit the inputs and rebuild, or drop --strict to stamp a dirty build (the lock says `dirty: true`)",
    );
  }

  const baselines: LedgerBaseline[] = [];
  if (facts.historicLedger !== null) {
    baselines.push({ source: "git history", entries: facts.historicLedger });
  }
  const lockPath = path.join(root, "build.lock.json");
  if (existsSync(lockPath)) {
    const committed = parseLock(readFileSync(lockPath, "utf8"));
    if (!committed.ok) {
      return refuse(
        io,
        "ksor-lock-invalid",
        `build.lock.json is not a lock this ksor can read: ${committed.why}`,
        "delete the file and rebuild — the lock is regenerated from the tree, never edited",
      );
    }
    baselines.push({
      source: "build.lock.json",
      entries: committed.lock.ledger_entries,
      // A build that PASSED wrote this lock, so the entries in it were judged
      // against the policy of the day. Marking it accepted is what lets
      // `checkLedgerActors` stop re-judging history — without it the whole
      // escape hatch is inert and its refusal prints a remedy that does not
      // exist. Git history stays UNACCEPTED: committing is not passing.
      accepted: true,
    });
  }

  const record = loadRecord(root);
  const result = checkRecord(record, { mode: "build", ledgerBaselines: baselines });
  // KSP R23 runs BESIDE the checker, not inside it: it is the one rule that
  // reads git, and `checkRecord` also judges staged trees and fixtures that
  // have no checkout. Where history cannot be read the check SAYS so on the
  // success path below — the `source: unspecified` posture, never a pass.
  const change = checkChangeControl(root, result.concepts, record.files);
  const refusals = sortRefusals([...result.refusals, ...change.refusals]);
  if (refusals.length > 0) {
    io.err(`error: ${refusals[0]?.slug ?? "ksor-refused"}\n`);
    io.err(`ksor build: ${refusals.length} problem(s) — nothing written:\n\n`);
    for (const r of refusals) io.err(`  ${formatRefusal(r)}\n\n`);
    return exitCodes.refused;
  }

  // What the write pass WOULD do, computed before the lock is composed. The
  // indexes are inputs `gitFacts` watched (`knowledge` is INPUTS[0]), so a
  // build that regenerates a committed-but-stale index makes the tree dirty
  // AFTER `dirty` was read: `--strict`, which promises to stamp only committed
  // content, exited 0 having stamped a `source_commit` that does not contain
  // the tree it just published.
  const pendingIndexes = [...result.indexes]
    .filter(([rel, text]) => record.files.get(rel) !== text)
    .map(([rel]) => rel);
  // An index committed for a directory that earns none is stale forever; remove it.
  const staleIndexes = [...record.files.keys()].filter(
    (rel) => rel.startsWith("knowledge/") && rel.endsWith("/index.md") && !result.indexes.has(rel),
  );
  if (parsed.strict && (pendingIndexes.length > 0 || staleIndexes.length > 0)) {
    return refuse(
      io,
      "ksor-build-dirty",
      `generating the indexes would change ${[...pendingIndexes, ...staleIndexes].sort().join(", ")}, which is uncommitted output, and --strict stamps only committed content`,
      "run `ksor build` without --strict, commit the indexes it writes, and rebuild",
    );
  }

  const ledgerText = record.files.get(".ksor/takedowns.yaml") ?? null;
  const ledger = parseLedger(ledgerText, ".ksor/takedowns.yaml");
  const denials = ledger.ok ? inForce(ledger.ledger) : [];
  const asOf = parsed.asOf ?? Date.now();
  const audiences = result.policy?.audiences ?? [];

  // The bundles, planned on EVERY build and written only under `--bundles`:
  // the lock records each one's digest either way, so it is the same lock
  // whether or not the directories exist (build spec §2). Admission is the
  // lock's own — `admittedViewersOf` over the same concepts, viewers, instant
  // and denials `composeLock` uses below — never a second predicate.
  const viewers = canonicalViewers(audiences);
  const bad = viewerRefusal(Object.keys(viewers));
  if (bad !== null) return refuse(io, bad.slug, bad.why, bad.fix);
  const instance = parseInstanceDocument(record.files.get("instance.md") ?? "");
  const bundles = planBundles({
    // The checker refused an unreadable instance above, so the fallback is
    // unreachable; it exists so a heading is never `undefined`.
    title: instance.ok ? instance.instance.title : "Index",
    viewers: Object.keys(viewers),
    concepts: result.concepts.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      order: c.order,
      admitted: admittedViewersOf(c, viewers, asOf, denials),
    })),
    files: record.files,
    assets: record.assets,
    dirs: record.dirs,
  });
  const lock = composeLock({
    ksorVersion: options.version,
    sourceCommit: facts.sourceCommit,
    // The build's OWN writes count: an index this run regenerates is published
    // content that is in no commit, so a lock claiming `dirty: false` beside it
    // would be a false provenance claim (invariant: provenance is load-bearing).
    dirty: facts.dirty || pendingIndexes.length > 0 || staleIndexes.length > 0,
    asOf,
    drafts: options.drafts,
    instanceText: record.files.get("instance.md") ?? "",
    policyText: record.files.get(".ksor/governance.yaml") ?? "",
    peopleText: record.files.get(".ksor/people.yaml") ?? null,
    ledgerText,
    ledgerEntries: result.ledgerEntries,
    audiences,
    concepts: result.concepts.map((c) => ({
      id: c.id,
      status: c.status,
      effectiveFrom: c.effectiveFrom,
      staleAfter: c.staleAfter,
      audience: c.audience,
      text: record.files.get(c.path) ?? "",
    })),
    // The CANONICAL rule, never a copy of it (decision 18). The regex that used
    // to be here was the fourth hand copy of the suffix list and carried the
    // same `.summary.mdx` gap as the third, which this branch had just removed.
    // It also matched on the PATH, where the rule is about the base name.
    companions: [...record.files]
      .filter(([p]) => attachmentKindOf(path.basename(p)) !== null)
      .map(([p, text]) => ({ path: p.slice("knowledge/".length), text })),
    assets: [...(record.assets ?? new Map())].map(([p, bytes]) => ({
      path: p.slice("knowledge/".length),
      bytes,
    })),
    // What this build PUBLISHES as the §8 surface — the generated bytes, not
    // whatever is on disk: the write pass below is what puts them there, and a
    // lock recording the stale file would record something no reader will see.
    indexes: [...result.indexes].map(([rel, text]) => ({
      path: rel.slice("knowledge/".length),
      text,
    })),
    denials,
    bundles: bundles.map((b) => ({
      viewer: b.viewer,
      sha256: bundleDigest(b.files),
      files: b.files.size,
    })),
  });
  const lockText = `${JSON.stringify(lock, null, 2)}\n`;

  // Write only what changed, so a no-op build leaves git quiet.
  for (const rel of pendingIndexes) {
    writeFileSync(path.join(root, rel), result.indexes.get(rel)!);
  }
  for (const rel of staleIndexes) unlinkSync(path.join(root, rel));
  if (parsed.bundles) writeBundles(root, bundles, lockText);
  writeFileSync(lockPath, lockText);

  const admitted = lock.documents.filter((d) => d.admitted.length > 0).length;
  // Why the count is what it is, and when it stops being true. A build that
  // publishes past a document's review date, or holds an embargoed one back,
  // has to SAY so: the number alone reads as a total, and the static artefact
  // it just wrote goes on answering at instants this run never saw.
  const notice = lifecycleNotice(
    result.concepts.map((c) => ({
      path: c.path.slice("knowledge/".length),
      status: c.status,
      effectiveFrom: c.effectiveFrom,
      staleAfter: c.staleAfter,
    })),
    Date.parse(lock.as_of),
  );
  io.out(
    `ksor build: ${lock.documents.length} document(s), ${admitted} admitted to a machine surface at ${lock.as_of}\n` +
      // The LOCK's dirty flag, not the one git reported a moment earlier: this
      // run's regenerated indexes are uncommitted output too, and the line has
      // to describe what was PUBLISHED.
      `${provenanceLine({ ...facts, dirty: lock.dirty }, root)}\n` +
      (change.notice === null ? "" : `  ${change.notice}\n`) +
      notice +
      `${pendingIndexes.map((w) => `  wrote ${w}\n`).join("")}${staleIndexes.map((r) => `  removed ${r} (its directory earns no index)\n`).join("")}` +
      (parsed.bundles ? bundlesReport(bundles, viewers) : "") +
      `  wrote build.lock.json — build_id ${lock.build_id}\n`,
  );
  return 0;
}

/**
 * Replace `.ksor/out/bundles/` with exactly this build's bundles. Replaced,
 * not merged: a bundle an earlier build wrote for an audience the policy no
 * longer registers, or a file a document no longer admits, would otherwise sit
 * beside the fresh ones under the same directory — the sims leak of 2026-08-25
 * (`pruneSims`) in a directory that exists to be sent somewhere. The lock goes
 * beside them the way it sits beside `knowledge/` (KSP-001 4.1.2), so the
 * output travels with the provenance that names it.
 */
function writeBundles(root: string, bundles: readonly Bundle[], lockText: string): void {
  const out = path.join(root, BUNDLES_DIR);
  rmSync(out, { recursive: true, force: true });
  for (const bundle of bundles) {
    for (const [rel, bytes] of bundle.files) {
      const to = path.join(out, bundle.viewer, rel);
      mkdirSync(path.dirname(to), { recursive: true });
      writeFileSync(to, bytes);
    }
  }
  writeFileSync(path.join(out, LOCK_NAME), lockText);
}

/** One line per bundle written, and a line per link it carries to a concept it excludes. */
function bundlesReport(
  bundles: readonly Bundle[],
  viewers: Readonly<Record<string, readonly string[]>>,
): string {
  let text = "";
  for (const bundle of bundles) {
    const list = (viewers[bundle.viewer] ?? [bundle.viewer]).join(", ");
    text += `  wrote ${BUNDLES_DIR}/${bundle.viewer}/ — the OKF bundle for viewer [${list}], ${bundle.files.size} file(s)\n`;
    // Said, not fixed: the body is the record's, verbatim, and the target is a
    // governed state (a draft, an embargo, a review date, a denial) — so the
    // bundle carries the link and the reader is told where it leads.
    for (const link of bundle.dangling) {
      text += `    ${link.from} links to ${link.to}, which this bundle excludes — the link dangles for its reader\n`;
    }
  }
  text += `  wrote ${BUNDLES_DIR}/build.lock.json — a copy, so the bundles travel with the build that made them\n`;
  return text;
}
