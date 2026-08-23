import { decks, quizzes, slides, summaries, teachings } from "collections/server";

import { ATTACHMENT_SUFFIXES } from "./attachment-rule";
import { cardHash, type Card, type Deck } from "./deck";
import { newCard, type CardSchedule } from "./srs";
import { type Question, type Quiz } from "./quiz";
import { type Slides } from "./slides";
import { embedUrlFor, providerOf } from "./slides-embed";
import { type Teaching } from "./teaching";
import { hasTeachingContent } from "./teaching-shape";
import { DEFAULT_QUESTIONS_PER_ROUND } from "./quiz-round";
import { questionHash } from "./identity";

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
  /**
   * The summary's processed markdown, for counting its reading time. The
   * collection enables `includeProcessedMarkdown` so this is in memory —
   * `"raw"` would go back to disk and resolve against the wrong base.
   */
  readonly getText: (type: "raw" | "processed") => Promise<string>;
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

/** One question as the quiz UI consumes it: authored text plus its identity. */
export interface QuizQuestion extends Question {
  /** Identity: a hash of the question's own text, so an edit resets only this one. */
  readonly hash: string;
}

export interface QuizEntry {
  readonly title: string;
  readonly description?: string;
  readonly questionsPerRound: number;
  readonly questions: readonly QuizQuestion[];
  /** The record-relative path — the quiz's identity, used to key saved answers. */
  readonly path: string;
}

/** The quiz for a document, or null when it has none. */
export function quizFor(documentPath: string): QuizEntry | null {
  const wanted = attachmentPath(documentPath, ".quiz.yaml");
  const hit = quizzes.find((entry) => entry.info.path === wanted);
  if (hit === undefined) return null;

  const parsed = hit as unknown as Quiz & { readonly info: { readonly path: string } };
  return {
    title: parsed.quiz.title,
    description: parsed.quiz.description,
    questionsPerRound: parsed.quiz.questionsPerRound ?? DEFAULT_QUESTIONS_PER_ROUND,
    path: parsed.info.path,
    questions: parsed.questions.map((q) => ({ ...q, hash: questionHash(q) })),
  };
}

export interface TeachingEntry extends Teaching {
  /** The record-relative path — the guide's identity. */
  readonly path: string;
}

/**
 * The teaching guide for a document, or null.
 *
 * Null also when the guide somehow carries no content: the schema refuses that
 * at parse time, and this asks the same question at RENDER time, because the
 * control must never open an empty panel.
 */
export function teachingFor(documentPath: string): TeachingEntry | null {
  const wanted = attachmentPath(documentPath, ".teaching.yaml");
  const hit = teachings.find((entry) => entry.info.path === wanted);
  if (hit === undefined) return null;
  const parsed = hit as unknown as Teaching & { readonly info: { readonly path: string } };
  if (!hasTeachingContent(parsed)) return null;
  return { ...parsed, path: parsed.info.path };
}

export interface SlidesEntry {
  readonly title: string;
  readonly url: string;
  readonly description?: string;
  /** Explicit `provider:`, when the author named one. */
  readonly provider?: string;
  /** Derived from the host when they did not — never guessed beyond the table. */
  readonly derivedProvider?: string;
  /** The framable url: the author's `embed:`, or one derived from `url`. */
  readonly embed?: string;
  readonly path: string;
}

/** The presentation for a document, or null. */
export function slidesFor(documentPath: string): SlidesEntry | null {
  const wanted = attachmentPath(documentPath, ".slides.yaml");
  const hit = slides.find((entry) => entry.info.path === wanted);
  if (hit === undefined) return null;
  const parsed = hit as unknown as Slides & { readonly info: { readonly path: string } };
  const d = parsed.slides;
  return {
    title: d.title,
    url: d.url,
    description: d.description,
    provider: d.provider,
    derivedProvider: providerOf(d.url) ?? undefined,
    // An author's explicit embed wins; otherwise derive one, and a provider we
    // do not know simply renders as a link.
    embed: d.embed ?? embedUrlFor(d.url) ?? undefined,
    path: parsed.info.path,
  };
}

/** True when a document has ANY attachment — the presence gate for the UI. */
export function hasAttachments(documentPath: string): boolean {
  return (
    summaryFor(documentPath) !== null ||
    deckFor(documentPath) !== null ||
    quizFor(documentPath) !== null ||
    slidesFor(documentPath) !== null
  );
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
