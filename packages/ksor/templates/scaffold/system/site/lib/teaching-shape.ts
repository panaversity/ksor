/**
 * Turning a teaching guide's authored shapes into the one shape the UI draws.
 *
 * `misconceptions` and `objectives` each accept a bare string OR an object,
 * because an author usually has half the note before they have all of it. The
 * cost of that kindness is two shapes downstream, so it is paid here, once,
 * rather than by every component that renders one.
 *
 * A LEAF: no imports, so it can be unit-tested. `teaching.ts` carries zod and
 * cannot enter this repo's unit tier — the same split as `quiz-round.ts`.
 */

export interface Misconception {
  /** What people get wrong. */
  readonly text: string;
  /** The correction, when the author had one. */
  readonly instead?: string | undefined;
}

export interface Objective {
  readonly objective: string;
  /** Free-text label, never a validated taxonomy — see teaching.ts. */
  readonly level?: string | undefined;
}

export function normalizeMisconception(
  value: string | { readonly text: string; readonly instead?: string | undefined },
): Misconception {
  return typeof value === "string" ? { text: value } : { text: value.text, instead: value.instead };
}

export function normalizeObjective(
  value: string | { readonly objective: string; readonly level?: string | undefined },
): Objective {
  return typeof value === "string"
    ? { objective: value }
    : { objective: value.objective, level: value.level };
}

/** The sections a guide can carry, in the order the sheet renders them. */
export const TEACHING_SECTIONS = [
  { key: "prerequisites", label: "Before this" },
  { key: "objectives", label: "They should leave able to" },
  { key: "key_points", label: "Key points" },
  { key: "misconceptions", label: "Commonly misunderstood" },
  { key: "discussion", label: "Questions to ask" },
  { key: "check", label: "Check they got it" },
  { key: "tips", label: "Tips" },
] as const;

export type TeachingSectionKey = (typeof TEACHING_SECTIONS)[number]["key"];

/**
 * Whether a guide has anything to show.
 *
 * The schema refuses an empty guide at parse time; this is the same question
 * asked by the RENDERER, which must not draw a control for a panel with
 * nothing in it even if a future shape slips past the schema.
 */
export function hasTeachingContent(
  guide: Partial<Record<TeachingSectionKey, readonly unknown[] | undefined>>,
): boolean {
  return TEACHING_SECTIONS.some((section) => (guide[section.key]?.length ?? 0) > 0);
}
