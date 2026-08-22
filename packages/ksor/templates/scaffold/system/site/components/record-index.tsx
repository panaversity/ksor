import Link from "next/link";
import type { ReactElement } from "react";

import type { RecordEntry } from "@/lib/source";

/**
 * What the record holds below this point — as a register, not as tiles.
 *
 * The site renders the record; this renders its shape. Every value comes from
 * the record — title, description, status, owner and the count below an entry
 * are frontmatter and tree, and the order is the governed `order:` key — so
 * nothing is authored in the site (critical rule 1).
 *
 * It exists because a folder's index page listed nothing: `/docs/policies`
 * rendered a title, a sentence and then empty space, while the two policies it
 * contains were reachable only from the sidebar. The home page had the same
 * gap — it said "5 documents" and linked to one (research/site-design.md F2/F5).
 *
 * The row is the design's second voice: the title in the record's serif on the
 * left, and on the right, in mono, what the record says ABOUT it — who owns it,
 * how much it holds, whether it carries a caveat. A reader choosing between two
 * documents should see that one of them was withdrawn BEFORE opening it, and
 * should see it in the same column every time. `approved` stays silent (see
 * `caveatStatus`): a label on every row is a label nobody reads.
 *
 * Server-rendered plain markup — it survives print, a failed bundle and
 * JavaScript off, like every other governance fact.
 */
export function RecordIndex({
  entries,
  heading,
}: {
  entries: readonly RecordEntry[];
  heading: string;
}): ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <section className="mt-14">
      {/* One rule, heavier than the row rules under it: the head of a register.
          No count beside it — the hero already states how many documents the
          record holds, and a second number counting something else (top-level
          entries) reads as a contradiction. */}
      <h2 className="border-b border-fd-foreground/70 pb-2.5 font-mono text-xs tracking-[0.18em] text-fd-muted-foreground uppercase">
        {heading}
      </h2>

      <ul>
        {entries.map((entry) => (
          <li key={entry.url} className="border-b border-fd-border">
            {/* The whole row is the target, and it says so on hover: the tint
                bleeds past the text into the page's own gutters, so a row reads
                as a row rather than as a link with a background. */}
            <Link
              href={entry.url}
              className="group -mx-3 grid gap-x-8 gap-y-1.5 rounded-md px-3 py-5 transition-colors hover:bg-fd-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring sm:grid-cols-[1fr_auto]"
            >
              <span className="font-display text-xl leading-snug font-semibold tracking-[-0.008em] transition-colors group-hover:text-fd-primary">
                {entry.title}
              </span>

              {/* What the record says about it, always in the same column and
                  always in mono: this half of the row is metadata, and it
                  should not be mistaken for the document's own words. Separated
                  by dots, because three uppercase mono runs with only a gap
                  between them read as one long string. */}
              <span className="flex items-baseline gap-2 font-mono text-xs tracking-wider text-fd-muted-foreground uppercase sm:col-start-2 sm:row-start-1 sm:justify-end">
                {entry.documents === 0 ? null : (
                  <span className="tabular-nums">
                    {entry.documents} {entry.documents === 1 ? "doc" : "docs"}
                  </span>
                )}
                {entry.documents === 0 || entry.owner === null ? null : (
                  <span aria-hidden className="text-fd-border">
                    ·
                  </span>
                )}
                {entry.owner === null ? null : <span>{entry.owner}</span>}
                {entry.status === null ? null : (
                  <span className="rounded-sm border border-fd-border px-1.5 py-0.5 tracking-widest text-fd-foreground">
                    {entry.status}
                  </span>
                )}
              </span>

              {entry.description === null ? null : (
                <span className="max-w-2xl text-sm text-pretty text-fd-muted-foreground sm:col-start-1 sm:row-start-2">
                  {entry.description}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
