import { decks, summaries } from "collections/server";

import { ATTACHMENT_SUFFIXES } from "./attachment-rule";
import { cardHash, type Card, type Deck } from "./deck";
import { newCard, type CardSchedule } from "./srs";

/**
 * Finding a document's study attachments.
 *
 * Both collections are keyed by their record-relative path (fumadocs'
 * `info.path`), which is the same shape as a page's own `page.path` — so the
 * lookup is a suffix swap, not a second index to keep in step. `x.md` finds
 * `x.summary.md` and `x.flashcards.yaml`, and nothing else can be reached.
 *
 * Neither collection is ever handed to `loader()`, which is what keeps an
 * attachment off the route table, the sidebar, llms.txt, llms-full.txt, the
 * markdown twin and the search index — see source.config.ts.
 */

const DOC_SUFFIX = /\.mdx?$/;

/** `policies/returns.md` + `.summary.md` → `policies/returns.summary.md`. */
function attachmentPath(documentPath: string, suffix: string): string {
  return documentPath.replace(DOC_SUFFIX, "") + suffix;
}

export interface SummaryEntry {
  readonly body: (props: { components?: Record<string, unknown> }) => React.ReactElement;
  readonly toc: unknown;
}

/**
 * The summary for a document, or null when it has none.
 *
 * Null is the ordinary case and never an error: the feature is presence-driven,
 * so a document with no summary renders no tab strip at all rather than an
 * empty one.
 */
export function summaryFor(documentPath: string): SummaryEntry | null {
  const wanted = attachmentPath(documentPath, ".summary.md");
  const wantedMdx = attachmentPath(documentPath, ".summary.mdx");
  const hit = summaries.find(
    (entry) => entry.info.path === wanted || entry.info.path === wantedMdx,
  );
  return hit === undefined ? null : (hit as unknown as SummaryEntry);
}

/** One card as the deck UI consumes it: authored text plus its identity. */
export interface DeckCard extends Card {
  /** Identity: a hash of the card's own text, so an edit resets only this card. */
  readonly hash: string;
}

export interface DeckEntry {
  readonly title: string;
  readonly description?: string;
  readonly cards: readonly DeckCard[];
  /**
   * The deck's identity, used to key persisted review state. The record-relative
   * path — never an authored id, because the path IS the identity here.
   */
  readonly path: string;
}

/** The deck for a document, or null when it has none. */
export function deckFor(documentPath: string): DeckEntry | null {
  const wanted = attachmentPath(documentPath, ".flashcards.yaml");
  const hit = decks.find((entry) => entry.info.path === wanted);
  if (hit === undefined) return null;

  const parsed = hit as unknown as Deck & { readonly info: { readonly path: string } };
  return {
    title: parsed.deck.title,
    description: parsed.deck.description,
    path: parsed.info.path,
    cards: parsed.cards.map((card) => ({ ...card, hash: cardHash(card) })),
  };
}

/** True when a document has either attachment — the presence gate for the UI. */
export function hasAttachments(documentPath: string): boolean {
  return summaryFor(documentPath) !== null || deckFor(documentPath) !== null;
}

/**
 * A fresh schedule for every card in a deck, all due now.
 *
 * Exported so the deck's first render and its reset path agree by construction
 * rather than by two similar-looking object literals.
 */
export function freshSchedules(
  cards: readonly DeckCard[],
  now: number,
): Record<string, CardSchedule> {
  return Object.fromEntries(cards.map((card) => [card.hash, newCard(card.hash, now)]));
}

/** Every attachment suffix, for the surfaces that need the list rather than the rule. */
export const ATTACHMENT_SUFFIX_LIST: readonly string[] = ATTACHMENT_SUFFIXES.map((e) => e.suffix);
