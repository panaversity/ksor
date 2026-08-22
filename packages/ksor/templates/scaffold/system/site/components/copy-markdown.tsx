"use client";

import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";
import { useState, type ReactElement } from "react";

/**
 * Hand this document to an agent: copy the governed markdown, verbatim.
 *
 * The record's second audience reads bytes, and until now a reader who wanted
 * to give an agent a document had to open its markdown twin and select the
 * page. This fetches that same twin — the one `/md/<path>.md` already serves,
 * so there is no second rendering of the document to drift — and puts it on the
 * clipboard.
 *
 * Fumadocs ships an `ai/page-actions` component that does this alongside "Open
 * in ChatGPT" and "Open in Claude". Those two are deliberately NOT taken: this
 * product's claim is that one corpus answers in ANY assistant because the
 * surface is an open standard, and hardcoding two vendors into every adopter's
 * page argues the opposite. What is taken is the shell's own `useCopyButton`,
 * which owns the copied-state timing — the only part worth not rewriting.
 */
export function CopyMarkdown({ href }: { href: string }): ReactElement {
  const [failed, setFailed] = useState(false);
  const [copied, onClick] = useCopyButton(async () => {
    setFailed(false);
    try {
      // `navigator.clipboard` exists only in a secure context, so a site served
      // over plain http on a LAN address has no clipboard at all. Saying so
      // beats a button that reports success it did not have.
      if (navigator.clipboard === undefined) throw new Error("no clipboard");
      const response = await fetch(href);
      if (!response.ok) throw new Error(`markdown twin returned ${response.status}`);
      await navigator.clipboard.writeText(await response.text());
    } catch {
      setFailed(true);
    }
  });

  return (
    <button
      type="button"
      onClick={onClick}
      // aria-live, because the label is the only feedback: a screen reader that
      // does not hear "Copied" is told nothing happened at all.
      aria-live="polite"
      className="inline-flex items-baseline gap-1.5 font-mono text-[0.6875rem] tracking-[0.16em] text-fd-primary uppercase transition-colors hover:text-fd-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
    >
      <span className="underline decoration-fd-primary/30 underline-offset-4 hover:decoration-fd-primary/70">
        {failed ? "Copy failed" : copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
