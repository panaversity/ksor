"use client";

import { Check, ChevronDown, Copy, FileText } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * What a reader can DO with this document, behind one control.
 *
 * Opening the markdown twin and handing it to an agent are different acts, and
 * a reader who wants the second should not have to perform the first — but two
 * bare controls sitting on a row of read-only facts made the row look half
 * clickable. One trigger says "there are actions here" once, and the menu says
 * what they are.
 *
 * Putting the markdown LINK behind a click is safe for the audience that reads
 * bytes: `generateMetadata` already advertises the twin as
 * `<link rel="alternate" type="text/markdown">` in the head, so a crawler and
 * an agent find the address without opening anything. Verified in the built
 * HTML before this moved.
 */
export function DocumentActions({ href }: { readonly href: string }): ReactElement {
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The shell ships `useCopyButton`, which owns this timing — but it hands back
  // a MouseEventHandler, and a menu item reports selection as a CustomEvent.
  // Casting one to the other to reuse six lines is worse than the six lines.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = useCallback(async () => {
    try {
      const markdown = await fetch(href).then((response) => response.text());
      await navigator.clipboard.writeText(markdown);
      setFailed(false);
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // A refused clipboard or a failed fetch is not an error where a document
      // should be: the menu says so, and View markdown still works.
      setFailed(true);
    }
  }, [href]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto gap-1.5 px-2 py-1 font-mono text-[0.6875rem] tracking-[0.14em] text-fd-muted-foreground uppercase hover:text-fd-foreground"
        >
          <FileText aria-hidden className="size-3.5" />
          Markdown
          <ChevronDown aria-hidden className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem asChild>
          <a href={href}>
            <FileText aria-hidden className="size-4" />
            View markdown
          </a>
        </DropdownMenuItem>

        {/* onSelect is prevented so the menu stays open long enough to show
          that the copy landed — closing on the click would take the only
          feedback away with it. */}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void onCopy();
          }}
        >
          {copied ? (
            <Check aria-hidden className="size-4 text-fd-primary" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          {failed ? "Copy failed — open it instead" : copied ? "Copied" : "Copy markdown"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
