import { z } from "zod";

/**
 * The shape of a `<doc>.flashcards.yaml` deck.
 *
 * NO AUTHORED IDS, anywhere — not on the deck, not on a card. The record's
 * third principle is that identity derives from the file path, and the checker
 * refuses `id:`/`name:` on a document for exactly this reason. A deck's
 * identity is its path; a CARD's identity is its own text, hashed
 * (`cardHash`), which is also what makes a per-card reset possible: an edited
 * card is a different card, and every card the author did not touch keeps its
 * review history.
 *
 * The predecessor authored `deck.id`, `card.id` AND `deck.version` by hand. The
 * version decided nothing (it was logged, never acted on) and the ids were a
 * second identity to keep in step with the filename.
 */
export const CardSchema = z.object({
  front: z.string().min(1).max(300),
  back: z.string().min(1).max(600),
  /** An optional prompt that turns a recall check into a thinking one. */
  why: z.string().max(240).optional(),
});

export const DeckSchema = z.object({
  deck: z.object({
    title: z.string().min(1).max(120),
    description: z.string().max(300).optional(),
  }),
  cards: z.array(CardSchema).min(1).max(60),
});

export type Deck = z.infer<typeof DeckSchema>;
export type Card = z.infer<typeof CardSchema>;

/**
 * A card's identity: a stable hash of the text a learner actually sees.
 *
 * FNV-1a, 32-bit, hand-rolled — the site has no crypto import at build time and
 * this needs to run identically in the browser. Collisions cost a single card's
 * review history, never correctness, so 32 bits is the right size of hammer.
 *
 * `why` is deliberately NOT hashed: it is a hint about the card, not the card,
 * and rewording it should not throw away a learner's history with the card.
 */
export function cardHash(card: Card): string {
  // NUL as the separator, written as an escape rather than embedded: a raw
  // NUL in the source makes git treat this file as binary. It has to be a
  // separator of some kind — without one, front "ab"/back "c" hashes the same
  // as front "a"/back "bc" — and NUL is the one character authored card text
  // cannot contain.
  const text = `${card.front}\u0000${card.back}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * How far through the deck the reader is, as a percentage, counting the card
 * they are ON rather than the ones behind it.
 *
 * Extracted because it was wrong and silently so: the bar read `position` while
 * its caption read `position + 1`, so the two disagreed by one card the whole
 * way — "1 / 5" over an empty bar, "5 / 5" over a bar at 80%, and a full bar
 * never once on screen, because reaching the end swaps the bar for the
 * completion panel. One number, one place, one test.
 */
export function progressPercent(position: number, total: number): number {
  if (total <= 0) return 0;
  const shown = Math.min(Math.max(position, 0) + 1, total);
  return (shown / total) * 100;
}
