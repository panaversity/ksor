import { ArrowRight, FileText, Folder } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { statusTone } from "@/lib/governance";
import type { RecordEntry } from "@/lib/source";

/**
 * What the record holds below this point.
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
 * Each entry is a CARD, not a hairline row (owner, 2026-08-22, choosing it from
 * four prototyped treatments). The register the design language called for was
 * honest about hierarchy and silent about being usable: at rest a row carried
 * no affordance at all — only a hover tint and a hover colour — so on a touch
 * screen, where there is no hover, nothing ever said the row was a link. A card
 * is a surface a reader expects to press, and the arrow says where pressing
 * leads before anyone has moved a pointer.
 *
 * What survives from the register is the part that was never about looks: the
 * record's serif for its own words, mono for what the record says ABOUT them —
 * who owns it, how much it holds, whether it carries a caveat — and `approved`
 * staying silent, because a label on every row is a label nobody reads.
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
      {/* The head of the list stays a register head: this is a label, and a
          label is machine-facing furniture whatever the rows below it are. */}
      <h2 className="ksor-section-label mb-3">{heading}</h2>

      <ul className="grid gap-3">
        {entries.map((entry) => {
          // A folder and a leaf are different things to open, and the icon is
          // read before the count is.
          const Icon = entry.documents > 0 ? Folder : FileText;
          return (
            <li key={entry.url}>
              <Link
                href={entry.url}
                className="group flex items-start gap-4 rounded-lg border border-fd-border bg-fd-muted/40 px-5 py-4 transition-all hover:-translate-y-px hover:border-fd-primary/40 hover:bg-fd-muted hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <Icon
                  aria-hidden
                  className="mt-1 size-4 shrink-0 text-fd-muted-foreground transition-colors group-hover:text-fd-primary"
                />

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-display text-lg leading-snug font-semibold tracking-[-0.008em] transition-colors group-hover:text-fd-primary">
                      {entry.title}
                    </span>
                    {entry.status === null ? null : (
                      <span
                        className={`rounded-sm border border-fd-border px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-fd-foreground uppercase ${statusTone(entry.status)}`}
                      >
                        {entry.status}
                      </span>
                    )}
                  </span>

                  {entry.description === null ? null : (
                    <span className="mt-1 block text-sm text-pretty text-fd-muted-foreground">
                      {entry.description}
                    </span>
                  )}
                </span>

                {/* What the record says about it, in the same column every
                    time, so two entries can be compared without reading. */}
                <span className="flex shrink-0 items-center gap-3 self-center">
                  <span className="hidden items-baseline gap-2 font-mono text-xs tracking-wider text-fd-muted-foreground uppercase tabular-nums sm:flex">
                    {entry.documents === 0 ? null : (
                      <span>{`${entry.documents} ${entry.documents === 1 ? "doc" : "docs"}`}</span>
                    )}
                    {entry.documents === 0 || entry.owner === null ? null : (
                      <span aria-hidden className="text-fd-border">
                        ·
                      </span>
                    )}
                    {entry.owner === null ? null : <span>{entry.owner}</span>}
                  </span>

                  {/* The affordance the register never had: a mark that says
                      "this opens something", visible without a pointer. */}
                  <ArrowRight
                    aria-hidden
                    className="size-4 text-fd-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-fd-primary motion-reduce:transition-none"
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
