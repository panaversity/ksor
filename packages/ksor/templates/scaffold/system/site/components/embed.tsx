"use client";

import { ExternalLink, Play } from "lucide-react";
import { useState, type ReactElement } from "react";

import { Button } from "@/components/ui/button";

/**
 * An interactive page the document points at.
 *
 * Authored as an ordinary link (see lib/embed-rule.ts); rendered here as a
 * frame the reader loads by asking. The click is not politeness — the
 * scaffold's browser test asserts ZERO external requests on a built page, and
 * that guarantee is what makes this record work offline, behind a firewall,
 * and without telling a third party which document someone is reading. An
 * always-on frame would break it on every page carrying one.
 *
 * Two things the panel says out loud, because they are the reason for the
 * click. It NAMES the host, so a reader consents to a party rather than to a
 * button. And it says the page is not part of the record: an embed carries no
 * provenance claim, cannot be cited, and can change under the document without
 * anyone reviewing it. The link out is always there and costs nothing, because
 * a plain `<a>` is not a request.
 */
export function Embed({
  url,
  host,
  label,
  owned,
}: {
  readonly url: string;
  readonly host: string;
  readonly label: string;
  /** "true" when the page is carried IN the record and served from here. */
  readonly owned?: string;
}): ReactElement {
  const [loaded, setLoaded] = useState(false);
  const isOwned = owned === "true";

  return (
    <figure className="not-prose my-8">
      <div
        // A ratio rather than a fixed height, so the frame scales with the
        // measure. The floor is there because these pages are usually taller
        // than they are wide, and a narrow window would otherwise letterbox
        // an interactive thing down to a strip.
        className="relative w-full overflow-hidden rounded-lg border border-fd-border bg-fd-muted"
        style={{ aspectRatio: "16 / 10", minHeight: "26rem" }}
      >
        {loaded ? (
          <iframe
            src={url}
            title={label}
            allowFullScreen
            // The host learns that its page was opened, not which document of
            // this record opened it.
            referrerPolicy="no-referrer"
            // Scripts, because the point of the page is that it runs. Not
            // top-navigation, and not forms: a framed page may not steer the
            // reader out of the record or collect anything from inside it.
            sandbox="allow-scripts allow-same-origin allow-popups"
            loading="lazy"
            className="absolute inset-0 size-full"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <Play aria-hidden className="size-8 text-fd-muted-foreground" />
            <Button onClick={() => setLoaded(true)}>{label}</Button>
            <p className="max-w-sm text-xs text-fd-muted-foreground">
              {isOwned
                ? "Part of this record, served from this site. Nothing leaves your browser."
                : `Runs on ${host}, and is not part of this record. Nothing is requested from there until you load it.`}
            </p>
          </div>
        )}
      </div>

      <figcaption className="mt-2 flex items-center justify-between gap-3 text-xs text-fd-muted-foreground">
        <span>{label}</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-fd-foreground"
        >
          {isOwned ? "Open on its own" : `Open on ${host}`}
          <ExternalLink aria-hidden className="size-3" />
        </a>
      </figcaption>
    </figure>
  );
}
