import Link from "next/link";
import type { ReactElement } from "react";

import type { RecordEntry } from "@/lib/source";

/**
 * What the record holds below this point.
 *
 * The site renders the record; this renders its shape. Every value here comes
 * from the record — title, description and status are frontmatter, and the
 * order is the governed `order:` key — so nothing is authored in the site
 * (critical rule 1).
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
    <section className="mt-10 border-t border-fd-border pt-5">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-fd-muted-foreground">
        {heading}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {entries.map((entry) => (
          <li key={entry.url}>
            <Link
              href={entry.url}
              className="flex h-full flex-col gap-1 rounded-lg border border-fd-border bg-fd-card p-3 transition-colors hover:border-fd-primary/40 hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-fd-foreground">{entry.title}</span>
                {entry.status === null ? null : (
                  <span className="shrink-0 rounded border border-fd-border px-1.5 py-0.5 text-[0.65rem] font-medium text-fd-muted-foreground">
                    {entry.status}
                  </span>
                )}
              </span>
              {entry.description === null ? null : (
                <span className="text-sm text-fd-muted-foreground">{entry.description}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
