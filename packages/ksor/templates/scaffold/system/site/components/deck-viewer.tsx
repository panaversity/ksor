"use client";

import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { useCallback, useRef, useState, type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import type { DeckSlide } from "@/lib/attachments";

/**
 * A presentation the RECORD owns, rendered in the page.
 *
 * This is the mode that makes the workflow complete. An agent writes the
 * slides from the document — no browser, no third party, no human step in the
 * middle — and this draws them. Which means the deck is governed like every
 * other attachment: reviewed in a PR, versioned with its document, withdrawn
 * with it. An embedded deck is none of those things, and can rot into a dead
 * link with nothing going red.
 *
 * Every slide is in the SERVER-RENDERED HTML, not fetched and not built on
 * mount: a crawler, a reader with JavaScript off, and an agent parsing the page
 * all get the whole deck. Only the *navigation* is client-side, so what the
 * bytes carry never depends on a script running.
 */
export function DeckViewer({
  slides,
  title,
}: {
  readonly slides: readonly DeckSlide[];
  readonly title: string;
}): ReactElement {
  const [index, setIndex] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const total = slides.length;

  const go = useCallback(
    (delta: number) => setIndex((i) => Math.min(total - 1, Math.max(0, i + delta))),
    [total],
  );

  // Arrow keys, but ONLY while the deck has focus — a page-wide listener would
  // hijack arrows from the reader scrolling the document.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        go(1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        go(-1);
      }
    },
    [go],
  );

  const present = useCallback(() => {
    void frameRef.current?.requestFullscreen?.().catch(() => {
      // Fullscreen is a nicety and is refused in plenty of ordinary contexts —
      // an iframe without the permission, a browser that requires a gesture it
      // did not see. The deck stays usable inline, so this is not an error.
    });
  }, []);

  const current = slides[index];
  if (current === undefined) return <></>;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={frameRef}
        tabIndex={0}
        role="group"
        aria-roledescription="presentation"
        aria-label={`${title}, slide ${index + 1} of ${total}`}
        onKeyDown={onKeyDown}
        // `bg-fd-muted`: --card is white in the light theme, so a "surface"
        // painted with it is invisible on the page (a trap this shell has
        // sprung before).
        className="relative aspect-video w-full overflow-hidden rounded-lg border border-fd-border bg-fd-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
      >
        {slides.map((slide, i) => (
          <article
            key={slide.heading + String(i)}
            // Every slide is rendered; the inactive ones are hidden rather
            // than absent, so the whole deck is in the shipped HTML.
            hidden={i !== index}
            aria-hidden={i !== index}
            className="absolute inset-0 flex flex-col justify-center gap-5 px-[7%] py-[6%]"
          >
            <h3 className="font-(family-name:--font-display) text-2xl leading-tight font-semibold text-balance text-fd-foreground sm:text-3xl">
              {slide.heading}
            </h3>
            {slide.lead === undefined ? null : (
              <p className="max-w-[46ch] text-base text-fd-muted-foreground sm:text-lg">
                {slide.lead}
              </p>
            )}
            {slide.bullets === undefined || slide.bullets.length === 0 ? null : (
              <ul className="flex max-w-[52ch] flex-col gap-2.5">
                {slide.bullets.map((bullet, k) => (
                  <li
                    key={`${bullet}-${k}`}
                    className="border-s-2 border-fd-primary/50 ps-3 text-sm leading-relaxed text-fd-foreground sm:text-base"
                  >
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}

        <p className="absolute end-4 bottom-3 font-mono text-xs tabular-nums text-fd-muted-foreground">
          {index + 1} / {total}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => go(-1)} disabled={index === 0}>
            <ChevronLeft aria-hidden className="size-4" />
            <span className="sr-only sm:not-sr-only">Back</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => go(1)} disabled={index === total - 1}>
            <span className="sr-only sm:not-sr-only">Next</span>
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </div>

        <Button variant="ghost" size="sm" onClick={present}>
          <Maximize2 aria-hidden className="size-3.5" />
          <span className="font-mono text-xs tracking-wide uppercase">Present</span>
        </Button>
      </div>

      {current.note === undefined ? null : (
        // The presenter's note: what to SAY, never what the slide shows. Kept
        // outside the frame so it is not projected when the deck is
        // fullscreened, which is the whole point of a note.
        <p className="border-s-2 border-fd-border ps-3 text-sm text-fd-muted-foreground">
          <span className="font-mono text-xs tracking-wide uppercase">Say: </span>
          {current.note}
        </p>
      )}
    </div>
  );
}
