import Link from "next/link";
import type { ReactElement } from "react";

import { Badge } from "@/components/ui/badge";
import type { RecordEntry } from "@/lib/source";

/**
 * What the record holds below this point.
 *
 * The site renders the record; this renders its shape. Every value here comes
 * from the record — title, description, status, owner and the count below an
 * entry are frontmatter and tree, and the order is the governed `order:` key —
 * so nothing is authored in the site (critical rule 1).
 *
 * It exists because a folder's index page listed nothing: `/docs/policies`
 * rendered a title, a sentence and then empty space, while the two policies it
 * contains were reachable only from the sidebar. The home page had the same
 * gap — it said "5 documents" and linked to one (research/site-design.md F2/F5).
 *
 * The status is shown here for the same reason the page shows it: a reader
 * choosing between two documents should be able to see that one of them was
 * withdrawn BEFORE opening it. `approved` stays silent (see `caveatStatus`).
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
    <section className="mt-10">
      <h2 className="mb-4 text-xs font-medium tracking-widest text-fd-muted-foreground uppercase">
        {heading}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {entries.map((entry) => (
          <li key={entry.url}>
            <Link
              href={entry.url}
              className="group flex h-full flex-col gap-1.5 rounded-xl border border-fd-border bg-fd-card p-4 transition-colors hover:border-fd-primary/40 hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-fd-foreground transition-colors group-hover:text-fd-primary">
                  {entry.title}
                </span>
                {entry.status === null ? null : (
                  <Badge variant="outline" className="rounded px-1.5 py-0 font-normal">
                    {entry.status}
                  </Badge>
                )}
              </span>
              {entry.description === null ? null : (
                <span className="text-sm text-pretty text-fd-muted-foreground">
                  {entry.description}
                </span>
              )}
              {/* What a reader chooses ON, under the sentence: how much is
                  below this entry, and who stands behind it. `mt-auto` holds
                  the line to the foot of the card so a row of cards agrees on
                  where to look. Both render only when the record says them —
                  and the owner disappears entirely when `site.governance` is
                  off, because it is a governance fact. */}
              {entry.documents === 0 && entry.owner === null ? null : (
                <span className="mt-auto flex items-baseline gap-2.5 pt-2 text-xs text-fd-muted-foreground">
                  {entry.documents === 0 ? null : (
                    <span className="tabular-nums">
                      {entry.documents} document{entry.documents === 1 ? "" : "s"}
                    </span>
                  )}
                  {entry.owner === null ? null : <span>{entry.owner}</span>}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
