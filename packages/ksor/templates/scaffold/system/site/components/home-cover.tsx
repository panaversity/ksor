import Link from "next/link";
import Image, { type StaticImageData } from "next/image";
import type { ReactElement } from "react";

import { RecordArtwork } from "@/components/record-artwork";

/**
 * The cover of the record, and the record opening.
 *
 * The band is cover stock; the page below it is paper. In light the cover is
 * ink on white; in the dark it does not become white — it becomes the surface
 * that catches the light, one step ABOVE the page. Same object, lit from the
 * same side, which is why the accent rule and the panel keep their colours in
 * both themes: on a cover that is always dark, the dark-theme accent is the
 * legible one.
 *
 * The panel slides out from under the cover onto the paper. That overlap is the
 * whole idea — the record crossing from the audience that reads pages to the
 * one that reads bytes — and it is the only place this page spends boldness.
 */
export function HomeCover({
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
}): ReactElement {
  return (
    <section className="relative flex min-h-[72vh] items-center bg-[var(--ksor-cover)] text-[var(--ksor-cover-foreground)]">
      {/* A ruled ground — the ledger's own lines, not a texture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, currentColor 0 1px, transparent 1px 2.25rem)",
        }}
      />

      <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-6 pt-20 pb-28 sm:pt-28 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
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

            <h1 className="mt-9 max-w-4xl font-display text-[clamp(2.75rem,6vw,4.75rem)] leading-[0.99] font-semibold tracking-[-0.02em] text-balance">
              {title}
            </h1>

            {/* The accent as structure. #7fb0f9 rather than the token: the cover
              is dark in both themes, so it takes the dark-theme accent. */}
            <div className="mt-8 h-px w-20 bg-[#7fb0f9]" />
          </div>

          {purpose === null ? null : (
            <p className="relative mt-8 max-w-2xl text-lg/relaxed text-pretty text-[var(--ksor-cover-muted)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 motion-safe:[animation-delay:120ms] motion-safe:[animation-fill-mode:backwards]">
              {purpose}
            </p>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 motion-safe:[animation-delay:220ms] motion-safe:[animation-fill-mode:backwards]">
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
              <span className="tracking-widest uppercase tabular-nums">{documents} documents</span>
              <span aria-hidden className="mx-2 text-[var(--ksor-cover-rule)]">
                ·
              </span>
              opens on {firstTitle}
            </span>
          </div>
        </div>

        {/* The illustration, not a second list: the record's index is already
            visible in the panel below, as the bytes an agent is served. */}
        <div className="flex justify-center lg:justify-end lg:self-center">
          <RecordArtwork />
        </div>
      </div>
    </section>
  );
}
