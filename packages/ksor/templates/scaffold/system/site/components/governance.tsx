import Link from "next/link";

import { DocumentActions } from "@/components/document-actions";
import { Clock } from "lucide-react";
import type { ReactElement } from "react";

import { displayActor } from "@/lib/actor-display";
import {
  badgeAddsToStatus,
  badgeText,
  badgeTone,
  dayOf,
  isCalendarDate,
  plainBadge,
  sourceHref,
  statusLabel,
  statusTone,
  trustSignal,
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

/** One chip: a word the record says about this document, in the register's voice. */
function Chip({ text, tone = "" }: { text: string; tone?: string }): ReactElement {
  return (
    <span
      className={`rounded-sm border border-fd-border px-1.5 py-0.5 tracking-widest whitespace-nowrap uppercase ${tone}`}
    >
      {text}
    </span>
  );
}

/** The chip a badge wears, in every listing and on the page. */
export function BadgeChip({
  badge,
  effectiveFrom = null,
}: {
  badge: LifecycleBadge;
  /** `ksor.effective_from`, which fills record spec §2.5's "effective from …". */
  effectiveFrom?: string | null;
}): ReactElement {
  return <Chip text={badgeText(badge, effectiveFrom) ?? ""} tone={badgeTone(badge)} />;
}

/**
 * The lifecycle caveat ALONE, for a page with no governance strip under its
 * title — a record whose `site.governance` is off.
 *
 * That key turns off attribution, not caveats: the deprecation notice has
 * always survived it, and the sidebar row, the folder card and the search
 * result for this same document carry their badge whatever it says. The rule
 * for which states reach here is `plainBadge`, beside the vocabulary itself.
 *
 * Typed like the strip's own values (mono, 13px), because a badge is the
 * record speaking about a document and that is the voice it speaks in
 * everywhere else.
 */
export function LifecycleCaveat({
  badge,
  effectiveFrom = null,
}: {
  badge: LifecycleBadge | null;
  effectiveFrom?: string | null;
}): ReactElement | null {
  const caveat = plainBadge(badge);
  if (caveat === null) return null;
  return (
    <div className="mb-7 font-mono text-[0.8125rem] font-medium text-fd-foreground">
      <BadgeChip badge={caveat} effectiveFrom={effectiveFrom} />
    </div>
  );
}

/**
 * The one-line governance strip under the document's title: what the record
 * says about this document, and who said it.
 *
 * Two kinds of thing sit here and they are drawn differently on purpose. The
 * CHIPS are states — the lifecycle status, and the date badge when the calendar
 * keeps an otherwise current document off the machine surfaces (record spec
 * §2.5) — and the FACTS are attributions: who owns it, who approved it, who
 * verified it and when. A reader deciding whether to act on a document needs
 * both halves, and the predecessor's failure was showing neither.
 */
export function GovernanceMeta({
  governance,
  badge,
  replaces = [],
  markdownUrl,
  minutes,
}: {
  governance: DocumentGovernance;
  /** Why the machine surfaces decline this page, or null. */
  badge: LifecycleBadge | null;
  /** Documents this one replaced — derived from the record, never declared. */
  replaces?: readonly Successor[];
  /** The document's markdown twin, offered beside its governance — only where one exists. */
  markdownUrl?: string;
  /**
   * How long the document takes to read, when this row is the only place for
   * it — a document with a summary shows it on that view's own strip instead,
   * because there the number belongs to the view you picked.
   */
  minutes?: number;
}): ReactElement {
  const { status, owner, effectiveFrom, staleAfter, approval, deprecated } = governance;
  const state = statusLabel(status);
  // The badge is a SECOND chip only where it says something the status does
  // not: `draft` and `deprecated` are both words, and printing either twice
  // reads as two facts about one document.
  const alsoBadge = badgeAddsToStatus(badge, status) ? badge : null;
  const trust = trustSignal(governance.verified);
  // …and where the badge carries the date, the fact beside it would repeat it.
  const showEffective = effectiveFrom !== null && alsoBadge !== "effective-from";

  // There is no "nothing to show" case any more: every concept has a trust
  // tier, `unverified` included, and that is the whole point of printing it.
  // The early return this replaced would have hidden the tier on exactly the
  // documents whose tier is the only governance fact they have.
  /**
   * TWO TIERS, because the row's length was never its vocabulary.
   *
   * Measured on the starter's own document: 79 characters, of which the
   * APPROVER is 32 (41%) and the three labels 19 (24%). One producer id was
   * longer than both governance chips together, so the two facts a reader
   * scans for — what state is this in, and has anyone checked it — competed
   * with a string that means nothing to them, and Export was pushed onto a
   * line of its own.
   *
   * So the chips lead and the provenance follows beneath them. Nothing is
   * hidden: decision 21 says a governance act NAMES its actor and decision
   * 27's starter revision requires a non-human approver to be DISCLOSED, so
   * demoting `ksor.approval` to a hover would trade a governance guarantee
   * for a tidier row (critical rule 1). It is one line lower, not one click
   * away, and every byte of it is still in the server-rendered markup an
   * agent parses.
   */
  return (
    <div className="mb-7 border-b border-fd-border pb-4">
      <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-2.5">
        {state === null && alsoBadge === null ? null : (
          <Fact label="Status">
            <span className="flex flex-wrap items-baseline gap-1.5">
              {state === null ? null : <Chip text={state} tone={statusTone(status)} />}
              {alsoBadge === null ? null : (
                <BadgeChip badge={alsoBadge} effectiveFrom={effectiveFrom} />
              )}
            </span>
          </Fact>
        )}
        {/* The tier OKF's own vocabulary names, on every document including the
          unverified ones — that is the honest state of a stable, approved
          concept nobody has reviewed, and hiding it would leave a reader unable
          to tell "checked" from "never mentioned" (research/okf-native.md
          §1.1). Never a colour: a tier is a fact about review, not a warning. */}
        <Fact label="Trust">
          <span className="flex flex-wrap items-baseline gap-1.5">
            <Chip text={trust.tier} />
            {trust.by === null ? null : (
              <span className="font-normal text-fd-muted-foreground">
                {displayActor(trust.by)}
                {trust.at === null ? null : <> · {day(trust.at)}</>}
              </span>
            )}
          </span>
        </Fact>
        {/* Actions ride tier ONE: a reader who wants the bytes wants them
          immediately, and this is the row with room. */}
        {markdownUrl === undefined && minutes === undefined ? null : (
          <div className="ms-auto flex items-center gap-x-6">
            {markdownUrl === undefined ? null : <DocumentActions href={markdownUrl} />}
            {minutes === undefined ? null : (
              <div className="flex items-center gap-2 text-sm text-fd-muted-foreground">
                <Clock aria-hidden className="size-3.5 shrink-0" />
                <span>{minutes} min read</span>
              </div>
            )}
          </div>
        )}
      </dl>
      {/* Tier two RECEDES. It is provenance — who let this in, when it takes
          effect, what it replaced — and it is read when a reader goes looking,
          not scanned. At full `--foreground` weight it competed with the two
          chips above it for the same attention, which is what made a producer
          id the loudest thing on the page.

          Links keep full strength: `Replaces` points at the document this one
          superseded, and that is an action rather than a fact. */}
      <dl className="mt-2.5 flex flex-wrap items-baseline gap-x-8 gap-y-2.5 empty:mt-0 [&_a]:text-fd-foreground [&_dd]:font-normal [&_dd]:text-fd-muted-foreground">
        {owner === null ? null : <Fact label="Owner">{displayActor(owner)}</Fact>}
        {/* Who let this into the record. `ksor.approval` is what makes a `stable`
          document stable at all (record spec §2.2), so a page that showed the
          word and not the signature would be publishing the claim without its
          author. */}
        {approval === null ? null : (
          <Fact label="Approved">
            <>
              {displayActor(approval.by)} · {day(approval.at)}
            </>
          </Fact>
        )}
        {/* found live 2026-08-25: a deprecated page named its successor and said
          nothing about WHO withdrew it, though `ksor.deprecated` is required on
          every deprecated concept (record spec §2.2) and readGovernance already
          refuses a document that omits it. Withdrawal is the most consequential
          act in a document's life; publishing it unattributed is exactly the
          gap the approver fact above closes at the other end. */}
        {deprecated === null ? null : (
          <Fact label="Withdrawn">
            <>
              {displayActor(deprecated.by)} · {day(deprecated.at)}
            </>
          </Fact>
        )}
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
        {effectiveFrom === null || !showEffective ? null : (
          <Fact label="Effective from">{day(effectiveFrom)}</Fact>
        )}
        {staleAfter === null ? null : <Fact label="Review by">{day(staleAfter)}</Fact>}
      </dl>
    </div>
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
