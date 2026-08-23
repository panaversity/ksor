/**
 * Mechanical hygiene checks for a quiz, run before it can be published.
 *
 * Carried from the predecessor's `scripts/quiz-audit/` under decision 6, and
 * carried because of what its own README records: these bugs SHIPPED and were
 * found by students rather than by the project — every correct answer at
 * position A across 9 quizzes and 451 questions, explanations dismissing their
 * own marked answer, and the correct option systematically the longest. Its
 * `findings-2026-04-14.txt` still reports 88% pick-longest in one file, which
 * is the argument for running this in the build instead of on request: the
 * script existed, and the findings sat.
 *
 * What is NOT carried is its thresholds. It targets a 15-35% distribution,
 * which a five-question bank cannot satisfy without the checker dictating the
 * answers. These are floors against the shipped bug, not a distribution target
 * — see MIN_BANK_FOR_RATIOS.
 *
 * A LEAF: no imports, so the site's build and the record's checker can both
 * hold this rule without either taking the other's dependencies.
 */

/** One question, in the shape the audit needs — a structural subset of the schema. */
export interface AuditQuestion {
  readonly question: string;
  readonly options: readonly string[];
  readonly answer: number;
  readonly explanation?: string | undefined;
}

export interface AuditQuiz {
  readonly quiz: { readonly title: string };
  readonly questions: readonly AuditQuestion[];
}

export interface QuizFinding {
  readonly slug: string;
  /** 1-based question numbers, so a human can find them in the file. */
  readonly questions: readonly number[];
  /** What was measured, with the number that failed. */
  readonly detail: string;
}

export const QUIZ_AUDIT_SLUGS = [
  "ksor-quiz-answer-bias",
  "ksor-quiz-length-bias",
  "ksor-quiz-answer-run",
  "ksor-quiz-contradiction",
  "ksor-quiz-duplicate-stem",
] as const;

/**
 * Below this many questions the ratio checks do not run.
 *
 * A four-question bank cannot spread answers across four indices without the
 * checker deciding which option is correct, and a record's answers are the
 * record's business. The run and contradiction checks have no such floor —
 * they are wrong at any size.
 */
export const MIN_BANK_FOR_RATIOS = 5;
/** Above this share of answers on one index, the reader can guess. */
export const MAX_INDEX_SHARE = 0.6;
/** Above this share, "always pick the longest" is a winning strategy. */
export const MAX_STRATEGY_WIN = 0.6;
/** A run this long reads as a pattern rather than as chance. */
export const MAX_SAME_ANSWER_RUN = 3;
/** Two stems sharing this much of their opening are the same question twice. */
export const STEM_PREFIX = 60;

/** Letters for the dismissal check: `answer: 0` is spoken about as "A". */
const LETTERS = "ABCDEFGH";

/**
 * Phrases that dismiss an option, paired with how an author names it.
 *
 * Deliberately narrow. A broad reading of explanation prose refuses honest
 * text — "option B is wrong" is exactly what a good explanation SAYS about the
 * distractors, so only a phrase naming the MARKED answer is a contradiction.
 */
function dismissalsOf(letter: string, index: number): readonly RegExp[] {
  const names = [`option ${letter}`, `\\(${letter}\\)`, `answer ${letter}`, `option ${index + 1}`];
  const verdicts = ["is wrong", "is incorrect", "is not correct", "is false"];
  return names.flatMap((name) =>
    verdicts.map((verdict) => new RegExp(`${name}\\b[^.]{0,40}?${verdict}`, "i")),
  );
}

/**
 * The option a length strategy would pick, or null when nothing is picked.
 *
 * A TIE is not a win. If two options are the longest, "always pick the longest"
 * does not name an answer, so counting it as a win would report 100% on a quiz
 * whose options are all deliberately the same length — which is the shape the
 * check exists to encourage. Found by the conformance table: options of equal
 * length scored as pick-longest wins on every question.
 */
function uniqueExtreme(options: readonly string[], want: "long" | "short"): number | null {
  const lengths = options.map((o) => o.length);
  const target = want === "long" ? Math.max(...lengths) : Math.min(...lengths);
  const hits = lengths.flatMap((len, i) => (len === target ? [i] : []));
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

/**
 * Every hygiene problem in this quiz, or an empty array.
 *
 * Pure and total: it never throws on a malformed quiz, because the schema is
 * what refuses that and an audit that threw would replace a precise schema
 * error with a vague one.
 */
export function auditQuiz(quiz: AuditQuiz): readonly QuizFinding[] {
  const findings: QuizFinding[] = [];
  const questions = quiz.questions;
  const total = questions.length;
  if (total === 0) return findings;

  if (total >= MIN_BANK_FOR_RATIOS) {
    // Answer-position bias — the predecessor's 451-question bug.
    const byIndex = new Map<number, number[]>();
    questions.forEach((q, i) => {
      byIndex.set(q.answer, [...(byIndex.get(q.answer) ?? []), i + 1]);
    });
    for (const [index, numbers] of [...byIndex].sort((a, b) => b[1].length - a[1].length)) {
      const share = numbers.length / total;
      if (share > MAX_INDEX_SHARE) {
        findings.push({
          slug: "ksor-quiz-answer-bias",
          questions: numbers,
          detail: `${numbers.length} of ${total} answers (${Math.round(share * 100)}%) are option ${LETTERS[index] ?? index}, above ${Math.round(MAX_INDEX_SHARE * 100)}% — a reader can pass by guessing it`,
        });
        break;
      }
    }

    // Length bias, both directions: if either "always pick the longest" or
    // "always pick the shortest" wins, the reader never has to read.
    for (const want of ["long", "short"] as const) {
      const label = want === "long" ? "longest" : "shortest";
      const wins = questions.flatMap((q, i) =>
        uniqueExtreme(q.options, want) === q.answer ? [i + 1] : [],
      );
      const share = wins.length / total;
      if (share > MAX_STRATEGY_WIN) {
        findings.push({
          slug: "ksor-quiz-length-bias",
          questions: wins,
          detail: `picking the ${label} option answers ${wins.length} of ${total} (${Math.round(share * 100)}%), above ${Math.round(MAX_STRATEGY_WIN * 100)}% — the answer is visible without reading`,
        });
        break;
      }
    }
  }

  // A run of identical answers. No size floor: it is a pattern at any length.
  let runStart = 0;
  for (let i = 1; i <= total; i++) {
    const same = i < total && questions[i]?.answer === questions[runStart]?.answer;
    if (same) continue;
    const length = i - runStart;
    if (length > MAX_SAME_ANSWER_RUN) {
      const numbers = Array.from({ length }, (_, k) => runStart + k + 1);
      findings.push({
        slug: "ksor-quiz-answer-run",
        questions: numbers,
        detail: `questions ${numbers[0]}-${numbers[numbers.length - 1]} all answer option ${LETTERS[questions[runStart]?.answer ?? 0] ?? "?"} — ${length} in a row, above ${MAX_SAME_ANSWER_RUN}`,
      });
    }
    runStart = i;
  }

  // An explanation that dismisses the answer the quiz marks correct. One of
  // the two is wrong and neither the reader nor the author can tell which.
  const contradicting = questions.flatMap((q, i) => {
    const text = q.explanation ?? "";
    if (text === "") return [];
    const letter = LETTERS[q.answer] ?? String(q.answer);
    return dismissalsOf(letter, q.answer).some((re) => re.test(text)) ? [i + 1] : [];
  });
  if (contradicting.length > 0) {
    findings.push({
      slug: "ksor-quiz-contradiction",
      questions: contradicting,
      detail: `the explanation calls the marked answer wrong — either the answer index or the explanation is incorrect`,
    });
  }

  // Two questions opening identically are the same question twice.
  const seen = new Map<string, number>();
  const duplicates: number[] = [];
  questions.forEach((q, i) => {
    const key = q.question.trim().slice(0, STEM_PREFIX).toLowerCase();
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i + 1);
    else duplicates.push(first, i + 1);
  });
  if (duplicates.length > 0) {
    findings.push({
      slug: "ksor-quiz-duplicate-stem",
      questions: [...new Set(duplicates)].sort((a, b) => a - b),
      detail: `two questions share their first ${STEM_PREFIX} characters`,
    });
  }

  return findings;
}

/** A bank whose answers cycle, so no ratio, run or duplicate rule fires. */
function clean(count: number): readonly AuditQuestion[] {
  return Array.from({ length: count }, (_, i) => ({
    question: `Question ${i} about a distinct matter entirely, worded at length`,
    // All the same length on purpose: the clean bank must be clean on the
    // length rule too, and equal-length options are what an author should aim
    // for anyway.
    options: ["option alpha", "option gamma", "option delta", "option omega"],
    answer: i % 4,
    explanation: "The marked option follows from the document.",
  }));
}

/**
 * The rule, as a decision table.
 *
 * The checker implements these same rules in plain JS because it cannot import
 * TypeScript, so this table is what both halves are asserted against rather
 * than each being internally consistent with itself — the shape decision 18
 * exists to enforce.
 */
export const QUIZ_AUDIT_CASES = [
  {
    name: "a balanced bank is clean",
    quiz: { quiz: { title: "Clean" }, questions: clean(8) },
    expect: [] as readonly string[],
  },
  {
    name: "every answer at A",
    quiz: {
      quiz: { title: "Bias" },
      questions: clean(8).map((q) => ({ ...q, answer: 0 })),
    },
    expect: ["ksor-quiz-answer-bias", "ksor-quiz-answer-run"],
  },
  {
    name: "the correct option is always the longest",
    quiz: {
      quiz: { title: "Length" },
      questions: clean(8).map((q, i) => ({
        ...q,
        options: q.options.map((o, k) => (k === i % 4 ? `${o} with considerably more words` : o)),
      })),
    },
    expect: ["ksor-quiz-length-bias"],
  },
  {
    name: "four consecutive questions share an answer",
    quiz: {
      quiz: { title: "Run" },
      // 12 questions so the four-long run cannot also trip the ratio rule.
      questions: clean(12).map((q, i) => (i < 4 ? { ...q, answer: 1 } : q)),
    },
    expect: ["ksor-quiz-answer-run"],
  },
  {
    name: "an explanation dismisses its own marked answer",
    quiz: {
      quiz: { title: "Contradiction" },
      questions: clean(8).map((q, i) =>
        i === 2
          ? { ...q, answer: 1, explanation: "Option B is wrong because it inverts the rule." }
          : q,
      ),
    },
    expect: ["ksor-quiz-contradiction"],
  },
  {
    name: "an explanation dismissing a DISTRACTOR is honest text, not a finding",
    quiz: {
      quiz: { title: "Honest" },
      questions: clean(8).map((q, i) =>
        i === 2
          ? { ...q, answer: 2, explanation: "Option B is wrong because it inverts the rule." }
          : q,
      ),
    },
    expect: [] as readonly string[],
  },
  {
    name: "two questions open identically",
    quiz: {
      quiz: { title: "Duplicate" },
      questions: clean(8).map((q, i) => (i === 5 ? { ...q, question: clean(8)[1]!.question } : q)),
    },
    expect: ["ksor-quiz-duplicate-stem"],
  },
] as const;
