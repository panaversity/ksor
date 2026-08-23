"use client";

import { GraduationCap } from "lucide-react";
import { type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { TeachingEntry } from "@/lib/attachments";
import {
  TEACHING_SECTIONS,
  normalizeMisconception,
  normalizeObjective,
} from "@/lib/teaching-shape";

/**
 * The teaching guide, in a sheet beside the document.
 *
 * The audience is what makes this different from every other attachment: the
 * summary, deck and quiz serve the READER, and this serves whoever has to
 * explain the document to a third person. So it is not in the study-aids
 * region at the end of the page — a reader would meet a panel written past
 * them — and it does not displace the prose, because a teacher reads the guide
 * ALONGSIDE the document. That is the predecessor's own framing and the reason
 * it chose a sheet.
 *
 * What is NOT here is the predecessor's taxonomy — Bloom levels, DigComp
 * areas, proficiency bands, cognitive-load counts. `specs/ksor/teaching-guide/
 * spec.md` §4: validating a pedagogy is not this product's business, and an
 * unenforced vocabulary that LOOKS governed is worse than none.
 */

function SectionList({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactElement[];
}): ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-mono text-xs tracking-wide text-fd-muted-foreground uppercase">
        {label}
      </h3>
      <ul className="flex flex-col gap-2 text-sm leading-relaxed text-fd-foreground">{children}</ul>
    </section>
  );
}

/** A bullet with the record's hairline rather than a disc, matching the shell. */
function Item({ children }: { readonly children: React.ReactNode }): ReactElement {
  return (
    <li className="border-s-2 border-fd-border ps-3">
      <span className="block">{children}</span>
    </li>
  );
}

export function TeachingGuide({ guide }: { guide: TeachingEntry }): ReactElement {
  const meta = [guide.teaching.audience, guide.teaching.duration].filter(
    (part): part is string => part !== undefined && part !== "",
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="font-mono text-xs tracking-wide uppercase"
          // Named for the act, not the artifact: an onboarding lead is looking
          // for how to run the session, not for a document type.
          aria-label={`Teaching guide: ${guide.teaching.title}`}
        >
          <GraduationCap aria-hidden className="size-3.5" />
          Teach this
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b border-fd-border">
          <SheetTitle className="font-(family-name:--font-display) text-xl">
            {guide.teaching.title}
          </SheetTitle>
          {meta.length === 0 ? (
            // Radix requires a description for the dialog's accessible name;
            // rendering an empty one would announce nothing, so it says what
            // the panel IS instead of inventing metadata the author omitted.
            <SheetDescription className="font-mono text-xs">
              How to teach this document
            </SheetDescription>
          ) : (
            <SheetDescription className="font-mono text-xs">{meta.join(" · ")}</SheetDescription>
          )}
        </SheetHeader>

        <div className="flex flex-col gap-7 px-4 py-6">
          {TEACHING_SECTIONS.map((section) => {
            const items = guide[section.key];
            if (items === undefined || items.length === 0) return null;

            if (section.key === "misconceptions") {
              return (
                <SectionList key={section.key} label={section.label}>
                  {items.map((raw, i) => {
                    const m = normalizeMisconception(
                      raw as Parameters<typeof normalizeMisconception>[0],
                    );
                    return (
                      <Item key={`${section.key}-${i}`}>
                        <span>{m.text}</span>
                        {m.instead === undefined ? null : (
                          // The correction, marked as the record's own answer
                          // rather than as more commentary.
                          <span className="mt-1 block text-fd-muted-foreground">
                            <span className="font-mono text-xs">Actually: </span>
                            {m.instead}
                          </span>
                        )}
                      </Item>
                    );
                  })}
                </SectionList>
              );
            }

            if (section.key === "objectives") {
              return (
                <SectionList key={section.key} label={section.label}>
                  {items.map((raw, i) => {
                    const o = normalizeObjective(raw as Parameters<typeof normalizeObjective>[0]);
                    return (
                      <Item key={`${section.key}-${i}`}>
                        <span>{o.objective}</span>
                        {o.level === undefined ? null : (
                          <span className="ms-2 font-mono text-xs text-fd-muted-foreground">
                            {o.level}
                          </span>
                        )}
                      </Item>
                    );
                  })}
                </SectionList>
              );
            }

            return (
              <SectionList key={section.key} label={section.label}>
                {(items as readonly string[]).map((text, i) => (
                  <Item key={`${section.key}-${i}`}>{text}</Item>
                ))}
              </SectionList>
            );
          })}

          <p className="border-t border-fd-border pt-5 text-xs text-fd-muted-foreground">
            {/* Not a disclaimer — the governance fact. A guide is part of its
                document, so it carries the same tier and the same takedown,
                and it is never a second source. */}
            Part of this document, and governed with it.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
