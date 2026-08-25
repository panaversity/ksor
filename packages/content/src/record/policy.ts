/**
 * The Governance Policy, `.ksor/governance.yaml` (record spec §4; KSP-001
 * §4.2.5): the audience registry and the authority sets every governance
 * fact on a concept is checked against. Scope resolution is the proposal's,
 * verbatim — the deepest matching path wins, an explicit type breaks the
 * tie, equally specific approval rules intersect, and a less specific rule
 * never widens.
 */
import { z } from "zod";

import { actorKind } from "./actor.js";
import { nearest } from "./near-miss.js";
import type { Refusal } from "./refusal.js";
import { parseYamlFile } from "./yaml-file.js";

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

function closedKeys(value: unknown, where: string, path: string, refusals: Refusal[]): void {
  if (!isMapping(value)) return;
  const allowed = POLICY_KEYS[where] ?? [];
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) continue;
    const near = nearest(key, allowed, 2) ?? undefined;
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

/**
 * Why this scope path can never name a concept, or null when it can.
 *
 * `paths` holds bundle-relative directory prefixes (KSP-001 §4.2.5), matched
 * segment-wise against concept ids — and `conceptIdOf` strips both the
 * `knowledge/` prefix and the `.md`. So the two forms a hand reaches for first
 * are the two that match NOTHING: `hr/handbook.md`, written as the file is
 * named, and `knowledge/hr/`, written as the takedown ledger's `stable_id` is.
 * Neither errored. The tightly scoped rule simply never applied and resolution
 * fell through to a broader one, which is the failure this whole file exists to
 * prevent — a rule the policy does not read is a rule that is not in force.
 * They are refused rather than repaired, because guessing which document an
 * author meant is the policy choosing an authority for them.
 */
function pathProblem(raw: string): { readonly why: string; readonly fix: string } | null {
  const trimmed = raw.replace(/^\/+/, "").replace(/\/+$/, "");
  const extension = /\.mdx?$/.exec(trimmed)?.[0];
  if (extension !== undefined) {
    return {
      why: `which matches no concept: a path names a directory or a concept id, and neither carries a file extension — \`knowledge/hr/handbook.md\` is the concept \`hr/handbook\` — so this rule is not in force and resolution falls through to a broader one`,
      fix: `write \`${trimmed.slice(0, -extension.length)}\` — a path matches the concept of exactly that id as well as everything beneath it, so one document can be scoped without its extension`,
    };
  }
  if (trimmed === "knowledge" || trimmed.startsWith("knowledge/")) {
    const rest = trimmed.slice("knowledge".length).replace(/^\//, "");
    return {
      why: "which matches no concept: scope paths are bundle-relative and start INSIDE `knowledge/`, unlike the takedown ledger's `stable_id`, which spells it out — so this rule is not in force and resolution falls through to a broader one",
      fix:
        rest === ""
          ? "drop the prefix: `/` is the whole record, and so is omitting `paths` entirely"
          : `drop the prefix: \`${rest}/\``,
    };
  }
  return null;
}

/** Every `paths` entry of one rule family, in the vocabulary `POLICY_KEYS` uses. */
function checkScopePaths(
  rules: readonly { readonly scope?: Scope }[],
  where: string,
  path: string,
  refusals: Refusal[],
): void {
  for (const rule of rules) {
    for (const raw of rule.scope?.paths ?? []) {
      const problem = pathProblem(raw);
      if (problem === null) continue;
      refusals.push({
        slug: SLUG,
        path,
        why: `${where} scopes to \`${raw}\`, ${problem.why}`,
        fix: problem.fix,
      });
    }
  }
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
  const unmatchable: Refusal[] = [];
  checkScopePaths(fm.ownership ?? [], "an `ownership` rule", path, unmatchable);
  checkScopePaths(fm.approval_authorities, "an `approval_authorities` rule", path, unmatchable);
  if (unmatchable.length > 0) return { ok: false, refusals: unmatchable };
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

/**
 * Segment-wise: `finance/` covers `finance/x` and never `financeops/x`. A bare
 * `/` normalises to the empty prefix, which matches every concept at depth 0 —
 * the same tier as omitting `paths`, so any deeper rule still beats it. Forms
 * that could never match are refused at parse time (`pathProblem`), so
 * everything reaching here can.
 */
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
