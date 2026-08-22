import type { ReactNode } from "react";

import { statusTone } from "@/lib/governance";

/**
 * A sidebar row, with the document's status when the status is a caveat.
 *
 * The sidebar is where a reader chooses. Without this, a withdrawn document and
 * the one that replaced it were pixel-identical rows — the governance appeared
 * only after the click, which is the moment it is least useful
 * (research/site-design.md F3).
 *
 * The page tree's `name` is a ReactNode, so this needs no client component and
 * no override of the shell's internals: the decoration is applied where the
 * tree is built, and it server-renders like every other governance fact.
 */
export function withStatus(name: ReactNode, status: string | null): ReactNode {
  if (status === null) return name;
  // Wraps rather than truncates: the sidebar column is ~200px and titles
  // routinely run two lines there. A first attempt pinned the chip right with
  // `truncate`, which clipped both the title AND the chip to "sup…" (seen in
  // Chromium, 2026-08-21) — the marker has to fit around the name, not fight it.
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span>{name}</span>
      <span
        className={`rounded border border-fd-border px-1 py-px text-[0.6rem] font-medium text-fd-muted-foreground ${statusTone(status)}`}
      >
        {status}
      </span>
    </span>
  );
}
