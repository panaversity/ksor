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
 *
 * The stage is dark in both themes (`.ksor-stage`, app/global.css). A slide is
 * a PROJECTION and the page around it is a document; looking like the first
 * thing while sitting inside the second is most of what makes a deck legible
 * at a glance. The first version painted it `--muted` and it read as an empty
 * placeholder — pale grey on a pale page, saying nothing.
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
        className="ksor-stage relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--ksor-stage-rule)] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_12px_28px_-12px_rgba(0,0,0,0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
      >
        {/* The deck's own rule across the top: a slide theme in one line, and
            the thing that stops the stage reading as a plain dark rectangle. */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-fd-primary" />

        {slides.map((slide, i) => (
          <article
            key={slide.heading + String(i)}
            // Every slide is rendered; the inactive ones are hidden rather
            // than absent, so the whole deck is in the shipped HTML.
            hidden={i !== index}
            aria-hidden={i !== index}
            className="absolute inset-0 flex flex-col justify-center gap-6 px-[8%] pt-[8%] pb-[13%]"
          >
            <h3 className="font-(family-name:--font-display) text-[clamp(1.35rem,3.1vw,2.1rem)] leading-[1.15] font-semibold tracking-tight text-balance">
              {slide.heading}
            </h3>
            {slide.lead === undefined ? null : (
              <p className="ksor-stage-dim max-w-[42ch] text-[clamp(0.9rem,1.5vw,1.1rem)] leading-relaxed">
                {slide.lead}
              </p>
            )}
            {slide.bullets === undefined || slide.bullets.length === 0 ? null : (
              <ul className="flex max-w-[48ch] flex-col gap-3">
                {slide.bullets.map((bullet, k) => (
                  <li
                    key={`${bullet}-${k}`}
                    className="flex gap-3 text-[clamp(0.85rem,1.4vw,1rem)] leading-snug"
                  >
                    {/* A square tick in the accent rather than a disc: it reads
                        at projection distance, where a bullet dot disappears. */}
                    <span
                      aria-hidden
                      className="mt-[0.45em] size-[0.42em] shrink-0 rounded-[1px] bg-fd-primary"
                    />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}

        {/* The stage's own footer: the deck's name and the position, in mono,
            the way a real deck carries its identity on every slide. */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 px-[8%] pb-[4%]">
          <p className="ksor-stage-dim truncate font-mono text-[0.68rem] tracking-wide uppercase">
            {title}
          </p>
          <p className="ksor-stage-dim shrink-0 font-mono text-[0.68rem] tabular-nums">
            {index + 1} / {total}
          </p>
        </div>

        {/* How far through the deck, drawn on the stage itself so it survives
            fullscreen — where the controls below are not on screen at all. */}
        <div aria-hidden className="ksor-stage-rule absolute inset-x-0 bottom-0 h-[2px]">
          <div
            className="h-full bg-fd-primary transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
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

        {/* Jump to any slide. Dots rather than a list, because a deck this
            size is scanned rather than read, and they double as the shape of
            how much is left. */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {slides.map((slide, i) => (
            <button
              key={`dot-${slide.heading}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Slide ${i + 1}: ${slide.heading}`}
              aria-current={i === index ? "true" : undefined}
              className={`h-1.5 rounded-full transition-all motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring ${
                i === index
                  ? "w-5 bg-fd-primary"
                  : "w-1.5 bg-fd-border hover:bg-fd-muted-foreground"
              }`}
            />
          ))}
        </div>

        <Button variant="ghost" size="sm" onClick={present}>
          <Maximize2 aria-hidden className="size-3.5" />
          <span className="font-mono text-xs tracking-wide uppercase">Present</span>
        </Button>
      </div>

      {current.note === undefined ? null : (
        // The presenter's note: what to SAY, never what the slide shows. Kept
        // outside the stage so it is not projected when the deck is
        // fullscreened, which is the whole point of a note.
        <p className="border-s-2 border-fd-border ps-3 text-sm text-fd-muted-foreground">
          <span className="font-mono text-xs tracking-wide uppercase">Say: </span>
          {current.note}
        </p>
      )}
    </div>
  );
}
