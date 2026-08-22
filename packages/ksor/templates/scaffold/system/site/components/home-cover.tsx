"use client";

import Link from "next/link";
import Image, { type StaticImageData } from "next/image";
import { useState, type ReactElement } from "react";
import { useSearchContext } from "fumadocs-ui/contexts/search";

import { RecordArtwork } from "@/components/record-artwork";

/** One tab of the panel: a file the build actually publishes. */
export interface RecordArtifact {
  readonly label: string;
  readonly href: string;
  readonly text: string;
  /** True when `text` is the head of a longer file. */
  readonly truncated: boolean;
}

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
  artifacts,
}: {
  mark: StaticImageData;
  name: string;
  title: string;
  purpose: string | null;
  documents: number;
  firstUrl: string;
  firstTitle: string;
  artifacts: readonly RecordArtifact[];
}): ReactElement {
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const search = useSearchContext();
  const shown = artifacts[tab] ?? artifacts[0];

  const copy = (): void => {
    if (shown === undefined) return;
    void navigator.clipboard.writeText(shown.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <section className="relative bg-[var(--ksor-cover)] text-[var(--ksor-cover-foreground)]">
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

            {/* The second way in. A record is as often searched as browsed, and
              the navbar's field is 1100px away from the eye at this moment. */}
            {search.enabled ? (
              <button
                type="button"
                onClick={() => search.setOpenSearch(true)}
                className="inline-flex items-center gap-2.5 rounded-md border border-[var(--ksor-cover-rule)] px-5 py-3.5 text-sm text-[var(--ksor-cover-foreground)] transition-colors hover:bg-[var(--ksor-cover-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
              >
                Search the record
                <kbd className="rounded border border-[var(--ksor-cover-rule)] px-1.5 py-0.5 font-mono text-[0.6875rem] text-[var(--ksor-cover-muted)]">
                  ⌘K
                </kbd>
              </button>
            ) : null}

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

      {/* The panel slides out from under the cover. */}
      <div className="relative mx-auto -mb-24 w-full max-w-6xl px-6">
        <figure className="overflow-hidden rounded-xl border border-[var(--ksor-cover-panel-rule)] bg-[var(--ksor-cover-panel)] shadow-[0_18px_50px_-24px_rgba(0,0,0,0.35)]">
          <figcaption className="flex items-center gap-1 border-b border-[var(--ksor-cover-panel-rule)] px-2.5 py-2">
            {artifacts.map((artifact, index) => (
              <button
                key={artifact.label}
                type="button"
                onClick={() => setTab(index)}
                aria-pressed={index === tab}
                className={
                  "rounded px-2.5 py-1 font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring " +
                  (index === tab
                    ? "bg-fd-accent text-[var(--ksor-cover-foreground)]"
                    : "text-[var(--ksor-cover-muted)] hover:text-[var(--ksor-cover-foreground)]")
                }
              >
                {artifact.label}
              </button>
            ))}
            <button
              type="button"
              onClick={copy}
              className="ms-auto rounded px-2.5 py-1 font-mono text-xs text-[var(--ksor-cover-muted)] transition-colors hover:text-[var(--ksor-cover-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
            >
              {copied ? "copied" : "copy"}
            </button>
          </figcaption>

          {shown === undefined ? null : (
            <pre
              className="max-h-64 overflow-hidden px-5 py-4 font-mono text-[0.78125rem]/relaxed whitespace-pre-wrap text-[var(--ksor-cover-muted)]"
              style={{
                maskImage: "linear-gradient(to bottom, black calc(100% - 3rem), transparent)",
              }}
            >
              {shown.text}
            </pre>
          )}

          {/* Says what the panel is, without becoming a link: the addresses
              came off this page (owner, 2026-08-22). The doors are still
              published — `/llms.txt` sits where every agent looks for it, and
              every document page advertises its markdown twin — they are just
              not furniture on the front door. */}
          {shown === undefined ? null : (
            <p className="border-t border-[var(--ksor-cover-panel-rule)] px-5 py-2.5 font-mono text-[0.6875rem] tracking-wider text-[var(--ksor-cover-muted)] uppercase">
              {shown.truncated
                ? "the first lines of what an agent is served"
                : "what an agent is served"}
            </p>
          )}
        </figure>
      </div>
    </section>
  );
}
