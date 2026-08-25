/**
 * The takedown ledger, `.ksor/takedowns.yaml` (record spec §5): an
 * append-only list of denials, revocations and amendments, in file order.
 * Only `ksor takedown` writes it, and that is enforced by validation rather
 * than assumed — an entry the record has not yet accepted has its actor
 * checked against the policy's takedown authorities here, so a line
 * hand-appended in a pull request is refused exactly as the verb would refuse
 * it, and every entry's TEXT is
 * checked against the versions history and the committed lock recorded, so a
 * line hand-EDITED is refused too. An entry is only ever superseded by a
 * revocation or an amendment appended after it.
 */
import { createHash, randomBytes } from "node:crypto";

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

/**
 * `text` is null when the file does not exist: an empty ledger, and the honest
 * way to write "this record has never withdrawn anything".
 *
 * A file that EXISTS and holds nothing is a different claim, and it is one no
 * writer makes: the verb writes the header and the first entry in the same
 * call, so there is no moment at which a real ledger is empty. What produces
 * one is a write that was interrupted, and reading it as "no denials" is how
 * that becomes permanent — the reader believes the record has withdrawn
 * nothing, republishes everything it withdrew, and the next write makes the
 * belief true on disk. Both halves measured (2026-08-25): a `writeFileSync` of
 * a 7 KB ledger left the file at zero bytes for 3.3% of reads under sustained
 * contention, and a sampler watching REAL `ksor takedown` runs was handed the
 * empty file once in 5,177 reads — and the verb, handed exactly that state,
 * wrote a ONE-entry ledger over forty and exited 0. So an empty read is a
 * refusal: the one moment at which the entries are still recoverable.
 */
export function parseLedger(text: string | null, path: string): LedgerResult {
  if (text === null) return { ok: true, ledger: { entries: [], ids: [] } };
  const refuse = (why: string): LedgerResult => ({
    ok: false,
    refusals: [{ slug: SLUG, path, why, fix: FIX }],
  });
  if (text.trim() === "") {
    return {
      ok: false,
      refusals: [
        {
          slug: "ksor-ledger-empty",
          path,
          why:
            "the file exists and holds nothing. `ksor takedown` writes the header and an entry " +
            "together, so an empty ledger is not a record that has withdrawn nothing — it is one " +
            "whose withdrawals were lost, and reading it as `no denials` republishes every " +
            "document they took down",
          fix:
            "restore the file from version control — it is committed, and every entry it ever " +
            "held is in its history; if this record has genuinely never withdrawn anything, " +
            "delete the file, because ABSENCE is how that is written",
        },
      ],
    };
  }

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

/**
 * The key that says which ACT an entry is, and the closed key set that act
 * reads — the policy's discipline (`POLICY_KEYS`) applied to the ledger, and
 * for the same reason.
 *
 * Dispatching on the first key that was PRESENT and letting zod strip the rest
 * read an entry carrying both `stable_id` and `revokes` as a denial and dropped
 * the revocation: the entry it named stayed in force, and no surface said so.
 * An entry is one act, so two act keys is a refusal rather than a precedence
 * rule — the ledger cannot guess which of the two the operator meant, and
 * guessing is what let the other one vanish. An unknown key is the same
 * silence one step out: a `scope:` on a revocation is a constraint its author
 * believes is in force and no reader ever applies.
 */
const ENTRY_KINDS = [
  {
    act: "stable_id",
    kind: "denial",
    keys: ["id", "by", "at", "reason", "stable_id", "scope", "expected"],
  },
  { act: "revokes", kind: "revocation", keys: ["id", "by", "at", "reason", "revokes"] },
  { act: "amends", kind: "amendment", keys: ["id", "by", "at", "reason", "amends", "expected"] },
] as const;

function parseEntry(item: unknown): LedgerEntry | string {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return "not a mapping";
  const keys = item as Record<string, unknown>;
  const declared = ENTRY_KINDS.filter((entry) => entry.act in keys);
  if (declared.length > 1) {
    const acts = declared.map((entry) => entry.act).join("` and `");
    const kinds = declared.map((entry) => entry.kind).join(" and a ");
    return `declares \`${acts}\`, so it is both a ${kinds} — an entry is exactly one act, and reading it as one of the two drops the other silently`;
  }
  const only = declared[0];
  if (only !== undefined) {
    const unknown = Object.keys(keys).filter((key) => !only.keys.some((k) => k === key));
    if (unknown.length > 0) {
      return `declares an unknown key: \`${unknown.join("`, `")}\` — a ${only.kind} reads \`${only.keys.join("`, `")}\`, and a key it does not read is a constraint that is not in force`;
    }
  }
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
 * Every entry — denial, revocation, amendment — must be by a takedown
 * authority, checked where the ACT happens: an entry this record has not yet
 * accepted. History is not re-litigated, and that is the whole of the rule.
 *
 * Judging every entry against the PRESENT roster made a personnel change break
 * the record: remove a departed authority from `.ksor/governance.yaml` and
 * every entry they had ever written refused, while the obvious remedy —
 * deleting those entries — is `ksor-ledger-shrank`. The only escape left was to
 * go on naming a departed person as a takedown authority, which is a lie the
 * policy would then carry forever. An entry was authorised when it was written;
 * the ledger is append-only precisely so the past is not rewritten.
 *
 * `accepted` is what makes this safe, and only a baseline that says so grants
 * it. Git history proves a line was COMMITTED, and anyone with write access can
 * commit — a pull request that hand-appends an entry puts it in history before
 * any check runs — so exempting on history would have retired the guarantee
 * this rule exists for (record spec §5: a line hand-appended in a pull request
 * is refused exactly as the verb would refuse it). The committed lock is
 * different: it is written by a build that PASSED, and this check is what that
 * build had to get past. Acceptance is of TEXT, not of an id, so an entry
 * retargeted under an accepted id is judged again.
 */
export function checkLedgerActors(
  ledger: Ledger,
  takedownActors: readonly string[],
  // REQUIRED, with no default. It had one (`= []`), and `checkRecord` then
  // called this with two arguments for as long as the rule existed: the
  // accepted set was always empty, every entry was judged against the PRESENT
  // roster, and the whole departed-authority guarantee was dead code whose
  // refusal went on describing it as fact. A caller that means "nothing is
  // accepted" now says so, in the same shape as a caller that means it.
  baselines: readonly LedgerBaseline[],
): Refusal[] {
  const accepted = acceptedEntries(baselines);
  return ledger.entries
    .filter((e) => !takedownActors.includes(e.by) && !accepted.has(`${e.id}\t${entryDigest(e)}`))
    .map((e) => ({
      slug: "ksor-takedown-unauthorised",
      path: ".ksor/takedowns.yaml",
      why: `entry \`${e.id}\` is by \`${e.by}\`, whom \`takedown_authorities\` does not name, and no build this record committed has accepted it — so it is judged as an entry being written now`,
      fix: "only an actor the policy names may write the ledger — revert the appended entry, or name the actor in the policy in a reviewed change (an entry an earlier build accepted is history and is never judged again, so a departed authority's committed entries do not hold the policy hostage)",
    }));
}

/** `<id>\t<digest>` for every entry a baseline records as accepted; a digest-less one proves no text. */
function acceptedEntries(baselines: readonly LedgerBaseline[]): Set<string> {
  const out = new Set<string>();
  for (const b of baselines) {
    if (b.accepted !== true) continue;
    for (const e of b.entries) if (e.digest !== null) out.add(`${e.id}\t${e.digest}`);
  }
  return out;
}

export interface TreeShape {
  /**
   * Every bundle-relative id the tree holds a DOCUMENT for — one that parsed
   * into a concept, and one that did not. Not `conceptIds`, which is what this
   * used to be: a denied document with a frontmatter typo is not a concept, so
   * an in-force denial on it reported `ksor-takedown-dangling` — "this denial
   * names a document that does not exist" — about a file still sitting in the
   * checkout, and its remedy (`--removed`) appends a governance record
   * asserting a removal that never happened (2026-08-25 review). Presence is a
   * question about the TREE; whether a document is readable is the parse
   * refusal's to raise, and it is raised, so nothing is published either way.
   */
  readonly documentIds: ReadonlySet<string>;
  /** Bundle-relative directories. */
  readonly dirs: ReadonlySet<string>;
}

/**
 * Is the thing this denial names in the tree? ONE question, and the only one
 * `expected` is an answer to — asked here for BOTH scopes so the two can never
 * mean different things again. A `node` entry names a document; a `subtree`
 * entry names the directory behind its `#section` anchor (decision 14: the
 * container, so a descendant a later change adds is covered too).
 */
export function targetPresent(
  denial: Pick<Denial, "stableId" | "scope">,
  tree: TreeShape,
): boolean {
  return denial.scope === "subtree"
    ? tree.dirs.has(denial.stableId.slice("knowledge/".length, -"#section".length))
    : tree.documentIds.has(denial.stableId.slice("knowledge/".length));
}

/**
 * The `expected` a denial written against THIS tree carries — what the verb
 * records at the moment of the act, and what anything transcribing a denial
 * into a ledger must write instead of assuming (`ksor migrate` assumed
 * `present` for every subtree denial, so its very first build could refuse).
 */
export function expectedIn(denial: Pick<Denial, "stableId" | "scope">, tree: TreeShape): Expected {
  return targetPresent(denial, tree) ? "present" : "removed";
}

/**
 * Dangling and re-added entries, evaluated on the in-force denials only.
 *
 * ONE rule for both scopes (decision 18's shape): `expected` is compared with
 * what the tree actually holds, and the scope decides only how the refusal
 * READS. It used to decide the verdict as well — the subtree branch refused on
 * absence alone and never consulted `expected` — and that made an ordinary act
 * unrecordable. `ksor takedown --actor <who> --scope subtree knowledge/embargo` on a
 * directory that does not exist yet is sanctioned (a denial may precede what it
 * names, decision 14); the verb wrote `expected: removed` and exited 0, and the
 * next `ksor build` exited 1 with `ksor-takedown-dangling` — with no honest
 * exit, because the ledger is append-only, `--revoke` records a lift that never
 * happened, and git cannot commit an empty directory back into the tree. The
 * same act at node scope was green. Meanwhile the SERVING half had read
 * `expected` scope-blind all along (`governance-gate.ts`: `d.expected <>
 * 'removed'`), so the two surfaces disagreed about which records are
 * publishable — decision 19's forbidden state, inverted (2026-08-25).
 */
/**
 * Why the record ROOT can never be the target of a denial, and what to do
 * instead — written ONCE, because two places refuse it and a rule explained
 * twice is a rule that drifts (decision 18's shape, applied to prose).
 *
 * `planTakedown` refuses the ACT, so the entry is never written; this module
 * refuses the ENTRY, for the ones an older verb wrote and for the ones a hand
 * appends in a pull request. Only the second can name a `--revoke` exit, so the
 * entry id is appended there and not carried in the shared text.
 */
export const RECORD_ROOT_DENIAL = {
  why: "the record root is no node: top-level sections are `knowledge/<section>#section` with no parent, so the serving side's `parent_id` walk seeds EMPTY and denies nothing, while the site's prefix test denies EVERYTHING. A hold that darkens the website and goes on serving every document to every agent is worse than no hold, because the dark website reads as confirmation",
  fix: "deny each top-level section instead — `ksor takedown --actor <who> --scope subtree knowledge/<section>`, one per section",
} as const;

export function checkLedgerAgainstTree(ledger: Ledger, tree: TreeShape): Refusal[] {
  const refusals: Refusal[] = [];
  const path = ".ksor/takedowns.yaml";
  for (const d of inForce(ledger)) {
    /** The directory a subtree entry names, or null for a node entry. */
    const dir =
      d.scope === "subtree" ? d.stableId.slice("knowledge/".length, -"#section".length) : null;
    // The record ROOT, `knowledge/#section`. Only ONE surface can carry it
    // out: `denies()` reads the empty prefix as "everything", so the site
    // goes dark, while the serving side walks `parent_id` from the node the
    // denylist row NAMES (decision 14) and there is no node for the root —
    // top-level sections carry `parent_id IS NULL` — so the seed is empty and
    // the door serves every document. The surfaces INVERT: the visible one
    // goes dark, which reads as confirmation, and the invisible one keeps
    // answering. That is decision 19's forbidden state, so the hold is
    // refused rather than half-performed, whatever `expected` says: the form is
    // unhonourable, not merely out of step with the tree. (Refused here and not
    // in `parseEntry` on purpose: the entry must stay READABLE, because the
    // exit this names — `--revoke` — loads the ledger through `parseLedger`,
    // and append-only means the line cannot simply be deleted.)
    if (dir === "") {
      refusals.push({
        slug: "ksor-takedown-dangling",
        path,
        why: `entry \`${d.id}\` denies the subtree \`${d.stableId}\` — ${RECORD_ROOT_DENIAL.why}`,
        fix: `${RECORD_ROOT_DENIAL.fix} — and then lift this one with \`ksor takedown --actor <who> --revoke ${d.id}\``,
      });
      continue;
    }
    // Presence is read the same way in both directions: an unreadable document
    // is still HERE, so `present` does not dangle — and `removed` is still
    // contradicted by something at that path, which is the direction that must
    // never go quiet.
    if (expectedIn(d, tree) === d.expected) continue;
    const what = dir === null ? `\`${d.stableId}\`` : `the subtree \`${dir}/\``;
    const it = dir === null ? "file" : "directory";
    if (d.expected === "present") {
      refusals.push({
        slug: "ksor-takedown-dangling",
        path,
        why:
          dir === null
            ? `entry \`${d.id}\` denies ${what}, which resolves to no concept — a renamed denied document would otherwise republish under its new path`
            : `entry \`${d.id}\` denies ${what}, which no longer exists — a renamed folder would otherwise republish`,
        // `--removed`, never `--revoke`: a revocation records a lift that never
        // happened, and drops the hold if the path ever comes back.
        fix: `restore the ${it}, or record its removal with \`ksor takedown --actor <who> --removed ${d.id}\` (and deny the new path if it was renamed)`,
      });
    } else {
      refusals.push({
        slug: "ksor-takedown-readded",
        path,
        why: `entry \`${d.id}\` recorded ${what} as removed, and the ${dir === null ? "path" : "directory"} is back`,
        fix: `delete the ${it} again, or revoke the entry with \`ksor takedown --actor <who> --revoke ${d.id}\` in a reviewed change`,
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
  /**
   * Does this baseline prove the RECORD ACCEPTED these entries, or only that
   * their text was committed? The committed lock is written by a build that
   * passed every check in this file, so it says yes; git history says no,
   * because committing is not passing (`checkLedgerActors`). Absent means no —
   * a caller that proves nothing gets the strict rule.
   *
   * Append-only (`checkLedgerAppendOnly`) ignores this: for "was this id ever
   * written" and "is it still the same text", a committed version is exactly
   * the right evidence, and the one a single commit cannot rewrite.
   */
  readonly accepted?: boolean;
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
 * `knowledge/<dir>#section` and covers every id beneath `dir/`. Resolved at
 * use, never expanded at write time, for the reason decision 14 records: a
 * subtree denial must also cover a descendant a later change adds.
 *
 * The ROOT, `knowledge/#section`, answers true for everything — but that is a
 * backstop, not a feature: `checkLedgerAgainstTree` refuses the form, because
 * the serving side cannot honour it and a hold only the website performs is
 * worse than none. It stays true here because if the refusal were ever lifted,
 * denying too much is the recoverable half and denying too little is a leak.
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
 * The bytes to ADD to `text` — never the file rewritten around them.
 *
 * The distinction is the whole of it. This used to return the file as it
 * should be after appending, and its one caller wrote that back with
 * `writeFileSync`: a call that opens with `O_TRUNC`, so every earlier entry
 * was deleted and then re-written from whatever the caller happened to have
 * read. Two operators running `ksor takedown` at once destroyed each other's
 * acts and both reported success (measured: five concurrent runs, five claims,
 * three entries), and a reader landing inside the truncation window read an
 * empty ledger and rewrote forty entries down to one.
 *
 * A delta cannot do either. Appended with `O_APPEND` the kernel places the
 * bytes at the end whatever else is happening, so the file only ever grows,
 * a killed writer leaves what was already there, and the worst a LOST lock can
 * do is order two acts differently — not lose one.
 *
 * `text` is null when the ledger does not exist yet, which is the only time
 * the header is written. A file that does not end in a newline gets one first,
 * so an append never joins itself onto somebody else's last line.
 */
export function bytesToAppend(text: string | null, entry: LedgerEntry): string {
  const rendered = renderEntry(entry);
  if (text === null || text.trim() === "") return LEDGER_HEADER + rendered;
  return (text.endsWith("\n") ? "" : "\n") + rendered;
}

// Manager-NEUTRAL on purpose. This file is written at RUNTIME by `ksor
// takedown`, so it never passes through init's prose translation (decision 25)
// — a package-manager command named here landed verbatim in every scaffold,
// including the npm and bun ones that cannot run it, while the emitted
// scaffold's own translated copy of this constant said something else beside
// it. Naming the checker rather than a runner needs no threading and cannot
// drift.
const LEDGER_HEADER =
  "# The takedown ledger (record spec §5): append-only, written only by\n" +
  "# `ksor takedown`, and validated by the record checker, `ksor build` and\n" +
  "# ingest. Lift a denial with a revocation entry; never delete a line.\n";
