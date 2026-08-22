"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";

import { Button } from "@/components/ui/button";

/** One agent-readable surface: the address, and what a consumer gets from it. */
export interface AgentDoor {
  readonly href: string;
  readonly label: string;
  readonly note: string;
}

/** One tab of the panel: a file the build actually publishes. */
export interface RecordArtifact {
  readonly label: string;
  readonly href: string;
  readonly text: string;
  /** True when `text` is the head of a longer file. */
  readonly truncated: boolean;
}

/**
 * The front door, split into the two readings of one record.
 *
 * This is the page's thesis and its only bold move: a rule down the middle,
 * people on the left, agents on the right, both true at once. The product's
 * second principle is "one source, two surfaces" — a page that states that in
 * prose is a claim; a page built as two columns of the same record is the
 * thing itself. The right column is not an illustration either: it renders the
 * bytes `/llms.txt` and `/md/….md` actually serve.
 *
 * An earlier version put the two audiences behind a toggle. It hid half the
 * record's story behind a click, and the half it hid was the half nobody
 * expects — so the toggle went and the rule arrived.
 */
export function HomeHero({
  eyebrow,
  name,
  title,
  purpose,
  documents,
  firstUrl,
  doors,
  artifacts,
}: {
  eyebrow: string;
  name: string;
  title: string;
  purpose: string | null;
  documents: string;
  firstUrl: string;
  doors: readonly AgentDoor[];
  artifacts: readonly RecordArtifact[];
}): ReactElement {
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const shown = artifacts[tab] ?? artifacts[0];

  const copy = (): void => {
    if (shown === undefined) return;
    void navigator.clipboard.writeText(shown.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-0">
      <div className="lg:pe-14">
        <p className="font-mono text-xs tracking-[0.18em] text-fd-muted-foreground uppercase">
          {eyebrow}
          <span aria-hidden className="mx-2 text-fd-border">
            /
          </span>
          {/* The slug stays lowercase in mono: it is machine identity — what
              llms.txt names and what a citation carries — not a display name. */}
          <span className="normal-case">{name}</span>
        </p>

        <h1 className="mt-6 font-display text-[clamp(2.25rem,4.4vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.012em] text-balance">
          {title}
        </h1>

        {purpose === null ? null : (
          <p className="mt-7 max-w-xl text-lg/relaxed text-pretty text-fd-muted-foreground">
            {purpose}
          </p>
        )}

        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button asChild size="lg">
            <Link href={firstUrl} className="group">
              Open the record
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
              >
                &rarr;
              </span>
            </Link>
          </Button>
          <span className="font-mono text-xs tracking-widest text-fd-muted-foreground uppercase tabular-nums">
            {documents}
          </span>
        </div>
      </div>

      {/* The rule is the design. On a narrow screen it lies down and becomes
          the border between two stacked halves, which is the same statement. */}
      <div className="border-t border-fd-border pt-10 lg:border-t-0 lg:border-s lg:ps-14 lg:pt-0">
        <p className="font-mono text-xs tracking-[0.18em] text-fd-muted-foreground uppercase">
          For agents
        </p>

        <dl className="mt-5 space-y-2.5">
          {doors.map((door) => (
            <div key={door.label} className="flex items-baseline justify-between gap-4">
              <dt className="font-mono text-sm">
                <a
                  href={door.href}
                  className="text-fd-foreground underline-offset-4 transition-colors hover:text-fd-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
                >
                  {door.label}
                </a>
              </dt>
              <dd className="text-right text-xs text-fd-muted-foreground">{door.note}</dd>
            </div>
          ))}
        </dl>

        {shown === undefined ? null : (
          <figure className="mt-7 overflow-hidden rounded-lg border border-fd-border bg-fd-card">
            <figcaption className="flex items-center gap-1 border-b border-fd-border px-2 py-1.5">
              {artifacts.map((artifact, index) => (
                <button
                  key={artifact.label}
                  type="button"
                  onClick={() => setTab(index)}
                  aria-pressed={index === tab}
                  className={
                    "rounded px-2.5 py-1 font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring " +
                    (index === tab
                      ? "bg-fd-accent text-fd-foreground"
                      : "text-fd-muted-foreground hover:text-fd-foreground")
                  }
                >
                  {artifact.label}
                </button>
              ))}
              <button
                type="button"
                onClick={copy}
                className="ms-auto rounded px-2.5 py-1 font-mono text-xs text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
              >
                {copied ? "copied" : "copy"}
              </button>
            </figcaption>
            <pre
              className="max-h-72 overflow-auto px-4 py-3.5 font-mono text-[0.78125rem]/relaxed whitespace-pre-wrap text-fd-muted-foreground"
              /* The file is longer than the panel; it fades rather than stopping
                 mid-word, which reads as a crop somebody chose. */
              style={{
                maskImage: "linear-gradient(to bottom, black calc(100% - 2.5rem), transparent)",
              }}
            >
              {shown.text}
            </pre>
            <p className="border-t border-fd-border px-4 py-2 text-xs text-fd-muted-foreground">
              {shown.truncated ? "the first lines of " : "this is "}
              <a
                href={shown.href}
                className="font-mono underline underline-offset-4 transition-colors hover:text-fd-foreground"
              >
                {shown.label}
              </a>
              {" — served, not illustrated"}
            </p>
          </figure>
        )}
      </div>
    </div>
  );
}
