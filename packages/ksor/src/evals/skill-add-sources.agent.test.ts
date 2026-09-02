/**
 * The agent tier: a shipped skill, run by a real coding agent in a real
 * scaffold, WITH the skill and WITHOUT it — the comparison AGENTS.md demands
 * before a skill is allowed to exist ("a skill nobody can show winning is
 * deleted"), which no skill had ever actually been put through (issue #30).
 *
 * WHAT RUNS. For every row of `CASES` (`skill-cases.ts`): `ksor init` a fresh
 * scaffold, install it, drop the row's fixture PDF in `src/`, and hand
 * `claude -p` the prompt tutorial 2 hands the reader. For the baseline arm
 * the skill is removed from both trees first. Nothing else differs. The agent
 * works inside the scaffold with file tools and a shell, bounded by a dollar
 * budget, and what it leaves behind is graded. One row at a time when that
 * is all the budget allows: `pnpm test:agent -t scanned` runs one fixture.
 *
 * WHAT GATES, and what only reports — the three-class split the Testing
 * contract already uses, applied here rather than invented:
 *
 *   GATE (behavioural, deterministic, on the WITH arm). For a fixture a
 *   correct run CONVERTS: exactly one new document, under `knowledge/finance/`;
 *   `.ksor/*` and `instance.md` untouched — an agent that edits the policy to
 *   make a check pass has done the worst thing it could; the record builds
 *   green afterwards; the body gates the row carries (`status: draft`,
 *   `sources` present, no `id:`/`name:`, furniture gone, no currency invented,
 *   and for the hard fixture the two statements, the misreadable pair and the
 *   five rows); and every number, date and name in the body is in the
 *   extraction, by the same `verify.mjs` the skill ships. For a fixture a
 *   correct run REFUSES — the scanned one — the gates are that it wrote
 *   nothing and told the owner why. Found while designing this: "checker
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
 * on push to main and by hand, never per PR. It arms on `ANTHROPIC_API_KEY`
 * (CI: `--bare`, no OAuth) or, on a developer's machine, on a logged-in
 * `claude`; without either it prints that it was skipped, the way the
 * database and live-provider tiers do. Honest absence, never silent weakness.
 *
 * WHAT THREE ARMED RUNS SHOWED (2026-09-02, `SKILL_BASELINE`): on a clean
 * two-page PDF, both arms pass every deterministic gate. The skill's value was
 * in acts the gates did not score — extracting to a greppable file, verifying
 * against it, rendering the page as the read-back, and in one run refusing to
 * invent a currency the source never names — at about three times the cost.
 * A harness that cannot tell the arms apart is measuring the fixture, not the
 * skill, so `CASES` gained two rows a baseline plausibly gets wrong: a hard
 * policy built from the acts a careless conversion fails a deterministic gate
 * on, and a scanned copy of it that the skill says to refuse.
 *
 * WHAT IT CANNOT MEASURE, stated rather than implied: a conversational skill
 * (intake-interview; add-sources' person path) needs a scripted owner to talk
 * to, which is a second harness shape; "reads as a finished page" needs a
 * browser; and the adopter's own model is whatever they run. This measures
 * the skill's instructions under one model, which is the thing #30 asked for
 * and the thing nothing measured.
 *
 * HOW THE FIXTURES WERE MADE (macOS, 2026-09-02), so the next one is made the
 * same way: the policy text → `cupsfilter text.txt > x.pdf` (WITHOUT `-D`,
 * which deletes the input after converting it; a form feed in the text is a
 * page break) → `pdftotext -layout x.pdf x.txt` is the committed extraction,
 * byte for byte — its column spacing and the running header's em dash are
 * poppler's, not the source's. The scanned fixture is the hard PDF through
 * `pdftoppm -r 100 -gray -png`, each page wrapped by `sips -s format pdf`,
 * the pages joined with PDFKit; `pdffonts` lists nothing and `pdftotext`
 * returns two form feeds. The suite below asserts both shapes.
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

import { CASES, bodyGates, refusalGates, type Grade, type SkillCase } from "./skill-cases.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const distCli = fileURLToPath(new URL("../../dist/cli.mjs", import.meta.url));
const FIXTURES = path.join(here, "fixtures");
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

const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";
const claudeOnPath = spawnSync("claude", ["--version"], { encoding: "utf8" }).status === 0;
const pdftotextOnPath = spawnSync("pdftotext", ["-v"], { encoding: "utf8" }).status === 0;
/** CI arms only on the key; a developer's logged-in CLI is enough locally. */
const armed = apiKey !== "" || (claudeOnPath && process.env["CI"] === undefined);
const MODEL = process.env["KSOR_EVAL_MODEL"] ?? "claude-sonnet-5";
const BUDGET_USD = process.env["KSOR_EVAL_BUDGET_USD"] ?? "4";

// ── the fixtures ────────────────────────────────────────────────────────────

/**
 * Whitespace-folded, lower-cased, non-ASCII dropped: poppler versions differ
 * in `-layout` column spacing and in how they render a MacRoman em dash, and
 * neither is what this compares. Every word and every number still is.
 */
const shape = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\x20-\x7e]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe.runIf(pdftotextOnPath)("the fixtures are what they claim", () => {
  it.each(CASES.filter((c) => c.outcome === "converted"))(
    "$fixture: the committed .txt is its pdftotext -layout extraction",
    (kase) => {
      const extracted = spawnSync(
        "pdftotext",
        ["-layout", path.join(FIXTURES, kase.fixture), "-"],
        { encoding: "utf8" },
      );
      expect(extracted.status, extracted.stderr).toBe(0);
      expect(shape(extracted.stdout)).toBe(
        shape(readFileSync(path.join(FIXTURES, kase.extraction), "utf8")),
      );
    },
  );

  it.each(CASES.filter((c) => c.outcome === "refused"))(
    "$fixture: has no text layer — pdftotext returns only whitespace",
    (kase) => {
      const extracted = spawnSync("pdftotext", [path.join(FIXTURES, kase.fixture), "-"], {
        encoding: "utf8",
      });
      expect(extracted.status, extracted.stderr).toBe(0);
      expect(
        extracted.stdout,
        `pdftotext saw: ${JSON.stringify(extracted.stdout.slice(0, 200))}`,
      ).toMatch(/^\s*$/);
      // And the text it was made from is committed, so a document written
      // from the picture can be checked for what the eye misread.
      expect(existsSync(path.join(FIXTURES, kase.extraction))).toBe(true);
    },
  );
});

// ── the scaffold ────────────────────────────────────────────────────────────

function run(cmd: string, args: readonly string[], cwd: string, env?: NodeJS.ProcessEnv) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
}

function scaffold(label: string, kase: SkillCase): string {
  const dir = mkdtempSync(path.join(tmpdir(), `ksor-skill-eval-${label}-`));
  const init = run(process.execPath, [distCli, "init", "acme"], dir);
  if (init.status !== 0) throw new Error(`init: ${init.stdout}${init.stderr}`);
  const root = path.join(dir, "acme");
  // Installed, so `ksor build` exists for the agent — the skill's own finish
  // step names it, and a scaffold without it leaves every index stale.
  const install = run("pnpm", ["install", "--prefer-offline", "--silent"], root);
  if (install.status !== 0) throw new Error(`install: ${install.stdout}${install.stderr}`);
  mkdirSync(path.join(root, "src"));
  copyFileSync(path.join(FIXTURES, kase.fixture), path.join(root, "src", kase.fixture));
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

function agent(root: string, prompt: string): AgentResult {
  const args = [
    "-p",
    prompt,
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
  if (apiKey !== "") args.push("--bare");
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

function grade(
  root: string,
  changed: readonly string[],
  kase: SkillCase,
  result: AgentResult,
): readonly Grade[] {
  const docs = changed.filter(
    (p) =>
      p.startsWith("knowledge/") &&
      p.endsWith(".md") &&
      !p.endsWith("index.md") &&
      !p.includes("(deleted)"),
  );
  const doc = docs[0] === undefined ? null : path.join(root, docs[0]);
  const file = doc === null ? "" : readFileSync(doc, "utf8");
  const verify =
    doc === null
      ? null
      : run(process.execPath, [VERIFY, path.join(FIXTURES, kase.extraction), doc], root);
  const verifySaw =
    verify === null ? "(no document)" : verify.stdout.trim().replaceAll("\n", ", ") || "0 missing";

  if (kase.outcome === "refused") {
    return refusalGates(
      result.text,
      changed,
      doc === null
        ? undefined
        : `${docs[0]} — verify.mjs against what the picture says: ${verifySaw}`,
    );
  }

  const build = run(process.execPath, [distCli, "build", "--as-of", "2026-09-02T00:00:00Z"], root);
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
    ...bodyGates(kase, file),
    {
      name: "every number, date and name is in the source (verify.mjs)",
      pass: verify !== null && verify.status === 0,
      saw: verifySaw,
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

function runArm(arm: Arm["arm"], kase: SkillCase): Arm {
  const root = scaffold(arm, kase);
  try {
    if (arm === "without") removeSkill(root, "add-sources");
    const before = snapshot(root);
    const result = agent(root, kase.prompt);
    const after = snapshot(root);
    const changed = touched(before, after);
    const paused = changed.length === 0 && result.text.trimEnd().endsWith("?");
    return {
      arm,
      agent: { ...result, pausedForOwner: paused },
      touched: changed,
      grades: grade(root, changed, kase, result),
    };
  } finally {
    rmSync(path.dirname(root), { recursive: true, force: true });
  }
}

function report(kase: SkillCase, arms: readonly Arm[]): string {
  const lines: string[] = [`skill eval: add-sources / ${kase.fixture} — model ${MODEL}`, ""];
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
    if (kase.outcome === "refused")
      lines.push(`  said: ${a.agent.text.replace(/\s+/g, " ").slice(0, 400)}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** One report file for the whole run, keyed by fixture, rewritten as each case lands. */
const reports: Record<string, readonly Arm[]> = {};

describe.runIf(armed)("add-sources, run by an agent (with the skill vs without)", () => {
  for (const kase of CASES) {
    const expected =
      kase.outcome === "refused"
        ? "the WITH arm refuses and tells the owner"
        : "the WITH arm passes every behavioural gate";
    it(
      `${kase.fixture}: ${expected}; both arms are reported`,
      () => {
        expect(existsSync(distCli), "run pnpm build first").toBe(true);
        const arms = [runArm("with", kase), runArm("without", kase)];
        console.log(report(kase, arms));
        const out = process.env["KSOR_EVAL_REPORT"];
        if (out !== undefined) {
          reports[kase.fixture] = arms;
          writeFileSync(out, `${JSON.stringify(reports, null, 2)}\n`);
        }

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
  }
});

describe.runIf(!armed)("add-sources, run by an agent (gated)", () => {
  it("skipped — set ANTHROPIC_API_KEY (CI) or log in to `claude` (locally) to run the skill eval", () => {
    expect(armed).toBe(false);
  });
});
