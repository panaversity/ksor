/**
 * The KSoR Profile of OKF, §2 of the record spec, as one schema: what a
 * concept's frontmatter must say, and the refusals when it does not. Only
 * shape and self-consistency live here; anything that needs the policy (the
 * audience registry, who may approve or deprecate) is `policy.ts`'s, and
 * anything that needs the rest of the tree (links, footnotes, supersession)
 * is `check.ts`'s.
 */
import { z } from "zod";

import { isIndividualActor } from "./actor";
import { parseInstant } from "./instant";
import { nearest } from "./near-miss";
import { sortRefusals, type Refusal, type RefusalSlug } from "./refusal";

export const RESERVED_TYPES = [
  "Policy",
  "Procedure",
  "Control",
  "Standard",
  "Definition",
  "Decision Record",
  "Example",
  "Attested Computation",
] as const;

export const STATUSES = ["draft", "stable", "deprecated"] as const;
export type Status = (typeof STATUSES)[number];

/** Pre-profile keys whose silent survival would be silent loss of governance (§2.7). */
export const LEGACY_KEYS = [
  "id",
  "name",
  "visibility",
  "provenance",
  "owner",
  "effective",
  "superseded",
  // The pre-profile supersession pointer. It is NOT harmless to preserve as an
  // unknown key (§2.7): the profile reads `ksor.superseded_by`, so a top-level
  // one announces a successor no surface shows and no reader follows — the
  // silent loss of governance this list exists to prevent.
  "superseded_by",
  "sor_id",
] as const;

/**
 * The keys the BUILD writes into a concept's markdown twin and its
 * `llms-full.txt` block — the derived trust tier and the R14 stamps. They are
 * appended under the record's own frontmatter, intact, so a concept that
 * declares one publishes it TWICE: the twin then fails the record's own reader
 * (`uniqueKeys: true` → `ksor-frontmatter-invalid`), and a lenient consumer
 * picks one of the two, which makes the derived tier non-authoritative and the
 * build stamp forgeable by whoever writes the document.
 */
export const DERIVED_KEYS = [
  "trust_tier",
  "build_id",
  "source_commit",
  "ksor_version",
  "dirty",
  "unstamped",
] as const;

export const TRUST_TIERS = ["unverified", "machine-confirmed", "human-reviewed"] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

const actor = z.custom<string>(isIndividualActor, { message: "actor" });
const instant = z.custom<string>((v) => parseInstant(v) !== null, { message: "instant" });
const act = z.object({ by: actor, at: instant });

const source = z.object({
  resource: z.string().min(1, "resource"),
  id: z.string().min(1).optional(),
  title: z.string().optional(),
});

/**
 * The `ksor:` block's keys, CLOSED. The namespace is ksor's own, not OKF's, so
 * §11's preserve-unknown-keys rule does not reach it — and the keys that fail
 * open here are the OPTIONAL ones, because a typo in a required key already
 * surfaces as `ksor-missing-key`. `ksor.effective-from` (one hyphen) published
 * an embargoed policy four weeks early with nothing red, and a mistyped
 * `stale_after` serves a document that should have expired forever
 * (reproduced 2026-08-25).
 */
export const NAMESPACE_KEYS = [
  "audience",
  "owner",
  "approval",
  "effective_from",
  "superseded_by",
  "deprecated",
] as const;

const ksorBlock = z.object({
  audience: z.array(z.string().min(1)).min(1, "audience"),
  owner: z.string().min(1).optional(),
  approval: act.optional(),
  effective_from: instant.optional(),
  superseded_by: z.string().min(1).optional(),
  deprecated: act.optional(),
});

const conceptSchema = z
  .object({
    type: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    status: z.enum(STATUSES),
    order: z.number().optional(),
    generated: z.object({ by: actor, at: instant.optional() }).optional(),
    sources: z.array(source).optional(),
    // OKF §5.2: a consumer MUST accept a bare mapping as a one-element list.
    verified: z.preprocess(
      (v) => (typeof v === "object" && v !== null && !Array.isArray(v) ? [v] : v),
      z.array(act).optional(),
    ),
    stale_after: instant.optional(),
    ksor: ksorBlock,
  })
  .loose();

type Parsed = z.infer<typeof conceptSchema>;

export interface Concept {
  /** Record-relative path: `knowledge/<id>.md`. */
  readonly path: string;
  /** OKF concept id: bundle-relative path without `.md`. */
  readonly id: string;
  readonly type: string;
  readonly reserved: boolean;
  readonly title: string;
  readonly description: string;
  readonly status: Status;
  readonly order: number | null;
  readonly audience: readonly string[];
  readonly owner: string | null;
  readonly generatedAt: number | null;
  readonly approval: { readonly by: string; readonly at: number } | null;
  readonly deprecated: { readonly by: string; readonly at: number } | null;
  readonly verified: readonly { readonly by: string; readonly at: number }[];
  readonly trustTier: TrustTier;
  readonly effectiveFrom: number | null;
  readonly staleAfter: number | null;
  readonly supersededBy: string | null;
  readonly sourceIds: readonly string[];
  /** Everything, unknown keys included (OKF §11). */
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

export type ConceptResult =
  | { readonly ok: true; readonly concept: Concept }
  | { readonly ok: false; readonly refusals: readonly Refusal[] };

const FLOOR_KEYS = ["type", "title", "description", "status"] as const;

/**
 * The profile's own top-level keys. The concept schema stays OPEN (OKF §11: a
 * consumer preserves keys it does not know), so this list is not a closed set
 * — it is the target of the near-miss net below.
 */
const PROFILE_KEYS = [
  "type",
  "title",
  "description",
  "status",
  "order",
  "generated",
  "sources",
  "verified",
  "stale_after",
  "ksor",
] as const;

export function conceptIdOf(path: string): string {
  return path.replace(/^knowledge\//, "").replace(/\.md$/, "");
}

export function parseConcept(path: string, frontmatter: Record<string, unknown>): ConceptResult {
  const refusals: Refusal[] = [];
  const refuse = (slug: RefusalSlug, why: string, fix: string): void => {
    refusals.push({ slug, path, why, fix });
  };

  for (const key of LEGACY_KEYS) {
    if (key in frontmatter) {
      refuse(
        "ksor-legacy-key",
        `\`${key}\` is a pre-profile key; the profile does not read it, so whatever it governed would be silently lost`,
        "run `ksor migrate` to move it into the profile's shape, then delete it",
      );
    }
  }
  for (const key of DERIVED_KEYS) {
    if (!(key in frontmatter)) continue;
    refuse(
      "ksor-derived-key",
      `\`${key}\` is written by the BUILD, not by a document — the markdown twin and the \`llms-full.txt\` block append it under this frontmatter, so declaring it here publishes the key twice and the derived value stops being the authoritative one`,
      `remove \`${key}:\` — the trust tier comes from \`verified\`, and the build stamps come from \`build.lock.json\``,
    );
  }
  // OKF §11 keeps a key nobody knows — but a key ONE edit from a profile key is
  // not an extension, it is the profile key failing open. `stale_afer:` never
  // expires; `titel:` renders no title. Refusing beats preserving here.
  for (const key of Object.keys(frontmatter)) {
    const near = nearest(key, PROFILE_KEYS, 1);
    if (near === null) continue;
    refuse(
      "ksor-key-near-miss",
      `\`${key}\` is one edit from \`${near}\`, the profile key it is almost certainly meant to be — unknown keys are preserved (§2.7), so a near miss would be kept and the governance it carried would simply stop existing`,
      `rename it to \`${near}:\`, or — if it really is an extension key of your own — give it a name no profile key is one edit from`,
    );
  }
  for (const key of FLOOR_KEYS) {
    if (!(key in frontmatter)) {
      refuse(
        "ksor-missing-key",
        `\`${key}\` is required on every concept`,
        `add \`${key}:\` to the frontmatter`,
      );
    }
  }
  const ksor = frontmatter["ksor"];
  const audience =
    typeof ksor === "object" && ksor !== null && !Array.isArray(ksor)
      ? (ksor as Record<string, unknown>)["audience"]
      : undefined;
  if (!Array.isArray(audience) || audience.length === 0) {
    refuse(
      "ksor-audience-missing",
      "`ksor.audience` is required and is a non-empty list — omission is refused, never defaulted (record spec §2.4)",
      "add `ksor:\\n  audience: [public]`, or the registered audiences who may read this",
    );
  }
  if (typeof ksor === "object" && ksor !== null && !Array.isArray(ksor)) {
    for (const key of Object.keys(ksor as Record<string, unknown>)) {
      if ((NAMESPACE_KEYS as readonly string[]).includes(key)) continue;
      const near = nearest(key, NAMESPACE_KEYS, 2);
      refuse(
        "ksor-ksor-key-unknown",
        `\`ksor.${key}\` is not a key of the \`ksor:\` block — the block is ksor's own namespace and its key set is closed, so a key it does not read is a guarantee that stops existing rather than one the record announces`,
        `${near === null ? `remove \`${key}:\`` : `did you mean \`${near}:\`?`} (allowed under \`ksor:\`: ${NAMESPACE_KEYS.join(", ")})`,
      );
    }
  }
  if (
    typeof frontmatter["status"] === "string" &&
    !STATUSES.includes(frontmatter["status"] as Status)
  ) {
    refuse(
      "ksor-status-unknown",
      `\`status: ${frontmatter["status"]}\` is not one of ${STATUSES.join(" | ")}`,
      "`draft` while it is being written, `stable` once approved, `deprecated` with its successor",
    );
  }

  const parsed = conceptSchema.safeParse(frontmatter);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const at = issue.path.map(String).join(".");
      if (issue.message === "actor") {
        refuse(
          "ksor-actor-form",
          `\`${at}\` is not an actor — \`human:<id>\`, \`process:<id>\` or \`<producer>/<version>\`; \`team:\` is allowed only in \`ksor.owner\`, because trust tiers key on the \`human:\` prefix`,
          "name the person or process that performed the act",
        );
      } else if (issue.message === "instant") {
        refuse(
          "ksor-instant-form",
          `\`${at}\` is not an ISO 8601 instant with an explicit offset (e.g. 2026-08-20T09:00:00Z)`,
          "write the full instant; `ksor migrate` widens a bare date to midnight UTC",
        );
      } else if (
        issue.message === "resource" ||
        (at.startsWith("sources.") && at.endsWith(".resource"))
      ) {
        refuse(
          "ksor-source-unresourced",
          `\`${at}\` is required — a URL, a bundle path, or a scope descriptor (OKF §5.1)`,
          "name where the source lives; a scope descriptor is allowed until a URL exists",
        );
      } else if (alreadyRefused(at, refusals)) {
        // The floor, status and audience refusals above are the author-facing form of the same issue.
      } else {
        refuse(
          "ksor-frontmatter-invalid",
          `\`${at || "(root)"}\`: ${issue.message}`,
          "check the key's shape against the profile (record spec §2)",
        );
      }
    }
    return { ok: false, refusals: sortRefusals(refusals) };
  }

  const fm = parsed.data;
  const reserved = (RESERVED_TYPES as readonly string[]).includes(fm.type);
  if (reserved && (fm.sources === undefined || fm.sources.length === 0)) {
    refuse(
      "ksor-reserved-type-unsourced",
      `\`type: ${fm.type}\` is a reserved type, which carries governance meaning and therefore needs \`sources\``,
      "list where this knowledge comes from, or use a non-reserved type such as `Document`",
    );
  }
  if (reserved && fm.ksor.owner === undefined) {
    refuse(
      "ksor-reserved-type-unowned",
      `\`type: ${fm.type}\` is a reserved type and needs \`ksor.owner\``,
      "name the owning team or person, or use a non-reserved type such as `Document`",
    );
  }
  const generatedAt = fm.generated?.at === undefined ? null : parseInstant(fm.generated.at);
  if (fm.status === "stable") {
    if (generatedAt === null) {
      refuse(
        "ksor-stable-ungenerated",
        "a `stable` concept must carry `generated: { by, at }` — when and by what it was produced",
        "add `generated`, or keep `status: draft`",
      );
    }
    if (fm.ksor.approval === undefined) {
      refuse(
        "ksor-stable-unapproved",
        "a `stable` concept must carry `ksor.approval: { by, at }` — the authority decision to publish",
        "record the approval an authorised actor gave, or keep `status: draft`",
      );
    } else if (generatedAt !== null && generatedAt > parseInstant(fm.ksor.approval.at)!) {
      refuse(
        "ksor-generated-after-approval",
        "`generated.at` is after `ksor.approval.at` — the approved text is not the text that was generated (R23)",
        "re-approve in the same reviewed change, or fall back to `status: draft`",
      );
    }
  }
  if (fm.status === "deprecated" && fm.ksor.deprecated === undefined) {
    refuse(
      "ksor-deprecated-unattributed",
      "a `deprecated` concept must carry `ksor.deprecated: { by, at }` — who withdrew it",
      "record the deprecation by the owner or a takedown authority, usually with `ksor.superseded_by`",
    );
  }
  if (refusals.length > 0) return { ok: false, refusals: sortRefusals(refusals) };

  return { ok: true, concept: toConcept(path, fm, frontmatter, reserved, generatedAt) };
}

function alreadyRefused(at: string, refusals: readonly Refusal[]): boolean {
  if ((FLOOR_KEYS as readonly string[]).includes(at)) return true;
  if (at === "status") return refusals.some((r) => r.slug === "ksor-status-unknown");
  if (at === "ksor" || at === "ksor.audience" || at.startsWith("ksor.audience.")) {
    return refusals.some((r) => r.slug === "ksor-audience-missing");
  }
  return false;
}

function toConcept(
  path: string,
  fm: Parsed,
  frontmatter: Record<string, unknown>,
  reserved: boolean,
  generatedAt: number | null,
): Concept {
  const verified = (fm.verified ?? []).map((v) => ({ by: v.by, at: parseInstant(v.at)! }));
  const trustTier: TrustTier =
    verified.length === 0
      ? "unverified"
      : verified.some((v) => v.by.startsWith("human:"))
        ? "human-reviewed"
        : "machine-confirmed";
  return {
    path,
    id: conceptIdOf(path),
    type: fm.type,
    reserved,
    title: fm.title,
    description: fm.description,
    status: fm.status,
    order: fm.order ?? null,
    audience: fm.ksor.audience,
    owner: fm.ksor.owner ?? null,
    generatedAt,
    approval: fm.ksor.approval
      ? { by: fm.ksor.approval.by, at: parseInstant(fm.ksor.approval.at)! }
      : null,
    deprecated: fm.ksor.deprecated
      ? { by: fm.ksor.deprecated.by, at: parseInstant(fm.ksor.deprecated.at)! }
      : null,
    verified,
    trustTier,
    effectiveFrom:
      fm.ksor.effective_from === undefined ? null : parseInstant(fm.ksor.effective_from),
    staleAfter: fm.stale_after === undefined ? null : parseInstant(fm.stale_after),
    supersededBy: fm.ksor.superseded_by ?? null,
    sourceIds: (fm.sources ?? []).flatMap((s) => (s.id === undefined ? [] : [s.id])),
    frontmatter,
  };
}
