/**
 * How long a document takes to read.
 *
 * Computed at BUILD time from the document's own markdown, so the figure is in
 * the server-rendered HTML — a reader with a failed bundle, a crawler and an
 * agent parsing the page all get it. The predecessor measured `article.
 * textContent` in the browser after paint, which put the number out of reach of
 * every one of them.
 *
 * A LEAF: no imports, so it can be tested in isolation.
 */

/**
 * Words per minute for prose.
 *
 * 200 is the conventional figure for adult silent reading of ordinary text and
 * is what the predecessor used. It is a rough number, and the clock beside it
 * is what says so — nobody reads a time next to a clock icon as a promise. A
 * governed record's prose is denser than a novel's, so if anything this reads
 * slightly fast.
 */
export const WORDS_PER_MINUTE = 200;

/**
 * Fenced code is not read at prose speed — it is scanned, or studied, but
 * either way counting its tokens as words inflates the estimate badly on a
 * technical document. It is removed before counting rather than weighted:
 * a weight would be a second invented number on top of the first.
 */
const FENCED_CODE = /^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\1[ \t]*$/gm;

/** Frontmatter is metadata, not prose, and is never shown to the reader. */
const FRONTMATTER = /^﻿?---\n[\s\S]*?\n---[ \t]*\n/;

/**
 * Minutes to read this markdown, rounded to the nearest minute and never zero:
 * a document that exists takes some time to read, and "0 min read" is a
 * sentence no reader has use for.
 */
export function readingMinutes(markdown: string): number {
  const prose = markdown.replace(/\r\n/g, "\n").replace(FRONTMATTER, "").replace(FENCED_CODE, " ");
  const words = prose.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  if (words === 0) return 1;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
