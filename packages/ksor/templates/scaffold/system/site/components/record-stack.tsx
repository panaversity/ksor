import Link from "next/link";
import type { ReactElement } from "react";

import { badgeLabel, badgeTone } from "@/lib/governance";
import type { LifecycleBadge } from "@/lib/lifecycle-rule";
import type { RecordEntry } from "@/lib/source";

/**
 * The record on the cover, as a body of documents rather than a diagram of one.
 *
 * The front door used to carry an illustration of the product's claim — one
 * governed source projecting into its surfaces. Four of them were drawn and all
 * four were rejected (owner, 2026-08-22), and the reason is worth keeping: a
 * stock drawing is the ONE thing on this page that can never be true of the
 * adopter's corpus. Every KSoR would ship the identical picture, and it would
 * say nothing about the record behind it.
 *
 * So the picture is made of the record. The document `Open the record` opens
 * leads, fully set — its own title, its own words, its own governance — and the
 * record's next entries stand behind it with depth. A record of one document
 * and a record of two hundred therefore get visibly different front doors,
 * which is the point: what is on the cover is what is in the volume.
 *
 * Nothing here is authored (scaffolded AGENTS.md, critical rule 1): every
 * string is a title, description, owner or status the record declares, or a UI
 * label. The depth is CSS, so it costs no image and follows the theme.
 */
export function RecordStack({
  lead,
  behind,
  documents,
}: {
  /** The document `Open the record` lands on. */
  lead: RecordEntry;
  /** The entries standing behind it — at most three; the rest are counted. */
  behind: readonly RecordEntry[];
  /** Every document in the record, for the line beneath the stack. */
  documents: number;
}): ReactElement {
  // An owner is a governance fact, so it is null with `site.governance: false`;
  // a leaf holds nothing, so its count is 0. With neither, the footer rule
  // would be an empty bar across the card — the same defect the sidebar's
  // theme switch shipped with, so it is not drawn at all.
  const footed = lead.owner !== null || lead.documents > 0;

  return (
    <div className="w-full max-w-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700 motion-safe:[animation-delay:180ms] motion-safe:[animation-fill-mode:backwards]">
      <Link
        href={lead.url}
        className="group relative z-30 block rounded-xl border border-[var(--ksor-cover-panel-rule)] bg-[var(--ksor-cover-panel)] p-7 shadow-[0_28px_60px_-32px_rgb(15_23_42/0.55)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring motion-reduce:transition-none"
      >
        <div className="flex items-baseline justify-between gap-4">
          {/* The one label that ties this card to the button beside it. */}
          <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--ksor-cover-muted)] uppercase">
            Opens here
          </span>
          {lead.badge === null ? null : <StatusChip badge={lead.badge} />}
        </div>

        <h2 className="mt-4 font-display text-2xl leading-snug font-semibold tracking-[-0.008em] transition-colors group-hover:text-fd-primary">
          {lead.title}
        </h2>

        {lead.description === null ? null : (
          <p className="mt-3 text-sm/relaxed text-pretty text-[var(--ksor-cover-muted)]">
            {lead.description}
          </p>
        )}

        {!footed ? null : (
          <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-[var(--ksor-cover-panel-rule)] pt-4 font-mono text-[11px] text-[var(--ksor-cover-muted)]">
            <span>{lead.owner ?? ""}</span>
            {lead.documents === 0 ? null : (
              <span className="tracking-wider uppercase tabular-nums">
                {`${lead.documents} ${lead.documents === 1 ? "doc" : "docs"}`}
              </span>
            )}
          </div>
        )}
      </Link>

      {/* The volume it sits on. Painted in DOM order, so each card would cover
          the one before it — the z-index descends to put them BEHIND. */}
      {behind.map((entry, index) => (
        <Link
          key={entry.url}
          href={entry.url}
          className="group relative -mt-4 block rounded-xl border border-[var(--ksor-cover-panel-rule)] bg-[var(--ksor-cover-panel)] px-7 pt-6 pb-4 shadow-[0_18px_40px_-30px_rgb(15_23_42/0.5)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring motion-reduce:transition-none"
          style={{
            zIndex: 20 - index * 10,
            transform: `scale(${1 - (index + 1) * 0.028})`,
            opacity: 1 - index * 0.13,
          }}
        >
          <span className="flex items-baseline justify-between gap-4">
            <span className="truncate font-display text-base font-medium transition-colors group-hover:text-fd-primary">
              {entry.title}
            </span>
            <span className="flex shrink-0 items-baseline gap-2 font-mono text-[10px] tracking-widest text-[var(--ksor-cover-muted)] uppercase tabular-nums">
              {entry.documents === 0
                ? null
                : `${entry.documents} ${entry.documents === 1 ? "doc" : "docs"}`}
              {entry.badge === null ? null : <StatusChip badge={entry.badge} />}
            </span>
          </span>
        </Link>
      ))}

      {/* Rendered from one template literal, not `{documents} documents`:
          React splits an interpolation with a comment node, so the split form
          ships as `3<!-- --> documents` and no assertion can ever match it. */}
      <p className="mt-6 text-center font-mono text-[11px] tracking-[0.18em] text-[var(--ksor-cover-muted)] uppercase">
        {`${documents} ${documents === 1 ? "document" : "documents"} in the record`}
      </p>
    </div>
  );
}

/**
 * A caveat status, in the same chip the record's listings use — only ever
 * `draft`, `review` or `superseded`, because a reader already assumes a
 * document in the record is current.
 */
function StatusChip({ badge }: { badge: LifecycleBadge }): ReactElement {
  return (
    <span
      className={`rounded-sm border border-[var(--ksor-cover-rule)] px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-[var(--ksor-cover-foreground)] uppercase ${badgeTone(badge)}`}
    >
      {badgeLabel(badge)}
    </span>
  );
}
