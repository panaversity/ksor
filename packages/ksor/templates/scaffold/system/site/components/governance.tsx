import { Clock, FileText } from "lucide-react";
import Link from "next/link";

import { CopyMarkdown } from "@/components/copy-markdown";
import type { ReactElement } from "react";

import {
  caveatStatus,
  statusTone,
  isCalendarDate,
  sourceHref,
  type DocumentGovernance,
} from "@/lib/governance";

/**
 * What the record says about the document you are reading.
 *
 * The site renders the record; these render the record's governance — the
 * frontmatter `pnpm check` enforces on every document. Nothing here is
 * authored in the site (critical rule 1) and nothing is inferred: a key the
 * document does not declare renders nothing at all.
 *
 * All three are plain server-rendered markup — no client component, no
 * disclosure widget. A governance fact that only exists once JavaScript runs
 * is a governance fact missing from the printout and from the reader with a
 * failed bundle.
 */

/**
 * The successor of a superseded document: its route and the text naming it.
 * `href` is null when the pointer could not be resolved to a route, and then
 * the pointer itself is shown as text rather than as a dead link.
 */
export interface Successor {
  readonly href: string | null;
  readonly label: string;
}

/**
 * The supersession notice. Deliberately the first thing on the page, above the
 * title: a reader must not have to notice a subtle badge to learn that what
 * they are about to read has been replaced.
 */
export function SupersededNotice({ successor }: { successor: Successor }): ReactElement {
  return (
    <aside
      // A landmark, not a note: GOV.UK ships this as role="region" with
      // aria-labelledby so a screen-reader user can reach the most consequential
      // thing on the page by landmark, rather than only meeting it in reading
      // order. role="note" is announced but not navigable.
      role="region"
      aria-labelledby="ksor-superseded"
      // Tinted and ruled down the left edge in the CAUTION role, never
      // --color-fd-muted: the shipped light theme defines --color-fd-muted and
      // --color-fd-background as the same value, so the callout composited to
      // exactly the page and had no visible surface at all (measured in
      // Chromium, 2026-08-20). The one thing this notice cannot be is missable.
      className="ksor-caution mb-8 rounded-lg border border-l-4 px-4 py-3 text-sm"
    >
      <p id="ksor-superseded" className="font-medium text-fd-foreground">
        Superseded
      </p>
      <p className="mt-1 text-fd-muted-foreground">
        This document has been replaced by{" "}
        {successor.href === null ? (
          <code className="break-words text-fd-foreground">{successor.label}</code>
        ) : (
          <Link
            href={successor.href}
            className="font-medium text-fd-foreground underline underline-offset-4 transition-colors hover:text-fd-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
          >
            {successor.label}
          </Link>
        )}
        . It is kept because the record never deletes what it replaces.
      </p>
    </aside>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactElement | string;
}): ReactElement {
  return (
    <div className="flex items-baseline gap-2.5">
      {/* Mono, uppercase, letterspaced: these are the record's checkable facts,
          and they read as a register's column heads rather than as a form.

          The label is deliberately SMALLER and more letterspaced than the value
          it introduces. Both used to be mono a single pixel apart — 11px label
          against a 12px value — so "Owner Product Effective 2026-08-22" read as
          one undifferentiated mono run rather than as two facts with names
          (reported by the owner, 2026-08-22, quoting the run back verbatim).
          The step is now 10px against 13px, and the value carries the weight. */}
      <dt className="font-mono text-[0.625rem] tracking-[0.18em] text-fd-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="font-mono text-[0.8125rem] font-medium break-words text-fd-foreground">
        {children}
      </dd>
    </div>
  );
}

/**
 * The one-line governance strip under the document's title: any caveat on its
 * status, who stands behind it, and when it took effect.
 */
export function GovernanceMeta({
  governance,
  replaces = [],
  markdownUrl,
  readingMinutes,
}: {
  governance: DocumentGovernance;
  /** Documents this one replaced — derived from the record, never declared. */
  replaces?: readonly Successor[];
  /** The document's markdown twin, offered beside its governance. */
  markdownUrl?: string;
  /**
   * About how long the document takes to read, counted at build time from its
   * own markdown. Not governance — the record does not declare it — but it
   * belongs on this row because this row is what the page says ABOUT the
   * document, and a reader deciding whether to start wants it here.
   */
  readingMinutes?: number;
}): ReactElement | null {
  const { owner, effective } = governance;
  const status = caveatStatus(governance.status);
  const bare = status === null && owner === null && effective === null && replaces.length === 0;
  if (bare && markdownUrl === undefined && readingMinutes === undefined) return null;

  return (
    <dl className="mb-7 flex flex-wrap items-baseline gap-x-8 gap-y-2.5 border-b border-fd-border pb-4">
      {status === null ? null : (
        <Fact label="Status">
          <span
            className={`rounded-sm border border-fd-border px-1.5 py-0.5 tracking-widest uppercase ${statusTone(status)}`}
          >
            {status}
          </span>
        </Fact>
      )}
      {readingMinutes === undefined ? null : (
        // A clock instead of a "READ" label: the icon says what the number is
        // faster than a word does, and the other facts on this row are things
        // the record DECLARES — a mono label beside them implied this was one
        // too. The clock is also what carries "roughly": nobody reads a time
        // beside a clock icon as a promise, so the hedge does not need saying.
        <span
          className="flex items-center gap-2"
          title={`${readingMinutes} minute${readingMinutes === 1 ? "" : "s"} to read`}
        >
          <Clock aria-hidden className="size-3.5 shrink-0 text-fd-muted-foreground" />
          <span className="font-mono text-[0.8125rem] font-medium text-fd-foreground">
            {readingMinutes} min
          </span>
        </span>
      )}
      {owner === null ? null : <Fact label="Owner">{owner}</Fact>}
      {replaces.length === 0 ? null : (
        // The other half of a supersession. The withdrawn document names its
        // successor above the title; this is the successor naming what it
        // replaced, so the history the record kept is reachable from the
        // current document instead of only from the retired one.
        <Fact label={replaces.length === 1 ? "Replaces" : "Replaces"}>
          <>
            {replaces.map((entry, index) => (
              <span key={entry.href ?? `${index}-${entry.label}`}>
                {index === 0 ? null : ", "}
                {entry.href === null ? (
                  entry.label
                ) : (
                  <Link
                    href={entry.href}
                    className="underline underline-offset-4 transition-colors hover:text-fd-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
                  >
                    {entry.label}
                  </Link>
                )}
              </span>
            ))}
          </>
        </Fact>
      )}
      {effective === null ? null : (
        <Fact label="Effective">
          {/* The machine attribute is stamped only for a real day on the
              calendar. A SHAPE test was not enough: the checker's own remedy
              for `2026-06-31` is to QUOTE it, and quoted text arrives here — so
              a shape test published `<time dateTime="2026-06-31">`, which is
              invalid HTML and which a consumer reads as July 1st. That is the
              precise hazard the record's date rule exists to prevent. */}
          {isCalendarDate(effective) ? (
            <time dateTime={effective}>{effective}</time>
          ) : (
            <span>{effective}</span>
          )}
        </Fact>
      )}
      {markdownUrl === undefined ? null : (
        // On the governance row, not as a footnote below the sources: it is
        // how a reader hands this document to an agent, and it was previously
        // the smallest text on the page, last (research/site-design.md F2).
        // These are the ACTIONS on a row of FACTS, so they wear neither the
        // bordered badge (that means "a status the record declares", and
        // dressing a link in it made the only clickable thing look like another
        // read-only field) nor the accent at rest. An icon and a hover surface
        // say "control" without spending the brand colour on something that is
        // merely sitting there — the page had gone blue enough that the accent
        // had stopped meaning anything (owner, 2026-08-22).
        // Inline after the facts, NOT right-aligned: `ms-auto` parked it at the
        // far edge of a 900px row, 498px from the nearest thing on a document
        // with two facts, where it read as belonging to nothing (measured in
        // Chromium, 2026-08-21).
        <span className="flex items-center gap-0.5">
          <a
            href={markdownUrl}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[0.6875rem] tracking-[0.14em] text-fd-muted-foreground uppercase transition-colors hover:bg-fd-muted hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
          >
            <FileText aria-hidden className="size-3.5" />
            Markdown
          </a>
          {/* Beside the link, not instead of it: opening the markdown and
              handing it to an agent are different acts, and a reader who wants
              the second should not have to perform the first. */}
          <CopyMarkdown href={markdownUrl} />
        </span>
      )}
    </dl>
  );
}

/**
 * Where the document came from.
 *
 * One entry per source, each independently visible — that is the whole point
 * of `provenance` being a list: a citation has to be able to point at exactly
 * one of them. Rendering them as prose would take that away.
 */
export function Provenance({ entries }: { entries: readonly string[] }): ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <section className="mt-10 border-t border-fd-border pt-5 text-sm">
      <h2 className="mb-2 font-mono text-xs tracking-[0.18em] text-fd-muted-foreground uppercase">
        Sources
      </h2>
      {/* break-words, because a citation is often a long unbroken URL: on a
          phone it overflowed its row by 175px under an ancestor with
          `overflow-x: clip`, so the middle of the source was clipped away with
          no ellipsis and nothing to scroll (measured, 2026-08-20). A source
          nobody can read is not provenance. */}
      <ul className="space-y-1 break-words text-fd-muted-foreground">
        {entries.map((entry, index) => {
          // An entry that IS a URL becomes followable; a citation stays text.
          // `rel="noreferrer"` because the destination is authored in the
          // record, not chosen by this site.
          const href = sourceHref(entry);
          return (
            // Position, not text: a record may cite the same source twice, and
            // duplicate keys are a console error on a governed page.
            <li key={`${index}-${entry}`}>
              {href === null ? (
                entry
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4 transition-colors hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
                >
                  {entry}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
