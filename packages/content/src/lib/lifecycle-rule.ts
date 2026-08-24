/**
 * Lifecycle by surface (record spec §2.5) — ONE rule for the page, sidebar
 * and on-site search (human) and for `llms.txt`, the twins, `server.json`,
 * bundles and the door (machine). Evaluated at the build's `as_of` for
 * static output and at request time on the door; the two can disagree on a
 * concept that crosses a boundary in between, which `LIFECYCLE_CASES` pins
 * as a row rather than hides. No imports: a leaf, safe to copy.
 */

export type Surface = "human" | "machine";
export type LifecycleStatus = "draft" | "stable" | "deprecated";

export interface LifecycleDoc {
  readonly status: LifecycleStatus;
  /** Epoch ms, or null when unset. */
  readonly effectiveFrom: number | null;
  readonly staleAfter: number | null;
}

/**
 * May `surface` publish `doc` at instant `at`? `drafts` is `KSOR_DRAFTS=show`,
 * which admits drafts to HUMAN surfaces only.
 */
export function admitsLifecycle(
  doc: LifecycleDoc,
  surface: Surface,
  at: number,
  drafts: "hidden" | "shown",
): boolean {
  if (doc.status === "draft") return surface === "human" && drafts === "shown";
  if (surface === "human") return true;
  if (doc.status === "deprecated") return false;
  if (doc.effectiveFrom !== null && doc.effectiveFrom > at) return false;
  if (doc.staleAfter !== null && doc.staleAfter <= at) return false;
  return true;
}
