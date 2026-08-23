"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import type { DeckCard, DeckEntry } from "@/lib/attachments";
import { SCHEDULER_POLICY, dueOrder, newCard, schedule, type CardSchedule } from "@/lib/srs";

/**
 * A document's recall deck.
 *
 * Two behaviours here are deliberately NOT what the predecessor shipped, and
 * both were defects rather than choices:
 *
 *  - **The schedule decides the order.** The predecessor computed a due queue
 *    and then rendered `deck.cards` directly, so its spaced repetition
 *    persisted state that influenced nothing a learner ever saw. Here
 *    `dueOrder` is what the session walks.
 *  - **The reset message is true.** The predecessor's toast said progress "was
 *    reset due to a deck update" and fired only from its JSON.parse catch —
 *    i.e. on storage corruption, the one cause it was never about. Here a card
 *    is identified by a hash of its own text, so an edited card resets ALONE
 *    and the notice says exactly how many and why.
 */

const STORAGE_VERSION = 1;

interface Persisted {
  readonly policy: string;
  readonly version: number;
  readonly cards: Record<string, CardSchedule>;
}

function storageKey(deckPath: string): string {
  return `ksor:flashcards:${deckPath}`;
}

/**
 * Read persisted review state, or null when there is none to read.
 *
 * Every failure path returns null rather than throwing: a browser with storage
 * disabled, a private window, a corrupted value and a record written by a
 * different scheduler are all "no history yet", which degrades this to an
 * unscheduled walk through the deck instead of an error where a deck should be.
 */
function readPersisted(deckPath: string): Persisted | null {
  try {
    const raw = window.localStorage.getItem(storageKey(deckPath));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Partial<Persisted>;
    // A record written by a different policy is not migrated and not trusted —
    // the numbers in it mean something else. Starting fresh is honest; silently
    // reinterpreting another scheduler's stability as our ease is not.
    if (record.policy !== SCHEDULER_POLICY || record.version !== STORAGE_VERSION) return null;
    if (typeof record.cards !== "object" || record.cards === null) return null;
    return record as Persisted;
  } catch {
    return null;
  }
}

function writePersisted(deckPath: string, cards: Record<string, CardSchedule>): void {
  try {
    window.localStorage.setItem(
      storageKey(deckPath),
      JSON.stringify({ policy: SCHEDULER_POLICY, version: STORAGE_VERSION, cards }),
    );
  } catch {
    // Storage refused (quota, private mode, disabled). The session still works
    // for as long as the page is open; it simply will not be remembered.
  }
}

/** How long until a card is due again, in the coarsest honest unit. */
function untilDue(ms: number): string {
  if (ms <= 0) return "now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

export function Flashcards({ deck }: { deck: DeckEntry }): ReactElement {
  // Server render and first client render must agree, so the deck starts in
  // authored order with everything new; the persisted schedule is applied on
  // mount. Reading localStorage during render is the classic hydration
  // mismatch, and it would flash the wrong card.
  const [schedules, setSchedules] = useState<Record<string, CardSchedule>>(() =>
    Object.fromEntries(deck.cards.map((card) => [card.hash, newCard(card.hash, 0)])),
  );
  const [hydrated, setHydrated] = useState(false);
  const [changed, setChanged] = useState(0);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [now, setNow] = useState(0);
  /**
   * "Review anyway" — walk the whole deck, ignoring what is due.
   *
   * Found live: without this the button did nothing at all. It resets the
   * index, but the queue is filtered by due date, so on a deck with nothing
   * due it stayed empty and the reader clicked a control that promised exactly
   * what it then refused. Grading still schedules normally; this only changes
   * WHICH cards the session offers.
   */
  const [reviewAll, setReviewAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const at = Date.now();
    const stored = readPersisted(deck.path);
    const known = stored?.cards ?? {};
    // A card is identified by its text. A hash present in the deck but not in
    // storage is new OR edited — indistinguishable, and it does not matter:
    // either way it has no history that belongs to this text.
    const next: Record<string, CardSchedule> = {};
    let fresh = 0;
    for (const card of deck.cards) {
      const existing = known[card.hash];
      if (existing === undefined) {
        next[card.hash] = newCard(card.hash, at);
        if (stored !== null) fresh += 1;
      } else {
        next[card.hash] = existing;
      }
    }
    setSchedules(next);
    setChanged(fresh);
    setNow(at);
    setHydrated(true);
  }, [deck.path, deck.cards]);

  /** What this session walks: due first, never-seen ahead of overdue. */
  const queue = useMemo(
    () =>
      !hydrated || reviewAll
        ? deck.cards
        : dueOrder(deck.cards, (card) => schedules[card.hash] ?? newCard(card.hash, now), now),
    // `schedules` is deliberately absent: re-ordering the queue under the
    // reader's hand as they grade would move the next card mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hydrated, reviewAll, deck.cards, now],
  );

  const card: DeckCard | undefined = queue[index];
  const done = hydrated && index >= queue.length;

  const grade = useCallback(
    (rating: "again" | "good") => {
      if (card === undefined) return;
      const at = Date.now();
      // The updater stays PURE — no write in here. React may invoke an updater
      // more than once (it does under StrictMode), and a side effect in one is
      // a write that fires a number of times nobody controls. The persist runs
      // in the effect below, keyed on the state it is persisting.
      setSchedules((current) => {
        const existing = current[card.hash] ?? newCard(card.hash, at);
        return { ...current, [card.hash]: schedule(existing, rating, at) };
      });
      setRevealed(false);
      setIndex((i) => i + 1);
    },
    [card, deck.path],
  );

  const restart = useCallback(() => {
    setIndex(0);
    setRevealed(false);
    setNow(Date.now());
    setReviewAll(true);
  }, []);

  // Persist whatever the schedule currently is, once it has been hydrated.
  // Before hydration `schedules` is the all-new placeholder the server and the
  // first client render agree on, and writing THAT would erase real history.
  useEffect(() => {
    if (!hydrated) return;
    writePersisted(deck.path, schedules);
  }, [hydrated, schedules, deck.path]);

  useEffect(() => {
    const node = containerRef.current;
    if (node === null) return;
    const onKey = (event: KeyboardEvent) => {
      // Only when the deck owns the focus: these are single-letter shortcuts,
      // and stealing "1" from the search box would be a bug.
      if (!node.contains(document.activeElement)) return;
      if (event.key === " " || event.key === "Enter") {
        if (!revealed && card !== undefined) {
          event.preventDefault();
          setRevealed(true);
        }
        return;
      }
      if (!revealed) return;
      if (event.key === "1") {
        event.preventDefault();
        grade("again");
      } else if (event.key === "2") {
        event.preventDefault();
        grade("good");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, card, grade]);

  const reviewed = hydrated ? Math.min(index, queue.length) : 0;
  const total = queue.length;

  return (
    <div ref={containerRef} className="not-prose">
      <header className="mb-4">
        <h2 className="font-(family-name:--font-display) text-xl text-fd-foreground">
          {deck.title}
        </h2>
        {deck.description === undefined ? null : (
          <p className="mt-1 text-sm text-fd-muted-foreground">{deck.description}</p>
        )}
      </header>

      {/* Honest, and only when there is something to be honest about. Counts
          cards whose TEXT changed, which is the only thing that resets. */}
      {changed > 0 ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-fd-border bg-fd-muted px-3 py-2 font-mono text-xs text-fd-muted-foreground"
        >
          {changed === 1 ? "1 card has" : `${changed} cards have`} changed since you last reviewed
          this deck — {changed === 1 ? "its" : "their"} progress starts again. The rest is
          untouched.
        </p>
      ) : null}

      {done || total === 0 ? (
        <DeckDone deck={deck} schedules={schedules} reviewed={reviewed} onRestart={restart} />
      ) : card === undefined ? null : (
        <>
          <div className="mb-3 flex items-baseline justify-between font-mono text-xs text-fd-muted-foreground">
            <span>
              {reviewed + 1} / {total}
            </span>
            <span aria-hidden>{revealed ? "space to hide" : "space to reveal"}</span>
          </div>

          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-expanded={revealed}
            className="w-full rounded-lg border border-fd-border bg-fd-muted px-5 py-6 text-left transition-colors hover:border-fd-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-primary"
          >
            {/* The card's question in the record's own voice — the serif that
                marks the record speaking, the same face document titles use. */}
            <p className="font-(family-name:--font-display) text-lg leading-snug text-fd-foreground">
              {card.front}
            </p>
            {revealed ? (
              <p className="mt-4 border-t border-fd-border pt-4 text-sm leading-relaxed text-fd-foreground">
                {card.back}
              </p>
            ) : card.why === undefined ? null : (
              <p className="mt-3 text-sm italic text-fd-muted-foreground">{card.why}</p>
            )}
          </button>

          {revealed ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <GradeButton onClick={() => grade("again")} tone="again" hint="1">
                <X className="size-4" /> Missed it
              </GradeButton>
              <GradeButton onClick={() => grade("good")} tone="good" hint="2">
                <Check className="size-4" /> Got it
              </GradeButton>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function GradeButton({
  onClick,
  tone,
  hint,
  children,
}: {
  readonly onClick: () => void;
  readonly tone: "again" | "good";
  readonly hint: string;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-primary",
        // The accent means "the thing you probably want" and is spent once.
        // Missed-it is deliberately NOT red: getting a card wrong is the
        // mechanism working, not an error.
        tone === "good"
          ? "border-fd-primary/50 text-fd-foreground hover:bg-fd-primary/10"
          : "border-fd-border text-fd-muted-foreground hover:text-fd-foreground hover:bg-fd-muted",
      ].join(" ")}
    >
      {children}
      <kbd className="ml-1 font-mono text-[10px] opacity-60">{hint}</kbd>
    </button>
  );
}

function DeckDone({
  deck,
  schedules,
  reviewed,
  onRestart,
}: {
  readonly deck: DeckEntry;
  readonly schedules: Record<string, CardSchedule>;
  readonly reviewed: number;
  readonly onRestart: () => void;
}): ReactElement {
  /**
   * Measured from NOW, not from when the page was opened.
   *
   * The session's `now` is stamped at mount so the queue does not re-order
   * under the reader's hand — correct for the queue, wrong for a countdown:
   * every second spent reviewing was being added to "next card due in", so a
   * card scheduled a minute out reported two (found live, three-card session).
   * This component only ever mounts after hydration and after a review, so
   * reading the clock here cannot mismatch the server.
   */
  const [at] = useState(() => Date.now());
  const nextDue = deck.cards
    .map((card) => schedules[card.hash]?.dueMs ?? at)
    .reduce((soonest, due) => (due < soonest ? due : soonest), Number.POSITIVE_INFINITY);

  return (
    <div className="rounded-lg border border-fd-border bg-fd-muted px-5 py-6 text-center">
      <p className="font-(family-name:--font-display) text-lg text-fd-foreground">
        {reviewed === 0 ? "Nothing due right now." : "Session complete."}
      </p>
      <p className="mt-2 font-mono text-xs text-fd-muted-foreground">
        {reviewed > 0 ? `${reviewed} reviewed · ` : ""}
        next card due in {untilDue(nextDue - at)}
      </p>
      <button
        type="button"
        onClick={onRestart}
        className="mt-4 inline-flex items-center gap-2 rounded-md border border-fd-border px-3 py-1.5 font-mono text-xs text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-primary"
      >
        <RotateCcw className="size-3.5" />
        Review anyway
      </button>
    </div>
  );
}
