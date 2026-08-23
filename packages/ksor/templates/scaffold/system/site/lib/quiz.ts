import { z } from "zod";

import { QUIZ_AUDIT_SLUGS, auditQuiz, type QuizFinding } from "./quiz-audit.js";

/**
 * The shape of a `<doc>.quiz.yaml`.
 *
 * NO AUTHORED IDS, as with the deck: the quiz's identity is its path and a
 * question's identity is its own text. See `lib/deck.ts` for the full argument.
 *
 * Two of the predecessor's hard requirements are deliberately not here, and the
 * spec (`specs/ksor/quiz/spec.md` §6) records why: exactly four options, and a
 * bank of exactly fifty. Both are conventions from timed multiple-choice exams,
 * and a governed record's document may honestly warrant five questions with
 * three options each. Quality is protected by the audit instead of by a count.
 */
export const QuestionSchema = z.object({
  question: z.string().min(1).max(400),
  /**
   * Two to six. Two is a true/false question, which is a legitimate check on a
   * policy statement; past six the reader is scanning a list rather than
   * choosing.
   */
  options: z.array(z.string().min(1).max(300)).min(2).max(6),
  /** Zero-based index into `options`. Range is checked below, against THIS question. */
  answer: z.number().int().min(0),
  /**
   * Required. The predecessor's immediate-feedback model teaches through the
   * mistake, and a wrong answer with no explanation teaches nothing at all —
   * which is the whole reason to put a quiz in a record rather than a course.
   */
  explanation: z.string().min(1).max(1200),
  /**
   * Where in the document the answer lives — prose, not a citation.
   *
   * Deliberately NOT called a source in the UI. A citation in this product
   * carries a generation (product invariant 1) and an attachment has no id to
   * pin, so presenting this as one would be selling provenance we do not have.
   */
  source: z.string().max(200).optional(),
});

export const QuizSchema = z
  .object({
    quiz: z.object({
      title: z.string().min(1).max(120),
      description: z.string().max(300).optional(),
      /** How many questions one round shows. See `roundOf`. */
      questionsPerRound: z.number().int().min(1).max(50).optional(),
    }),
    questions: z.array(QuestionSchema).min(1).max(200),
  })
  .superRefine((value, ctx) => {
    // The answer index must point at an option THIS question has. A schema-wide
    // max would admit `answer: 3` on a two-option question, which renders as a
    // quiz nobody can pass and no error anybody can see.
    value.questions.forEach((q, i) => {
      if (q.answer >= q.options.length) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", i, "answer"],
          message: `answer ${q.answer} is out of range: question ${i + 1} has ${q.options.length} options, so the last valid index is ${q.options.length - 1}`,
        });
      }
    });

    // The audit runs as part of parsing, so a quiz that would let a reader
    // guess cannot be loaded at all — not by a separate pass somebody has to
    // remember to run. This is the predecessor's mistake corrected: it had
    // these checks and they lived in a script (spec §5).
    for (const finding of auditQuiz(value)) {
      ctx.addIssue({
        code: "custom",
        path: ["questions"],
        message: `${finding.slug}: ${finding.detail} (questions ${finding.questions.join(", ")})`,
      });
    }
  });

export type Quiz = z.infer<typeof QuizSchema>;
export type Question = z.infer<typeof QuestionSchema>;

/** Re-exported so a caller needs one import to name what refused it. */
export { QUIZ_AUDIT_SLUGS, type QuizFinding };
