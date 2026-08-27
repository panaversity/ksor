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
 * May `surface` publish `doc` at instant `at`? `drafts` is the build's drafts switch,
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

/** The word a human surface shows for a state the machine surfaces decline. */
export type LifecycleBadge = "draft" | "effective-from" | "stale" | "deprecated";

/**
 * Why the machine surfaces decline `doc` at `at`, in one word — or null when
 * they admit it. Independent of `drafts`: a draft is a draft whether or not a
 * preview happens to show it.
 */
export function lifecycleBadge(doc: LifecycleDoc, at: number): LifecycleBadge | null {
  if (doc.status === "draft") return "draft";
  if (doc.status === "deprecated") return "deprecated";
  if (doc.effectiveFrom !== null && doc.effectiveFrom > at) return "effective-from";
  if (doc.staleAfter !== null && doc.staleAfter <= at) return "stale";
  return null;
}
