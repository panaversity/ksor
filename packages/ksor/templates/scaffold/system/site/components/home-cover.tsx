import Link from "next/link";
import Image, { type StaticImageData } from "next/image";
import type { ReactElement } from "react";

import { RecordArtwork } from "@/components/record-artwork";

/**
 * The cover of the record: one screen, standing alone.
 *
 * It is cover stock, one step off the page beneath it — pale in light, and in
 * the dark not white but the surface that catches the light. Every colour on it
 * is a `--ksor-cover-*` token, so the whole composition inverts with the theme
 * rather than staying dark in both, and the accent inverts with it.
 *
 * The record's own words on the left, the record drawn on the right. The
 * drawing is where this page spends its boldness; everything around it is
 * deliberately quiet.
 */
export function HomeCover({
  foot,
  mark,
  name,
  title,
  purpose,
  documents,
  firstUrl,
  firstTitle,
}: {
  mark: StaticImageData;
  name: string;
  title: string;
  purpose: string | null;
  documents: number;
  firstUrl: string;
  firstTitle: string;
  /** Signed from inside the cover, so the front door is one screen. */
  foot?: ReactElement;
}): ReactElement {
  // The cover fills the window under the navbar (measured at 56px, the shell's
  // `h-14`): a front door is the whole view, not a band with the page's
  // background showing beneath it. `dvh` rather than `vh`, so a phone's
  // collapsing browser chrome does not leave a gap at the bottom.
  return (
    <section className="relative flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[var(--ksor-cover)] text-[var(--ksor-cover-foreground)]">
      {/* A ruled ground — the ledger's own lines, not a texture. Masked to
          fade at both ends: at full strength edge to edge the rules read as
          stripes ACROSS the composition rather than as the paper under it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, currentColor 0 1px, transparent 1px 2.25rem)",
          maskImage: "linear-gradient(to bottom, transparent, black 22%, black 70%, transparent)",
        }}
      />

      {/* Centred in the space ABOVE the signature, not top-aligned with the
          slack dumped underneath: `justify-center` on the section was cancelled
          by the signature's `mt-auto`, which measured as 197px of dead space
          below the content and none above it (found live 2026-08-22). */}
      <div className="relative flex flex-1 items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-16 px-6 py-14 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <div>
            <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
              <div className="flex items-center gap-3">
                <Image
                  src={mark}
                  alt=""
                  width={30}
                  height={30}
                  priority
                  className="size-[30px] rounded ring-1 ring-[var(--ksor-cover-rule)]"
                />
                <p className="font-mono text-xs tracking-[0.18em] text-[var(--ksor-cover-muted)] uppercase">
                  System of record
                  <span aria-hidden className="mx-2 text-[var(--ksor-cover-rule)]">
                    /
                  </span>
                  <span className="normal-case">{name}</span>
                </p>
              </div>

              <h1 className="mt-8 max-w-4xl font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.02] font-semibold tracking-[-0.022em] text-balance">
                {title}
              </h1>

              {/* The accent as structure, in the token so it inverts with the
              cover. It was pinned to the dark-theme blue back when the cover
              was dark in BOTH themes; once the cover started following the
              theme that left a pale blue hairline on a pale ground, all but
              invisible in light (found live 2026-08-22). */}
              <div className="mt-7 h-0.5 w-16 bg-fd-primary" />
            </div>

            {purpose === null ? null : (
              <p className="relative mt-7 max-w-xl text-lg/[1.65] text-pretty sm:text-xl/[1.6] text-[var(--ksor-cover-muted)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 motion-safe:[animation-delay:120ms] motion-safe:[animation-fill-mode:backwards]">
                {purpose}
              </p>
            )}

            <div className="mt-9 flex flex-wrap items-center gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 motion-safe:[animation-delay:220ms] motion-safe:[animation-fill-mode:backwards]">
              {/* One primary action. It names where it lands, because a front door
              that says only "open" makes you click to find out. */}
              <Link
                href={firstUrl}
                className="group inline-flex items-center gap-2.5 rounded-md bg-fd-primary px-6 py-3.5 text-sm font-medium text-fd-primary-foreground transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring motion-reduce:transition-none"
              >
                Open the record
                <span
                  aria-hidden
                  className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                >
                  &rarr;
                </span>
              </Link>

              {/* Where the button lands, said once and quietly. Uppercase made a
              document's title shout; it is the record's word, not a label. */}
              <span className="ms-1 font-mono text-xs text-[var(--ksor-cover-muted)]">
                <span className="tracking-widest uppercase tabular-nums">
                  {documents} documents
                </span>
                <span aria-hidden className="mx-2 text-[var(--ksor-cover-rule)]">
                  ·
                </span>
                opens on {firstTitle}
              </span>
            </div>
          </div>

          {/* The illustration carries the second audience: it says the record
            projects into pages, markdown and an agent door without the page
            printing a list of addresses at a reader who will never fetch one. */}
          <div className="flex justify-center lg:justify-end lg:self-center">
            <RecordArtwork />
          </div>
        </div>
      </div>
      {foot === undefined ? null : <div className="relative pb-10">{foot}</div>}
    </section>
  );
}
