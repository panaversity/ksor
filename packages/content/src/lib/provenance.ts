/**
 * What a published artefact can say about the commit that produced it — and
 * what it says when it cannot say a commit at all.
 *
 * ONE home, because TWO verbs answer for the same fact. `ksor ingest` explained
 * the gap in full; `ksor build`, on an identical tree, said only `(dirty)` and
 * wrote `"source_commit": null` — a word defined in no human-facing document,
 * for the invariant AGENTS.md calls load-bearing (first-hour walkthrough,
 * 2026-08-26). Provenance is one guarantee, so it gets one set of sentences and
 * both verbs read them.
 */
import { execFileSync } from "node:child_process";

/**
 * The commit the corpus was ingested from, resolved from git when the tree is
 * in a repository.
 *
 * `--source-commit` has always existed and the golden path never passed it, so
 * EVERY generation an adopter produced recorded the literal string
 * "unspecified" — product principle 6 requires a build to record the exact
 * corpus that produced it, and a placeholder records nothing (review
 * 2026-08-20). Resolved here rather than in the scaffold script so it is right
 * however the verb is invoked. A tree that is not a repository, or a git that
 * is not installed, still records the honest sentinel rather than failing an
 * ingest over provenance metadata.
 */
/**
 * WHY a generation could not name the commit that produced it.
 *
 * Three different states used to collapse into one word, and the message built
 * from it named only the first: "knowledge/ is not in a git repository". For a
 * freshly scaffolded project that is FALSE — `ksor init` runs `git init`
 * (`init/index.ts:95`), so the repository exists and merely has no commit yet,
 * and `rev-parse HEAD` fails with "unknown revision" rather than because
 * nothing is there. The reader was sent to `git init`, which they had already
 * done, in the one message that governs provenance.
 */
export type ProvenanceGap =
  | "no-repo"
  | "no-commit"
  | "no-git"
  /**
   * A repository with commits, none of which touch the record's inputs. Only
   * `ksor build` can reach it — it resolves the commit SCOPED to the four
   * inputs, where ingest asks for HEAD — and it is a real state: a repository
   * that holds the record beside other things, none of the record committed.
   */
  | "no-input-commit"
  | "not-asked";

export function provenanceGap(knowledgeDir: string | undefined): ProvenanceGap {
  if (knowledgeDir === undefined) return "not-asked";
  const run = (args: readonly string[]): { ok: boolean; out: string } => {
    try {
      return {
        ok: true,
        out: execFileSync("git", ["-C", knowledgeDir, ...args], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim(),
      };
    } catch {
      return { ok: false, out: "" };
    }
  };
  // `git --version` distinguishes "git is not installed" from "this is not a
  // repository" — `ksor init` already warns about the former and must not be
  // contradicted here.
  if (!run(["--version"]).ok && !run(["rev-parse", "--git-dir"]).ok) return "no-git";
  if (!run(["rev-parse", "--git-dir"]).ok) return "no-repo";
  return "no-commit";
}

/**
 * The remedy for each, because the reader's next command differs.
 *
 * `subject` is the artefact whose provenance is missing — the noun is the only
 * thing that differs between the verbs, so it is the only thing parameterised.
 */
export function provenanceNotice(
  gap: ProvenanceGap,
  subject: "generation" | "build" = "generation",
): string {
  const why = `so this ${subject} cannot be traced back to a reviewed commit`;
  switch (gap) {
    case "no-commit":
      return (
        `source: unspecified — knowledge/ is in a git repository with no commits yet, ${why}.\n` +
        "  fix: commit the record (git add knowledge && git commit) and re-run"
      );
    case "no-repo":
      return (
        `source: unspecified — knowledge/ is not in a git repository, ${why}.\n` +
        "  fix: git init, commit the record, and re-run"
      );
    case "no-git":
      return (
        `source: unspecified — git is not installed, ${why}.\n` +
        "  fix: install git, or pass --source-commit <sha> if the record is versioned elsewhere"
      );
    case "no-input-commit":
      return (
        `source: unspecified — no commit touches the record (knowledge/, instance.md, ` +
        `.ksor/governance.yaml, .ksor/takedowns.yaml), ${why}.\n` +
        "  fix: commit the record (git add knowledge instance.md .ksor && git commit) and re-run"
      );
    case "not-asked":
      return `source: unspecified — no knowledge directory was given, ${why}.`;
  }
}

export function detectSourceCommit(knowledgeDir: string | undefined): string {
  if (knowledgeDir === undefined) return "unspecified";
  try {
    const head = execFileSync("git", ["-C", knowledgeDir, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!/^[0-9a-f]{40}$/.test(head)) return "unspecified";
    // A dirty tree did NOT produce that commit; say so rather than citing a
    // commit whose bytes differ from what was just ingested.
    // Path-scoped: a dirty file elsewhere in the repository says nothing about
    // whether the RECORD that was ingested matches the commit (review of PR #43).
    const dirty = execFileSync("git", ["-C", knowledgeDir, "status", "--porcelain", "--", "."], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return dirty === "" ? head : `${head}-dirty`;
  } catch {
    return "unspecified";
  }
}

/**
 * What a `dirty` stamp MEANS, for the reader who has one.
 *
 * `build.lock.json` records `dirty: true` and the summary line used to append
 * the bare word `(dirty)` — which no document this project ships defines. The
 * commit IS named here, and that is exactly why the sentence is owed: a lock
 * naming a commit whose bytes are not what was published is the one shape of
 * this record that looks like provenance and is not.
 */
export function dirtyNotice(commit: string, subject: "generation" | "build" = "build"): string {
  return (
    `source: ${commit} (dirty) — an input differs from that commit, so it does not contain ` +
    `the bytes this ${subject} published.\n` +
    "  fix: commit the inputs (git add -A && git commit) and re-run; `ksor build --strict` " +
    "refuses this state instead of stamping it"
  );
}
