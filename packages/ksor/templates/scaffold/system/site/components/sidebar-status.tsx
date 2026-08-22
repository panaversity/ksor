import type { ReactElement } from "react";

import { caveatStatus, statusTone } from "@/lib/governance";

/**
 * The sidebar's status marker, rendered by the shell's own status-badges
 * plugin (`lib/source.ts`).
 *
 * The sidebar is where a reader chooses. Without this, a withdrawn document and
 * the one that replaced it were pixel-identical rows — the governance appeared
 * only after the click, which is the moment it is least useful
 * (research/site-design.md F3).
 *
 * Only a CAVEAT is drawn. `approved` returns null, because a reader already
 * assumes a document in the record is current and a label that never varies
 * stops being read — so the marker stays rare enough to be noticed on the rows
 * where it matters. That rule is ours; the walk over the tree is the shell's.
 */
export function renderCaveatBadge(status: string): ReactElement | null {
  const caveat = caveatStatus(status);
  if (caveat === null) return null;
  // `inline-block` with the row's own wrapping, not a flex wrapper: the plugin
  // composes `<>{name}{badge}</>` with no element around the pair, so the badge
  // has to survive beside a title that runs two lines in a ~200px column. An
  // earlier hand-rolled version pinned the chip right with `truncate`, which
  // clipped the title AND the chip to "sup…" (seen in Chromium, 2026-08-21) —
  // the marker has to fit around the name, not fight it.
  return (
    <span
      className={`ms-1.5 inline-block rounded border border-fd-border px-1 py-px align-middle text-[0.6rem] font-medium whitespace-nowrap text-fd-muted-foreground ${statusTone(caveat)}`}
    >
      {caveat}
    </span>
  );
}
