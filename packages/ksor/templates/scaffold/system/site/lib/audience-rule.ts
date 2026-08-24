/**
 * The audience rule, alone, with no imports and no side effects.
 *
 * CANONICAL COPY: `packages/content/src/lib/audience-rule.ts`. The scaffold's
 * site carries a byte-identical copy at
 * `system/site/lib/audience-rule.ts`, and `audience-rule-drift.test.ts`
 * fails if the two ever differ. The site cannot simply import the kernel: its
 * lib is deliberately dependency-light and runs inside Next's build, while the
 * kernel package carries pg and the embedding providers.
 *
 * Why the rule gets its own file at all: the site and the kernel enforce the
 * same visibility rule in two languages — TypeScript here, SQL in
 * `audience.ts` — and it drifted four separate times while each side's own
 * tests stayed green, because each side was internally consistent with itself.
 * `AUDIENCE_CASES` is the shared decision table both are asserted against, and
 * this file is the shared implementation of the TypeScript half.
 */

export interface AudienceModel {
  /** Least- to most-restricted, `public` first. */
  readonly audiences: readonly string[];
  /** The tier of a document that declares no `visibility:`. */
  readonly defaultVisibility: string;
}

/**
 * May a build FOR `audience` publish a document of this `visibility`?
 *
 * `model === null` is a record that declares no audience model: nothing to
 * filter, everything publishes — the level-0 shape.
 */
export function decideVisible(
  model: AudienceModel | null,
  audience: string,
  visibility: string | null,
): boolean {
  if (model === null) return true;
  const value = visibility === null || visibility === "" ? model.defaultVisibility : visibility;
  const rank = model.audiences.indexOf(value);
  // An undeclared visibility is refused, never published: a value no build
  // understands is a typo, and a typo reads as a restriction.
  if (rank === -1) return false;
  return rank <= model.audiences.indexOf(audience);
}

/**
 * The overlap rule (record spec §2.4): a concept holds a LIST of audience
 * identifiers, a viewer holds a list that always includes `public`, and the
 * concept is visible when the two overlap. Rank moves to the viewer,
 * membership stays on the document. Omission is a refusal upstream, never a
 * default here — an empty list on either side is visible to nobody.
 */
export function overlaps(viewer: readonly string[], audience: readonly string[]): boolean {
  return audience.some((a) => viewer.includes(a));
}

/**
 * The widening rule: a link, a `ksor.superseded_by` pointer or a companion
 * body may reach a target whose audience contains `public` or contains every
 * identifier in the source's — then every reader of the source can read the
 * target. `[internal]` → `[public]` passes; `[public]` → `[internal]` refuses.
 */
export function mayReach(source: readonly string[], target: readonly string[]): boolean {
  return target.includes("public") || source.every((a) => target.includes(a));
}
