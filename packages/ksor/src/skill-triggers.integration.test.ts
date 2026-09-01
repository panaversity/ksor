/**
 * A skill's `description` is its TRIGGER, and nothing measured it (#30).
 *
 * Guard rule 3 checks that the frontmatter `name` matches the directory — the
 * label on the tin. What decides whether a skill ever runs is the prose an
 * agent reads to choose it, and that has been graded by eye.
 *
 * This is the deterministic half, and only that. It cannot know whether a model
 * would actually fire a skill on a given sentence; the model-scored half is the
 * eval harness #30 asks for, which spends tokens and belongs in CI. What it CAN
 * do is hold the two halves of a promise together:
 *
 *   the tutorial tells a reader to say a sentence to their agent
 *   a skill's trigger claims to fire on sentences like it
 *
 * Those were coupled the day the hello world was written and nothing joined
 * them. A prompt whose skill is deleted, renamed, or re-triggered leaves the
 * tutorial telling readers to say something no skill answers — and the reader,
 * not the test suite, finds out.
 *
 * Every prompt is therefore accounted for: matched to a skill, or listed as
 * deliberately needing none. There is no third option, which is the point —
 * a NEW prompt in the tutorial fails here until someone decides which it is.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SKILLS = path.join(repoRoot, "packages/ksor/templates/scaffold/.agents/skills");

function descriptionOf(skill: string): string {
  const text = readFileSync(path.join(SKILLS, skill, "SKILL.md"), "utf8");
  const line = /^description:\s*(.+)$/m.exec(text);
  if (line?.[1] === undefined) throw new Error(`${skill}/SKILL.md has no description`);
  return line[1];
}

const shipped = readdirSync(SKILLS, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

/**
 * What each shipped skill claims to fire on, as the phrase an owner would
 * actually say. Written out here rather than read from the file, so a trigger
 * that is quietly narrowed fails against what it was understood to promise.
 */
const TRIGGERS: Readonly<Record<string, readonly string[]>> = {
  "add-sources": ["add this to the knowledge base"],
  "make-summary": ["summarise X", "give me the short version"],
  "make-slides": ["make slides for X", "turn this into a deck"],
  "intake-interview": ["get started with"],
  "format-checker": ["pnpm check"],
};

/**
 * Every prompt the hello world tells a reader to say, and the skill that owns
 * it — or `null`, meaning it is ordinary agent work no skill mediates.
 *
 * The `null` rows are not a loophole; they are the finding. Running a command,
 * editing a config file and reading a build's output need no skill and should
 * have none. Writing a document from something the owner simply KNOWS is a
 * different matter, and it is called out below.
 */
const TUTORIAL_PROMPTS: ReadonlyArray<readonly [string, string | null]> = [
  ["Install the dependencies and start the site", null],
  ["Add a document to `knowledge/` about our refund policy", "add-sources"],
  ["Build this for publishing", null],
  ["Why isn't my refund policy in `llms.txt`", null],
  ["Using the Neon MCP server, create a project", null],
  ["Run `npm run provision`, then `npm run refresh`", null],
  ["Start the server in the background", null],
  ["Add my record to `.mcp.json`", null],
  // The payoff. No skill: this is the reader ASKING THE RECORD, through the MCP
  // door they just stood up — the one prompt in the tutorial answered by the
  // product rather than by the agent's own competence.
  ["How long does a customer have to return something?", null],
];

describe("every shipped skill's trigger says what it fires on", () => {
  it("the shipped set is exactly what this file accounts for", () => {
    // A new skill lands with its trigger recorded, or this goes red. That is
    // the cheapest form of "a skill nobody can show winning is deleted".
    expect(shipped).toEqual(Object.keys(TRIGGERS).sort());
  });

  it.each(Object.entries(TRIGGERS))("%s still claims its trigger phrases", (skill, phrases) => {
    const description = descriptionOf(skill);
    for (const phrase of phrases) {
      expect(
        description.includes(phrase),
        `${skill}'s description no longer contains ${JSON.stringify(phrase)} — the phrase ` +
          "an owner says is what makes an agent choose this skill, so narrowing it silently " +
          "stops the skill firing",
      ).toBe(true);
    }
  });

  it("no skill's description is so short it cannot trigger", () => {
    // A one-line description is a skill that fires on nothing in particular.
    for (const skill of shipped) {
      expect(descriptionOf(skill).length, `${skill} description`).toBeGreaterThan(80);
    }
  });
});

describe("the hello world's prompts are accounted for", () => {
  const tutorial = readFileSync(path.join(repoRoot, "docs/tutorials/00-hello-world.md"), "utf8");

  it("every prompt in this table is still in the tutorial", () => {
    for (const [prompt] of TUTORIAL_PROMPTS) {
      expect(
        tutorial.includes(prompt),
        `the tutorial no longer says ${JSON.stringify(prompt)}`,
      ).toBe(true);
    }
  });

  it("every prompt the tutorial gives is in this table", () => {
    // Extracted from the blockquotes the tutorial uses for prompts. A NEW
    // prompt fails here until someone says which skill answers it — which is
    // the coupling that otherwise exists only in whoever wrote both.
    const blocks = [...tutorial.matchAll(/^> \*\*Ask your agent:\*\*\n((?:^> .*\n)+)/gm)].map((m) =>
      (m[1] ?? "").replaceAll(/^> /gm, "").replaceAll("\n", " "),
    );
    expect(blocks.length, "the tutorial's prompt blocks").toBe(TUTORIAL_PROMPTS.length);
    for (const block of blocks) {
      const known = TUTORIAL_PROMPTS.some(([prompt]) => block.includes(prompt));
      expect(
        known,
        `the tutorial gives a prompt this table does not account for: ${JSON.stringify(block.slice(0, 70))}. ` +
          "Add it, naming the skill that answers it or `null` for ordinary agent work.",
      ).toBe(true);
    }
  });

  it("each prompt claiming a skill names one that ships", () => {
    for (const [prompt, skill] of TUTORIAL_PROMPTS) {
      if (skill === null) continue;
      expect(shipped, `${JSON.stringify(prompt)} expects ${skill}`).toContain(skill);
    }
  });
});

/**
 * THE GAP THIS FOUND, recorded as a test rather than as a note.
 *
 * The tutorial's step 3 asks the agent to write a document from a fact the
 * owner simply states. The nearest skill is `add-sources`, whose whole
 * discipline is PROVENANCE — "turn source material — documents, pages, pasted
 * text, notes — into governed knowledge". A remembered fact has no source, so
 * routing it there either produces a document citing nothing or quietly
 * stretches a skill built around citation.
 *
 * That is issue #50 — "an owner whose knowledge is only in their head has no
 * path into the record" — reached from a different direction, and it is not
 * fixable by editing a description. This asserts the CURRENT state so the day
 * it changes is a day someone decided to change it.
 */
describe("the uncovered act: knowledge that exists only in someone's head", () => {
  it("no shipped skill triggers on dictating a fact with no source", () => {
    const dictation = ["tell you a fact", "write down what I", "from memory", "no source"];
    for (const skill of shipped) {
      const description = descriptionOf(skill).toLowerCase();
      for (const phrase of dictation) {
        expect(
          description.includes(phrase),
          `${skill} now claims to handle dictated knowledge (${JSON.stringify(phrase)}). ` +
            "That is issue #50 and it is a design decision, not a description edit: " +
            "`add-sources` is built around provenance, and a remembered fact has none. " +
            "Update this test in the change that decides it.",
        ).toBe(false);
      }
    }
  });

  it("add-sources is still about SOURCE material, so the gap is real", () => {
    expect(descriptionOf("add-sources")).toContain("source material");
  });
});
