/**
 * The takedown ledger, `.ksor/takedowns.yaml` (record spec §5): an
 * append-only list of denials, revocations and amendments, in file order.
 * Only `ksor takedown` writes it, and that is enforced by validation rather
 * than assumed — every entry's actor is checked against the policy's
 * takedown authorities here, so a line hand-appended in a pull request is
 * refused exactly as the verb would refuse it, and every entry's TEXT is
 * checked against the versions history and the committed lock recorded, so a
 * line hand-EDITED is refused too. An entry is only ever superseded by a
 * revocation or an amendment appended after it.
 */
import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

import { isIndividualActor } from "./actor";
import { parseInstant } from "./instant";
import type { Refusal } from "./refusal";
import { parseYamlFile } from "./yaml-file";

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
      // The bundle root is a directory of the tree that `dirs` never names —
      // the walker pushes CHILD directories only. `knowledge/#section` is the
      // record-wide legal hold `denies()` already resolves; refusing it here as
      // "the subtree `/` no longer exists" made that hold unrecordable.
      if (dir !== "" && !tree.dirs.has(dir)) {
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

export interface LedgerBaselineEntry {
  readonly id: string;
  /**
   * `entryDigest` of the entry as that baseline recorded it, or null when the
   * baseline could only read ids — a historic version of the file that does not
   * parse today still proves the id existed, which is what shrink needs.
   */
  readonly digest: string | null;
  /** The parsed entry, where the baseline has it, so a refusal can name the fields that moved. */
  readonly entry?: LedgerEntry;
  /** Where this version was seen — a commit sha for history; absent for the lock. */
  readonly where?: string;
}

export interface LedgerBaseline {
  readonly source: string;
  readonly entries: readonly LedgerBaselineEntry[];
}

/**
 * A sha256 over every governing field of one entry. The append-only guarantee
 * is not about the id set: comparing ids alone let a committed denial be
 * RETARGETED in place — same id, same actor, a different `stable_id` — which
 * republished the denied document and denied an innocent one with nothing red
 * on any surface (reproduced end to end, 2026-08-25). `reason` is included
 * because the ledger is written by the verb and never edited by hand: a
 * correction is an appended entry, not a rewritten line.
 */
export function entryDigest(entry: LedgerEntry): string {
  const common = [entry.kind, entry.id, entry.by, entry.at, entry.reason ?? ""];
  const rest =
    entry.kind === "denial"
      ? [entry.stableId, entry.scope, entry.expected]
      : entry.kind === "revocation"
        ? [entry.revokes]
        : [entry.amends];
  return createHash("sha256")
    .update(JSON.stringify([...common, ...rest]))
    .digest("hex");
}

/** The `(id, digest)` pairs a build records so the next one can compare text, not just ids. */
export function ledgerDigests(ledger: Ledger): { id: string; digest: string }[] {
  return ledger.entries.map((e) => ({ id: e.id, digest: entryDigest(e) }));
}

/**
 * The ledger is append-only in two senses, and both are checked here: its id
 * set must contain every id any baseline has seen (`ksor-ledger-shrank`), and
 * an id a baseline recorded must still carry the same text
 * (`ksor-ledger-amended`).
 */
export function checkLedgerAppendOnly(
  ledger: Ledger,
  baselines: readonly LedgerBaseline[],
): Refusal[] {
  const path = ".ksor/takedowns.yaml";
  const have = new Map(ledger.entries.map((e) => [e.id, e]));
  const missing = new Map<string, string[]>();
  const refusals: Refusal[] = [];
  for (const b of baselines) {
    for (const seen of b.entries) {
      const current = have.get(seen.id);
      if (current === undefined) {
        missing.set(seen.id, [...(missing.get(seen.id) ?? []), b.source]);
        continue;
      }
      if (seen.digest === null || seen.digest === entryDigest(current)) continue;
      const moved = seen.entry === undefined ? [] : changedFields(seen.entry, current);
      refusals.push({
        slug: "ksor-ledger-amended",
        path,
        why:
          `entry \`${seen.id}\` is not the entry ${b.source}${seen.where === undefined ? "" : ` (${seen.where})`} recorded` +
          `${moved.length === 0 ? "" : ` — ${moved.join(", ")} moved`}; an entry is never edited, only superseded by a revocation or an amendment appended after it`,
        fix: "restore the entry's text; to change what a denial covers, append a new entry with `ksor takedown` (`--revoke <id>`, or a fresh denial)",
      });
    }
  }
  if (missing.size > 0) {
    const list = [...missing]
      .sort()
      .map(([id, sources]) => `\`${id}\` (seen in ${sources.join(", ")})`)
      .join(", ");
    refusals.push({
      slug: "ksor-ledger-shrank",
      path,
      why: `the ledger is append-only and lost ${list}`,
      fix: "restore the deleted entries; lift a denial with a revocation entry, never by removing a line",
    });
  }
  return refusals;
}

/** The field names whose values differ, in the entry's own vocabulary. */
function changedFields(before: LedgerEntry, after: LedgerEntry): string[] {
  const flat = (e: LedgerEntry): Record<string, string> => ({
    kind: e.kind,
    by: e.by,
    at: e.at,
    reason: e.reason ?? "",
    ...(e.kind === "denial"
      ? { stable_id: e.stableId, scope: e.scope, expected: e.expected }
      : e.kind === "revocation"
        ? { revokes: e.revokes }
        : { amends: e.amends }),
  });
  const a = flat(before);
  const b = flat(after);
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...names].filter((k) => a[k] !== b[k]).sort();
}

/**
 * Does any in-force denial cover the concept `id` (bundle-relative)? A `node`
 * entry names exactly `knowledge/<id>`; a `subtree` entry names
 * `knowledge/<dir>#section` and covers every id beneath `dir/` (the root,
 * `knowledge/#section`, covers everything). Resolved at use, never expanded
 * at write time, for the reason decision 14 records: a subtree denial must
 * also cover a descendant a later change adds.
 *
 * `id === dir` is covered too. In a conformant record it cannot arise — a
 * `policies.md` beside a `policies/` is a refused route collision — but a
 * denial that covers one document too many is recoverable and one that covers
 * one too few is a leak, so the unreachable case denies.
 */
export function denies(inForceDenials: readonly Denial[], id: string): boolean {
  return inForceDenials.some((d) => {
    if (d.scope === "node") return d.stableId === `knowledge/${id}`;
    const dir = d.stableId.slice("knowledge/".length, -"#section".length);
    return dir === "" || id === dir || id.startsWith(`${dir}/`);
  });
}

// ── writing ───────────────────────────────────────────────────────────────
// Only `ksor takedown` writes the ledger, and it writes by APPENDING text
// rather than re-serializing the file: re-emitting a parsed document would
// rewrite bytes nobody changed, and an append-only file whose earlier lines
// move on every write is not reviewable in a pull request diff.

/** Entry ids are `<at>-<6 random>` (record spec §5) — sortable by the act, unique by the suffix. */
export function mintLedgerId(at: string, random: () => string = randomSuffix): string {
  return `${at}-${random()}`;
}

function randomSuffix(): string {
  return randomBytes(3).toString("hex");
}

/**
 * One entry's YAML. Every scalar is double-quoted: an id and an instant both
 * contain `:` and would otherwise depend on the reader's resolution rules, and
 * a reason is free text an operator typed. JSON string escapes are exactly
 * YAML's double-quoted escapes, so `JSON.stringify` is the right quoter.
 */
export function renderEntry(entry: LedgerEntry): string {
  const q = (value: string): string => JSON.stringify(value);
  const lines: string[] = [`- id: ${q(entry.id)}`];
  if (entry.kind === "denial") {
    lines.push(
      `  stable_id: ${q(entry.stableId)}`,
      `  scope: ${entry.scope}`,
      `  expected: ${entry.expected}`,
    );
  } else if (entry.kind === "revocation") {
    lines.push(`  revokes: ${q(entry.revokes)}`);
  } else {
    lines.push(`  amends: ${q(entry.amends)}`, "  expected: removed");
  }
  lines.push(`  by: ${q(entry.by)}`, `  at: ${q(entry.at)}`);
  if (entry.reason !== null) lines.push(`  reason: ${q(entry.reason)}`);
  return lines.join("\n") + "\n";
}

/**
 * The file as it should be after appending. `text` is null when the ledger
 * does not exist yet; a file that does not end in a newline gets one, so an
 * append never joins itself onto someone else's last line.
 */
export function appendEntry(text: string | null, entry: LedgerEntry): string {
  const rendered = renderEntry(entry);
  if (text === null || text.trim() === "") return LEDGER_HEADER + rendered;
  return (text.endsWith("\n") ? text : `${text}\n`) + rendered;
}

const LEDGER_HEADER =
  "# The takedown ledger (record spec §5): append-only, written only by\n" +
  "# `ksor takedown`, and validated by `pnpm check`, `ksor build` and ingest.\n" +
  "# Lift a denial with a revocation entry; never delete a line.\n";
