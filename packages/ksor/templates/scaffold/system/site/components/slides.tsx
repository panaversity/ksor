"use client";

import { ExternalLink, Presentation } from "lucide-react";
import { useState, type ReactElement } from "react";

import { DeckViewer } from "@/components/deck-viewer";
import { Button } from "@/components/ui/button";
import type { SlidesEntry } from "@/lib/attachments";

/**
 * The presentation that teaches this document.
 *
 * The predecessor embeds the deck directly — an always-on `<iframe>` to Google
 * Slides, authored as raw JSX in the lesson's MDX. Two things stop that here,
 * and the second one changed the design rather than just the authoring:
 *
 *  1. `knowledge/` is CommonMark (critical rule 2), so the frame cannot be
 *     authored in the document. It is an attachment instead.
 *
 *  2. The scaffold's browser test asserts **zero external requests** on a
 *     built page. An always-on frame breaks that on every page carrying a
 *     deck — and the guarantee is worth keeping, because it is what makes the
 *     site work offline, behind a firewall, and without telling a third party
 *     which of your policies someone is reading.
 *
 * So the frame is CLICK-TO-LOAD. Nothing reaches the provider until a reader
 * asks for it: the page ships a placeholder, and the `<iframe>` is created on
 * click. The link out is always available and costs nothing, because a plain
 * `<a>` is not a request.
 *
 * That is a real divergence from the predecessor and it is an improvement
 * rather than a compromise — the reader who only wanted the policy never
 * announces themselves to a slide host.
 */
export function Slides({ slides }: { slides: SlidesEntry }): ReactElement {
  const [loaded, setLoaded] = useState(false);
  const provider = slides.provider ?? slides.derivedProvider;

  return (
    <section aria-label="Teaching aid" className="not-prose mt-8 mb-12">
      {/* A section heading, in the record's own language for one.

          An earlier version dropped the accent bar and greyed the label, on
          the theory that anything stronger would compete with the document
          title directly above. That went too far: with no marker and no colour
          the block read as loose text rather than as a section (owner, seen
          live). The fix is the established marker at a smaller SIZE, not a
          weaker one — the label carries the accent so it reads as a marker,
          and the title sits one step below the document's. */}
      <header className="mb-6">
        <p className="ksor-section-label">Teaching aid</p>
        <h2 className="mt-2 font-(family-name:--font-display) text-2xl font-semibold tracking-tight text-fd-foreground">
          {slides.title}
        </h2>
        {/* The record's own marker for "a new region starts here": a short
            accent bar riding a full-width hairline. Every study-aid header
            uses it, so a reader has met it before. */}
        <div className="mt-3 h-px w-full bg-fd-border">
          <div className="h-[3px] w-24 -translate-y-px bg-fd-primary" />
        </div>
        {slides.description === undefined ? null : (
          <p className="mt-4 text-sm text-fd-muted-foreground">{slides.description}</p>
        )}
      </header>

      <div className="flex flex-col gap-4">
        {/* A deck the record owns needs no link and no permission: it IS the
            presentation. The linked mode below is for an adopter who already
            has one somewhere else. */}
        {slides.deck !== undefined && slides.deck.length > 0 ? (
          <DeckViewer slides={slides.deck} title={slides.title} />
        ) : null}

        {slides.url === undefined ? null : (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <a
              href={slides.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-fd-primary underline underline-offset-4 transition-colors hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
            >
              Open the full presentation
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
            {provider === undefined ? null : (
              <span className="font-mono text-xs text-fd-muted-foreground">{provider}</span>
            )}
          </p>
        )}

        {slides.embed === undefined ? null : (
          <div
            // 16:9, the aspect every deck host serves. A ratio box rather than
            // a fixed height, so the frame scales with the measure instead of
            // letterboxing on a narrow window.
            className="relative w-full overflow-hidden rounded-lg border border-fd-border bg-fd-muted"
            style={{ paddingBottom: "56.25%" }}
          >
            {loaded ? (
              <iframe
                src={slides.embed}
                title={slides.title}
                allowFullScreen
                // No referrer: the provider learns that a deck was opened, not
                // which document of this record it was opened from.
                referrerPolicy="no-referrer"
                loading="lazy"
                className="absolute inset-0 size-full"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <Presentation aria-hidden className="size-8 text-fd-muted-foreground" />
                <Button onClick={() => setLoaded(true)}>Load the slides</Button>
                <p className="max-w-sm text-xs text-fd-muted-foreground">
                  {/* Said plainly, because it is the reason for the click. */}
                  The deck is hosted{provider === undefined ? " elsewhere" : ` on ${provider}`}.
                  Nothing is requested from there until you load it.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
