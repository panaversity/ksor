/**
 * The agent tier: a shipped skill, run by a real coding agent in a real
 * scaffold, WITH the skill and WITHOUT it — the comparison AGENTS.md demands
 * before a skill is allowed to exist ("a skill nobody can show winning is
 * deleted"), which no skill had ever actually been put through (issue #30).
 *
 * WHAT RUNS. `ksor init` a fresh scaffold, install it, drop the fixture PDF
 * in `src/`, and hand `claude -p` the prompt tutorial 2 hands the reader. For
 * the baseline arm the skill is removed from both trees first. Nothing else
 * differs. The agent works inside the scaffold with file tools and a shell,
 * bounded by a dollar budget, and what it leaves behind is graded.
 *
 * WHAT GATES, and what only reports — the three-class split the Testing
 * contract already uses, applied here rather than invented:
 *
 *   GATE (behavioural, deterministic, on the WITH arm). Exactly one new
 *   document, under `knowledge/finance/`; `.ksor/*` and `instance.md`
 *   untouched — an agent that edits the policy to make a check pass has done
 *   the worst thing it could; the record builds green afterwards; `status:
 *   draft`, `sources` present, no `id:`/`name:`; the page furniture is gone;
 *   and every number, date and name in the body is in the extraction, by the
 *   same `verify.mjs` the skill ships. Found while designing this: "checker
 *   passes" is NOT a grader — a baseline run passed it by hand-authoring
 *   `index.md` and editing `.ksor/people.yaml`, the worse behaviour scoring
 *   better. Files touched is the discriminating assertion. Governs acts, not
 *   artefacts.
 *
 *   REPORT (recorded, never gating). Cost, turns, duration, and the same
 *   graders on the WITHOUT arm — so the delta is visible and a skill that
 *   stops winning is seen. A model is stochastic; a threshold over three runs
 *   flakes; the number goes beside `RETRIEVAL_BASELINE`'s and is compared by a
 *   person until there is enough history to ratchet.
 *
 * WHAT IT COSTS, and why it is gated. One arm on the default model ran to
 * $0.25 for a one-word reply (2026-09-02, claude-fable-5-1, `--bare`), so the
 * tier pins a mid-tier model unless `KSOR_EVAL_MODEL` says otherwise, and runs
 * on push to main and by hand, never per PR. It authenticates the way the
 * owner asked (2026-09-02): through `claude`'s OWN login, never an API key —
 * a developer's logged-in CLI locally, and in CI a long-lived token from
 * `claude setup-token` in `CLAUDE_CODE_OAUTH_TOKEN`. It never passes `--bare`,
 * because bare mode does not read that token (code.claude.com/docs/en/headless:
 * "Bare mode does not read CLAUDE_CODE_OAUTH_TOKEN"). Without a login it prints
 * that it was skipped, the way the database and live-provider tiers do. Honest
 * absence, never silent weakness.
 *
 * WHAT THREE ARMED RUNS SHOWED (2026-09-02, `SKILL_BASELINE`): on a clean
 * two-page PDF, both arms pass every deterministic gate. The skill's value was
 * in acts the gates did not score — extracting to a greppable file, verifying
 * against it, rendering the page as the read-back, and in one run refusing to
 * invent a currency the source never names — at about three times the cost.
 * So the tenth gate scores an absence, and the next fixture must be one a
 * baseline plausibly gets wrong. A harness that cannot tell the arms apart is
 * measuring the fixture, not the skill.
 *
 * WHAT IT CANNOT MEASURE, stated rather than implied: a conversational skill
 * (intake-interview; add-sources' person path) needs a scripted owner to talk
 * to, which is a second harness shape; "reads as a finished page" needs a
 * browser; and the adopter's own model is whatever they run. This measures
 * the skill's instructions under one model, which is the thing #30 asked for
 * and the thing nothing measured.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const distCli = fileURLToPath(new URL("../../dist/cli.mjs", import.meta.url));
const FIXTURE_PDF = path.join(here, "fixtures", "expense-policy.pdf");
const FIXTURE_TXT = path.join(here, "fixtures", "expense-policy.txt");
/**
 * The REPO's copy of the check, never the scaffold's: the baseline arm removes
 * the skill directory, which took `verify.mjs` with it and left that arm's
 * last gate reading "module not found" as a failure — a 9/9 vs 8/9 delta that
 * was the grader's, not the skill's (first armed run, 2026-09-02). Both arms
 * are judged by one script.
 */
const VERIFY = path.resolve(
  here,
  "..",
  "..",
  "templates",
  "scaffold",
  ".agents",
  "skills",
  "add-sources",
  "verify.mjs",
);

const oauthToken = process.env["CLAUDE_CODE_OAUTH_TOKEN"] ?? "";
const claudeOnPath = spawnSync("claude", ["--version"], { encoding: "utf8" }).status === 0;
/** CI arms only on a setup-token; a developer's logged-in CLI is enough locally. */
const armed = claudeOnPath && (oauthToken !== "" || process.env["CI"] === undefined);
const MODEL = process.env["KSOR_EVAL_MODEL"] ?? "claude-sonnet-5";
const BUDGET_USD = process.env["KSOR_EVAL_BUDGET_USD"] ?? "4";

/**
 * The prompt tutorial 2 gives the reader, plus the owner's standing answers.
 *
 * The second armed run (2026-09-02) taught why the second sentence exists.
 * Given the tutorial's prompt alone, the WITH-skill agent extracted the PDF,
 * compared it against the page, found two things it must not invent — the
 * source names no currency, and the emitted AGENTS.md says audience is "never
 * omitted, never inferred" — and STOPPED to ask the owner, writing nothing.
 * The baseline guessed an owner ("a guess"), chose `[public]` unasked, and
 * proceeded: 9/9 gates against 4/9. That is the skill behaving correctly and
 * the harness misreading it, because a one-shot `claude -p` has no owner to
 * answer. In tutorial 2 the owner is there and answers in a sentence. So the
 * harness says what that owner would, once — and the report below still
 * names a run that paused for the owner rather than scoring it as silence.
 */
const PROMPT =
  "Here is our expense policy, `src/expense-policy.pdf`. Add it to the record under " +
  "`finance/`, and tell me what it leaves open. The record has one audience, public. " +
  "Where the source leaves something unstated, write it into the document as an open " +
  "question rather than asking me — I will review the page on the site.";

// ── the scaffold ────────────────────────────────────────────────────────────

function run(cmd: string, args: readonly string[], cwd: string, env?: NodeJS.ProcessEnv) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
}

function scaffold(label: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `ksor-skill-eval-${label}-`));
  const init = run(process.execPath, [distCli, "init", "acme"], dir);
  if (init.status !== 0) throw new Error(`init: ${init.stdout}${init.stderr}`);
  const root = path.join(dir, "acme");
  // Installed, so `ksor build` exists for the agent — the skill's own finish
  // step names it, and a scaffold without it leaves every index stale.
  const install = run("pnpm", ["install", "--prefer-offline", "--silent"], root);
  if (install.status !== 0) throw new Error(`install: ${install.stdout}${install.stderr}`);
  mkdirSync(path.join(root, "src"));
  copyFileSync(FIXTURE_PDF, path.join(root, "src", "expense-policy.pdf"));
  return root;
}

function removeSkill(root: string, name: string): void {
  for (const tree of [".agents", ".claude"]) {
    rmSync(path.join(root, tree, "skills", name), { recursive: true, force: true });
  }
}

/** Every file under the record that matters, with its content hash. */
function snapshot(root: string): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full);
      if (e.isDirectory()) {
        if (!["node_modules", ".git", "system", ".next"].includes(e.name)) walk(full);
        continue;
      }
      if (e.isFile()) out.set(rel, createHash("sha256").update(readFileSync(full)).digest("hex"));
    }
  };
  walk(root);
  return out;
}

function touched(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>) {
  const changed: string[] = [];
  for (const [rel, hash] of after) if (before.get(rel) !== hash) changed.push(rel);
  for (const rel of before.keys()) if (!after.has(rel)) changed.push(`${rel} (deleted)`);
  return changed.sort();
}

// ── the agent ───────────────────────────────────────────────────────────────

interface AgentResult {
  readonly ok: boolean;
  /** Wrote nothing and ended on a question: it is waiting for an owner. */
  readonly pausedForOwner: boolean;
  readonly subtype: string;
  readonly costUsd: number;
  readonly turns: number;
  readonly durationMs: number;
  readonly text: string;
}

function agent(root: string): AgentResult {
  const args = [
    "-p",
    PROMPT,
    "--output-format",
    "json",
    "--model",
    MODEL,
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
  // `CLAUDECODE` is set inside a Claude Code session and refuses nesting;
  // this is a subprocess with its own scaffold, which is the safe case.
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env["CLAUDECODE"];
  const r = spawnSync("claude", args, { cwd: root, encoding: "utf8", env, maxBuffer: 64 << 20 });
  let messages: unknown = [];
  try {
    messages = JSON.parse(r.stdout);
  } catch {
    throw new Error(`claude -p did not return JSON (exit ${r.status}): ${r.stderr.slice(0, 800)}`);
  }
  const list = Array.isArray(messages) ? messages : [messages];
  const result = [...list].reverse().find((m) => (m as { type?: string }).type === "result") as
    | Record<string, unknown>
    | undefined;
  if (result === undefined) throw new Error(`no result message in: ${r.stdout.slice(0, 800)}`);
  const text = String(result["result"] ?? "");
  return {
    ok: result["is_error"] !== true,
    pausedForOwner: false, // decided once the tree diff is known; see runArm
    subtype: String(result["subtype"] ?? ""),
    costUsd: Number(result["total_cost_usd"] ?? 0),
    turns: Number(result["num_turns"] ?? 0),
    durationMs: Number(result["duration_ms"] ?? 0),
    text,
  };
}

// ── the graders ─────────────────────────────────────────────────────────────

interface Grade {
  readonly name: string;
  readonly pass: boolean;
  readonly saw: string;
}

function grade(root: string, changed: readonly string[]): Grade[] {
  const docs = changed.filter(
    (p) =>
      p.startsWith("knowledge/") &&
      p.endsWith(".md") &&
      !p.endsWith("index.md") &&
      !p.includes("(deleted)"),
  );
  const doc = docs[0] === undefined ? null : path.join(root, docs[0]);
  const body = doc === null ? "" : readFileSync(doc, "utf8");
  const fm = /^---\n([\s\S]*?)\n---/.exec(body)?.[1] ?? "";

  const build = run(process.execPath, [distCli, "build", "--as-of", "2026-09-02T00:00:00Z"], root);
  const verify = doc === null ? null : run(process.execPath, [VERIFY, FIXTURE_TXT, doc], root);

  return [
    { name: "exactly one new document", pass: docs.length === 1, saw: docs.join(", ") || "(none)" },
    {
      name: "placed under knowledge/finance/",
      pass: docs.length === 1 && (docs[0] as string).startsWith("knowledge/finance/"),
      saw: docs[0] ?? "(none)",
    },
    {
      name: ".ksor/* and instance.md untouched",
      pass: !changed.some((p) => p.startsWith(".ksor/") || p === "instance.md"),
      saw:
        changed.filter((p) => p.startsWith(".ksor/") || p === "instance.md").join(", ") ||
        "untouched",
    },
    {
      name: "the record builds green afterwards",
      pass: build.status === 0,
      saw: (build.stdout + build.stderr).split("\n")[0] ?? "",
    },
    {
      name: "status: draft",
      pass: /^status:\s*draft\s*$/m.test(fm),
      saw: /^status:.*$/m.exec(fm)?.[0] ?? "(no status)",
    },
    {
      name: "sources present",
      pass: /^sources:/m.test(fm),
      saw: /^sources:/m.test(fm) ? "yes" : "no",
    },
    {
      name: "no id:/name: (the path is the identity)",
      pass: !/^(id|name):/m.test(fm),
      saw: /^(id|name):.*$/m.exec(fm)?.[0] ?? "none",
    },
    {
      name: "page furniture stripped",
      pass: !/Page \d+ of \d+/.test(body),
      saw: /Page \d+ of \d+/.exec(body)?.[0] ?? "none",
    },
    {
      // The source names no currency. Run 2's WITH arm stopped rather than
      // invent one; a document that says $ or USD filled a gap from general
      // knowledge, which is the one thing add-sources must never do. This is
      // the first gate that measures NOT doing something, and it was added
      // after run 3 because the first nine could not tell the arms apart.
      name: "no currency invented (the source names none)",
      pass: !/[$£€]|\b(USD|GBP|EUR|PKR|INR|AUD|CAD)\b/.test(body),
      saw: /[$£€]|\b(USD|GBP|EUR|PKR|INR|AUD|CAD)\b/.exec(body)?.[0] ?? "none",
    },
    {
      name: "every number, date and name is in the source (verify.mjs)",
      pass: verify !== null && verify.status === 0,
      saw:
        verify === null
          ? "(no document)"
          : verify.stdout.trim().replaceAll("\n", ", ") || "0 missing",
    },
  ];
}

// ── the run ─────────────────────────────────────────────────────────────────

interface Arm {
  readonly arm: "with" | "without";
  readonly agent: AgentResult;
  readonly touched: readonly string[];
  readonly grades: readonly Grade[];
}

function runArm(arm: Arm["arm"]): Arm {
  const root = scaffold(arm);
  try {
    if (arm === "without") removeSkill(root, "add-sources");
    const before = snapshot(root);
    const result = agent(root);
    const after = snapshot(root);
    const changed = touched(before, after);
    const paused = changed.length === 0 && result.text.trimEnd().endsWith("?");
    return {
      arm,
      agent: { ...result, pausedForOwner: paused },
      touched: changed,
      grades: grade(root, changed),
    };
  } finally {
    rmSync(path.dirname(root), { recursive: true, force: true });
  }
}

function report(arms: readonly Arm[]): string {
  const lines: string[] = [`skill eval: add-sources / convert a PDF — model ${MODEL}`, ""];
  for (const a of arms) {
    const passed = a.grades.filter((g) => g.pass).length;
    lines.push(
      `${a.arm.padEnd(8)} ${passed}/${a.grades.length} gates  $${a.agent.costUsd.toFixed(2)}  ` +
        `${a.agent.turns} turns  ${(a.agent.durationMs / 1000).toFixed(0)}s  ${a.agent.subtype}` +
        (a.agent.pausedForOwner
          ? "  — PAUSED FOR THE OWNER (wrote nothing, asked a question)"
          : ""),
    );
    for (const g of a.grades) lines.push(`  ${g.pass ? "✓" : "✗"} ${g.name} — ${g.saw}`);
    lines.push(`  touched: ${a.touched.join(", ") || "(nothing)"}`);
    lines.push("");
  }
  return lines.join("\n");
}

describe.runIf(armed)(
  "add-sources, run by an agent: convert a PDF (with the skill vs without)",
  () => {
    it(
      "the WITH arm passes every behavioural gate; both arms are reported",
      () => {
        expect(existsSync(distCli), "run pnpm build first").toBe(true);
        const arms = [runArm("with"), runArm("without")];
        const text = report(arms);
        console.log(text);
        const out = process.env["KSOR_EVAL_REPORT"];
        if (out !== undefined) writeFileSync(out, `${JSON.stringify(arms, null, 2)}\n`);

        const withArm = arms[0] as Arm;
        expect(withArm.agent.ok, `the WITH arm did not finish: ${withArm.agent.subtype}`).toBe(
          true,
        );
        const failed = withArm.grades.filter((g) => !g.pass);
        expect(
          failed.map((g) => `${g.name} — saw ${g.saw}`),
          "behavioural gates the skill's own instructions promise",
        ).toEqual([]);
        // The baseline is REPORTED, never gated: it exists so the delta is
        // visible, and a run where "without" scores as well as "with" is the
        // finding, not a failure.
        expect((arms[1] as Arm).agent.subtype, "the WITHOUT arm ran").not.toBe("");
      },
      20 * 60_000,
    );
  },
);

describe.runIf(!armed)("add-sources, run by an agent (gated)", () => {
  it("skipped — run `claude setup-token` and set CLAUDE_CODE_OAUTH_TOKEN (CI), or log in to `claude` (locally), to run the skill eval", () => {
    expect(armed).toBe(false);
  });
});
