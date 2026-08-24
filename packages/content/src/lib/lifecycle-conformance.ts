/**
 * The decision table for record spec §2.5, one row per line of the table
 * and one for the build-vs-request boundary. TS is asserted in
 * `lifecycle-rule.test.ts`; the SQL half is asserted through real Postgres
 * when the serving predicate lands (research/okf-native.md §1.6).
 */
import type { LifecycleDoc } from "./lifecycle-rule.js";

export interface LifecycleCase {
  readonly name: string;
  readonly doc: LifecycleDoc;
  readonly at: number;
  readonly drafts: "hidden" | "shown";
  readonly human: boolean;
  readonly machine: boolean;
}

const NOW = Date.parse("2026-08-25T12:00:00Z");
const DAY = 86_400_000;
const STABLE: LifecycleDoc = { status: "stable", effectiveFrom: null, staleAfter: null };

export const LIFECYCLE_CASES: readonly LifecycleCase[] = [
  {
    name: "draft: never on a machine surface, on a human surface only when drafts are shown",
    doc: { ...STABLE, status: "draft" },
    at: NOW,
    drafts: "shown",
    human: true,
    machine: false,
  },
  {
    name: "draft with drafts hidden (every build's default): nowhere",
    doc: { ...STABLE, status: "draft" },
    at: NOW,
    drafts: "hidden",
    human: false,
    machine: false,
  },
  {
    name: "stable, effective, unexpired: both surfaces",
    doc: { ...STABLE, effectiveFrom: NOW - DAY, staleAfter: NOW + DAY },
    at: NOW,
    drafts: "hidden",
    human: true,
    machine: true,
  },
  {
    name: "stable with no effective_from and no stale_after: both surfaces",
    doc: STABLE,
    at: NOW,
    drafts: "hidden",
    human: true,
    machine: true,
  },
  {
    name: "stable before effective_from: human with a badge, machine no",
    doc: { ...STABLE, effectiveFrom: NOW + DAY },
    at: NOW,
    drafts: "hidden",
    human: true,
    machine: false,
  },
  {
    name: "stable past stale_after: human with a badge, machine no",
    doc: { ...STABLE, staleAfter: NOW - DAY },
    at: NOW,
    drafts: "hidden",
    human: true,
    machine: false,
  },
  {
    name: "stale_after equal to as_of is already stale: the review date has arrived",
    doc: { ...STABLE, staleAfter: NOW },
    at: NOW,
    drafts: "hidden",
    human: true,
    machine: false,
  },
  {
    name: "effective_from equal to as_of is effective",
    doc: { ...STABLE, effectiveFrom: NOW },
    at: NOW,
    drafts: "hidden",
    human: true,
    machine: true,
  },
  {
    name: "deprecated: human with its successor, machine no",
    doc: { ...STABLE, status: "deprecated" },
    at: NOW,
    drafts: "hidden",
    human: true,
    machine: false,
  },
  // The disclosed disagreement: a build at as_of and a door request an hour
  // later read the same concept differently when a boundary lies between.
  {
    name: "boundary: a build before effective_from excludes what a request after it admits — disclosed, not hidden",
    doc: { ...STABLE, effectiveFrom: NOW + 1 },
    at: NOW,
    drafts: "hidden",
    human: true,
    machine: false,
  },
];
