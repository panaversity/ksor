/**
 * The Governance Policy, `.ksor/governance.yaml` (record spec §4; KSP-001
 * §4.2.5): the audience registry and the authority sets every governance
 * fact on a concept is checked against. Scope resolution is the proposal's,
 * verbatim — the deepest matching path wins, an explicit type breaks the
 * tie, equally specific approval rules intersect, and a less specific rule
 * never widens.
 */
import { z } from "zod";

import { actorKind } from "./actor";
import type { Refusal } from "./refusal";
import { parseYamlFile } from "./yaml-file";

const SLUG = "ksor-policy-invalid";
const PATH = ".ksor/governance.yaml";

const anyActor = z.custom<string>(
  (v) => typeof v === "string" && actorKind(v) !== null,
  "an actor is `human:<id>`, `process:<id>`, `team:<id>` or `<producer>/<version>`",
);
const scope = z
  .object({
    paths: z.array(z.string().min(1)).optional(),
    types: z.array(z.string().min(1)).optional(),
  })
  .optional();

const ownershipRule = z.object({ scope, owner: anyActor, escalation: anyActor.optional() });
const approvalRule = z.object({
  scope,
  actors: z.array(anyActor).min(1, "an approval rule needs non-empty `actors`"),
});

/**
 * Every object in the policy has a CLOSED key set, checked before the shape is
 * parsed so the refusal can name the key and the set it missed.
 *
 * zod strips an unknown key by default, and a stripped key in THIS file widens
 * authority: `scope: { path: ["drafts/"] }` (one letter) left `scope: {}`,
 * which `pathDepth` scores as depth 0, so an intern's drafts rule became the
 * record's fallback and approved a document nobody had authority over
 * (reproduced end to end, 2026-08-25). The instance's key set is closed for
 * exactly this reason, and this file is the root of authority the instance is
 * not. There are therefore no extension keys here: a key the policy does not
 * read is a rule that is not in force, and silence about that is the failure
 * mode.
 */
const POLICY_KEYS: Readonly<Record<string, readonly string[]>> = {
  "(root)": ["version", "audiences", "ownership", "approval_authorities", "takedown_authorities"],
  scope: ["paths", "types"],
  "an audience": ["description"],
  "an `ownership` rule": ["scope", "owner", "escalation"],
  "an `approval_authorities` rule": ["scope", "actors"],
  takedown_authorities: ["actors"],
};

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Edit distance, capped: only a near miss earns a "did you mean". */
function distance(a: string, b: string): number {
  let previous = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[b.length] ?? 0;
}

function closedKeys(value: unknown, where: string, path: string, refusals: Refusal[]): void {
  if (!isMapping(value)) return;
  const allowed = POLICY_KEYS[where] ?? [];
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) continue;
    const near = allowed
      .map((a) => [a, distance(a, key)] as const)
      .filter(([, d]) => d <= 2)
      .sort((x, y) => x[1] - y[1])[0]?.[0];
    refusals.push({
      slug: SLUG,
      path,
      why: `${where === "(root)" ? "the policy" : where} declares an unknown key: \`${key}\` — the policy is the root of authority every approval and takedown is checked against, and a key it does not read is a rule that is not in force`,
      fix: `${near === undefined ? `remove \`${key}:\`` : `did you mean \`${near}:\`?`} (allowed ${where === "(root)" ? "at the root" : `in ${where}`}: ${allowed.join(", ")})`,
    });
  }
}

/** The whole closed-key walk, in the shape `checkInstance` uses for `instance.md`. */
function checkPolicyKeys(value: unknown, path: string): Refusal[] {
  const refusals: Refusal[] = [];
  if (!isMapping(value)) return refusals;
  closedKeys(value, "(root)", path, refusals);
  const audiences = value["audiences"];
  if (isMapping(audiences)) {
    for (const entry of Object.values(audiences)) closedKeys(entry, "an audience", path, refusals);
  }
  for (const [key, where] of [
    ["ownership", "an `ownership` rule"],
    ["approval_authorities", "an `approval_authorities` rule"],
  ] as const) {
    const rules = value[key];
    if (!Array.isArray(rules)) continue;
    for (const rule of rules) {
      closedKeys(rule, where, path, refusals);
      if (isMapping(rule)) closedKeys(rule["scope"], "scope", path, refusals);
    }
  }
  closedKeys(value["takedown_authorities"], "takedown_authorities", path, refusals);
  return refusals;
}

const policySchema = z.object({
  version: z.string().min(1),
  audiences: z
    .record(
      z.string().min(1),
      z.object({ description: z.string().min(1, "every audience needs a `description`") }),
    )
    .optional(),
  ownership: z.array(ownershipRule).optional(),
  approval_authorities: z.array(approvalRule),
  takedown_authorities: z.object({
    actors: z.array(anyActor).min(1, "`takedown_authorities` needs non-empty `actors`"),
  }),
});

export interface Scope {
  readonly paths?: readonly string[];
  readonly types?: readonly string[];
}
export interface OwnershipRule {
  readonly scope?: Scope;
  readonly owner: string;
  readonly escalation?: string;
}
export interface ApprovalRule {
  readonly scope?: Scope;
  readonly actors: readonly string[];
}

export interface Policy {
  /** Registered audience identifiers, sorted; `public` is reserved and never listed. */
  readonly audiences: readonly string[];
  readonly takedownActors: readonly string[];
  readonly ownership: readonly OwnershipRule[];
  readonly approvalRules: readonly ApprovalRule[];
  /** The parsed document. The key set is closed, so this is `POLICY_KEYS` and nothing else. */
  readonly raw: Readonly<Record<string, unknown>>;
}

export type PolicyResult =
  | { readonly ok: true; readonly policy: Policy }
  | { readonly ok: false; readonly refusals: readonly Refusal[] };

/** `text` is null when the file does not exist. */
export function parsePolicy(text: string | null, path: string): PolicyResult {
  if (text === null) {
    return {
      ok: false,
      refusals: [
        {
          slug: "ksor-policy-missing",
          path,
          why: "the record has no Governance Policy — the root of authority every approval and takedown is checked against",
          fix: "write `.ksor/governance.yaml` with `version`, `approval_authorities: [{ actors: [human:<you>] }]` and `takedown_authorities: { actors: [human:<you>] }`",
        },
      ],
    };
  }
  const loaded = parseYamlFile(text, path, SLUG);
  if (!loaded.ok) return loaded;
  const unknown = checkPolicyKeys(loaded.value, path);
  if (unknown.length > 0) return { ok: false, refusals: unknown };
  const parsed = policySchema.safeParse(loaded.value);
  if (!parsed.success) {
    return {
      ok: false,
      refusals: parsed.error.issues.map((issue) => ({
        slug: SLUG,
        path,
        why: `\`${issue.path.map(String).join(".") || "(root)"}\`: ${issue.message}`,
        fix: "the policy's shape is record spec §4: `version`, optional `audiences` and `ownership`, required `approval_authorities` and `takedown_authorities`",
      })),
    };
  }
  const fm = parsed.data;
  if (fm.audiences !== undefined && "public" in fm.audiences) {
    return {
      ok: false,
      refusals: [
        {
          slug: SLUG,
          path,
          why: "`audiences.public` is declared — `public` is the reserved unrestricted audience and a policy may not redefine it",
          fix: "remove the `public` entry; it is implicit in every record",
        },
      ],
    };
  }
  return {
    ok: true,
    policy: {
      audiences: Object.keys(fm.audiences ?? {}).sort(),
      takedownActors: fm.takedown_authorities.actors,
      ownership: fm.ownership ?? [],
      approvalRules: fm.approval_authorities,
      raw: loaded.value,
    },
  };
}

export type ApproversResult =
  | { readonly ok: true; readonly actors: readonly string[] }
  | { readonly ok: false; readonly refusal: Refusal };

/** The effective approval authority set for the concept `id` (bundle-relative) of `type`. */
export function resolveApprovers(policy: Policy, id: string, type: string): ApproversResult {
  const rules = mostSpecific(policy.approvalRules, id, type);
  if (rules.length === 0) {
    return {
      ok: false,
      refusal: {
        slug: SLUG,
        path: PATH,
        why: `no \`approval_authorities\` rule matches \`${id}\` (${type})`,
        fix: "add an unscoped rule as the fallback, or a scoped one covering this path",
      },
    };
  }
  const actors = rules
    .map((r) => new Set(r.actors))
    .reduce((acc, set) => new Set([...acc].filter((a) => set.has(a))));
  if (actors.size === 0) {
    return {
      ok: false,
      refusal: {
        slug: SLUG,
        path: PATH,
        why: `the equally specific approval rules matching \`${id}\` (${type}) share no actor — their intersection is empty`,
        fix: "give the rules a common actor, or make one more specific than the other",
      },
    };
  }
  return { ok: true, actors: [...actors] };
}

export type OwnerResult =
  | { readonly ok: true; readonly owner: string | null }
  | { readonly ok: false; readonly refusal: Refusal };

/** The resolved owner, or null when no ownership rule binds the concept. */
export function resolveOwner(policy: Policy, id: string, type: string): OwnerResult {
  const rules = mostSpecific(policy.ownership, id, type);
  if (rules.length === 0) return { ok: true, owner: null };
  const owners = new Set(rules.map((r) => `${r.owner} ${r.escalation ?? ""}`));
  if (owners.size > 1) {
    return {
      ok: false,
      refusal: {
        slug: SLUG,
        path: PATH,
        why: `two equally specific ownership rules match \`${id}\` (${type}) and name different owners`,
        fix: "make them agree, or make one more specific than the other",
      },
    };
  }
  return { ok: true, owner: rules[0]?.owner ?? null };
}

/** Segment-wise: `finance/` covers `finance/x` and never `financeops/x`. */
function pathDepth(id: string, prefixes: readonly string[] | undefined): number | null {
  if (prefixes === undefined) return 0;
  let best: number | null = null;
  for (const raw of prefixes) {
    const prefix = raw.replace(/^\/+/, "").replace(/\/+$/, "");
    const depth = prefix === "" ? 0 : prefix.split("/").length;
    if (prefix === "" || id === prefix || id.startsWith(`${prefix}/`)) {
      if (best === null || depth > best) best = depth;
    }
  }
  return best;
}

function mostSpecific<R extends { readonly scope?: Scope }>(
  rules: readonly R[],
  id: string,
  type: string,
): R[] {
  let top: readonly [number, number] | null = null;
  let winners: R[] = [];
  for (const rule of rules) {
    const depth = pathDepth(id, rule.scope?.paths);
    if (depth === null) continue;
    const types = rule.scope?.types;
    if (types !== undefined && !types.includes(type)) continue;
    const key = [depth, types === undefined ? 0 : 1] as const;
    const cmp = top === null ? 1 : key[0] - top[0] || key[1] - top[1];
    if (cmp > 0) {
      top = key;
      winners = [rule];
    } else if (cmp === 0) {
      winners.push(rule);
    }
  }
  return winners;
}
