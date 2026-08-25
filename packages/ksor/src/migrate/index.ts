/**
 * `ksor migrate` (research/okf-native.md §1.8): the update vehicle decision 4
 * promised, for a record written before the KSoR Profile and — with
 * `--write-site` — for the adopter-owned site's byte-copied rule modules.
 *
 * It SHOWS before it writes. Without `--write` it prints a unified diff and
 * exits 0, because the mapping makes governance decisions (a tier expands, an
 * approval becomes a draft, a denylist row becomes a committed ledger entry)
 * and every one of them is something the owner has to see.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { Document, isCollection } from "yaml";

import {
  formatRefusal,
  loadRecord,
  parseInstant,
  parsePolicy,
  resolveInstanceDir,
  sortRefusals,
  splitFrontmatter,
  type Refusal,
} from "@panaversity/ksor-content/record";

import { exitCodes } from "../index.js";
import { applyProse, type PackageManager } from "../init/manager.js";
import { ACTOR_FORM, isWritableActor } from "./actor.js";
import { DenialReadError, readDbDenials, type DbDenial } from "./denials.js";
import {
  renderLedger,
  toLedgerEntries,
  type LedgerDenial,
  type ReservedFate,
} from "./ledger-out.js";
import { renderDiff, type FileChange } from "./diff.js";
import {
  instanceNameOf,
  migrateConcept,
  migrateInstance,
  migrateSummary,
  modelOf,
  NO_AUDIENCE_MODEL,
  type AudienceModel,
  type InstanceNameResult,
} from "./rules.js";

export interface MigrateIo {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

export interface MigrateOptions {
  readonly version: string;
  /** The CLI's own `templates/scaffold` directory — where `--write-site` copies from. */
  readonly templatesDir: string;
}

export const MIGRATE_USAGE = `Usage: ksor migrate [--write] [--instance <path>] [--actor human:<id>]
                    [--approve-by human:<id>] [--attribute <stable_id>=<actor>]...
                    [--generated-at <instant>] [--write-site]

Rewrites a pre-profile record into the KSoR Profile of OKF: audiences expanded
upward from the old ordered model, provenance into sources, the instance into
format 2, authority into .ksor/governance.yaml, and every denylist row in the
database into the committed takedown ledger.

Without --write it prints a unified diff and changes nothing. It never authors
knowledge: a document whose title or description it cannot derive is refused by
name (ksor-migrate-underivable), and so is a denial it cannot attribute.

  --write             apply the diff
  --instance <path>   instance.md, or a directory at or below the record root
  --actor human:<id>  the person running this migration — recorded on every
                      deprecation, and named in a policy migrate has to write
  --approve-by human:<id>
                      every \`approved\` document becomes \`stable\` with this
                      approval; without it they become drafts (R25)
  --attribute <stable_id>=<actor>
                      who denied this document, where the log no longer says
  --generated-at <instant>
                      stamp every document's \`generated.at\` with this instant
                      instead of the last commit that touched it
  --write-site        offer every file of system/site this ksor emits, so the
                      adopter-owned site can read the record this run writes
`;

interface Parsed {
  readonly instance: string | null;
  readonly write: boolean;
  readonly actor: string | null;
  readonly approveBy: string | null;
  readonly generatedAt: string | null;
  readonly writeSite: boolean;
  readonly attributions: ReadonlyMap<string, string>;
}

/** A rejected value is quoted back to the operator; an unbounded one is not printed whole. */
function cap(value: string): string {
  const oneLine = value.replace(/[\r\n\u2028\u2029]/g, "\u23ce");
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}\u2026` : oneLine;
}

function parseArgs(args: readonly string[]): Parsed | string {
  let instance: string | null = null;
  let write = false;
  let actor: string | null = null;
  let approveBy: string | null = null;
  let generatedAt: string | null = null;
  let writeSite = false;
  const attributions = new Map<string, string>();
  const VALUED = ["--instance", "--actor", "--approve-by", "--attribute", "--generated-at"];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (VALUED.includes(arg)) {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("-")) return `${arg} needs a value`;
      i += 1;
      if (arg === "--instance") instance = value;
      else if (arg === "--actor" || arg === "--approve-by") {
        // Decision 21: a governance act NAMES its actor. Guarding only that
        // the flag was PRESENT let any wrong string through to the Governance
        // Policy — `--actor ""` (an unset CI variable) wrote a policy
        // authorising nobody, and `--actor "human:jane, human:john"` rendered
        // as TWO authorities, granting approval to an identity the operator
        // never named. Both exited 0. Reproduced live, 2026-08-25.
        //
        // `isIndividualActor` was then applied here and closed those two and
        // not the rest: its id is `\S+`, so `human:a]`, `human:a,b`, `human:a#c`
        // and `human:"a"` all passed it and went on to be interpolated into a
        // YAML flow sequence. `isWritableActor` is the WRITING rule (actor.ts).
        if (!isWritableActor(value)) {
          return `${arg} must name ONE individual — ${ACTOR_FORM} — got "${cap(value)}"`;
        }
        if (arg === "--actor") actor = value;
        else approveBy = value;
      } else if (arg === "--generated-at") {
        if (parseInstant(value) === null) {
          return `--generated-at must be an ISO 8601 instant with an offset (e.g. 2026-08-25T12:00:00Z), got "${value}"`;
        }
        generatedAt = value;
      } else {
        const at = value.indexOf("=");
        if (at <= 0 || at === value.length - 1) {
          return `--attribute is <stable_id>=<actor>, got "${cap(value)}"`;
        }
        // The half after `=` is an actor like any other, and it lands in the
        // ledger AND in the policy's `takedown_authorities`. It was the one
        // actor seam with no validation at all.
        const asserted = value.slice(at + 1);
        if (!isWritableActor(asserted)) {
          return `--attribute names the actor who denied a document — ${ACTOR_FORM} — got "${cap(asserted)}"`;
        }
        attributions.set(value.slice(0, at), asserted);
      }
    } else if (arg === "--write") write = true;
    else if (arg === "--write-site") writeSite = true;
    else return `unknown argument "${arg}"`;
  }
  return { instance, write, actor, approveBy, generatedAt, writeSite, attributions };
}

const COMPANION = /\.(summary\.md|flashcards\.yaml|quiz\.yaml|slides\.yaml)$/;
// `.md` only. `loadRecord` reads `.md` and `.yaml` as text and nothing else, so
// an `.mdx` never enters `record.files` at all — and the record checker refuses
// one under `knowledge/` by name (`ksor-file-type`: the bundle is CommonMark,
// decision 8). The `index.mdx` and `.mdx` branches this file used to carry were
// unreachable in both directions.
const RESERVED = new Set(["index.md", "README.md"]);

/** Stands in for `--actor` in a dry run, and is never written to a file. */
const PLACEHOLDER_ACTOR = "human:<you>";

/** A generated index: no governance frontmatter, and every body line a heading or a bullet. */
function isGeneratedIndex(text: string, path: string): boolean {
  const split = splitFrontmatter(text, path);
  if (!split.ok) return false;
  const fm = split.frontmatter ?? {};
  if (Object.keys(fm).some((k) => k !== "okf_version")) return false;
  return split.body
    .split("\n")
    .every((line) => line.trim() === "" || /^#\s/.test(line) || /^\*\s+\[/.test(line));
}

function refusal(io: MigrateIo, refusals: readonly Refusal[]): number {
  const sorted = sortRefusals([...refusals]);
  io.err(`error: ${sorted[0]?.slug ?? "ksor-migrate-underivable"}\n`);
  io.err(`ksor migrate: ${sorted.length} problem(s) — nothing written:\n\n`);
  for (const r of sorted) io.err(`  ${formatRefusal(r)}\n\n`);
  return exitCodes.refused;
}

function badArgs(io: MigrateIo, why: string): number {
  io.err(`error: bad-args\n${why}\n${MIGRATE_USAGE}`);
  return exitCodes.refused;
}

export async function runMigrate(
  args: readonly string[],
  cwd: string,
  io: MigrateIo,
  options: MigrateOptions,
): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    io.out(MIGRATE_USAGE);
    return 0;
  }
  const parsed = parseArgs(args);
  if (typeof parsed === "string") return badArgs(io, parsed);

  const start =
    parsed.instance === null
      ? cwd
      : existsSync(parsed.instance) && statSync(parsed.instance).isFile()
        ? path.dirname(path.resolve(cwd, parsed.instance))
        : path.resolve(cwd, parsed.instance);
  const root = resolveInstanceDir(start);
  if (root === null) {
    io.err(
      "error: ksor-instance-missing\n" +
        `no instance.md at or above ${start} — the record root is the directory holding it\n` +
        "  fix: run from inside the record, or pass --instance <path>\n",
    );
    return exitCodes.refused;
  }

  const record = loadRecord(root);
  const instanceText = record.files.get("instance.md") ?? "";
  const instanceSplit = splitFrontmatter(instanceText, "instance.md");
  const oldFm = instanceSplit.ok ? (instanceSplit.frontmatter ?? {}) : {};
  const policyPath = ".ksor/governance.yaml";
  const hadPolicy = record.files.has(policyPath);
  if (!hadPolicy && parsed.actor === null && parsed.write) {
    return badArgs(
      io,
      "this record has no `.ksor/governance.yaml`, so migrate has to write one — and a policy names\n" +
        "who may approve and who may take down. Pass --actor human:<id>: the person running this\n" +
        "migration. A governance act never names an actor the tool guessed (decision 21).",
    );
  }
  // The dry run writes nothing, so it needs an actor to APPLY the migration,
  // not to SHOW it — and the documented first step of the upgrade path is the
  // bare form. The placeholder is only ever substituted when nothing will be
  // written, so no file can carry it, and it is rendered in the diff rather
  // than hidden, because "who" is the one thing the owner is being asked for.
  const actor = parsed.actor ?? (parsed.write ? null : PLACEHOLDER_ACTOR);

  const identity = instanceNameOf(oldFm, path.basename(root));
  const changes: FileChange[] = [];
  const refusals: Refusal[] = [];
  const registry = new Set<string>();
  const model: AudienceModel = oldFm["format"] === 2 ? NO_AUDIENCE_MODEL : modelOf(oldFm);

  // ── instance.md ────────────────────────────────────────────────────────
  const instance = migrateInstance(instanceText, { directory: path.basename(root) });
  if (!instance.ok) refusals.push(...instance.refusals);
  else if (instance.outcome.changed) {
    changes.push({ path: "instance.md", before: instanceText, after: instance.outcome.text });
  }

  // ── the bundle ─────────────────────────────────────────────────────────
  const instantNow = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const ctx = {
    version: options.version,
    actor,
    approveBy: parsed.approveBy,
    instant: parsed.generatedAt ?? instantNow,
    model,
  };
  const conceptIds = new Set<string>();
  /** Reserved-name targets THIS run has already claimed, so two sources cannot share one. */
  const claimed = new Map<string, string>();
  /** What became of every reserved name walked, for the denials that name one. */
  const fate = new Map<string, "moved" | "kept">();
  /** Concept id → path, for every `approved` document this run turns into a `draft`. */
  const demoted = new Map<string, string>();
  /** Every `ksor.superseded_by` this run would write, by the document writing it. */
  const pointers: { readonly path: string; readonly successor: string }[] = [];
  for (const [rel, text] of [...record.files].sort()) {
    if (!rel.startsWith("knowledge/") || !rel.endsWith(".md")) continue;
    const name = rel.slice(rel.lastIndexOf("/") + 1);
    if (name === "log.md") continue;
    if (COMPANION.test(name)) {
      if (!name.endsWith(".summary.md")) continue;
      const out = migrateSummary(rel, text);
      // Its refusals were DROPPED here, so a summary declaring governance was
      // silently left alone by the one branch that had just decided to refuse
      // it — the whole point of decision 24's class refusal, discarded one line
      // after it was raised.
      if (!out.ok) refusals.push(...out.refusals);
      else if (out.outcome.changed) {
        changes.push({ path: rel, before: text, after: out.outcome.text });
      }
      continue;
    }
    let target = rel;
    if (RESERVED.has(name)) {
      const reservedId = rel.replace(/\.md$/, "");
      if (isGeneratedIndex(text, rel)) {
        // Left exactly where it is: `ksor build` regenerates it, and it carries
        // no prose to move. A denial that names it has nothing to follow.
        fate.set(reservedId, "kept");
        continue;
      }
      const dir = rel.slice(0, rel.lastIndexOf("/"));
      target = `${dir}/overview.md`;
      if (record.files.has(target)) {
        refusals.push({
          slug: "ksor-migrate-underivable",
          path: rel,
          why: `\`${name}\` is a name the profile reserves and carries prose, but \`${target}\` already exists — migrate will not choose which of the two governs`,
          fix: `move ${rel}'s prose into ${target} by hand and delete it, then run \`ksor migrate\` again`,
        });
        continue;
      }
      // BOTH reserved names can carry prose in one directory, and
      // README-beside-index is an ordinary layout — precisely the population
      // migrate exists to convert. Asking only whether the target was already
      // on DISK missed the case where THIS run had just claimed it: both
      // originals were emptied, both writes went to one path, the second won,
      // and one document's prose was deleted with exit 0 and nothing printed
      // (reproduced live, 2026-08-25). Which of two documents governs a
      // directory is an authoring decision, so migrate refuses it the same way
      // it refuses to invent a `description`.
      const claimant = claimed.get(target);
      if (claimant !== undefined) {
        refusals.push({
          slug: "ksor-migrate-underivable",
          path: rel,
          why: `\`${rel}\` and \`${claimant}\` both carry prose and both map to \`${target}\` — migrate will not choose which of the two governs this directory`,
          fix: `merge the two by hand into one of them (or into ${target}) and delete the other, then run \`ksor migrate\` again`,
        });
        continue;
      }
      claimed.set(target, rel);
      fate.set(reservedId, "moved");
    }
    const out = migrateConcept(target, text, generatedAtOf(root, rel, parsed.generatedAt), ctx);
    if (!out.ok) {
      refusals.push(...out.refusals);
      continue;
    }
    for (const a of out.outcome.audiences) registry.add(a);
    const conceptId = target.slice("knowledge/".length).replace(/\.md$/, "");
    conceptIds.add(conceptId);
    if (out.outcome.demoted) demoted.set(conceptId, target);
    if (out.outcome.successor !== null) {
      pointers.push({ path: target, successor: out.outcome.successor });
    }
    if (target !== rel) {
      // A reserved name is emptied and its prose lands in a concept beside it;
      // `ksor build` regenerates index.md from the tree at the next build.
      changes.push({ path: rel, before: text, after: null });
      changes.push({ path: target, before: null, after: out.outcome.text });
    } else if (out.outcome.changed) {
      changes.push({ path: rel, before: text, after: out.outcome.text });
    }
  }

  // The commonest pre-profile shape is a withdrawn document pointing at the
  // approved one that replaced it. Demoting that successor to `draft` — which
  // is what happens without `--approve-by` — leaves a tree `ksor build` refuses
  // as `ksor-supersession-strands`, so the published runbook ended RED on it.
  // Migrate already refuses the neighbouring stray-pointer case up front; this
  // is the one it creates itself, so it refuses it the same way.
  for (const pointer of pointers) {
    const target = demoted.get(pointer.successor);
    if (target === undefined) continue;
    refusals.push({
      slug: "ksor-migrate-underivable",
      path: target,
      why: `\`${pointer.path}\` is withdrawn in favour of this document, and without \`--approve-by\` an \`approved\` document becomes a \`draft\` (R25) — the checker then refuses that tree as \`ksor-supersession-strands\`, because a reader sent to a draft successor is stranded`,
      fix: "re-run with `--approve-by human:<id>` — the person approving these documents — so every `approved` document becomes `stable` and the pointer resolves",
    });
  }

  // ── the takedown ledger ────────────────────────────────────────────────
  // Transcribing the denylist is a ONE-TIME act, into a record that has no
  // ledger yet. A record that already has one has already been migrated, and
  // `ksor takedown` may have appended to it since — regenerating the file from
  // the database would delete those entries, which is the one thing an
  // append-only ledger must never suffer.
  const hadLedger = record.files.has(".ksor/takedowns.yaml");
  const denials = hadLedger
    ? []
    : await collectDenials(identity, oldFm, parsed.attributions, fate, refusals, io);
  const takedownActors = new Set<string>(denials.map((d) => d.by));
  if (denials.length > 0) {
    changes.push({
      path: ".ksor/takedowns.yaml",
      before: null,
      after: renderLedger(denials, conceptIds),
    });
  }

  // ── the governance policy ──────────────────────────────────────────────
  const policyBefore = record.files.get(policyPath) ?? null;
  const policyAfter = renderPolicy({
    before: policyBefore,
    actor,
    approveBy: parsed.approveBy,
    registry: [...registry].sort(),
    takedownActors: [...takedownActors].sort(),
    refusals,
  });
  if (policyAfter !== null && policyAfter !== policyBefore) {
    changes.push({ path: policyPath, before: policyBefore, after: policyAfter });
  }

  // ── .gitignore ─────────────────────────────────────────────────────────
  const gitignore = gitignoreChange(root);
  if (gitignore !== null) changes.push(gitignore);

  // ── the emitted checker and the manifest that runs it ──────────────────
  // Neither is behind a flag: a stale checker REFUSES the record this run
  // writes (and the shipped validate.yml runs that exact file), and the root
  // `build` script calls a `ksor takedown` flag this release removed. An
  // upgrade that leaves the adopter's own gate red is not an upgrade.
  changes.push(...checkerChanges(root, options.templatesDir));
  const manifest = manifestChange(root);
  if (manifest !== null) changes.push(manifest);

  // ── the site, which the adopter owns and only this can update ──────────
  if (parsed.writeSite) {
    changes.push(
      ...siteChanges(root, options.templatesDir, {
        name: identity.ok ? identity.name : path.basename(root),
        version: options.version,
      }),
    );
  }

  if (refusals.length > 0) return refusal(io, refusals);
  if (changes.length === 0) {
    io.out("ksor migrate: nothing to migrate — this record is already in the KSoR Profile.\n");
    return 0;
  }
  if (!parsed.write) {
    io.out(renderDiff(changes));
    io.out(
      `\nksor migrate: ${changes.length} file(s) would change. Re-run with --write to apply.\n` +
        (parsed.actor === null
          ? `The diff names \`${PLACEHOLDER_ACTOR}\` where the person running this migration goes;\n` +
            "applying it needs --actor human:<id> (a governance act never names an actor the tool\n" +
            "guessed — decision 21).\n"
          : ""),
    );
    return 0;
  }
  // WRITES FIRST, DELETIONS LAST — the same set either way, but never a moment
  // where a document's prose exists in neither file. A reserved name is emptied
  // and its prose lands beside it, so applying in list order put the delete of
  // `index.md` before the write of `overview.md`: interrupt it there — Ctrl-C,
  // a full disk, a killed CI step — and the text is gone from a tree that never
  // received its replacement. Recoverable from git IF the adopter had committed,
  // which migrate does not check and cannot assume.
  const ordered = [
    ...changes.filter((c) => c.after !== null),
    ...changes.filter((c) => c.after === null),
  ];
  for (const change of ordered) {
    const abs = path.join(root, change.path);
    if (change.after === null) {
      rmSync(abs, { force: true });
      io.out(`deleted ${change.path}\n`);
      continue;
    }
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, change.after);
    io.out(`${change.before === null ? "wrote" : "rewrote"} ${change.path}\n`);
  }
  io.out(
    `\nksor migrate: ${changes.length} file(s) written. Run \`ksor build\` to generate the indexes and the lock.\n`,
  );
  return 0;
}

/** The last commit that touched the file — `generated.at` is when the text was produced, not when it was migrated. */
function generatedAtOf(root: string, rel: string, override: string | null): string | null {
  if (override !== null) return override;
  const r = spawnSync("git", ["log", "-1", "--format=%cI", "--", rel], {
    cwd: root,
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  const at = r.stdout.trim();
  return at === "" ? null : at;
}

/** Reads the database's denylist, or refuses; an empty list when the record declares none. */
async function collectDenials(
  identity: InstanceNameResult,
  fm: Readonly<Record<string, unknown>>,
  attributions: ReadonlyMap<string, string>,
  fate: ReservedFate,
  refusals: Refusal[],
  io: MigrateIo,
): Promise<readonly LedgerDenial[]> {
  const database = fm["database"];
  if (typeof database !== "object" || database === null || Array.isArray(database)) return [];
  const dsnEnv = (database as Record<string, unknown>)["dsn_env"];
  if (typeof dsnEnv !== "string" || dsnEnv === "") return [];
  // A record with no readable identity has no rows to scope a query by;
  // `migrateInstance` has already refused it by name, so say nothing twice.
  if (!identity.ok) return [];
  const dsn = process.env[dsnEnv];
  if (dsn === undefined || dsn === "") {
    refusals.push({
      slug: "ksor-migrate-underivable",
      path: "instance.md",
      why: `this record declares \`database.dsn_env: ${dsnEnv}\`, and its takedown denials live only in that database — migrating without reading them would republish every withdrawn document`,
      fix: `export ${dsnEnv} and run it again, or remove \`database:\` from instance.md if this record no longer has one`,
    });
    return [];
  }
  let rows: readonly DbDenial[];
  try {
    rows = await readDbDenials({ tenantId: identity.name, corpusId: identity.name }, dsn);
  } catch (error) {
    // A refusal raised by the transcription itself is already a what/why/fix;
    // nesting it inside another one's `why:` printed two `why:` lines at two
    // indents and blamed the database for a decision about a row.
    if (error instanceof DenialReadError) {
      refusals.push({
        slug: "ksor-migrate-underivable",
        path: ".ksor/takedowns.yaml",
        why: error.why,
        fix: error.fix,
      });
      return [];
    }
    refusals.push({
      slug: "ksor-migrate-underivable",
      path: "instance.md",
      // One line: a driver error's own multi-line detail nested inside a
      // refusal reads as a second, malformed refusal.
      why: `the takedown denials could not be read from ${dsnEnv}: ${firstLine(error)}`,
      fix: `make the database reachable and run it again — the ledger is the record's copy of those rows and cannot be derived without them`,
    });
    return [];
  }
  io.err(`read ${rows.length} denylist row(s) from ${dsnEnv}\n`);
  const outcome = toLedgerEntries(rows, attributions, fate);
  refusals.push(...outcome.refusals);
  return outcome.entries;
}

function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split("\n")[0] ?? "";
}

interface PolicyInput {
  readonly before: string | null;
  readonly actor: string | null;
  readonly approveBy: string | null;
  readonly registry: readonly string[];
  readonly takedownActors: readonly string[];
  readonly refusals: Refusal[];
}

/** null when the existing policy already says everything the migrated record needs. */
function renderPolicy(input: PolicyInput): string | null {
  const approvers = [
    ...new Set([input.approveBy, input.actor].filter((a): a is string => a !== null)),
  ];
  if (input.before !== null) {
    const parsed = parsePolicy(input.before, ".ksor/governance.yaml");
    if (!parsed.ok) {
      input.refusals.push(...parsed.refusals);
      return null;
    }
    const missingAudiences = input.registry.filter((a) => !parsed.policy.audiences.includes(a));
    const missingActors = input.takedownActors.filter(
      (a) => !parsed.policy.takedownActors.includes(a),
    );
    if (missingAudiences.length === 0 && missingActors.length === 0) return null;
    // Adding to an existing policy is a decision, not a merge: say so and stop.
    input.refusals.push({
      slug: "ksor-migrate-underivable",
      path: ".ksor/governance.yaml",
      why:
        `this record already has a policy, and the migration needs it to declare ` +
        [
          missingAudiences.length > 0 ? `audience(s) ${missingAudiences.join(", ")}` : "",
          missingActors.length > 0 ? `takedown actor(s) ${missingActors.join(", ")}` : "",
        ]
          .filter((s) => s !== "")
          .join(" and ") +
        " — migrate will not edit an authority set that a human already wrote",
      fix: "add them to `.ksor/governance.yaml` in a reviewed change, then run `ksor migrate` again",
    });
    return null;
  }
  const takedown = [
    ...new Set([...input.takedownActors, ...(input.actor === null ? [] : [input.actor])]),
  ];
  const audiences: Record<string, unknown> = {};
  for (const a of input.registry) {
    audiences[a] = { description: "Migrated from the record's `audiences:` model." };
  }
  // Built as a DOCUMENT and stringified, never interpolated. `actors:
  // [${xs.join(", ")}]` is only YAML while nothing in `xs` is an indicator, and
  // an actor is a string this tool did not write: `human:a]` closed the
  // sequence, `human:a,b` became two authorities, `human:a#c` commented the
  // rest of the line out. The seams now refuse those (actor.ts), and this makes
  // the refusal the only thing standing between them and a broken file rather
  // than the last thing (decision 26: the record is real YAML, one parser —
  // written by that parser too).
  const doc = new Document(
    {
      version: "0.1",
      ...(input.registry.length > 0 ? { audiences } : {}),
      approval_authorities: [{ actors: [...approvers] }],
      takedown_authorities: { actors: [...takedown] },
    },
    // Two authority lists with the same members are the COMMON case, and
    // `yaml` would otherwise emit the second as `*a1` — legal, and unreadable
    // in the one file a human is being asked to review.
    { aliasDuplicateObjects: false },
  );
  // (named `at`, not `path`: `path` is the node:path import in this module)
  for (const at of [
    ["approval_authorities", 0, "actors"],
    ["takedown_authorities", "actors"],
  ]) {
    const node: unknown = doc.getIn(at, true);
    if (isCollection(node)) node.flow = true;
  }
  doc.commentBefore = [
    " The Governance Policy: who has authority over this record (record spec §4).",
    " Written by `ksor migrate` from the actors it was given; review it before merging.",
  ].join("\n");
  const text = doc.toString({ lineWidth: 0, flowCollectionPadding: false });

  // Read back what was written, with the record's OWN reader, before it is
  // offered as a change. This is the posture decision 23 records for the
  // served tool surface: hand the rendering over, then refuse to proceed on a
  // state that breaks it. Nothing should be able to reach here and fail — and
  // that is exactly the claim worth checking on the file that decides who may
  // approve and who may take down.
  const readBack = parsePolicy(text, ".ksor/governance.yaml");
  if (!readBack.ok) {
    input.refusals.push({
      slug: "ksor-migrate-underivable",
      path: ".ksor/governance.yaml",
      why: `migrate rendered a policy its own reader will not accept (${readBack.refusals[0]?.why ?? "unknown"}) — it will not write a governance file the record refuses`,
      fix: `re-run with plainer actors than ${JSON.stringify([...approvers, ...takedown])}, and report this: an actor that passed the argument guard should never render an unreadable policy`,
    });
    return null;
  }
  return text;
}

/** Every spelling of "ignore the whole `.ksor` directory" a pre-profile scaffold carried. */
const BARE_DOTKSOR_PATTERNS = new Set([".ksor/", ".ksor", "/.ksor/", "/.ksor"]);

const GOVERNANCE_IGNORE_BLOCK = [
  "# ksor's working directory — build output and scratch, never the record.",
  "# The two governance files inside it ARE the record (the policy and the",
  "# takedown ledger) and are un-ignored by name: the directory form `.ksor/`",
  "# cannot be negated, so the glob is `.ksor/*`.",
  ".ksor/*",
  "!.ksor/governance.yaml",
  "!.ksor/takedowns.yaml",
];

/**
 * The one adopter-owned file the migration itself invalidates. Every scaffold
 * ever emitted ignores `.ksor/` WHOLESALE, and this migration writes the
 * policy and (from the denylist) the ledger into that directory — so `git add
 * -A` stages neither, the migration commits green locally, and the clone CI
 * builds from refuses `ksor-policy-missing`. A directory pattern cannot be
 * negated, so the bare line is replaced rather than appended to, and the stale
 * comment above it goes with it.
 */
function gitignoreChange(root: string): FileChange | null {
  const abs = path.join(root, ".gitignore");
  if (!existsSync(abs)) return null;
  const before = readFileSync(abs, "utf8");
  const lines = before.split("\n");
  const at = lines.findIndex((line) => BARE_DOTKSOR_PATTERNS.has(line.trim()));
  if (at === -1) return null;
  let from = at;
  while (from > 0 && lines[from - 1]!.trimStart().startsWith("#")) from -= 1;
  const after = [...lines.slice(0, from), ...GOVERNANCE_IGNORE_BLOCK, ...lines.slice(at + 1)].join(
    "\n",
  );
  return { path: ".gitignore", before, after };
}

/**
 * The emitted format checker, in BOTH skill trees. It is a build product of
 * the CLI, generated from the same rule set `ksor build` runs, and its own
 * skill tells the adopter never to edit it because a ksor upgrade replaces
 * it — which nothing did. So a migrated record was refused by the adopter's
 * own `check` script and by their shipped `validate.yml`, with printed fixes
 * that undo the migration key by key.
 *
 * Never a creation: a record that does not carry the skill is not handed one.
 */
function checkerChanges(root: string, templatesDir: string): FileChange[] {
  const out: FileChange[] = [];
  for (const tree of [".agents", ".claude"]) {
    for (const [name, generated] of [
      ["check.mjs", true],
      ["SKILL.md", false],
    ] as const) {
      const rel = `${tree}/skills/format-checker/${name}`;
      const src = path.join(templatesDir, rel);
      const abs = path.join(root, rel);
      if (!existsSync(src) || !existsSync(abs)) continue;
      const before = readFileSync(abs, "utf8");
      const after = readFileSync(src, "utf8");
      if (before !== after) out.push({ path: rel, before, after, generated });
    }
  }
  return out;
}

/**
 * The root scripts this release breaks. `export-denylist` ran
 * `ksor takedown --export`, a flag the committed ledger retired, and the
 * scaffold's own `build` calls it first — so the adopter's build died on
 * `error: bad-args` with nothing saying the flag was removed. Structured, not
 * string surgery: the manifest is the one file where a half-applied edit
 * would still parse and then lie.
 */
function manifestChange(root: string): FileChange | null {
  const abs = path.join(root, "package.json");
  if (!existsSync(abs)) return null;
  const before = readFileSync(abs, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(before);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const manifest = parsed as Record<string, unknown>;
  const scripts = manifest["scripts"];
  if (typeof scripts !== "object" || scripts === null || Array.isArray(scripts)) return null;
  const table = scripts as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(table)) {
    if (key === "export-denylist") continue;
    if (typeof value !== "string") {
      next[key] = value;
      continue;
    }
    // `--knowledge` is gone too: the record root beside instance.md supplies
    // it, and the flag now refuses like any other unknown one — so a script
    // left carrying it would fail the adopter's first `ingest` after upgrading.
    // A quoted value is matched explicitly. `[^\s"]+` alone could not match a
    // value that STARTS with a quote, so `--knowledge "my knowledge"` — a path
    // with a space, the commonest reason to quote one — was left in the script
    // whole, which is the one case this strip exists for.
    const stripped = value.replace(/\s+--knowledge(?:=|\s+)(?:"[^"]*"|'[^']*'|[^\s]+)/g, "");
    next[key] =
      key === "build"
        ? stripped.replace(/^.*?export-denylist\s*&&\s*/, "ksor build && ")
        : stripped;
  }
  // The manifest is the ADOPTER's file, formatted the way their repository is.
  // Re-emitting it at a fixed two spaces rewrote every line of a 4-space or
  // tab-indented one, so the single script this actually changes arrived as an
  // unreviewable whole-file hunk — and their next formatter run reverted it.
  // The indentation and the line endings are read off the bytes; nothing else
  // about the file's shape is ours to preserve, because a structured rewrite is
  // the point (a half-applied string edit would still parse, and then lie).
  const rendered = JSON.stringify({ ...manifest, scripts: next }, null, indentOf(before));
  // `JSON.stringify` emits LF only, so a CRLF manifest came back with every
  // line ending changed — the same unreadable whole-file hunk by another route.
  // Only structural newlines are real here: one inside a string value is
  // already escaped as the two characters `\n`.
  const eol = before.includes("\r\n") ? "\r\n" : "\n";
  const after = `${rendered.replaceAll("\n", eol)}${/\r?\n$/.test(before) ? eol : ""}`;
  return before === after ? null : { path: "package.json", before, after };
}

/** The indentation the adopter's manifest is written in: their string, or none when it is minified. */
function indentOf(json: string): string | number {
  const indent = /\n([ \t]+)\S/.exec(json)?.[1];
  // No indented member at all: either minified, or one line. Re-indenting it
  // would be the rewrite this exists to avoid, so it stays as it is.
  if (indent === undefined) return json.includes("\n") ? 2 : 0;
  // `JSON.stringify` caps a string indent at 10 characters and ignores one
  // built of anything else, so a value it would not honour is not offered to it.
  return indent.length <= 10 && /^( +|\t+)$/.test(indent) ? indent : 2;
}

/** What a text file of the template is; the site's icon has no diff to review. */
const SITE_TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  ".json",
  ".css",
  ".md",
  ".yaml",
  ".yml",
  ".txt",
]);

/**
 * The whole of `system/site`, which the adopter owns (decision 4) and which
 * nothing else can update. Offering only `*-rule.ts` left every other file
 * this release changed — the 18 copied record modules, `source.config.ts`,
 * the staging library — at the pre-profile version, so a correctly migrated
 * record could not be built at all. The set is WALKED, not listed, so a file
 * added to the template later is offered without anyone remembering to.
 *
 * Rendered through the same two substitutions `ksor init` applies, because a
 * template's raw bytes carry `KSOR-STAMP-…` placeholders and pnpm spellings
 * that an npm or bun scaffold cannot run.
 */
function siteChanges(root: string, templatesDir: string, stamps: Stamps): FileChange[] {
  const from = path.join(templatesDir, "system", "site");
  // Only ever an UPDATE. A record with no site of its own is not one that
  // wants a `system/site` conjured into it by a migration.
  if (!existsSync(from) || !existsSync(path.join(root, "system", "site"))) return [];
  const manager = managerOf(root);
  const out: FileChange[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      if (entry.name === "node_modules") continue;
      const abs = path.join(dir, entry.name);
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(abs, child);
        continue;
      }
      if (!SITE_TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
      const after = applyProse(
        readFileSync(abs, "utf8")
          .replaceAll("KSOR-STAMP-NAME", stamps.name)
          .replaceAll("KSOR-STAMP-VERSION", stamps.version),
        manager,
      );
      const target = path.join(root, child);
      const before = existsSync(target) ? readFileSync(target, "utf8") : null;
      if (before !== after) out.push({ path: child, before, after });
    }
  };
  walk(from, "system/site");
  return out;
}

interface Stamps {
  readonly name: string;
  readonly version: string;
}

/**
 * Which manager this repository was scaffolded for, from what it committed.
 * `ksor init` reads `npm_config_user_agent` — the run that scaffolds is the
 * run that knows — but a migration is a different run, so it reads the tree.
 * An unrecognized tree falls back to pnpm, exactly as init does.
 */
function managerOf(root: string): PackageManager {
  if (existsSync(path.join(root, "pnpm-workspace.yaml"))) return "pnpm";
  if (existsSync(path.join(root, "bun.lock")) || existsSync(path.join(root, "bun.lockb"))) {
    return "bun";
  }
  if (existsSync(path.join(root, "package-lock.json")) || existsSync(path.join(root, ".npmrc"))) {
    return "npm";
  }
  return "pnpm";
}
