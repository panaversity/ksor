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

import { exitCodes } from "../index.js";
import { gitFacts } from "./git.js";

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
    baselines.push({ source: "build.lock.json", entries: committed.lock.ledger_entries });
  }

  const record = loadRecord(root);
  const result = checkRecord(record, { mode: "build", ledgerBaselines: baselines });
  if (result.refusals.length > 0) {
    io.err(`error: ${result.refusals[0]?.slug ?? "ksor-refused"}\n`);
    io.err(`ksor build: ${result.refusals.length} problem(s) — nothing written:\n\n`);
    for (const r of result.refusals as readonly Refusal[]) io.err(`  ${formatRefusal(r)}\n\n`);
    return exitCodes.refused;
  }

  const ledgerText = record.files.get(".ksor/takedowns.yaml") ?? null;
  const ledger = parseLedger(ledgerText, ".ksor/takedowns.yaml");
  const denials = ledger.ok ? inForce(ledger.ledger) : [];
  const lock = composeLock({
    ksorVersion: options.version,
    sourceCommit: facts.sourceCommit,
    dirty: facts.dirty,
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
    companions: [...record.files]
      .filter(([p]) => /\.(summary\.md|flashcards\.yaml|quiz\.yaml|slides\.yaml)$/.test(p))
      .map(([p, text]) => ({ path: p.slice("knowledge/".length), text })),
    assets: [...(record.assets ?? new Map())].map(([p, bytes]) => ({
      path: p.slice("knowledge/".length),
      bytes,
    })),
    denials,
  });

  // Write only what changed, so a no-op build leaves git quiet.
  const written: string[] = [];
  for (const [rel, text] of result.indexes) {
    if (record.files.get(rel) === text) continue;
    writeFileSync(path.join(root, rel), text);
    written.push(rel);
  }
  // An index committed for a directory that earns none is stale forever; remove it.
  const removed: string[] = [];
  for (const rel of record.files.keys()) {
    if (rel.startsWith("knowledge/") && rel.endsWith("/index.md") && !result.indexes.has(rel)) {
      unlinkSync(path.join(root, rel));
      removed.push(rel);
    }
  }
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

  const admitted = lock.documents.filter((d) => d.admitted.length > 0).length;
  io.out(
    `ksor build: ${lock.documents.length} document(s), ${admitted} admitted to a machine surface at ${lock.as_of}` +
      `${lock.dirty ? " (dirty)" : ""}\n` +
      `${written.map((w) => `  wrote ${w}\n`).join("")}${removed.map((r) => `  removed ${r} (its directory earns no index)\n`).join("")}` +
      `  wrote build.lock.json — build_id ${lock.build_id}\n`,
  );
  return 0;
}
