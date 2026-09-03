/**
 * WHICH skill a real agent reaches for — the half of #30 the content eval
 * cannot answer.
 *
 * `skill-triggers.integration.test.ts` checks that a description still contains
 * the phrases it promises. That is a string test, and it passes on a
 * description no agent ever acts on. `skill-add-sources.agent.test.ts` measures
 * what an agent PRODUCES, and its own runs showed the record coming out
 * well-formed whether or not the skill was present. Neither can say whether the
 * skill fires.
 *
 * A live walk of the published 0.0.59 (2026-09-03) found that it does not.
 * Given "Here is our expense policy in src/policy.txt. Add it to the record
 * under finance/" — all but verbatim from `add-sources`' own description, which
 * claims "Use when the owner shares material to add" — the agent made ZERO
 * Skill calls across eight tool uses, with the skill discovered (it appears in
 * the session's own `skills` list) and `Skill` in `--allowedTools`. The record
 * still came out right, because the emitted AGENTS.md is ~57 KB and always
 * resident, so the rules were in context anyway.
 *
 * That is a finding about the skill, not a bug to paper over, and the tempting
 * repair — reword the description until it fires — is a guess. This file is the
 * instrument that replaces the guess: N runs per phrase, in a fresh scaffold
 * with ALL THREE skills present, graded on which skill the agent actually
 * invoked.
 *
 * REPORTED, NEVER GATING. A model is stochastic: the same query scored 1/3 and
 * 2/2 in two runs of an earlier probe. A threshold over a handful of runs
 * flakes, so the number goes into `TRIGGER_BASELINE` and is read by a person,
 * the way `RETRIEVAL_BASELINE` is. What this can support is a decision —
 * whether a skill's trigger works, and whether a skill that never fires should
 * exist at all (AGENTS.md: "a skill nobody can show winning is deleted").
 *
 * WHAT IT COSTS. One probe is a real `claude -p` run bounded by
 * `--max-budget-usd`; the sweep below is ~15 runs. It is gated exactly like the
 * content eval — a logged-in `claude` locally, `CLAUDE_CODE_OAUTH_TOKEN` in CI
 * — and announces its own skip, so an unarmed tier is visible rather than
 * absent.
 *
 * WHAT THE FIRST SWEEPS FOUND (see `trigger-baseline.ts` for the numbers).
 * `add-sources` fires on four of five phrases on BOTH models, and both controls
 * behave — a different skill wins `get-started`, and nothing fires on a question
 * about the repo. It misses exactly one shape on `claude-opus-5`: the owner
 * pointing at a file already in the repo and naming a destination. Naming that
 * shape in the description was tried and measured, and changed nothing (0/3
 * before and after), so the cause is not the wording: an instruction concrete
 * enough to act on gets acted on, and no skill is consulted.
 *
 * That leaves a question this instrument can inform but not settle, and it is
 * the owner's: on the one path where the skill does not fire, the record still
 * came out well-formed, because the emitted AGENTS.md carries the same rules and
 * is always resident. So is the skill earning its resident cost on that path, or
 * is AGENTS.md already doing the work? The content eval's own runs point the
 * same way — both arms passed every behavioural gate. Do not answer it by
 * rewording a description; answer it with a fixture the two arms score
 * differently, or delete the skill (AGENTS.md: "a skill nobody can show winning
 * is deleted").
 *
 * WHAT IT CANNOT SAY. Why a skill did not fire: a description that reads wrong
 * to the model, a rule already carried by AGENTS.md, or a prompt an agent
 * simply finds easier to do directly are indistinguishable from the outside.
 * It measures the outcome, and the outcome is what the decision needs.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const distCli = fileURLToPath(new URL("../../dist/cli.mjs", import.meta.url));

const oauthToken = process.env["CLAUDE_CODE_OAUTH_TOKEN"] ?? "";
const claudeOnPath = spawnSync("claude", ["--version"], { encoding: "utf8" }).status === 0;
/** CI arms only on a setup-token; a developer's logged-in CLI is enough locally. */
const armed = claudeOnPath && (oauthToken !== "" || process.env["CI"] === undefined);
/**
 * The models to probe, because triggering turns out to DEPEND on the model and
 * "the adopter's own model is whatever they run".
 *
 * Measured 2026-09-03 on the identical phrase and scaffold: `claude-sonnet-5`
 * fired `add-sources` 3/3; `claude-opus-5` fired NOTHING 2/2. One model is not
 * a measurement of a trigger — it is a measurement of that model.
 */
const MODELS: readonly string[] = (
  process.env["KSOR_EVAL_MODELS"] ?? "claude-sonnet-5,claude-opus-5"
)
  .split(",")
  .map((m) => m.trim())
  .filter((m) => m !== "");
/** Low on purpose: a Skill call happens in the first turns or not at all. */
const BUDGET_USD = process.env["KSOR_TRIGGER_BUDGET_USD"] ?? "0.60";
const RUNS = Number(process.env["KSOR_TRIGGER_RUNS"] ?? "3");

/**
 * What an owner says, and which skill should answer it — `null` meaning none
 * should, which is as much a claim as the others.
 *
 * Every phrase is one an owner would plausibly type, and each `expect` is what
 * the shipped description promises. `add-sources`' description reads: "Use when
 * the owner shares material to add, says 'add this to the knowledge base', asks
 * how to get existing content in, or wants to write down what they know from
 * memory with no source to hand."
 */
interface TriggerCase {
  readonly id: string;
  readonly prompt: string;
  readonly expect: string | null;
  readonly why: string;
}

const CASES: readonly TriggerCase[] = [
  {
    id: "file-in-repo",
    prompt:
      "Here is our expense policy in src/policy.txt. Add it to the record under finance/, " +
      "and tell me what it leaves open.",
    expect: "add-sources",
    why: "the headline use case, and the phrase the 0.0.59 walk found missing",
  },
  {
    id: "own-words",
    prompt: "Add this to the knowledge base: staff may claim up to 75 per day for meals.",
    expect: "add-sources",
    why: "the description's own quoted phrase — if this misses, the trigger is the problem",
  },
  {
    id: "from-memory",
    prompt:
      "Nobody ever wrote down how we handle a late expense claim. Interview me and write it up.",
    expect: "add-sources",
    why: "the #50 half: knowledge with no file behind it",
  },
  {
    id: "get-started",
    prompt: "Get me started with this project — I want to set up what it is authoritative for.",
    expect: "intake-interview",
    why: "the one-time scope conversation; a control that a DIFFERENT skill wins",
  },
  {
    id: "stay-silent",
    prompt: "What version of Node does this project need? Just tell me, do not change anything.",
    expect: null,
    why: "no skill should fire on a question about the repo itself",
  },
];

interface Probe {
  readonly fired: string | null;
  readonly allSkills: readonly string[];
  readonly costUsd: number;
  readonly turns: number;
  readonly subtype: string;
}

/** A scaffold from the BUILT cli, with the one file a case refers to. */
function scaffold(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ksor-trigger-"));
  const init = spawnSync(process.execPath, [distCli, "init", "acme"], {
    cwd: dir,
    encoding: "utf8",
  });
  if (init.status !== 0) throw new Error(`init: ${init.stdout}${init.stderr}`);
  const root = path.join(dir, "acme");
  mkdirSync(path.join(root, "src"));
  writeFileSync(
    path.join(root, "src", "policy.txt"),
    "ACME EXPENSE POLICY\n\nStaff may claim up to 75 per day for meals while travelling.\n" +
      "A purchase above 2,500 needs a director's approval. Claims are paid within 10 working days.\n",
  );
  return root;
}

/**
 * One probe. The whole transcript is read, not just the result message: a
 * `Skill` tool use anywhere in the turn is what "fired" means, and taking only
 * the FIRST tool call would score an agent that reads a file before deciding as
 * a miss — which is how `skill-creator`'s own runner reports false negatives.
 */
function probe(root: string, prompt: string, model: string): Probe {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--model",
    model,
    "--max-budget-usd",
    BUDGET_USD,
    "--permission-mode",
    "acceptEdits",
    "--add-dir",
    root,
    "--allowedTools",
    "Read",
    "Write",
    "Edit",
    "Bash",
    "Glob",
    "Grep",
    "Skill",
  ];
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env["CLAUDECODE"];
  const r = spawnSync("claude", args, { cwd: root, encoding: "utf8", env, maxBuffer: 64 << 20 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    // The CLI can emit raw control characters inside a string, which
    // `JSON.parse` rejects outright — a transcript is not worth losing to a
    // stray \u0001 in a tool result (hit while probing by hand, 2026-09-03).
    try {
      parsed = JSON.parse(r.stdout.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " "));
    } catch {
      throw new Error(
        `claude -p did not return JSON (exit ${r.status}): ${r.stderr.slice(0, 600)}`,
      );
    }
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];

  // Every Skill invocation in the turn, in order.
  const fired: string[] = [];
  for (const m of list) {
    const content = (m as { message?: { content?: unknown } }).message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const b = block as { type?: string; name?: string; input?: { skill?: unknown } };
      if (b.type === "tool_use" && b.name === "Skill") {
        const named = b.input?.skill;
        if (typeof named === "string") fired.push(named);
      }
    }
  }
  const result = [...list].reverse().find((m) => (m as { type?: string }).type === "result") as
    | Record<string, unknown>
    | undefined;
  return {
    fired: fired[0] ?? null,
    allSkills: fired,
    costUsd: Number(result?.["total_cost_usd"] ?? 0),
    turns: Number(result?.["num_turns"] ?? 0),
    subtype: String(result?.["subtype"] ?? ""),
  };
}

interface CaseResult {
  readonly model: string;
  readonly id: string;
  readonly expect: string | null;
  readonly hits: number;
  readonly runs: number;
  readonly fired: readonly (string | null)[];
  readonly costUsd: number;
}

function report(rows: readonly CaseResult[]): string {
  const lines = [`skill trigger eval — ${RUNS} run(s) per phrase per model`, ""];
  let seen = "";
  for (const r of rows) {
    if (r.model !== seen) {
      lines.push(`${seen === "" ? "" : "\n"}${r.model}`);
      seen = r.model;
    }
    lines.push(
      `  ${r.id.padEnd(14)} ${String(r.hits)}/${r.runs}  expected ${r.expect ?? "(none)"}` +
        `  fired: ${r.fired.map((f) => f ?? "—").join(", ")}  $${r.costUsd.toFixed(2)}`,
    );
  }
  lines.push("", `total $${rows.reduce((n, r) => n + r.costUsd, 0).toFixed(2)}`);
  return lines.join("\n");
}

describe.runIf(armed)("which skill a real agent reaches for", () => {
  it(
    "every phrase is probed and the rate recorded — reported, never gating",
    () => {
      expect(existsSync(distCli), "run pnpm build first").toBe(true);
      const rows: CaseResult[] = [];
      for (const model of MODELS) {
        for (const c of CASES) {
          const fired: (string | null)[] = [];
          let costUsd = 0;
          for (let n = 0; n < RUNS; n += 1) {
            const root = scaffold();
            try {
              const p = probe(root, c.prompt, model);
              fired.push(p.fired);
              costUsd += p.costUsd;
            } finally {
              rmSync(path.dirname(root), { recursive: true, force: true });
            }
          }
          rows.push({
            model,
            id: c.id,
            expect: c.expect,
            hits: fired.filter((f) => f === c.expect).length,
            runs: RUNS,
            fired,
            costUsd,
          });
        }
      }
      const text = report(rows);
      console.log(text);
      const out = process.env["KSOR_TRIGGER_REPORT"];
      if (out !== undefined) writeFileSync(out, `${JSON.stringify(rows, null, 2)}\n`);

      // The ONLY assertion: the instrument ran and produced a number per
      // phrase. What the numbers mean is a decision for a person reading
      // TRIGGER_BASELINE — a stochastic rate must not turn CI red.
      expect(rows.length).toBe(CASES.length * MODELS.length);
      for (const r of rows) expect(r.fired.length, `${r.id} produced no observations`).toBe(RUNS);
    },
    45 * 60_000,
  );
});

describe.runIf(!armed)("which skill a real agent reaches for (gated)", () => {
  it("skipped — run `claude setup-token` and set CLAUDE_CODE_OAUTH_TOKEN (CI), or log in to `claude` (locally), to measure triggering", () => {
    expect(armed).toBe(false);
  });
});
