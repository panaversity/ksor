/**
 * What in this record still wants a human's eyes, as one list.
 *
 * The per-page half of "preview and review" (decision 7) already ships: a
 * badged page says what state it is in, and the search dialog carries the same
 * word. The record-level half is this — a reviewer asking "what needs me?"
 * otherwise walks the sidebar page by page, which is free on the five-document
 * starter and is the difference between review happening and review being
 * skipped on a record of any size.
 *
 * Grouped by the badge the lifecycle rule already computes, so there is no
 * second opinion about a document's state anywhere on the site: the group a
 * document appears in here is the same `LifecycleBadge` its own page shows
 * (record spec §2.5, `lib/lifecycle-rule.ts`).
 *
 * Pure — the page hands it entries and gets sections back — so the ordering
 * and the empty cases are testable without a site install.
 */

import type { LifecycleBadge } from "./lifecycle-rule.js";

export interface ReviewItem {
  readonly url: string;
  readonly title: string;
  readonly description: string | null;
  readonly badge: LifecycleBadge;
  /** Who stands behind it; null when the record declares no owner (or governance is off). */
  readonly owner: string | null;
  /** The instant that explains the badge, as the record wrote it: `effective_from`, `stale_after`, or the deprecation. */
  readonly at: string | null;
}

export interface ReviewSection {
  readonly badge: LifecycleBadge;
  readonly heading: string;
  /** Why this state is on the list — the reviewer's actual next question. */
  readonly note: string;
  readonly items: readonly ReviewItem[];
}

/**
 * The order a reviewer works in, not the order the enum happens to be
 * declared in: what nobody has approved yet, then what has silently left the
 * agent surfaces, then what is waiting to arrive, then what has a successor.
 * The first two are the ones where doing nothing is the expensive choice.
 */
const ORDER: readonly LifecycleBadge[] = ["draft", "stale", "effective-from", "deprecated"];

const HEADINGS: Readonly<Record<LifecycleBadge, string>> = {
  draft: "Drafts",
  stale: "Past their review date",
  "effective-from": "Not yet effective",
  deprecated: "Deprecated",
};

const NOTES: Readonly<Record<LifecycleBadge, string>> = {
  draft:
    "Not published anywhere. A human approves one by setting status: stable in a pull request.",
  stale:
    "Still readable here, and already withdrawn from every agent surface. Re-review it, or extend its stale_after.",
  "effective-from": "Readable here, withheld from agents until the date it names.",
  deprecated: "Superseded or withdrawn. Readable here so a link into it still explains itself.",
};

/**
 * Group the badged documents, dropping the states with nothing in them.
 *
 * An empty result is a real answer and the page says so in words — never a
 * blank that could equally mean "the list failed to load".
 */
export function reviewSections(items: readonly ReviewItem[]): ReviewSection[] {
  return ORDER.flatMap((badge) => {
    const inBadge = items.filter((item) => item.badge === badge);
    if (inBadge.length === 0) return [];
    const heading = HEADINGS[badge];
    const note = NOTES[badge];
    // `noUncheckedIndexedAccess` widens a lookup to `| undefined` even against
    // a total Record. Read them once and narrow, rather than asserting.
    if (heading === undefined || note === undefined) return [];
    return [
      {
        badge,
        heading,
        note,
        // Titles, so two reviewers reading the same list see the same order.
        // Reading order would put the answer to "what needs me" in the place
        // the sidebar happens to have reached, which is not an order at all.
        items: [...inBadge].sort((a, b) => a.title.localeCompare(b.title)),
      },
    ];
  });
}

/**
 * What the page must say about DRAFTS when it is showing none.
 *
 * A published build excludes every draft from every surface (record spec
 * §2.5), so "no drafts" on such a build means "this build cannot see them",
 * not "there are none" — and a reviewer who reads the first as the second has
 * been misled by a page whose whole job is telling them what needs looking at.
 * `pnpm dev` and `KSOR_DRAFTS=show` are the surfaces that can.
 */
export function draftVisibility(drafts: "hidden" | "shown"): string | null {
  return drafts === "shown"
    ? null
    : "Drafts are excluded from this build, so none can be listed here. Run pnpm dev, or build with KSOR_DRAFTS=show, to review them.";
}
