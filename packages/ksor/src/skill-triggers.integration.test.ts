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
  "add-sources": ["add this to the knowledge base", "nobody ever wrote down", "from memory"],
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

/**
 * Tutorial 2's prompts. Two fire add-sources — one for a FILE, one for a PERSON
 * — which is the decision on #50 made visible: same skill, two kinds of source.
 */
const TUTORIAL_2_PROMPTS: ReadonlyArray<readonly [string, string | null]> = [
  ["Get me started — run the intake interview", "intake-interview"],
  ["Here is our expense policy, `src/expense-policy.pdf`", "add-sources"],
  ["Nobody ever wrote down how we handle a late expense claim", "add-sources"],
  ["Show me both on the site", null],
  ["Approved — record both as me", null],
  ["Delete the five starter documents", null],
];

/**
 * Tutorial 3's prompts. Governance is edited, never mediated: an audience, a
 * review, a date, a withdrawal are frontmatter and ledger acts the record
 * itself refuses or admits, so no skill stands between the owner and them.
 * The one exception is the successor policy, written from what the owner
 * simply states — the #50 shape again, and add-sources owns it.
 */
const TUTORIAL_3_PROMPTS: ReadonlyArray<readonly [string, string | null]> = [
  ["The late-claims procedure is for employees only", null],
  ["Omar has reviewed the expense policy against the finance manual", null],
  ["The expense policy takes effect on 1 October 2026", null],
  ["The refund window is now 14 days for unwanted items", "add-sources"],
  ["Withdraw the late-claims procedure from every surface", null],
  ["Priya has rewritten the late-claims procedure", null],
  // The record answers this one, not the agent: the ledger is append-only and
  // `ksor build` refuses the deletion by name. The prompt is in the tutorial
  // BECAUSE it sounds reasonable — that is what a fail-closed refusal is for.
  ["Delete the takedown entry from the ledger", null],
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

/**
 * Tutorial 4's prompts. None fires a skill, and that is the finding worth
 * keeping: the served rung is run by VERBS the scaffold's scripts already name
 * (`provision`, `refresh`, `serve`, `calibrate`), and the three questions at
 * the end are the reader asking the RECORD through the door — answered, or
 * refused, by the product rather than by the agent's competence. The one
 * prompt that edits the record ("say what happens to an exchange") is the
 * add-sources shape from tutorial 2, and names it.
 */
const TUTORIAL_4_PROMPTS: ReadonlyArray<readonly [string, string | null]> = [
  ["Provision the database — `npm run provision`", null],
  ["Publish the record — `npm run refresh`", null],
  ["Here are eight questions our record answers", null],
  ["Now measure it against questions just outside our scope", null],
  ["Nobody ever wrote down what happens to an exchange", "add-sources"],
  ["Paste the retrieval block into `instance.md`", null],
  // The three-question test, and the one after the takedown: the reader
  // asking the RECORD. The middle one is the only passing answer that is an
  // abstention, and the product — not the agent — is what produces it.
  ["What's the meal allowance when I'm away on business?", null],
  ["How many weeks of parental leave do we get?", null],
  ["What is the boiling point of water at sea level?", null],
  ["Run `ksor calibrate --check`", null],
  ["Take `finance/late-claims` down", null],
  ["What happens to a late claim from a director?", null],
];

/** Every tutorial that hands the reader prompts, with the table that accounts for them. */
const TUTORIALS: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string | null]>]> =
  [
    ["docs/tutorials/01-hello-world.md", TUTORIAL_PROMPTS],
    ["docs/tutorials/02-make-it-yours.md", TUTORIAL_2_PROMPTS],
    ["docs/tutorials/03-governance-in-practice.md", TUTORIAL_3_PROMPTS],
    ["docs/tutorials/04-serve-it.md", TUTORIAL_4_PROMPTS],
  ];

describe.each(TUTORIALS)("%s's prompts are accounted for", (file, table) => {
  const tutorial = readFileSync(path.join(repoRoot, file), "utf8");

  it("every prompt in this table is still in the tutorial", () => {
    for (const [prompt] of table) {
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
    expect(blocks.length, "the tutorial's prompt blocks").toBe(table.length);
    for (const block of blocks) {
      const known = table.some(([prompt]) => block.includes(prompt));
      expect(
        known,
        `the tutorial gives a prompt this table does not account for: ${JSON.stringify(block.slice(0, 70))}. ` +
          "Add it, naming the skill that answers it or `null` for ordinary agent work.",
      ).toBe(true);
    }
  });

  it("each prompt claiming a skill names one that ships", () => {
    for (const [prompt, skill] of table) {
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
describe("knowledge that exists only in someone's head has a skill (#50, decided 2026-09-02)", () => {
  // The decision: ONE skill, not a sibling. The record draws no line between a
  // file and a person as a source — an interview attestation in
  // `sources[].resource` passes `ksor build` today — and a real owner has
  // both: the PDF, and the exception the PDF never mentions. So add-sources
  // converts the file AND asks what it does not cover, every time. A sibling
  // would have forced the agent to choose before it knew.
  it("add-sources claims dictated knowledge, by name", () => {
    const description = descriptionOf("add-sources").toLowerCase();
    expect(description).toContain("nobody ever wrote down");
    expect(description).toContain("from memory");
  });

  it("no OTHER skill claims it — the boundary stays disjoint", () => {
    for (const skill of shipped.filter((s) => s !== "add-sources")) {
      const description = descriptionOf(skill).toLowerCase();
      for (const phrase of ["from memory", "nobody ever wrote down", "no source"]) {
        expect(description.includes(phrase), `${skill} also claims ${JSON.stringify(phrase)}`).toBe(
          false,
        );
      }
    }
  });

  it("the skill ENDS with the approval act — a draft-only record publishes nothing", () => {
    // Found on the journey walk: an owner who writes one elicited draft gets
    // `1 document(s), 0 admitted` until they approve it. Every machine surface
    // stays empty. The skill has to close the loop, not stop at the draft.
    const body = readFileSync(path.join(SKILLS, "add-sources", "SKILL.md"), "utf8");
    expect(body).toMatch(/ask them to approve/i);
    expect(body).toMatch(/Never record an approval\s+nobody gave/);
  });
});
