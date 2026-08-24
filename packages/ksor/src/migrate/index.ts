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
import { readDbDenials, ledgerIdFor, type DbDenial } from "./denials.js";
import { renderDiff, type FileChange } from "./diff.js";
import {
  migrateConcept,
  migrateInstance,
  migrateSummary,
  modelOf,
  NO_AUDIENCE_MODEL,
  type AudienceModel,
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
  --write-site        offer the site's byte-copied rule modules too
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
      else if (arg === "--actor") actor = value;
      else if (arg === "--approve-by") approveBy = value;
      else if (arg === "--generated-at") {
        if (parseInstant(value) === null) {
          return `--generated-at must be an ISO 8601 instant with an offset (e.g. 2026-08-25T12:00:00Z), got "${value}"`;
        }
        generatedAt = value;
      } else {
        const at = value.indexOf("=");
        if (at <= 0 || at === value.length - 1) {
          return `--attribute is <stable_id>=<actor>, got "${value}"`;
        }
        attributions.set(value.slice(0, at), value.slice(at + 1));
      }
    } else if (arg === "--write") write = true;
    else if (arg === "--write-site") writeSite = true;
    else return `unknown argument "${arg}"`;
  }
  return { instance, write, actor, approveBy, generatedAt, writeSite, attributions };
}

const COMPANION = /\.(summary\.md|flashcards\.yaml|quiz\.yaml|slides\.yaml)$/;
const RESERVED = new Set(["index.md", "index.mdx", "README.md"]);

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
  if (!hadPolicy && parsed.actor === null) {
    return badArgs(
      io,
      "this record has no `.ksor/governance.yaml`, so migrate has to write one — and a policy names\n" +
        "who may approve and who may take down. Pass --actor human:<id>: the person running this\n" +
        "migration. A governance act never names an actor the tool guessed (decision 21).",
    );
  }

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
    actor: parsed.actor,
    approveBy: parsed.approveBy,
    instant: parsed.generatedAt ?? instantNow,
    model,
  };
  const conceptIds = new Set<string>();
  for (const [rel, text] of [...record.files].sort()) {
    if (!rel.startsWith("knowledge/") || !/\.(md|mdx)$/.test(rel)) continue;
    const name = rel.slice(rel.lastIndexOf("/") + 1);
    if (name === "log.md") continue;
    if (COMPANION.test(name)) {
      if (!name.endsWith(".summary.md")) continue;
      const out = migrateSummary(rel, text);
      if (out.ok && out.outcome.changed) {
        changes.push({ path: rel, before: text, after: out.outcome.text });
      }
      continue;
    }
    let target = rel;
    if (RESERVED.has(name)) {
      if (isGeneratedIndex(text, rel)) continue;
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
    }
    const out = migrateConcept(target, text, generatedAtOf(root, rel, parsed.generatedAt), ctx);
    if (!out.ok) {
      refusals.push(...out.refusals);
      continue;
    }
    for (const a of out.outcome.audiences) registry.add(a);
    conceptIds.add(target.slice("knowledge/".length).replace(/\.mdx?$/, ""));
    if (target !== rel) {
      // A reserved name is emptied and its prose lands in a concept beside it;
      // `ksor build` regenerates index.md from the tree at the next build.
      changes.push({ path: rel, before: text, after: null });
      changes.push({ path: target, before: null, after: out.outcome.text });
    } else if (out.outcome.changed) {
      changes.push({ path: rel, before: text, after: out.outcome.text });
    }
  }

  // ── the takedown ledger ────────────────────────────────────────────────
  const denials = await collectDenials(root, oldFm, parsed.attributions, refusals, io);
  const takedownActors = new Set<string>(denials.map((d) => d.by));
  if (denials.length > 0) {
    const before = record.files.get(".ksor/takedowns.yaml") ?? null;
    const after = renderLedger(denials, conceptIds);
    if (before !== after) changes.push({ path: ".ksor/takedowns.yaml", before, after });
  }

  // ── the governance policy ──────────────────────────────────────────────
  const policyBefore = record.files.get(policyPath) ?? null;
  const policyAfter = renderPolicy({
    before: policyBefore,
    actor: parsed.actor,
    approveBy: parsed.approveBy,
    registry: [...registry].sort(),
    takedownActors: [...takedownActors].sort(),
    refusals,
  });
  if (policyAfter !== null && policyAfter !== policyBefore) {
    changes.push({ path: policyPath, before: policyBefore, after: policyAfter });
  }

  // ── the site's byte-copied rule modules ────────────────────────────────
  if (parsed.writeSite) changes.push(...siteRuleChanges(root, options.templatesDir));

  if (refusals.length > 0) return refusal(io, refusals);
  if (changes.length === 0) {
    io.out("ksor migrate: nothing to migrate — this record is already in the KSoR Profile.\n");
    return 0;
  }
  if (!parsed.write) {
    io.out(renderDiff(changes));
    io.out(
      `\nksor migrate: ${changes.length} file(s) would change. Re-run with --write to apply.\n`,
    );
    return 0;
  }
  for (const change of changes) {
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

interface LedgerDenial {
  readonly id: string;
  readonly stableId: string;
  readonly scope: "node" | "subtree";
  readonly by: string;
  readonly at: string;
  readonly reason: string;
}

/** Reads the database's denylist, or refuses; an empty list when the record declares none. */
async function collectDenials(
  root: string,
  fm: Readonly<Record<string, unknown>>,
  attributions: ReadonlyMap<string, string>,
  refusals: Refusal[],
  io: MigrateIo,
): Promise<readonly LedgerDenial[]> {
  const database = fm["database"];
  if (typeof database !== "object" || database === null || Array.isArray(database)) return [];
  const dsnEnv = (database as Record<string, unknown>)["dsn_env"];
  if (typeof dsnEnv !== "string" || dsnEnv === "") return [];
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
    rows = await readDbDenials(path.join(root, "instance.md"), dsn);
  } catch (error) {
    refusals.push({
      slug: "ksor-migrate-underivable",
      path: "instance.md",
      why: `the takedown denials could not be read from ${dsnEnv}: ${error instanceof Error ? error.message : String(error)}`,
      fix: `make the database reachable and run it again — the ledger is the record's copy of those rows and cannot be derived without them`,
    });
    return [];
  }
  io.err(`read ${rows.length} denylist row(s) from ${dsnEnv}\n`);
  const out: LedgerDenial[] = [];
  for (const row of rows) {
    const attributed = attributions.get(row.stableId);
    const by = attributed ?? row.actor;
    if (by === null || by === undefined) {
      refusals.push({
        slug: "ksor-migrate-underivable",
        path: ".ksor/takedowns.yaml",
        why: `the denial of \`${row.stableId}\` has no \`takedown_applied\` row naming who imposed it, and a ledger entry may never name an actor the tool guessed`,
        fix: `pass --attribute ${row.stableId}=human:<id> naming the person who denied it`,
      });
      continue;
    }
    // A denied `<dir>/index` or `<dir>/README` names a document that is about
    // to stop existing; re-point it at what replaces it (§1.8).
    const repointed = repoint(row.stableId, row.scope);
    out.push({
      id: ledgerIdFor(repointed, row.at),
      stableId: repointed,
      scope: row.scope,
      by,
      at: row.at,
      reason:
        (row.reason === "" ? "migrated from the denylist" : row.reason) +
        (attributed === undefined ? "" : ` (actor asserted by --attribute during ksor migrate)`),
    });
  }
  return out;
}

function repoint(stableId: string, scope: "node" | "subtree"): string {
  const m = /^(.*)\/(index|README)$/.exec(stableId);
  if (m === null) return stableId;
  return scope === "subtree" ? `${m[1]}#section` : `${m[1]}/overview`;
}

function renderLedger(denials: readonly LedgerDenial[], conceptIds: ReadonlySet<string>): string {
  const lines = [
    "# The takedown ledger — append-only, written by `ksor takedown` (record spec §5).",
    "# These entries were transcribed from the database's denylist by `ksor migrate`.",
  ];
  for (const d of denials) {
    const present =
      d.scope === "subtree" || conceptIds.has(d.stableId.slice("knowledge/".length))
        ? "present"
        : "removed";
    lines.push(
      `- id: ${JSON.stringify(d.id)}`,
      `  stable_id: ${JSON.stringify(d.stableId)}`,
      `  scope: ${d.scope}`,
      `  expected: ${present}`,
      `  by: ${JSON.stringify(d.by)}`,
      `  at: ${JSON.stringify(d.at)}`,
      `  reason: ${JSON.stringify(d.reason)}`,
    );
  }
  return `${lines.join("\n")}\n`;
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
  const lines = [
    "# The Governance Policy: who has authority over this record (record spec §4).",
    "# Written by `ksor migrate` from the actors it was given; review it before merging.",
    'version: "0.1"',
  ];
  if (input.registry.length > 0) {
    lines.push("audiences:");
    for (const a of input.registry) {
      lines.push(`  ${a}:`, `    description: Migrated from the record's \`audiences:\` model.`);
    }
  }
  lines.push("approval_authorities:", `  - actors: [${approvers.join(", ")}]`);
  const takedown = [
    ...new Set([...input.takedownActors, ...(input.actor === null ? [] : [input.actor])]),
  ];
  lines.push("takedown_authorities:", `  actors: [${takedown.join(", ")}]`);
  return `${lines.join("\n")}\n`;
}

/**
 * The site's rule modules are BYTE-COPIED from the kernel (decision 18), so an
 * upgrade has to offer the new bytes: the adopter owns `system/site`
 * (decision 4) and nothing else can update it. The set is every `*-rule.ts` in
 * the CLI's own template — computed, not listed, so a rule module added later
 * is offered without anyone remembering to add it here.
 */
function siteRuleChanges(root: string, templatesDir: string): FileChange[] {
  const from = path.join(templatesDir, "system", "site", "lib");
  if (!existsSync(from)) return [];
  const out: FileChange[] = [];
  for (const name of readdirSync(from).sort()) {
    if (!name.endsWith("-rule.ts")) continue;
    const rel = `system/site/lib/${name}`;
    const abs = path.join(root, rel);
    const before = existsSync(abs) ? readFileSync(abs, "utf8") : null;
    const after = readFileSync(path.join(from, name), "utf8");
    if (before !== after) out.push({ path: rel, before, after });
  }
  return out;
}
