import { z } from "zod";

/**
 * The shape of a `<doc>.teaching.yaml`.
 *
 * How to TEACH a document to someone new to it — for whoever is onboarding a
 * hire or handing a process to another team, not for the reader. See
 * `specs/ksor/teaching-guide/spec.md`.
 *
 * The predecessor read all of this from the lesson's own YAML frontmatter,
 * roughly ten keys with nested objects. That model is not carried: this
 * record's frontmatter is a closed key set and is where GOVERNANCE lives, and
 * pedagogy is not governance. An attachment leaves the document untouched.
 *
 * No authored ids, as everywhere else here: the path is the identity.
 */

/**
 * What people get wrong — optionally paired with the correction.
 *
 * A bare string is accepted because most authors have the misconception before
 * they have a crisp correction, and refusing the half they have would mean
 * losing it. `instead` is where the other half goes when they do.
 */
export const MisconceptionSchema = z.union([
  z.string().min(1).max(300),
  z.object({
    text: z.string().min(1).max(300),
    instead: z.string().min(1).max(400).optional(),
  }),
]);

/**
 * An objective, as prose.
 *
 * `level` is FREE TEXT and deliberately unvalidated. The predecessor validates
 * a Bloom level, a proficiency band and a DigComp area, and it is entitled to:
 * it is a curriculum and that taxonomy is part of its product. Here the same
 * enum would be an unenforced vocabulary that looks governed — a knowledge
 * system of record has no business ratifying a theory of learning. An adopter
 * running a real curriculum can still write `level: A2` and see it rendered.
 */
export const ObjectiveSchema = z.union([
  z.string().min(1).max(300),
  z.object({
    objective: z.string().min(1).max(300),
    level: z.string().max(40).optional(),
  }),
]);

const Notes = z.array(z.string().min(1).max(400)).max(20);

export const TeachingSchema = z
  .object({
    teaching: z.object({
      title: z.string().min(1).max(120),
      /** Who this session is for — "New managers, in their first week". */
      audience: z.string().max(200).optional(),
      /** Free text: "20 minutes". Not a number — a range is a real answer. */
      duration: z.string().max(60).optional(),
    }),
    prerequisites: Notes.optional(),
    objectives: z.array(ObjectiveSchema).max(20).optional(),
    key_points: Notes.optional(),
    misconceptions: z.array(MisconceptionSchema).max(20).optional(),
    discussion: Notes.optional(),
    check: Notes.optional(),
    tips: Notes.optional(),
  })
  .superRefine((value, ctx) => {
    // A guide with a title and nothing else renders a control that opens an
    // empty sheet — a promise the page cannot keep. Refused here rather than
    // rendered, because an empty panel is worse than no button (spec §7.7).
    const sections = [
      value.prerequisites,
      value.objectives,
      value.key_points,
      value.misconceptions,
      value.discussion,
      value.check,
      value.tips,
    ];
    if (!sections.some((s) => s !== undefined && s.length > 0)) {
      ctx.addIssue({
        code: "custom",
        message:
          "ksor-teaching-empty: this guide has a title and no content, so it would render a control that opens an empty panel — add at least one of key_points, misconceptions, discussion, check, tips, objectives or prerequisites",
      });
    }
  });

export type Teaching = z.infer<typeof TeachingSchema>;
export type Misconception = z.infer<typeof MisconceptionSchema>;
export type Objective = z.infer<typeof ObjectiveSchema>;
