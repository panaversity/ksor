"use client";

import { ExternalLink, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

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
  const [height, setHeight] = useState<number | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const isOwned = owned === "true";

  /**
   * Fit the frame to the page it holds, so nothing scrolls in a box and no
   * band of dead space sits under it.
   *
   * Measure the body's CHILDREN, never `documentElement.scrollHeight`. These
   * pages set `min-height: 100vh`, and inside a frame the viewport IS the
   * frame — so the document's scroll height is just the frame's own height
   * echoed back, and a frame sized from it grows without bound. Watched that
   * run away before the CSS explained it (2026-08-24). The children do not
   * depend on the frame: measured across all seven sims of the record this was
   * built for, each returned the same height at a 300px frame and a 1400px
   * one.
   *
   * Possible at all only because a carried page is SAME-ORIGIN. A cross-origin
   * frame refuses `contentDocument`, so it keeps the ratio box and this
   * returns without touching anything.
   */
  const fit = useCallback((): void => {
    let doc: Document | null = null;
    try {
      doc = frame.current?.contentDocument ?? null;
    } catch {
      return; // cross-origin: not ours to measure
    }
    const body = doc?.body;
    if (!body) return;
    // NOT `instanceof HTMLElement`. The elements inside a frame belong to the
    // frame's realm, so they are instances of ITS HTMLElement and never of this
    // one — the filter matched nothing, and the frame kept the ratio box while
    // looking as though measuring had simply not helped (found live).
    const blocks = [...body.children].filter(
      (el): el is HTMLElement => typeof (el as HTMLElement).offsetHeight === "number",
    );
    if (blocks.length === 0) return;
    const bottom = Math.max(...blocks.map((el) => el.offsetTop + el.offsetHeight));
    const padding = Number.parseFloat(getComputedStyle(body).paddingBottom) || 0;
    const measured = Math.ceil(bottom + padding);
    // GROW-ONLY. A running page changes height every beat — measured
    // oscillating 504 to 562 on one sim — and following it exactly would
    // shift everything below the frame while someone is reading. The high
    // water mark costs a little slack after a shrink and never a scrollbar.
    if (measured > 0)
      setHeight((current) => (current === null ? measured : Math.max(current, measured)));
  }, []);

  const watcher = useRef<ResizeObserver | null>(null);

  /**
   * Measure on load, then keep watching — these pages animate, and some add a
   * row per beat.
   *
   * Set up HERE rather than in an effect on `loaded`: that effect runs the
   * moment the click flips the state, which is before the frame's document
   * exists, so it observed an empty `about:blank` and never fired again (found
   * live — the frame fitted once and then ignored everything).
   *
   * Watch the CHILDREN, not the body. The body's own box is pinned by the
   * page's `min-height: 100vh` to exactly the frame, so it never reports a
   * change.
   */
  const handleLoad = useCallback((): void => {
    fit();
    let doc: Document | null = null;
    try {
      doc = frame.current?.contentDocument ?? null;
    } catch {
      return;
    }
    const body = doc?.body;
    if (!body || typeof ResizeObserver === "undefined") return;
    watcher.current?.disconnect();
    const observer = new ResizeObserver(fit);
    for (const child of body.children) observer.observe(child);
    watcher.current = observer;
  }, [fit]);

  useEffect(() => () => watcher.current?.disconnect(), []);

  return (
    <figure
      className="not-prose my-8"
      // Wider than the prose measure. A page built to be interactive is laid
      // out for a screen, not for a 60-character column: constrained to the
      // measure it either scrolls in a box or under-fills the height its
      // author stated (both seen live). Centred on the column and clamped to
      // the viewport, so it never causes a horizontal scroll.
      style={{
        width: "min(64rem, calc(100vw - 3rem))",
        marginLeft: "50%",
        transform: "translateX(-50%)",
      }}
    >
      <div
        // A ratio rather than a fixed height, so the frame scales with the
        // measure. The floor is there because these pages are usually taller
        // than they are wide, and a narrow window would otherwise letterbox
        // an interactive thing down to a strip.
        className="relative w-full overflow-hidden rounded-lg border border-fd-border bg-fd-muted"
        // The invitation is a card; the frame takes the page's own height once
        // it has one. Until it is measured — and always, for a frame we may
        // not measure — a ratio with a floor.
        style={
          !loaded
            ? { height: "14rem" }
            : height === null
              ? { aspectRatio: "16 / 10", minHeight: "26rem" }
              : { height }
        }
      >
        {loaded ? (
          <iframe
            ref={frame}
            onLoad={handleLoad}
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
