/**
 * `ksor takedown`, decided (record spec §5). The verb is ledger-first: it
 * appends an entry to `.ksor/takedowns.yaml` and only then — when the record
 * declares a database and the DSN is present — writes the row, so a level-0
 * project with no database gets takedown for the first time and every other
 * project gets a denial the site can read from the repository.
 *
 * Everything here is a PURE decision over the arguments, the policy and the
 * shape of the tree, so each branch of §5's decision table is a unit test
 * rather than a live walk. The IO lives in `commands.ts`; `ledger-apply.ts`
 * writes the row, and is the same code ingest runs.
 */

import { isIndividualActor } from "./record/actor.js";
import { RECORD_ROOT_DENIAL, type Expected, type Scope } from "./record/ledger.js";
import type { Policy } from "./record/policy.js";

/** A refusal from the verb: the slug is the first thing on stderr (product principle 4). */
export interface VerbRefusal {
  readonly slug: string;
  readonly why: string;
  readonly fix: string;
}

export type TakedownMode =
  | { readonly kind: "deny"; readonly stableId: string; readonly scope: Scope }
  | { readonly kind: "revoke"; readonly target: string }
  | { readonly kind: "removed"; readonly target: string }
  | { readonly kind: "apply" }
  | { readonly kind: "list" }
  | { readonly kind: "ledger" };

export interface TakedownArgs {
  readonly stableId: string | undefined;
  readonly scope: string | undefined;
  readonly reason: string | undefined;
  readonly revoke: string | undefined;
  readonly removed: string | undefined;
  readonly apply: boolean;
  readonly list: boolean;
  readonly ledger: boolean;
}

export type Planned =
  | { readonly ok: true; readonly mode: TakedownMode; readonly reason: string | null }
  | { readonly ok: false; readonly refusal: VerbRefusal };

const BUNDLE = "knowledge/";
const ANCHOR = "#section";
/** The bundle root — a directory, and the one directory no denial may name. */
const ROOT = BUNDLE.slice(0, -1);

/** Which act was asked for, and is it fully specified? Arguments only — no filesystem, no database. */
export function planTakedown(args: TakedownArgs): Planned {
  const refuse = (slug: string, why: string, fix: string): Planned => ({
    ok: false,
    refusal: { slug, why, fix },
  });
  const chosen = [
    args.stableId !== undefined && args.stableId !== "",
    args.revoke !== undefined,
    args.removed !== undefined,
    args.apply,
    args.list,
    args.ledger,
  ].filter(Boolean).length;
  if (chosen === 0) {
    return refuse(
      "ksor-takedown-unspecified",
      "no act was named",
      "name the document's stable_id (what search and read report as provenance.stable_id), or pass --revoke <entry id>, --removed <entry id>, --apply, --list or --ledger",
    );
  }
  if (chosen > 1) {
    return refuse(
      "ksor-takedown-ambiguous",
      "more than one act was named in one invocation",
      "run one act at a time: a denial, --revoke, --removed, --apply, --list or --ledger",
    );
  }

  const reason = args.reason === undefined || args.reason.trim() === "" ? null : args.reason.trim();
  if (args.list) return { ok: true, mode: { kind: "list" }, reason: null };
  if (args.ledger) return { ok: true, mode: { kind: "ledger" }, reason: null };
  if (args.apply) return { ok: true, mode: { kind: "apply" }, reason: null };
  if (args.revoke !== undefined) {
    return { ok: true, mode: { kind: "revoke", target: args.revoke }, reason };
  }
  if (args.removed !== undefined) {
    return { ok: true, mode: { kind: "removed", target: args.removed }, reason };
  }

  if (args.scope !== undefined && args.scope !== "node" && args.scope !== "subtree") {
    return refuse(
      "ksor-takedown-scope",
      `\`--scope ${args.scope}\` is not a scope`,
      "--scope node denies exactly the document named; --scope subtree denies a directory and every descendant",
    );
  }
  const scope: Scope = args.scope === "subtree" ? "subtree" : "node";
  if (reason === null) {
    // The denylist row's `reason` is NOT NULL, and the entry is the only place
    // the withdrawal is ever explained: a hole in the record with no reason
    // beside it cannot be reviewed later by anyone, including its author.
    return refuse(
      "ksor-takedown-unreasoned",
      "a denial records why the document was withdrawn, and this entry is the only place it is written down",
      '--reason "the figure was superseded"',
    );
  }
  const typed = args.stableId!;
  // The id the operator typed, reduced to its two parts ONCE: the path, and
  // whether a `#section` anchor was on it. Everything below reads `path`.
  //
  // A trailing slash is never part of a concept id, and a shell puts one on
  // every completed directory — so it arrives constantly and used to be
  // recorded verbatim. `knowledge/policies/x/` matched no concept, so both
  // surfaces denied nothing while the verb reported a denial, and `expected:
  // removed` AGREED with "no such concept", leaving the checker green: a
  // governance act reported as done with nothing red, ever.
  // `knowledge/policies/#section` became the directory `policies//`, which
  // every later `ksor build` refuses in an append-only ledger. Both walked live
  // (2026-08-25).
  // Slashes are trimmed on BOTH sides of the anchor, and the outer trim comes
  // first: a completion can leave one after the anchor too, and testing for the
  // anchor before trimming misses it and leaves it buried inside the path.
  const cleaned = typed.replace(/\/+$/, "");
  const anchored = cleaned.endsWith(ANCHOR);
  const path = (anchored ? cleaned.slice(0, -ANCHOR.length) : cleaned).replace(/\/+$/, "");
  // The record ROOT, in every shape a shell can hand it over, refused at the
  // ACT rather than at the entry it would write — the ledger is append-only, so
  // the anchored spelling used to exit 0 and leave an entry every subsequent
  // `ksor build` refuses (`ksor-takedown-dangling`), with no exit but a
  // revocation recording a lift that never happened; the bare one reached
  // `join(root, null)` and exited 3, the ENVIRONMENT code, for an argument.
  //
  // Both scopes, one refusal, because it is one cause in two costumes: at
  // subtree scope the two surfaces INVERT (`RECORD_ROOT_DENIAL`), and at node
  // scope the id matches no concept at all, so `denies()` and the denylist row
  // deny NOTHING while the verb prints `knowledge/ denied`.
  if (path === ROOT) {
    return refuse(
      "ksor-takedown-record-root",
      `\`${typed}\` names the whole record, and ${RECORD_ROOT_DENIAL.why}`,
      RECORD_ROOT_DENIAL.fix,
    );
  }
  if (!path.startsWith(BUNDLE)) {
    return refuse(
      "ksor-takedown-stable-id",
      `\`${typed}\` is not a stable_id — every concept's id begins \`${BUNDLE}\``,
      `name it as the record does: \`${BUNDLE}${path.replace(/^\/+/, "")}\` (search and read report it as provenance.stable_id)`,
    );
  }
  if (scope === "node" && anchored) {
    return refuse(
      "ksor-takedown-stable-id",
      `\`${typed}\` names a directory's section anchor, and the default scope denies one node`,
      "pass --scope subtree to deny the directory and every descendant, or name a concept",
    );
  }
  // A subtree denial names the directory's `#section` anchor, because that is
  // the node the walk starts from. Appending it is not a guess: with
  // `--scope subtree` the operator has already said the id names a directory.
  const stableId = scope === "subtree" ? `${path}${ANCHOR}` : path;
  return { ok: true, mode: { kind: "deny", stableId, scope }, reason };
}

/** Does the mode WRITE the ledger? Read-only modes need no actor (decision 21's last clause). */
export function writesLedger(mode: TakedownMode): boolean {
  return mode.kind === "deny" || mode.kind === "revoke" || mode.kind === "removed";
}

/**
 * Is an actor NAMED, and named in a shape that can perform an act? Checked
 * from the ARGUMENTS alone, before any file is opened and any DSN resolved: a
 * missing `--actor` is an argument error (exit 1), and it must not be reported
 * as a missing policy or a broken environment (exit 3) just because the record
 * also has something else wrong with it.
 */
export function checkActorNamed(actor: string | undefined): VerbRefusal | null {
  const named = (actor ?? "").trim();
  if (named === "") {
    return {
      slug: "ksor-takedown-unattributed",
      why: "a takedown is a governance act and its ledger entry must name who performed it. A name guessed from $USER attributes nothing — it reads like a person and is whatever the shell happened to be (`runner` in CI, `root` in a container)",
      fix: "pass --actor, e.g. --actor human:ciso",
    };
  }
  if (!isIndividualActor(named)) {
    return {
      slug: "ksor-actor-form",
      why: `\`${named}\` is not an actor — the ledger names a person or a process, never a team, because a team cannot perform an act`,
      fix: "use `human:<handle>` or `process:<id>`, e.g. --actor human:ciso",
    };
  }
  return null;
}

/**
 * …and does the POLICY name them? The authority half needs the policy, so it
 * runs once the record is read — still before any DSN, because an unauthorised
 * actor is a refusal and not an environment failure.
 */
export function authorizeActor(actor: string | undefined, policy: Policy): VerbRefusal | null {
  const unnamed = checkActorNamed(actor);
  if (unnamed !== null) return unnamed;
  const named = (actor ?? "").trim();
  if (!policy.takedownActors.includes(named)) {
    return {
      slug: "ksor-takedown-unauthorised",
      why: `\`${named}\` is not named by \`takedown_authorities\` in .ksor/governance.yaml (${policy.takedownActors.join(", ")})`,
      fix: "run the act as an authorised actor, or add this one to the policy in a reviewed change — the same refusal the checker applies to a hand-appended entry",
    };
  }
  return null;
}

export type RowStep = "entry-only" | "entry-and-row";
export type RowDecision =
  | { readonly ok: true; readonly step: RowStep; readonly why: string }
  | { readonly ok: false; readonly refusal: VerbRefusal };

/**
 * Record spec §5's decision table, by what the INSTANCE declares — never by
 * what happens to be reachable. A record that declares no database has no row
 * to write and the entry is the whole act; a record that declares one and
 * cannot reach it is refused, because writing only the entry would leave the
 * door serving a document the repository says is withdrawn until someone
 * remembers `--apply`.
 */
export function decideRowStep(opts: {
  readonly declaresDatabase: boolean;
  readonly dsnPresent: boolean;
  readonly dsnEnv: string;
  readonly fileOnly: boolean;
}): RowDecision {
  if (!opts.declaresDatabase) {
    return {
      ok: true,
      step: "entry-only",
      why: "instance.md declares no database:, so the ledger entry is the whole act — the site reads it at its next build",
    };
  }
  if (opts.fileOnly) {
    return {
      ok: true,
      step: "entry-only",
      why: "--file-only: the entry is written and the row is not — apply it with `ksor takedown --apply` where the database is reachable",
    };
  }
  if (!opts.dsnPresent) {
    return {
      ok: false,
      refusal: {
        slug: "ksor-takedown-dsn-missing",
        why: `instance.md declares a database (named by database.dsn_env) and ${opts.dsnEnv} is unset — the door would keep serving this document until someone remembered to apply the entry`,
        fix: `export ${opts.dsnEnv}='postgresql://...' and rerun, or pass --file-only to record the entry now and \`ksor takedown --apply\` where the database is reachable`,
      },
    };
  }
  return {
    ok: true,
    step: "entry-and-row",
    why: "the entry and the row, in that order: file → database, always",
  };
}

/** `expected` is what the verb SAW: `present` when the file (or directory) is there, `removed` when it is not. */
export function expectedFor(exists: boolean): Expected {
  return exists ? "present" : "removed";
}

/** The bundle-relative path a node denial's stable_id names, or null for a section anchor. */
export function conceptPathOf(stableId: string): string | null {
  if (stableId.endsWith(ANCHOR) || !stableId.startsWith(BUNDLE)) return null;
  return `${stableId}.md`;
}

/** The record-relative directory a subtree denial's stable_id names, or null. */
export function subtreeDirOf(stableId: string): string | null {
  if (!stableId.endsWith(ANCHOR) || !stableId.startsWith(BUNDLE)) return null;
  return stableId.slice(0, -ANCHOR.length);
}
