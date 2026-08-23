import { z } from "zod";

import { textHash } from "./identity";

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
  return textHash([card.front, card.back]);
}
