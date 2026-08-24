"use client";

import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import { WrapText } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

/**
 * A code block that can be asked to show the whole line.
 *
 * A record's commands are long — one in the fixture runs to 292 characters —
 * and in a 672px column that is a scrollbar, with the left edge of every line
 * going out of view as you drag it. Wrapping everything by default was tried
 * and is worse for the blocks that do not need it: a yaml file rewrapped at
 * the column reads as though its indentation means something else.
 *
 * So the reader decides, per block. The button appears ONLY on a block that
 * actually overflows, which is measured after layout rather than guessed —
 * most blocks fit, and a control that does nothing is worse than no control.
 *
 * The `Actions` slot is fumadocs' own, so the button sits with the copy button
 * and inherits its placement rather than being positioned against it.
 */
export function WrappableCodeBlock(props: React.ComponentProps<"pre">): ReactElement {
  const figure = useRef<HTMLElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [wrapped, setWrapped] = useState(false);

  const measure = useCallback((): void => {
    const viewport = figure.current?.querySelector<HTMLElement>(".fd-scroll-container");
    if (!viewport) return;
    // While wrapped there is nothing to overflow, so the question is only
    // asked in the state that can answer it — otherwise turning wrapping on
    // would remove the button that turns it off.
    setOverflows((was) => (wrapped ? was : viewport.scrollWidth > viewport.clientWidth + 1));
  }, [wrapped]);

  useEffect(() => {
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const viewport = figure.current?.querySelector<HTMLElement>(".fd-scroll-container");
    if (!viewport) return;
    // The column changes width with the window, and with the table of contents
    // appearing; a block that fits at one width overflows at another.
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <CodeBlock
      ref={figure}
      data-wrapped={wrapped ? "" : undefined}
      Actions={({ className, children }) => (
        // `children` IS the copy button — fumadocs hands the default actions
        // in, and a slot that ignores them REPLACES the copy button instead of
        // joining it (found live: the block lost copy entirely). The wrapper
        // mirrors the default's own `empty:hidden`, so a block with neither
        // button still renders nothing.
        <div className={`flex items-center empty:hidden ${className ?? ""}`}>
          {children}
          {overflows ? (
            <button
              type="button"
              aria-pressed={wrapped}
              onClick={() => setWrapped((on) => !on)}
              // The copy button's own metrics — measured, not guessed: 24x24
              // with a 3.5 icon. Mine came out 30x30 and the pair read as two
              // controls of different importance.
              className="inline-flex size-6 items-center justify-center rounded-lg transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground [&_svg]:size-3.5"
              // Said as what it does, not as what it is: the reader wants the
              // rest of the line, not a setting.
              title={wrapped ? "Show one line per line" : "Show the whole line"}
            >
              <WrapText aria-hidden />
              <span className="sr-only">
                {wrapped ? "Show one line per line" : "Show the whole line"}
              </span>
            </button>
          ) : null}
        </div>
      )}
      {...props}
    >
      <Pre>{props.children}</Pre>
    </CodeBlock>
  );
}
