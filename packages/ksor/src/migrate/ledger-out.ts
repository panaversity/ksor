/**
 * Denylist rows → committed ledger entries (record spec §5). Pure, and split
 * out from the database read beside it because the governance decisions are
 * here: who is recorded as having denied, what a denied reserved name becomes,
 * and whether the document is still expected to be present.
 */
import { createHash } from "node:crypto";

import type { Refusal } from "@panaversity/ksor-content/record";

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
 * A denied `<dir>/index` or `<dir>/README` names a document that is about to
 * stop existing, because migrate moves its prose into `overview.md` beside it
 * (§1.8). A node denial follows the prose; a subtree denial was never about
 * that file at all — it named the container, which is the `#section` anchor.
 */
export function repoint(stableId: string, scope: "node" | "subtree"): string {
  const m = /^(.*)\/(index|README)$/.exec(stableId);
  if (m === null) return stableId;
  return scope === "subtree" ? `${m[1]}#section` : `${m[1]}/overview`;
}

export function toLedgerEntries(
  rows: readonly DbDenial[],
  attributions: ReadonlyMap<string, string>,
): LedgerOutcome {
  const entries: LedgerDenial[] = [];
  const refusals: Refusal[] = [];
  for (const row of rows) {
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
    const stableId = repoint(row.stableId, row.scope);
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

/** The committed file. `expected` is `present` when the record still holds the concept. */
export function renderLedger(
  entries: readonly LedgerDenial[],
  conceptIds: ReadonlySet<string>,
): string {
  const lines = [
    "# The takedown ledger — append-only, written by `ksor takedown` (record spec §5).",
    "# These entries were transcribed from the database's denylist by `ksor migrate`.",
  ];
  for (const d of entries) {
    // A subtree denial names a directory anchor, never a concept, so it is
    // always `present`: what it governs is the container and its future
    // descendants (decision 14).
    const expected =
      d.scope === "subtree" || conceptIds.has(d.stableId.slice("knowledge/".length))
        ? "present"
        : "removed";
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
