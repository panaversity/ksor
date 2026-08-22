"use client";

import type { TOCItemType } from "fumadocs-core/toc";
import { createContext, use, useEffect, useState, type ReactElement, type ReactNode } from "react";

/**
 * The document's headings, handed down from the page.
 *
 * A slot is a component TYPE, not an element, so the page cannot close over its
 * own `toc` when it names one — a function cannot cross the server/client
 * boundary. Reading the items from the shell's observer context instead would
 * cost the server render: that context is filled in an effect, so the exported
 * HTML would ship an empty rail where it currently ships every anchor. A
 * context of our own, given serializable items by the server, keeps both.
 */
const TocItemsContext = createContext<readonly TOCItemType[]>([]);

export function TocItems({
  items,
  children,
}: {
  items: readonly TOCItemType[];
  children: ReactNode;
}): ReactElement {
  return <TocItemsContext value={items}>{children}</TocItemsContext>;
}

/**
 * "On this page", tracking where the reader actually is.
 *
 * The shell's own rail marks a heading active when 90% of it is visible
 * ANYWHERE in the viewport (`AnchorProvider` watches with `{ threshold: 0.9 }`
 * and no `rootMargin`), and then highlights whichever became active most
 * recently. On a long page that reads fine. On a governed record it does not:
 * these documents are short-sectioned, so several headings sit on screen at
 * once and the one entering from the BOTTOM wins — the marker ran two to four
 * headings ahead of the reader (measured 2026-08-22: reading "owner" while the
 * rail marked "description").
 *
 * The observer options are not configurable and the observer itself is not
 * exported, so the selection cannot be corrected from outside — only replaced.
 * This is the supported seam for that: `DocsPage`'s `slots.toc.main`. The
 * shell's provider and its small-screen popover are kept exactly as they are;
 * only the rail's choice of "here" is ours.
 *
 * The rule: the active heading is the LAST one whose top has passed the reading
 * line — which is what a person means by "the section I am in". Nothing below
 * the line can be it, however visible it is.
 */
export function RecordToc(): ReactElement | null {
  const items = use(TocItemsContext);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    const ids = items.map((item) => item.url.slice(1));

    // Scroll position, not intersection: a heading is "here" once it has passed
    // the reading line, and stays here until the next one does. An observer
    // answers "is it visible", which is a different question and the reason the
    // shell's rail runs ahead.
    const READING_LINE = 140;
    let frame = 0;
    const measure = (): void => {
      frame = 0;
      let current: string | null = null;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element === null) continue;
        if (element.getBoundingClientRect().top <= READING_LINE) current = id;
      }
      // Before the first heading passes the line the reader is in the lead
      // paragraphs, which belong to the first section — highlighting nothing
      // there reads as broken rather than as honest.
      setActiveId(current ?? ids[0] ?? null);
    };
    const onScroll = (): void => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);

  if (items.length === 0) return null;

  // The shallowest heading in THIS document is the left edge, so a document
  // whose sections start at h3 does not render its whole rail indented.
  const top = Math.min(...items.map((item) => item.depth));

  return (
    // The container is the shell's own, copied verbatim: it carries the grid
    // area, the rail width and the `max-xl:hidden` that hands small screens to
    // the popover. Replacing a slot means supplying what the slot supplied —
    // a first version rendered only the list and the rail escaped its column,
    // laying 1156px wide across the page (found live, 2026-08-22).
    <div
      id="nd-toc"
      className="sticky top-(--fd-docs-row-1) flex h-[calc(var(--fd-docs-height)-var(--fd-docs-row-1))] w-(--fd-toc-width) flex-col [grid-area:toc] pt-12 pe-4 pb-2 max-xl:hidden xl:layout:[--fd-toc-width:268px]"
    >
      <p className="mb-3 ps-4 font-mono text-[0.6875rem] tracking-[0.16em] text-fd-muted-foreground uppercase">
        On this page
      </p>
      <nav aria-label="On this page" className="flex flex-col overflow-y-auto text-sm">
        {items.map((item) => {
          const id = item.url.slice(1);
          const here = id === activeId;
          return (
            <a
              key={item.url}
              href={item.url}
              // The bar IS the border, so it cannot drift from the row it
              // marks — the shell drew it as a separately positioned track.
              className={`border-s-2 py-1.5 pe-2 transition-colors ${
                here
                  ? "border-fd-primary text-fd-primary"
                  : "border-fd-border text-fd-muted-foreground hover:text-fd-foreground"
              }`}
              style={{ paddingInlineStart: `${(item.depth - top) * 0.75 + 1}rem` }}
              aria-current={here ? "location" : undefined}
            >
              {item.title}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
