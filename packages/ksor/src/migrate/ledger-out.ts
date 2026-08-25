/**
 * Denylist rows → committed ledger entries (record spec §5). Pure, and split
 * out from the database read beside it because the governance decisions are
 * here: who is recorded as having denied, what a denied reserved name becomes,
 * and whether the document is still expected to be present.
 */
import { createHash } from "node:crypto";

import { expectedIn, type Refusal, type TreeShape } from "@panaversity/ksor-content/record";

import { ACTOR_FORM, isWritableActor } from "./actor.js";
import type { DbDenial } from "./denials.js";

export interface LedgerDenial {
  readonly id: string;
  readonly stableId: string;
  readonly scope: "node" | "subtree";
  readonly by: string;
  readonly at: string;
  readonly reason: string;
}

export interface LedgerOutcome {
  readonly entries: readonly LedgerDenial[];
  readonly refusals: readonly Refusal[];
}

/**
 * A ledger id is `<at>-<6>` (record spec §5). The verb's six characters are
 * random; migrate's are a digest of the row it is transcribing, so the same
 * database produces the same ledger twice and the diff an owner reviews is
 * stable between runs.
 */
export function ledgerIdFor(stableId: string, at: string): string {
  const digest = createHash("sha256").update(`${stableId}\n${at}`).digest("hex").slice(0, 6);
  return `${at}-${digest}`;
}

/**
 * What this run did with each reserved name it walked, keyed by the file's
 * stable_id (`knowledge/<dir>/index`). `moved` — its prose became
 * `overview.md`; `kept` — migrate left the file exactly where it is, which is
 * what it does with a GENERATED index (`isGeneratedIndex`). A reserved name
 * absent from the map is absent from the record.
 */
export type ReservedFate = ReadonlyMap<string, "moved" | "kept">;

/**
 * A denied `<dir>/index` or `<dir>/README` MAY name a document that is about to
 * stop existing, because migrate moves its prose into `overview.md` beside it
 * (§1.8) — but only when it actually did. It moves nothing when the index is a
 * generated one, and nothing when the file is not in the record at all, and
 * repointing in either case aimed a live denial at a path that would never
 * exist: `expected: removed` then made the checker agree, so the withdrawn
 * document was republished with exit 0 and nothing printed. So the rewrite
 * follows the PROSE, and the case migrate cannot derive is refused by
 * `toLedgerEntries` rather than guessed (critical rule 1).
 *
 * A subtree denial was never about that file at all — it named the container,
 * which is the `#section` anchor, and that is true whatever became of the file.
 */
export function repoint(stableId: string, scope: "node" | "subtree", fate: ReservedFate): string {
  const m = /^(.*)\/(index|README)$/.exec(stableId);
  if (m === null) return stableId;
  if (scope === "subtree") return `${m[1]}#section`;
  return fate.get(stableId) === "moved" ? `${m[1]}/overview` : stableId;
}

/** Where a PREVIOUS run's repointing would have sent this row's hold, when it moved the prose. */
function movedTo(stableId: string): string | null {
  const m = /^(.*)\/(index|README)$/.exec(stableId);
  return m === null ? null : `${m[1]}/overview`;
}

export function toLedgerEntries(
  rows: readonly DbDenial[],
  attributions: ReadonlyMap<string, string>,
  fate: ReservedFate,
  /**
   * The stable_ids the record's EXISTING `.ksor/takedowns.yaml` already names.
   *
   * Transcription used to be all-or-nothing — a record with a ledger was not
   * read at all — which left every row whose id had been REPOINTED accounted
   * for by nothing: `ksor ingest` refused `ksor-takedown-unledgered`, `ksor
   * serve` refused to boot, and the remedy both of them print (`ksor migrate
   * --write`) answered "nothing to migrate". Per-row is what makes the remedy
   * real, and it keeps the guarantee the all-or-nothing rule was protecting:
   * an entry already in the file is never rewritten, only appended past.
   */
  accounted: ReadonlySet<string> = new Set(),
): LedgerOutcome {
  const entries: LedgerDenial[] = [];
  const refusals: Refusal[] = [];
  for (const row of rows) {
    // Already in the ledger under its own id: the record accounts for this row,
    // and re-deriving anything from it would duplicate an append-only entry.
    if (accounted.has(row.stableId)) continue;
    const asserted = attributions.get(row.stableId);
    const by = asserted ?? row.actor;
    if (by === null || by === undefined) {
      refusals.push({
        slug: "ksor-migrate-underivable",
        path: ".ksor/takedowns.yaml",
        why: `the denial of \`${row.stableId}\` has no \`takedown_applied\` log row naming who imposed it, and a ledger entry may never name an actor the tool guessed`,
        fix: `pass --attribute ${row.stableId}=human:<id> naming the person who denied it`,
      });
      continue;
    }
    // `retrieval_log.actor` is free text the database hands back, and
    // `--attribute` is free text the operator hands over; neither passes the
    // argument guard. Both are written into the ledger AND into the policy's
    // `takedown_authorities`, so an id carrying a YAML indicator changes the
    // structure of a governance file rather than a value in it.
    if (!isWritableActor(by)) {
      refusals.push({
        slug: "ksor-migrate-underivable",
        path: ".ksor/takedowns.yaml",
        why: `the denial of \`${row.stableId}\` is attributed to "${by.slice(0, 80)}"${by.length > 80 ? " …" : ""}, which is not a governance identity migrate can record — ${ACTOR_FORM}`,
        fix: `pass --attribute ${row.stableId}=human:<id> naming the person who denied it, and correct the row it came from`,
      });
      continue;
    }
    const stableId = repoint(row.stableId, row.scope, fate);
    /**
     * The row AS IT STANDS, so nothing in the database is left unaccounted for.
     *
     * Emitted whenever the hold is written under a DIFFERENT id — `<dir>/index`
     * denied, its prose moved to `<dir>/overview`, the entry naming the
     * overview. The row still names the index, and the ledger is what accounts
     * for rows (`applyLedger` matches by stable_id), so without this the record
     * migrate produced could not be ingested or served at all.
     *
     * It is a faithful transcription and not a new act: the same actor, the same
     * instant, the reason the row carries. `renderLedger` derives `expected`
     * from the post-migration tree, which no longer holds that path, so it
     * records `removed` — the state `assertGovernanceServable` excludes from the
     * orphan check precisely because it is correct and permanent. `node`
     * whatever the row's scope was: a subtree entry must name a container's
     * `#section`, this names a former document, and the subtree hold itself is
     * carried by the repointed entry beside it.
     */
    const accountFor = (holdsAt: string): void => {
      if (accounted.has(row.stableId)) return;
      entries.push({
        id: ledgerIdFor(row.stableId, row.at),
        stableId: row.stableId,
        scope: "node",
        by,
        at: row.at,
        reason: `${row.reason === "" ? "migrated from the denylist" : row.reason} (the denylist row \`ksor migrate\` transcribed; the hold now names \`${holdsAt}\`)`,
      });
    };
    // A previous run already moved the prose and recorded the hold under the
    // moved id — the file left behind is the GENERATED index `ksor build`
    // writes, so `repoint` can no longer see that anything moved. All that is
    // missing is the row's own entry, and re-deciding what the denial covers
    // would contradict a ledger that has already decided it.
    const moved = movedTo(row.stableId);
    if (moved !== null && accounted.has(moved)) {
      accountFor(moved);
      continue;
    }
    // The reserved name is still in the record, so the denial cannot follow
    // prose that did not move — and it cannot stay pointed at a generated index
    // either, which under the profile carries no knowledge and is not a concept.
    // Which document it now covers is a governance decision (decision 14).
    if (fate.get(row.stableId) === "kept" && row.scope === "node") {
      refusals.push({
        slug: "ksor-migrate-underivable",
        path: ".ksor/takedowns.yaml",
        why: `\`${row.stableId}\` is denied, and migrate left that file where it is because it is a GENERATED index carrying no prose — so there is no migrated concept for the denial to follow, and repointing it at \`${stableId.replace(/\/(index|README)$/, "/overview")}\` would deny a document this record does not have`,
        fix: `re-deny what it meant after the migration: \`ksor takedown <the concept>\`, or \`ksor takedown --subtree ${row.stableId.replace(/\/(index|README)$/, "")}\` for the whole section`,
      });
      continue;
    }
    // `parseLedger` refuses a `subtree` entry that does not name a container's
    // `#section` anchor, so transcribing one verbatim would write a ledger
    // migrate's own checker cannot load — and a subtree denial narrowed to a
    // node is a takedown that stops covering descendants (decision 14).
    if (row.scope === "subtree" && !stableId.endsWith("#section")) {
      refusals.push({
        slug: "ksor-migrate-underivable",
        path: ".ksor/takedowns.yaml",
        why: `the subtree denial of \`${row.stableId}\` names a document, not a container — a subtree entry names \`knowledge/<dir>#section\`, and only the container form covers the descendants a later change adds`,
        fix: `re-deny it after the migration: \`ksor takedown --subtree <dir>\` for the container it meant, or a plain node denial if it only ever covered \`${row.stableId}\``,
      });
      continue;
    }
    if (stableId !== row.stableId) accountFor(stableId);
    if (accounted.has(stableId)) continue;
    entries.push({
      id: ledgerIdFor(stableId, row.at),
      stableId,
      scope: row.scope,
      by,
      at: row.at,
      reason:
        (row.reason === "" ? "migrated from the denylist" : row.reason) +
        (asserted === undefined ? "" : " (actor asserted by --attribute during ksor migrate)"),
    });
  }
  return { entries, refusals };
}

/**
 * The committed file. `expected` is derived from the POST-MIGRATION tree, with
 * `expectedIn` — the same function the checker judges the finished ledger with,
 * so what migrate writes is what the next `ksor build` accepts.
 *
 * It used to hardcode `present` for every subtree denial, on the reasoning that
 * a container is not a concept. But the checker asks the tree about a container
 * exactly as it asks about a document, so transcribing a denial whose directory
 * is gone wrote a ledger whose FIRST build refused `ksor-takedown-dangling` —
 * in an append-only file the adopter may not delete, and whose only other exit
 * (`--revoke`) records a lift that never happened.
 */
export function renderLedger(entries: readonly LedgerDenial[], tree: TreeShape): string {
  return `${LEDGER_HEADER.join("\n")}\n${renderEntries(entries, tree)}`;
}

const LEDGER_HEADER = [
  "# The takedown ledger — append-only, written by `ksor takedown` (record spec §5).",
  "# These entries were transcribed from the database's denylist by `ksor migrate`.",
];

/**
 * The entries alone, for APPENDING to a ledger that already exists — a record
 * whose rows migrate could not account for on its first run, or which grew a row
 * by hand. Append-only means the bytes already in the file are never re-rendered
 * (their `expected` is what an amendment left it, not what today's tree says), so
 * this renders only what is new.
 */
export function renderEntries(entries: readonly LedgerDenial[], tree: TreeShape): string {
  const lines: string[] = [];
  for (const d of entries) {
    const expected = expectedIn(d, tree);
    lines.push(
      `- id: ${JSON.stringify(d.id)}`,
      `  stable_id: ${JSON.stringify(d.stableId)}`,
      `  scope: ${d.scope}`,
      `  expected: ${expected}`,
      `  by: ${JSON.stringify(d.by)}`,
      `  at: ${JSON.stringify(d.at)}`,
      `  reason: ${JSON.stringify(d.reason)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
