import type { ReactElement, ReactNode } from "react";

/**
 * The end-of-document region: what a reader DOES with a document once they
 * have read it.
 *
 * The deck and the quiz live here, in that order. Deliberately not a tab:
 * a study aid is used AFTER the document, and a tab would hide the document
 * while you used it. Deliberately one region rather than each aid finding its
 * own spot on the page, so a second aid is a child here and not a new layout
 * argument.
 *
 * Renders NOTHING when the document has no aids — no heading, no rule, no
 * empty region (specs/ksor/study-attachments C3).
 */
export function StudyAids({ children }: { readonly children: ReactNode }): ReactElement | null {
  const present = Array.isArray(children) ? children.some((c) => c) : Boolean(children);
  if (!present) return null;

  return (
    <section
      aria-label="Study aids"
      // `not-prose`: this is site chrome around the record, not the record's
      // prose, so the document type ramp must not reach into it.
      className="not-prose mt-14 flex flex-col gap-14"
    >
      {children}
    </section>
  );
}

/**
 * One aid's header: its own name in the record's serif, an accent bar, and the
 * hairline that separates it from the document above.
 *
 * Shared so the deck and the quiz cannot drift into two different headings.
 */
export function StudyAidHeader({
  title,
  description,
}: {
  readonly title: string;
  readonly description?: string | undefined;
}): ReactElement {
  return (
    <header className="mb-8">
      <h2 className="font-(family-name:--font-display) text-2xl font-semibold tracking-tight text-fd-foreground">
        {title}
      </h2>
      {/* A short accent bar over a full-width hairline: the rule says "a new
        region starts here" and the bar says which one, without a second
        colour or a boxed container. */}
      <div className="mt-3 h-px w-full bg-fd-border">
        <div className="h-[3px] w-24 -translate-y-px bg-fd-primary" />
      </div>
      {description === undefined ? null : (
        <p className="mt-4 text-sm text-fd-muted-foreground">{description}</p>
      )}
    </header>
  );
}
