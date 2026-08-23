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
export function ReadingTime({
  minutes,
  afterDescription,
}: {
  readonly minutes: number;
  /**
   * Whether a description precedes this. It carries a 32px bottom margin from
   * the shell, which has to be pulled back against — but ONLY when it is there.
   * Applied unconditionally, the pull-back printed the reading time straight
   * through the title of any document that declares no `description:`
   * (measured: -20px, overlapping).
   */
  readonly afterDescription: boolean;
}): ReactElement {
  return (
    <p
      // Measured at 1728px before this: 60px from the description it belongs
      // to and 16px from the facts row it does not, so it read as the first
      // entry in that row — the opposite of why it sits here. Now 12px above,
      // 28px below, whichever element it follows.
      className={`${afterDescription ? "-mt-9" : "mt-4"} mb-3 flex items-center gap-2 text-sm text-fd-muted-foreground`}
    >
      {/* An hourglass would be the more correct glyph for a duration, and a
        clock shows a point in time — but the clock is what readers have been
        taught this means, and being understood beats being right here. */}
      <Clock aria-hidden className="size-3.5 shrink-0" />
      <span>{minutes} min read</span>
    </p>
  );
}
