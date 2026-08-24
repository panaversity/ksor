/**
 * `build.lock.json` (build spec §2): the committed record of one build —
 * what was published, from which commit, with which toolchain — and the
 * `build_id` every projection stamps. Pure: the CLI gathers texts and git
 * facts, this module decides what the lock says. `build_id` covers everything
 * a projection reads and NOTHING that merely describes the run (`as_of`,
 * `source_commit`, `dirty`), so the same tree with the same toolchain yields
 * the same id unless `as_of` crosses a lifecycle boundary — in which case a
 * different admitted set honestly gets a different id (R21).
 */
import { createHash } from "node:crypto";

import { z } from "zod";

import { overlaps } from "../lib/audience-rule.js";
import { admitsLifecycle, type LifecycleStatus } from "../lib/lifecycle-rule.js";
import { denies, type Denial } from "./ledger.js";

/** OKF at the commit the record spec pins (record spec §1). */
export const OKF_PIN: {
  readonly version: "0.2";
  readonly commit: string;
  readonly spec_sha256: string;
} = {
  version: "0.2",
  commit: "ad30107c31c06aec8a7d5636e0d1058118604e6f",
  spec_sha256: "26aa5da029278939f914e578107242d9607d4f2dc5fe153272b82f9ed1030101",
};

export const LOCK_FORMAT = 1;

export type Drafts = "hidden" | "shown";

const hex64 = z.string().regex(/^[0-9a-f]{64}$/, "a sha256 hex digest");
const viewerList = z.array(z.string().min(1));

const lockSchema = z
  .object({
    format: z.literal(LOCK_FORMAT),
    build_id: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    ksor_version: z.string().min(1),
    okf: z.object({ version: z.string(), commit: z.string(), spec_sha256: z.string() }).strict(),
    source_commit: z.string().nullable(),
    dirty: z.boolean(),
    as_of: z.string().min(1),
    drafts: z.enum(["hidden", "shown"]),
    instance_sha256: hex64,
    policy_sha256: hex64,
    ledger_sha256: hex64,
    ledger_entries: z.array(z.object({ id: z.string().min(1), digest: hex64 }).strict()),
    audiences: z
      .object({ registry: z.array(z.string()), viewers: z.record(z.string(), viewerList) })
      .strict(),
    documents: z.array(
      z
        .object({
          path: z.string().min(1),
          sha256: hex64,
          status: z.enum(["draft", "stable", "deprecated"]),
          audience: z.array(z.string()),
          admitted: z.array(z.string()),
        })
        .strict(),
    ),
    companions: z.array(z.object({ path: z.string().min(1), sha256: hex64 }).strict()),
  })
  .strict();

export interface LockDocument {
  /** Bundle-relative, with `.md`. */
  readonly path: string;
  readonly sha256: string;
  readonly status: LifecycleStatus;
  readonly audience: readonly string[];
  /** Canonical viewer names whose machine artefacts contain it at `as_of`, sorted. */
  readonly admitted: readonly string[];
}

export interface Lock {
  readonly format: typeof LOCK_FORMAT;
  readonly build_id: string;
  readonly ksor_version: string;
  readonly okf: typeof OKF_PIN;
  readonly source_commit: string | null;
  readonly dirty: boolean;
  readonly as_of: string;
  readonly drafts: Drafts;
  readonly instance_sha256: string;
  readonly policy_sha256: string;
  readonly ledger_sha256: string;
  /** `(id, digest)` per ledger entry, sorted by id — the baseline the next build compares TEXT against. */
  readonly ledger_entries: readonly { readonly id: string; readonly digest: string }[];
  readonly audiences: {
    readonly registry: readonly string[];
    readonly viewers: Readonly<Record<string, readonly string[]>>;
  };
  readonly documents: readonly LockDocument[];
  readonly companions: readonly { readonly path: string; readonly sha256: string }[];
}

export type LockResult =
  | { readonly ok: true; readonly lock: Lock }
  | { readonly ok: false; readonly why: string };

export function parseLock(text: string): LockResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, why: `not JSON: ${String(error).split("\n")[0] ?? ""}` };
  }
  const parsed = lockSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      why: `\`${issue?.path.map(String).join(".") || "(root)"}\`: ${issue?.message ?? "invalid"}`,
    };
  }
  return { ok: true, lock: parsed.data as Lock };
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256")
    .update(typeof data === "string" ? Buffer.from(data, "utf8") : data)
    .digest("hex");
}

export interface BuildIdInputs {
  readonly documents: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly admitted: readonly string[];
  }[];
  readonly companions: readonly { readonly path: string; readonly sha256: string }[];
  readonly instance_sha256: string;
  readonly policy_sha256: string;
  readonly ledger_sha256: string;
  readonly ksor_version: string;
  readonly drafts: Drafts;
}

/** `sha256:<hex>` over a canonical serialisation of everything a projection reads (build spec §2). */
export function buildIdOf(inputs: BuildIdInputs): string {
  const canonical = {
    documents: [...inputs.documents]
      .map((d) => [d.path, d.sha256, [...d.admitted].sort()])
      .sort((a, b) => compare(String(a[0]), String(b[0]))),
    companions: [...inputs.companions]
      .map((c) => [c.path, c.sha256])
      .sort((a, b) => compare(a[0] ?? "", b[0] ?? "")),
    instance_sha256: inputs.instance_sha256,
    policy_sha256: inputs.policy_sha256,
    ledger_sha256: inputs.ledger_sha256,
    ksor_version: inputs.ksor_version,
    drafts: inputs.drafts,
  };
  return `sha256:${sha256Hex(JSON.stringify(canonical))}`;
}

/** The canonical viewer lists: `public` alone, and `[public, X]` for each registered audience. */
export function canonicalViewers(audiences: readonly string[]): Record<string, string[]> {
  const viewers: Record<string, string[]> = { public: ["public"] };
  for (const a of audiences) viewers[a] = ["public", a];
  return viewers;
}

export interface AdmissionConcept {
  /** Bundle-relative id (path without `.md`). */
  readonly id: string;
  readonly status: LifecycleStatus;
  readonly effectiveFrom: number | null;
  readonly staleAfter: number | null;
  readonly audience: readonly string[];
}

/**
 * The viewer names whose MACHINE artefacts contain the concept at `asOf`:
 * stable, effective, unexpired, not denied by an in-force ledger entry, and
 * audience-overlapping. Drafts are never on a machine surface, so the drafts
 * switch does not enter here. Sorted, so the lock is stable.
 */
export function admittedViewersOf(
  concept: AdmissionConcept,
  viewers: Readonly<Record<string, readonly string[]>>,
  asOf: number,
  inForceDenials: readonly Denial[],
): string[] {
  if (!admitsLifecycle(concept, "machine", asOf, "hidden")) return [];
  if (denies(inForceDenials, concept.id)) return [];
  return Object.entries(viewers)
    .filter(([, list]) => overlaps(list, concept.audience))
    .map(([name]) => name)
    .sort();
}

export interface LockInput {
  readonly ksorVersion: string;
  readonly sourceCommit: string | null;
  readonly dirty: boolean;
  /** Epoch ms. */
  readonly asOf: number;
  readonly drafts: Drafts;
  readonly instanceText: string;
  readonly policyText: string;
  /** Null when the ledger file does not exist. */
  readonly ledgerText: string | null;
  readonly ledgerEntries: readonly { readonly id: string; readonly digest: string }[];
  /** Registered audiences, from the policy. */
  readonly audiences: readonly string[];
  readonly concepts: readonly (AdmissionConcept & { readonly text: string })[];
  readonly companions: readonly { readonly path: string; readonly text: string }[];
  readonly denials: readonly Denial[];
}

export function composeLock(input: LockInput): Lock {
  const viewers = canonicalViewers(input.audiences);
  const documents = [...input.concepts]
    .sort((a, b) => compare(a.id, b.id))
    .map((c) => ({
      path: `${c.id}.md`,
      sha256: sha256Hex(c.text),
      status: c.status,
      audience: [...c.audience],
      admitted: admittedViewersOf(c, viewers, input.asOf, input.denials),
    }));
  const companions = [...input.companions]
    .sort((a, b) => compare(a.path, b.path))
    .map((c) => ({ path: c.path, sha256: sha256Hex(c.text) }));
  const instance_sha256 = sha256Hex(input.instanceText);
  const policy_sha256 = sha256Hex(input.policyText);
  const ledger_sha256 = sha256Hex(input.ledgerText ?? "");
  return {
    format: LOCK_FORMAT,
    build_id: buildIdOf({
      documents,
      companions,
      instance_sha256,
      policy_sha256,
      ledger_sha256,
      ksor_version: input.ksorVersion,
      drafts: input.drafts,
    }),
    ksor_version: input.ksorVersion,
    okf: OKF_PIN,
    source_commit: input.sourceCommit,
    dirty: input.dirty,
    as_of: new Date(input.asOf).toISOString(),
    drafts: input.drafts,
    instance_sha256,
    policy_sha256,
    ledger_sha256,
    ledger_entries: [...input.ledgerEntries].sort((a, b) => compare(a.id, b.id)),
    audiences: { registry: [...input.audiences].sort(), viewers },
    documents,
    companions,
  };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
