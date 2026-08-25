/**
 * What makes a file in the record a SIM — an interactive page the record
 * CARRIES, served rather than bundled.
 *
 * A sim is an ASSET of its document, exactly like the figures beside it: many
 * per document, named freely, linked from the prose the way a figure is, and
 * staged only when a published document references it. It is deliberately NOT
 * a study attachment (decision 24) — an attachment is named after its parent
 * (`<doc>.quiz.yaml`), and seven sims cannot all be `index.sim.html`. So this
 * rule is the SUFFIX and nothing else: there is no parent name to derive, and
 * governance is inherited by POSITION — through the concept whose link is the
 * only way a sim ever reaches the stage.
 *
 * The suffix is what separates a page the record MEANS to serve from an
 * `.html` that fell into `knowledge/`. Both are bytes with the same extension,
 * so without a marker the record would either serve every stray export or
 * serve none of the sims — which is why the checker admits this shape by name
 * and refuses the rest.
 *
 * A LEAF: no imports, so the record's checker and the site's embed rule can
 * each take it without taking anything else with them. Duplicated by
 * construction — the site cannot import the kernel (decision 18) — and the
 * copy is asserted rather than trusted.
 */

/** The suffix that marks an asset as a page to be SERVED rather than bundled. */
export const SIM_SUFFIX = ".sim.html";

/**
 * True when this file name is a sim.
 *
 * Matched on the whole base name: a file called exactly `.sim.html` is a
 * dotfile with no stem, so it names no page and is not one — the same
 * boundary `attachmentKindOf` draws, and it keeps a stray dotfile falling
 * through to the honest "unexpected file type" refusal.
 */
export function isSim(baseName: string): boolean {
  return baseName.length > SIM_SUFFIX.length && baseName.endsWith(SIM_SUFFIX);
}

/**
 * Where a sim is served, derived from where it sits in the record.
 *
 * The record path is the identity (product principle 3), so two documents may
 * each own a `goal-loop.sim.html` without colliding.
 */
export function publicSimPath(recordRelative: string): string {
  return recordRelative.slice(0, -SIM_SUFFIX.length).replaceAll("\\", "/") + ".html";
}
