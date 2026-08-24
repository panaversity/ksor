import Link from "next/link";

import { DocumentActions } from "@/components/document-actions";
import type { ReactElement } from "react";

import {
  badgeLabel,
  badgeTone,
  dayOf,
  isCalendarDate,
  sourceHref,
  type DocumentGovernance,
} from "@/lib/governance";
import type { LifecycleBadge } from "@/lib/lifecycle-rule";

/**
 * What the record says about the document you are reading.
 *
 * The site renders the record; these render the record's governance — the
 * profile's frontmatter `pnpm check` enforces on every concept. Nothing here is
 * authored in the site (critical rule 1) and nothing is inferred: a key the
 * document does not declare renders nothing at all.
 *
 * All three are plain server-rendered markup — no client component, no
 * disclosure widget. A governance fact that only exists once JavaScript runs
 * is a governance fact missing from the printout and from the reader with a
 * failed bundle.
 */

/**
 * The successor of a deprecated document: its route and the text naming it.
 * `href` is null when the pointer could not be resolved to a route in this
 * build, and then the pointer itself is shown as text rather than as a dead link.
 */
export interface Successor {
  readonly href: string | null;
  readonly label: string;
}

/**
 * The deprecation notice. Deliberately the first thing on the page, above the
 * title: a reader must not have to notice a subtle badge to learn that what
 * they are about to read has been withdrawn. `successor` is null when the
 * record deprecated the document without naming a replacement.
 */
export function DeprecatedNotice({ successor }: { successor: Successor | null }): ReactElement {
  return (
    <aside
      // A landmark, not a note: GOV.UK ships this as role="region" with
      // aria-labelledby so a screen-reader user can reach the most consequential
      // thing on the page by landmark, rather than only meeting it in reading
      // order. role="note" is announced but not navigable.
      role="region"
      aria-labelledby="ksor-deprecated"
      // Tinted and ruled down the left edge in the CAUTION role, never
      // --color-fd-muted: the shipped light theme defines --color-fd-muted and
      // --color-fd-background as the same value, so the callout composited to
      // exactly the page and had no visible surface at all (measured in
      // Chromium, 2026-08-20). The one thing this notice cannot be is missable.
      className="ksor-caution mb-8 rounded-lg border border-l-4 px-4 py-3 text-sm"
    >
      <p id="ksor-deprecated" className="font-medium text-fd-foreground">
        Deprecated
      </p>
      <p className="mt-1 text-fd-muted-foreground">
        {successor === null ? (
          "The record has withdrawn this document."
        ) : (
          <>
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
            .
          </>
        )}{" "}
        It is kept because the record never deletes what it replaces.
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
          it introduces (10px against 13px), so "Owner Product Effective
          2026-08-22" reads as two facts with names rather than one mono run
          (reported by the owner, 2026-08-22). */}
      <dt className="font-mono text-[0.625rem] tracking-[0.18em] text-fd-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="font-mono text-[0.8125rem] font-medium break-words text-fd-foreground">
        {children}
      </dd>
    </div>
  );
}

/** The chip a badge wears, in every listing and on the page. */
export function BadgeChip({ badge }: { badge: LifecycleBadge }): ReactElement {
  return (
    <span
      className={`rounded-sm border border-fd-border px-1.5 py-0.5 tracking-widest uppercase ${badgeTone(badge)}`}
    >
      {badgeLabel(badge)}
    </span>
  );
}

/**
 * The one-line governance strip under the document's title: the badge when
 * the machine surfaces decline the document, who stands behind it, when it
 * takes effect and when it is due for review.
 */
export function GovernanceMeta({
  governance,
  badge,
  replaces = [],
  markdownUrl,
}: {
  governance: DocumentGovernance;
  /** Why the machine surfaces decline this page, or null. */
  badge: LifecycleBadge | null;
  /** Documents this one replaced — derived from the record, never declared. */
  replaces?: readonly Successor[];
  /** The document's markdown twin, offered beside its governance — only where one exists. */
  markdownUrl?: string;
}): ReactElement | null {
  const { owner, effectiveFrom, staleAfter } = governance;
  const bare =
    badge === null &&
    owner === null &&
    effectiveFrom === null &&
    staleAfter === null &&
    replaces.length === 0;
  if (bare && markdownUrl === undefined) return null;

  return (
    <dl className="mb-7 flex flex-wrap items-baseline gap-x-8 gap-y-2.5 border-b border-fd-border pb-4">
      {badge === null ? null : (
        <Fact label="Status">
          <BadgeChip badge={badge} />
        </Fact>
      )}
      {owner === null ? null : <Fact label="Owner">{owner}</Fact>}
      {replaces.length === 0 ? null : (
        // The other half of a supersession. The withdrawn document names its
        // successor above the title; this is the successor naming what it
        // replaced, so the history the record kept is reachable from the
        // current document instead of only from the retired one.
        <Fact label="Replaces">
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
      {effectiveFrom === null ? null : <Fact label="Effective from">{day(effectiveFrom)}</Fact>}
      {staleAfter === null ? null : <Fact label="Review by">{day(staleAfter)}</Fact>}
      {markdownUrl === undefined ? null : (
        // On the governance row, not as a footnote below the sources: it is
        // how a reader hands this document to an agent (research/site-design.md
        // F2). Right-aligned: a column of things you DO, against a row of
        // things the record DECLARES (owner, 2026-08-22).
        <span className="ms-auto">
          <DocumentActions href={markdownUrl} />
        </span>
      )}
    </dl>
  );
}

/** An instant as a day, stamped as machine-readable only when it is a real one. */
function day(instant: string): ReactElement {
  const value = dayOf(instant);
  return isCalendarDate(value) ? <time dateTime={value}>{value}</time> : <span>{value}</span>;
}

/**
 * Where the document came from: `sources`, one entry each — that is the whole
 * point of it being a list: a footnote has to be able to point at exactly one
 * of them. Rendering them as prose would take that away.
 */
export function Provenance({
  entries,
}: {
  entries: readonly {
    readonly id: string | null;
    readonly title: string | null;
    readonly resource: string;
  }[];
}): ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <section className="mt-10 border-t border-fd-border pt-5 text-sm">
      <h2 className="ksor-section-label mb-2">Sources</h2>
      {/* break-words, because a source is often a long unbroken URL: on a
          phone it overflowed its row by 175px under an ancestor with
          `overflow-x: clip`, so the middle of the source was clipped away with
          no ellipsis and nothing to scroll (measured, 2026-08-20). A source
          nobody can read is not provenance. */}
      <ul className="space-y-1 break-words text-fd-muted-foreground">
        {entries.map((entry, index) => {
          // A resource that IS a URL becomes followable; a bundle path or a
          // scope descriptor stays text. `rel="noreferrer"` because the
          // destination is authored in the record, not chosen by this site.
          const href = sourceHref(entry.resource);
          const label = entry.title ?? entry.resource;
          return (
            // Position, not text: a record may cite the same source twice, and
            // duplicate keys are a console error on a governed page.
            <li key={`${index}-${entry.resource}`}>
              {entry.id === null ? null : (
                <span className="me-2 font-mono text-xs text-fd-muted-foreground">
                  [^{entry.id}]
                </span>
              )}
              {href === null ? (
                label
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4 transition-colors hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
                >
                  {label}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
