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
 * The front door's hero: who the record is, and what it hands you.
 *
 * Two things here are borrowed deliberately, from AI-first documentation homes
 * read on 2026-08-22. The asymmetric hero with a live artifact beside the
 * identity is Anthropic's docs home; the humans/agents switch under the
 * sentence is Vercel's AI SDK. What makes them ours is the artifact: the panel
 * renders the record's OWN published bytes — the same `llms.txt` the route
 * serves and the same markdown twin `/md/` serves — so the front page is
 * evidence rather than a claim about evidence.
 *
 * Both audience blocks are in the markup at all times, the inactive one hidden.
 * The switch is a convenience for a reader; a crawler, a reader with no
 * JavaScript, and an agent parsing the HTML must still find every door.
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
  const [audience, setAudience] = useState<"humans" | "agents">("humans");
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
    <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
      <div>
        <p className="mb-3 flex items-center gap-2 text-xs font-medium tracking-widest text-fd-muted-foreground uppercase">
          {eyebrow}
          <span aria-hidden className="text-fd-border">
            /
          </span>
          {/* The slug in mono because it is machine identity — what llms.txt
              names and what a citation carries — not a display name. */}
          <span className="font-mono normal-case">{name}</span>
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance break-words sm:text-5xl">
          {title}
        </h1>
        {purpose === null ? null : (
          <p className="mt-5 text-lg/relaxed text-pretty text-fd-muted-foreground">{purpose}</p>
        )}

        <div className="mt-8 flex items-center gap-1 text-sm" role="group">
          {(["humans", "agents"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAudience(value)}
              aria-pressed={audience === value}
              className={
                "rounded-md px-3 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring " +
                (audience === value
                  ? "bg-fd-accent font-medium text-fd-foreground"
                  : "text-fd-muted-foreground hover:text-fd-foreground")
              }
            >
              For {value}
            </button>
          ))}
        </div>

        <div hidden={audience !== "humans"}>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
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
            <span className="text-sm tabular-nums text-fd-muted-foreground">{documents}</span>
          </div>
        </div>

        <div hidden={audience !== "agents"}>
          <dl className="mt-5 divide-y divide-fd-border border-y border-fd-border text-sm">
            {doors.map((door) => (
              <div key={door.label} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt>
                  <a
                    href={door.href}
                    className="font-mono text-fd-foreground underline-offset-4 transition-colors hover:text-fd-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
                  >
                    {door.label}
                  </a>
                </dt>
                <dd className="text-right text-xs text-fd-muted-foreground">{door.note}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {shown === undefined ? null : (
        <div className="overflow-hidden rounded-xl border border-fd-border bg-fd-card">
          <div className="flex items-center gap-1 border-b border-fd-border px-2 py-1.5">
            {artifacts.map((artifact, index) => (
              <button
                key={artifact.label}
                type="button"
                onClick={() => setTab(index)}
                aria-pressed={index === tab}
                className={
                  "rounded-md px-2.5 py-1 font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring " +
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
              className="ms-auto rounded-md px-2.5 py-1 text-xs text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="max-h-[22rem] overflow-auto px-4 py-3 font-mono text-[0.8125rem]/relaxed whitespace-pre-wrap text-fd-muted-foreground">
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
            {" — what an agent is served, not a picture of it"}
          </p>
        </div>
      )}
    </div>
  );
}
