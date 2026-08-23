"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";

import { StudyAidHeader } from "@/components/study-aids";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { QuizEntry, QuizQuestion } from "@/lib/attachments";
import { hasMoreRounds, roundOf } from "@/lib/quiz-round";

/**
 * Taking a quiz on the document you just read.
 *
 * The interaction model is the predecessor's and is the good part of it:
 * answer, see IMMEDIATELY whether you were right, and read the explanation
 * before moving on. Its own usage guide is explicit that this teaches through
 * the mistake, which has more effect than a score revealed at the end — so the
 * explanation is the point of the component and the score is a footnote.
 *
 * What is deliberately absent is everything the predecessor's `GatedQuiz`
 * wrapper added: a sign-in gate, an XP modal, and a POST of the score to a
 * progress API. The site is a static export with no backend, and decision 7
 * fixes it as preview and review rather than an editor. A score here is the
 * reader's, stays in their browser, and is sent nowhere.
 */

const STORAGE_VERSION = 1;

interface Persisted {
  readonly version: number;
  /** questionHash -> the option index this reader chose. */
  readonly answers: Record<string, number>;
}

function storageKey(quizPath: string): string {
  return `ksor:quiz:${quizPath}`;
}

function readPersisted(quizPath: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(storageKey(quizPath));
    if (raw === null) return {};
    const record = JSON.parse(raw) as Persisted;
    // A version bump discards rather than migrates: the only thing lost is
    // which options a reader clicked, and guessing at an old shape is how a
    // reader ends up with someone else's answers against their questions.
    if (record.version !== STORAGE_VERSION) return {};
    return record.answers ?? {};
  } catch {
    // A private window, cleared site data, or storage disabled entirely. An
    // unanswered quiz is a correct starting state, so this is not an error.
    return {};
  }
}

function writePersisted(quizPath: string, answers: Record<string, number>): void {
  try {
    window.localStorage.setItem(
      storageKey(quizPath),
      JSON.stringify({ version: STORAGE_VERSION, answers } satisfies Persisted),
    );
  } catch {
    // Storage is a convenience here, never the record. Losing it costs the
    // reader their place and nothing else.
  }
}

/** The letter an author and a reader both use for an option index. */
function letterOf(index: number): string {
  return String.fromCharCode(65 + index);
}

export function Quiz({ quiz }: { quiz: QuizEntry }): ReactElement {
  const size = quiz.questionsPerRound;
  const banked = quiz.questions.length;
  const canRedraw = hasMoreRounds(banked, size);

  // Round zero is the authored order, chosen on the server AND the client so
  // the first paint matches: `roundOf` returns the bank untouched when it fits
  // in one round, and for a larger bank the shuffle happens only after mount
  // (see the effect below). Sampling during render would differ between the
  // server HTML and the first client render and would hydrate mismatched.
  const [round, setRound] = useState<readonly QuizQuestion[]>(() =>
    roundOf(quiz.questions, size, () => 0),
  );
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [hydrated, setHydrated] = useState(false);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setAnswers(readPersisted(quiz.path));
    if (canRedraw) setRound(roundOf(quiz.questions, size, Math.random));
    setHydrated(true);
  }, [quiz.path, quiz.questions, size, canRedraw]);

  const current = round[index];
  const chosen = current === undefined ? undefined : answers[current.hash];
  const answered = chosen !== undefined;

  const answeredCount = useMemo(
    () => round.filter((q) => answers[q.hash] !== undefined).length,
    [round, answers],
  );
  const correctCount = useMemo(
    () => round.filter((q) => answers[q.hash] === q.answer).length,
    [round, answers],
  );

  const choose = useCallback(
    (option: number) => {
      if (current === undefined || answers[current.hash] !== undefined) return;
      const next = { ...answers, [current.hash]: option };
      setAnswers(next);
      writePersisted(quiz.path, next);
    },
    [answers, current, quiz.path],
  );

  const newRound = useCallback(() => {
    setRound(roundOf(quiz.questions, size, Math.random));
    setAnswers({});
    writePersisted(quiz.path, {});
    setIndex(0);
    setDone(false);
  }, [quiz.questions, size, quiz.path]);

  const retry = useCallback(() => {
    setAnswers({});
    writePersisted(quiz.path, {});
    setIndex(0);
    setDone(false);
  }, [quiz.path]);

  if (current === undefined) return <></>;

  if (done) {
    return (
      <section aria-label="Quiz results">
        <StudyAidHeader title={quiz.title} description={quiz.description} />
        <Card className="mx-auto max-w-2xl">
          <CardContent className="flex flex-col items-center gap-6 py-12 text-center">
            <p className="font-(family-name:--font-display) text-5xl font-semibold tabular-nums text-fd-foreground">
              {correctCount}
              <span className="text-fd-muted-foreground">/{round.length}</span>
            </p>
            <p className="max-w-sm text-sm text-fd-muted-foreground">
              {/* No pass mark, deliberately: this checks understanding of a
                  document, it does not certify anybody. */}
              Answers are kept in this browser only.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={() => setIndex(0)}>
                Review answers
              </Button>
              {canRedraw ? (
                <Button onClick={newRound}>
                  <RotateCcw aria-hidden className="size-4" />
                  Another round
                </Button>
              ) : (
                <Button onClick={retry}>
                  <RotateCcw aria-hidden className="size-4" />
                  Start again
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section aria-label="Quiz">
      <StudyAidHeader title={quiz.title} description={quiz.description} />

      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <p className="font-mono text-xs tracking-wide text-fd-muted-foreground uppercase">
            Question {index + 1} / {round.length}
            {canRedraw ? <span> · drawn from {banked}</span> : null}
          </p>
          <p className="font-mono text-xs tabular-nums text-fd-muted-foreground">
            {answeredCount} answered
          </p>
        </div>
        <Progress value={(answeredCount / round.length) * 100} className="mb-8 h-1" />

        <Card>
          <CardContent className="flex flex-col gap-6 py-8">
            <h3 className="text-lg leading-snug font-medium text-balance text-fd-foreground">
              {current.question}
            </h3>

            <ul className="flex flex-col gap-2">
              {current.options.map((option, i) => {
                const isAnswer = i === current.answer;
                const isChoice = i === chosen;
                // Three things have to be legible at once after a wrong
                // answer, and they are three different facts: which option is
                // RIGHT (green), which one is WRONG (red), and which one YOU
                // picked (the accent ring). The accent alone cannot carry two
                // of those, which is what it was doing — the correct option
                // wore the same colour as a selection, so choosing wrongly
                // looked like the page had answered for you.
                //
                // Colour is never the only channel: the check and cross icons
                // and the verdict line below say the same thing in shape and
                // in words.
                //
                // Plain CSS classes, not Tailwind arbitrary values: a
                // `border-[color:var(--x)]` utility did not paint in a real
                // build even with the rule in the stylesheet and the token
                // resolving on the element. `app/global.css` is where this
                // record's semantic colour already lives.
                const tone = !answered
                  ? "border-fd-border hover:border-fd-primary/60 hover:bg-fd-accent"
                  : isAnswer
                    ? "ksor-answer-correct"
                    : isChoice
                      ? "ksor-answer-wrong"
                      : "border-fd-border opacity-60";
                // Your own pick keeps the accent, whether it was right or
                // wrong, so "what I chose" is never in doubt.
                const mine = answered && isChoice ? " ksor-answer-mine" : "";
                return (
                  <li key={option}>
                    <button
                      type="button"
                      disabled={answered}
                      onClick={() => choose(i)}
                      aria-pressed={isChoice}
                      className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors motion-safe:duration-150 ${tone}${mine} ${answered ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <span className="mt-px font-mono text-xs text-fd-muted-foreground">
                        {letterOf(i)}
                      </span>
                      <span className="flex-1 text-fd-foreground">{option}</span>
                      {answered && isAnswer ? (
                        <Check
                          aria-label="correct answer"
                          className="ksor-answer-correct-text size-4 shrink-0"
                        />
                      ) : null}
                      {answered && isChoice && !isAnswer ? (
                        <X
                          aria-label="your answer, which is wrong"
                          className="ksor-answer-wrong-text size-4 shrink-0"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            {answered ? (
              <div
                // Announced, because the whole value of the immediate-feedback
                // model is this text, and a reader using a screen reader gets
                // it only if the region says it changed.
                role="status"
                className="motion-safe:animate-in motion-safe:fade-in flex flex-col gap-3 border-t border-fd-border pt-5 text-sm"
              >
                <p className="font-mono text-xs tracking-wide uppercase">
                  {chosen === current.answer ? (
                    <span className="ksor-answer-correct-text">Correct</span>
                  ) : (
                    <span className="ksor-answer-wrong-text">
                      Not quite — the answer is {letterOf(current.answer)}
                    </span>
                  )}
                </p>
                <p className="leading-relaxed text-fd-muted-foreground">{current.explanation}</p>
                {current.source === undefined ? null : (
                  // "In the document", never "Source": a citation in this
                  // product carries a generation, and an attachment has no id
                  // to pin — calling this a source would sell provenance that
                  // is not here (spec §3).
                  <p className="font-mono text-xs text-fd-muted-foreground">
                    In the document: {current.source}
                  </p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            Back
          </Button>
          {index === round.length - 1 ? (
            <Button disabled={!answered} onClick={() => setDone(true)}>
              Finish
            </Button>
          ) : (
            <Button disabled={!answered} onClick={() => setIndex((i) => i + 1)}>
              Next
            </Button>
          )}
        </div>

        {/* Rendered only once the reader's own answers are in, so the server
            HTML never claims a state this reader is not in. */}
        {hydrated && answeredCount > 0 && !done ? (
          <p className="mt-4 text-center font-mono text-xs text-fd-muted-foreground">
            {correctCount} of {answeredCount} correct so far
          </p>
        ) : null}
      </div>
    </section>
  );
}
