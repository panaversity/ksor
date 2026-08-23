import { Clock } from "lucide-react";
import type { ReactElement } from "react";

/**
 * How long the document takes to read, under its description.
 *
 * Deliberately NOT on the facts row beside owner and effective date. That row
 * is what the record DECLARES about a document, and every entry on it is a
 * value an author wrote and a reviewer checked. This is derived from the
 * document's own words and declared by nobody, so it sits with the description
 * — the other line that describes the document rather than governing it.
 *
 * It also means the estimate survives `site.governance: false`, which removes
 * the facts row wholesale. A record that publishes no governance still takes
 * three minutes to read.
 *
 * Plain server-rendered markup: the figure is counted at build time, so a
 * reader with a failed bundle, a crawler and an agent all get it.
 */
export function ReadingTime({ minutes }: { readonly minutes: number }): ReactElement {
  return (
    <p className="mt-3 flex items-center gap-2 text-sm text-fd-muted-foreground">
      {/* An hourglass would be the more correct glyph for a duration, and a
        clock shows a point in time — but the clock is what readers have been
        taught this means, and being understood beats being right here. */}
      <Clock aria-hidden className="size-3.5 shrink-0" />
      <span>{minutes} min read</span>
    </p>
  );
}
