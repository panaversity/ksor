/**
 * The takedown ledger, `.ksor/takedowns.yaml` (record spec §5): an
 * append-only list of denials, revocations and amendments, in file order.
 * Only `ksor takedown` writes it, and that is enforced by validation rather
 * than assumed — every entry's actor is checked against the policy's
 * takedown authorities here, so a line hand-appended in a pull request is
 * refused exactly as the verb would refuse it.
 */
import { z } from "zod";

import { isIndividualActor } from "./actor.js";
import { parseInstant } from "./instant.js";
import type { Refusal } from "./refusal.js";
import { parseYamlFile } from "./yaml-file.js";

const SLUG = "ksor-ledger-invalid";

const actor = z.custom<string>(isIndividualActor, "not an actor (`human:<id>` or `process:<id>`)");
const instant = z.custom<string>(
  (v) => parseInstant(v) !== null,
  "not an ISO 8601 instant with an explicit offset",
);
const base = { id: z.string().min(1), by: actor, at: instant, reason: z.string().optional() };

const denial = z.object({
  ...base,
  stable_id: z.string().min(1),
  scope: z.enum(["node", "subtree"]),
  expected: z.enum(["present", "removed"]),
});
const revocation = z.object({ ...base, revokes: z.string().min(1) });
const amendment = z.object({ ...base, amends: z.string().min(1), expected: z.literal("removed") });

export type Scope = "node" | "subtree";
export type Expected = "present" | "removed";

interface Common {
  readonly id: string;
  readonly by: string;
  readonly at: string;
  readonly reason: string | null;
}
export interface Denial extends Common {
  readonly kind: "denial";
  readonly stableId: string;
  readonly scope: Scope;
  readonly expected: Expected;
}
export interface Revocation extends Common {
  readonly kind: "revocation";
  readonly revokes: string;
}
export interface Amendment extends Common {
  readonly kind: "amendment";
  readonly amends: string;
}
export type LedgerEntry = Denial | Revocation | Amendment;

export interface Ledger {
  readonly entries: readonly LedgerEntry[];
  /** Every id, in file order — the set `ksor-ledger-shrank` compares. */
  readonly ids: readonly string[];
}

export type LedgerResult =
  | { readonly ok: true; readonly ledger: Ledger }
  | { readonly ok: false; readonly refusals: readonly Refusal[] };

const FIX =
  "the ledger is written by `ksor takedown`; do not edit it by hand — revert the edit and run the verb";

/** `text` is null when the file does not exist: an empty ledger. */
export function parseLedger(text: string | null, path: string): LedgerResult {
  if (text === null) return { ok: true, ledger: { entries: [], ids: [] } };
  const refuse = (why: string): LedgerResult => ({
    ok: false,
    refusals: [{ slug: SLUG, path, why, fix: FIX }],
  });

  // The file is a list at its root; the shared reader wants a mapping, so wrap it.
  const loaded = parseYamlFile(`entries:\n${indent(text)}`, path, SLUG);
  if (!loaded.ok) return loaded;
  const raw = loaded.value["entries"];
  if (raw === null || raw === undefined) return { ok: true, ledger: { entries: [], ids: [] } };
  if (!Array.isArray(raw)) return refuse("the ledger is a list of entries; the root is not a list");

  const entries: LedgerEntry[] = [];
  const seen = new Map<string, LedgerEntry>();
  for (const [i, item] of raw.entries()) {
    const parsed = parseEntry(item);
    if (typeof parsed === "string") return refuse(`entry ${i + 1}: ${parsed}`);
    if (seen.has(parsed.id)) return refuse(`entry ${i + 1}: id \`${parsed.id}\` is already used`);
    if (parsed.kind === "revocation" || parsed.kind === "amendment") {
      const ref = parsed.kind === "revocation" ? parsed.revokes : parsed.amends;
      const target = seen.get(ref);
      if (target === undefined) {
        return refuse(
          `entry ${i + 1}: \`${parsed.id}\` names \`${ref}\`, which is no earlier entry`,
        );
      }
      if (target.kind !== "denial") {
        return refuse(
          `entry ${i + 1}: \`${parsed.id}\` names \`${ref}\`, which is a ${target.kind} — only a denial can be revoked or amended`,
        );
      }
    }
    seen.set(parsed.id, parsed);
    entries.push(parsed);
  }
  return { ok: true, ledger: { entries, ids: entries.map((e) => e.id) } };
}

function indent(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (line === "" ? line : `  ${line}`))
    .join("\n");
}

function parseEntry(item: unknown): LedgerEntry | string {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return "not a mapping";
  const keys = item as Record<string, unknown>;
  if ("stable_id" in keys) {
    const r = denial.safeParse(item);
    if (!r.success) return issueText(r.error);
    const anchored = r.data.stable_id.endsWith("#section");
    if (!r.data.stable_id.startsWith("knowledge/")) {
      return `\`stable_id\` is \`knowledge/<id>\` (or \`knowledge/<dir>#section\` for a subtree), got \`${r.data.stable_id}\``;
    }
    if (r.data.scope === "subtree" && !anchored) {
      return `a subtree denial names a directory's \`#section\` anchor, got \`${r.data.stable_id}\``;
    }
    if (r.data.scope === "node" && anchored) {
      return `a node denial names a concept, not a \`#section\` anchor (\`${r.data.stable_id}\`) — use \`scope: subtree\``;
    }
    return {
      kind: "denial",
      id: r.data.id,
      by: r.data.by,
      at: r.data.at,
      reason: r.data.reason ?? null,
      stableId: r.data.stable_id,
      scope: r.data.scope,
      expected: r.data.expected,
    };
  }
  if ("revokes" in keys) {
    const r = revocation.safeParse(item);
    if (!r.success) return issueText(r.error);
    return {
      kind: "revocation",
      id: r.data.id,
      by: r.data.by,
      at: r.data.at,
      reason: r.data.reason ?? null,
      revokes: r.data.revokes,
    };
  }
  if ("amends" in keys) {
    const r = amendment.safeParse(item);
    if (!r.success) return issueText(r.error);
    return {
      kind: "amendment",
      id: r.data.id,
      by: r.data.by,
      at: r.data.at,
      reason: r.data.reason ?? null,
      amends: r.data.amends,
    };
  }
  return "neither a denial (`stable_id`), a revocation (`revokes`) nor an amendment (`amends`)";
}

function issueText(error: z.ZodError): string {
  return error.issues
    .map((i) => `\`${i.path.map(String).join(".") || "(entry)"}\`: ${i.message}`)
    .join("; ");
}

/** The denials currently in force, with `expected` as the latest amendment left it. */
export function inForce(ledger: Ledger): readonly Denial[] {
  const live = new Map<string, Denial>();
  for (const entry of ledger.entries) {
    if (entry.kind === "denial") live.set(entry.id, entry);
    else if (entry.kind === "revocation") live.delete(entry.revokes);
    else {
      const target = live.get(entry.amends);
      if (target !== undefined) live.set(entry.amends, { ...target, expected: "removed" });
    }
  }
  return [...live.values()];
}

/**
 * Is the concept `id` (bundle-relative) denied by the in-force denials? A
 * node denial names exactly one concept; a subtree denial names a directory's
 * `#section` anchor and covers everything beneath that DIRECTORY — segment-
 * wise, never a string prefix, so `policies#section` leaves `policies-archive/`
 * alone (decision 14's reason for walking `parent_id` rather than a prefix).
 * The one seam the site's staging and the bundle writer both use.
 */
export function isDeniedByLedger(denials: readonly Denial[], id: string): boolean {
  return denials.some((d) => {
    const target = d.stableId.slice("knowledge/".length);
    if (d.scope === "node") return target === id;
    const dir = target.slice(0, -"#section".length);
    return dir === "" || id.startsWith(`${dir}/`);
  });
}

/** Every entry — denial, revocation, amendment — must be by a takedown authority. */
export function checkLedgerActors(ledger: Ledger, takedownActors: readonly string[]): Refusal[] {
  return ledger.entries
    .filter((e) => !takedownActors.includes(e.by))
    .map((e) => ({
      slug: "ksor-takedown-unauthorised",
      path: ".ksor/takedowns.yaml",
      why: `entry \`${e.id}\` is by \`${e.by}\`, whom \`takedown_authorities\` does not name`,
      fix: "only an actor the policy names may write the ledger — remove the entry, or add the actor to the policy in a reviewed change",
    }));
}

export interface TreeShape {
  /** Bundle-relative concept ids (path without `knowledge/` and `.md`). */
  readonly conceptIds: ReadonlySet<string>;
  /** Bundle-relative directories. */
  readonly dirs: ReadonlySet<string>;
}

/** Dangling and re-added entries, evaluated on the in-force denials only. */
export function checkLedgerAgainstTree(ledger: Ledger, tree: TreeShape): Refusal[] {
  const refusals: Refusal[] = [];
  for (const d of inForce(ledger)) {
    const path = ".ksor/takedowns.yaml";
    if (d.scope === "subtree") {
      const dir = d.stableId.slice("knowledge/".length, -"#section".length);
      if (!tree.dirs.has(dir)) {
        refusals.push({
          slug: "ksor-takedown-dangling",
          path,
          why: `entry \`${d.id}\` denies the subtree \`${dir}/\`, which no longer exists — a renamed folder would otherwise republish`,
          fix: "restore the directory, or revoke the entry with `ksor takedown --revoke <id>` and deny the new path",
        });
      }
      continue;
    }
    const id = d.stableId.slice("knowledge/".length);
    const present = tree.conceptIds.has(id);
    if (d.expected === "present" && !present) {
      refusals.push({
        slug: "ksor-takedown-dangling",
        path,
        why: `entry \`${d.id}\` denies \`${d.stableId}\`, which resolves to no concept — a renamed denied document would otherwise republish under its new path`,
        fix: "restore the file, or record its removal with `ksor takedown --removed <id>` (and deny the new path if it was renamed)",
      });
    } else if (d.expected === "removed" && present) {
      refusals.push({
        slug: "ksor-takedown-readded",
        path,
        why: `entry \`${d.id}\` recorded \`${d.stableId}\` as removed, and the path is back`,
        fix: "delete the file again, or revoke the entry with `ksor takedown --revoke <id>` in a reviewed change",
      });
    }
  }
  return refusals;
}

export interface LedgerBaseline {
  readonly source: string;
  readonly ids: readonly string[];
}

/** The ledger is append-only: its id set must contain every id any baseline has seen. */
export function checkLedgerShrank(
  ids: readonly string[],
  baselines: readonly LedgerBaseline[],
): Refusal[] {
  const have = new Set(ids);
  const missing = new Map<string, string[]>();
  for (const b of baselines) {
    for (const id of b.ids) {
      if (!have.has(id)) missing.set(id, [...(missing.get(id) ?? []), b.source]);
    }
  }
  if (missing.size === 0) return [];
  const list = [...missing]
    .sort()
    .map(([id, sources]) => `\`${id}\` (seen in ${sources.join(", ")})`)
    .join(", ");
  return [
    {
      slug: "ksor-ledger-shrank",
      path: ".ksor/takedowns.yaml",
      why: `the ledger is append-only and lost ${list}`,
      fix: "restore the deleted entries; lift a denial with a revocation entry, never by removing a line",
    },
  ];
}
