/**
 * `ksor build` (build spec §1): generate every index in memory, run the
 * record checker, and only on green write the indexes whose bytes changed
 * and `build.lock.json`. Database-free, network-free. A refusal leaves the
 * tree exactly as it found it, with the slug on the first stderr line.
 */
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  checkRecord,
  composeLock,
  formatRefusal,
  inForce,
  loadRecord,
  parseInstant,
  parseLedger,
  parseLock,
  resolveInstanceDir,
  type LedgerBaseline,
  type Refusal,
} from "@panaversity/ksor-content/record";

import { attachmentKindOf } from "@panaversity/ksor-content";

import { exitCodes } from "../index.js";
import { gitFacts, ignoredGovernance } from "./git.js";
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

export const BUILD_USAGE = `Usage: ksor build [--instance <path>] [--as-of <instant>] [--strict] [--allow-unverifiable-ledger]

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
  --bundles           designed, not implemented (exit 2)
`;

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

function refuse(io: BuildIo, slug: string, why: string, fix: string): number {
  io.err(`error: ${slug}\n${why}\n  fix: ${fix}\n`);
  return exitCodes.refused;
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
  if (parsed.bundles) {
    io.out(`ksor build --bundles: designed but not implemented in ${options.version}.\n`);
    return exitCodes.notImplemented;
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
      "un-ignore them in .gitignore — the directory form `.ksor/` cannot be negated, so use `.ksor/*` plus `!.ksor/governance.yaml` and `!.ksor/takedowns.yaml` — then commit them (`ksor migrate` offers that edit)",
    );
  }
  if (parsed.strict && facts.dirty) {
    return refuse(
      io,
      "ksor-build-dirty",
      facts.repository
        ? "an input (knowledge/, instance.md, .ksor/governance.yaml, .ksor/takedowns.yaml) differs from its last commit, and --strict stamps only committed content"
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
  if (result.refusals.length > 0) {
    io.err(`error: ${result.refusals[0]?.slug ?? "ksor-refused"}\n`);
    io.err(`ksor build: ${result.refusals.length} problem(s) — nothing written:\n\n`);
    for (const r of result.refusals as readonly Refusal[]) io.err(`  ${formatRefusal(r)}\n\n`);
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
  const lock = composeLock({
    ksorVersion: options.version,
    sourceCommit: facts.sourceCommit,
    // The build's OWN writes count: an index this run regenerates is published
    // content that is in no commit, so a lock claiming `dirty: false` beside it
    // would be a false provenance claim (invariant: provenance is load-bearing).
    dirty: facts.dirty || pendingIndexes.length > 0 || staleIndexes.length > 0,
    asOf: parsed.asOf ?? Date.now(),
    drafts: options.drafts,
    instanceText: record.files.get("instance.md") ?? "",
    policyText: record.files.get(".ksor/governance.yaml") ?? "",
    ledgerText,
    ledgerEntries: result.ledgerEntries,
    audiences: result.policy?.audiences ?? [],
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
  });

  // Write only what changed, so a no-op build leaves git quiet.
  for (const rel of pendingIndexes) {
    writeFileSync(path.join(root, rel), result.indexes.get(rel)!);
  }
  for (const rel of staleIndexes) unlinkSync(path.join(root, rel));
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

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
    `ksor build: ${lock.documents.length} document(s), ${admitted} admitted to a machine surface at ${lock.as_of}` +
      `${lock.dirty ? " (dirty)" : ""}\n` +
      notice +
      `${pendingIndexes.map((w) => `  wrote ${w}\n`).join("")}${staleIndexes.map((r) => `  removed ${r} (its directory earns no index)\n`).join("")}` +
      `  wrote build.lock.json — build_id ${lock.build_id}\n`,
  );
  return 0;
}
