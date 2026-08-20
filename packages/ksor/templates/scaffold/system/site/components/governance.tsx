import Link from "next/link";
import type { ReactElement } from "react";

import type { DocumentGovernance } from "@/lib/governance";

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
      role="note"
      className="mb-8 rounded-lg border border-fd-border bg-fd-muted/40 px-4 py-3 text-sm"
    >
      <p className="font-medium text-fd-foreground">Superseded</p>
      <p className="mt-1 text-fd-muted-foreground">
        This document has been replaced by{" "}
        {successor.href === null ? (
          <code className="text-fd-foreground">{successor.label}</code>
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
    <div className="flex items-baseline gap-1.5">
      <dt className="text-fd-muted-foreground">{label}</dt>
      <dd className="text-fd-foreground">{children}</dd>
    </div>
  );
}

/**
 * A document in a system of record is ASSUMED current and approved, so saying
 * "approved" tells the reader nothing they had not already assumed. Only a
 * caveat earns the space: draft and review say this is not settled yet,
 * superseded says stop trusting it.
 *
 * This keeps the chip rare enough to be read. A label on every page that
 * always says the same thing trains the reader to skip it — and then it is
 * skipped on the page where it mattered. It also keeps a level-0 record (where
 * every document is `draft`) from wearing governance furniture it has not
 * climbed to yet.
 *
 * A presentation rule, deliberately here and not in readGovernance: the
 * projection reports what the record says, and the page decides what is worth
 * showing.
 */
const ASSUMED_STATUS = "approved";

/**
 * The one-line governance strip under the document's title: any caveat on its
 * status, who stands behind it, and when it took effect.
 */
export function GovernanceMeta({
  governance,
}: {
  governance: DocumentGovernance;
}): ReactElement | null {
  const { owner, effective } = governance;
  const status = governance.status === ASSUMED_STATUS ? null : governance.status;
  if (status === null && owner === null && effective === null) return null;

  return (
    <dl className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-fd-border pb-4 text-xs">
      {status === null ? null : (
        <Fact label="Status">
          <span className="rounded border border-fd-border px-1.5 py-0.5 font-medium">
            {status}
          </span>
        </Fact>
      )}
      {owner === null ? null : <Fact label="Owner">{owner}</Fact>}
      {effective === null ? null : (
        <Fact label="Effective">
          <time dateTime={effective}>{effective}</time>
        </Fact>
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
      <h2 className="mb-2 text-xs font-medium uppercase tracking-widest text-fd-muted-foreground">
        Sources
      </h2>
      <ul className="space-y-1 text-fd-muted-foreground">
        {entries.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
    </section>
  );
}
