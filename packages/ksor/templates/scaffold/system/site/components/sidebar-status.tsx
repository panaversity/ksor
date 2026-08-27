import type { ReactElement, ReactNode } from "react";

import { badgeLabel, badgeTone } from "@/lib/governance";
import type { LifecycleBadge } from "@/lib/lifecycle-rule";

/**
 * The sidebar's badge, drawn beside a row's name (`lib/source.ts` composes it
 * into the page tree while sorting it).
 *
 * The sidebar is where a reader chooses. Without this, a withdrawn document and
 * the one that replaced it were pixel-identical rows — the governance appeared
 * only after the click, which is the moment it is least useful
 * (research/site-design.md F3).
 *
 * Only a BADGE is drawn — a state the machine surfaces decline (record spec
 * §2.5). A current document shows nothing, because a reader already assumes a
 * document in the record is current and a label that never varies stops being
 * read; the marker stays rare enough to be noticed on the rows where it matters.
 */
export function renderBadge(name: ReactNode, badge: LifecycleBadge): ReactElement {
  // `inline-block` with the row's own wrapping, not a flex wrapper: the badge
  // has to survive beside a title that runs two lines in a ~200px column. An
  // earlier hand-rolled version pinned the chip right with `truncate`, which
  // clipped the title AND the chip to "sup…" (seen in Chromium, 2026-08-21) —
  // the marker has to fit around the name, not fight it.
  return (
    <>
      {name}
      <span
        className={`ms-1.5 inline-block rounded border border-fd-border px-1 py-px align-middle text-[0.6rem] font-medium whitespace-nowrap text-fd-muted-foreground ${badgeTone(badge)}`}
      >
        {badgeLabel(badge)}
      </span>
    </>
  );
}
