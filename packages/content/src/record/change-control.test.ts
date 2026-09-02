/**
 * KSP R23, the pure half: a `stable` concept whose BODY differs from a
 * committed version that was stable under the SAME `generated.at` is refused
 * `ksor-generated-stale`. History is handed in as a list, so every shape the
 * rule must judge is a fixture here and the git reader is tested once, against
 * a real repository, in `build.integration.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { checkGeneratedStale, type CommittedVersion } from "./change-control.js";
import { splitFrontmatter } from "./frontmatter.js";
import { parseConcept, type Concept } from "./profile.js";

const PATH = "knowledge/policies/purchase-approval.md";
const T0 = "2026-08-10T09:00:00Z";
const T1 = "2026-08-20T09:00:00Z";
const T2 = "2026-08-27T09:00:00Z";
const A1 = "2026-08-21T09:00:00Z";
const A2 = "2026-08-28T09:00:00Z";
const BODY = "A purchase above 10,000 needs a director's signature.\n";
const EDITED = "A purchase above 20,000 needs a director's signature.\n";

interface Shape {
  readonly status?: "draft" | "stable";
  readonly generatedAt?: string;
  readonly approvalAt?: string;
  readonly body?: string;
  /** Extra top-level frontmatter lines, verbatim. */
  readonly extra?: string;
}

function text(o: Shape = {}): string {
  return `---
type: Document
title: Purchase approval
description: Who signs what.
status: ${o.status ?? "stable"}
generated: { by: "claude-code/1.0", at: ${o.generatedAt ?? T1} }
${o.extra ?? ""}ksor:
  audience: [public]
  approval: { by: "human:cfo", at: ${o.approvalAt ?? A1} }
---

${o.body ?? BODY}`;
}

function concept(t: string): Concept {
  const split = splitFrontmatter(t, PATH);
  if (!split.ok) throw new Error(split.refusal.why);
  const parsed = parseConcept(PATH, split.frontmatter ?? {});
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.refusals));
  return parsed.concept;
}

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const COMMITTED_A = "2026-08-26T10:00:00+00:00";
const COMMITTED_B = "2026-08-25T10:00:00+00:00";
const version = (sha: string, committedAt: string, t: string): CommittedVersion => ({
  sha,
  committedAt,
  text: t,
});

/** Judge one working-tree text against a history, newest first. */
function judge(working: string, history: readonly CommittedVersion[]) {
  return checkGeneratedStale(
    [concept(working)],
    new Map([[PATH, working]]),
    new Map([[PATH, history]]),
  );
}

describe("ksor-generated-stale (KSP R23)", () => {
  it("refuses a body edit under the same generated.at, naming the commit, its instant and the stamp", () => {
    const refusals = judge(text({ body: EDITED }), [version(SHA_A, COMMITTED_A, text())]);
    expect(refusals.map((r) => [r.slug, r.path])).toEqual([["ksor-generated-stale", PATH]]);
    const [r] = refusals;
    expect(r!.why).toContain("aaaaaaa");
    expect(r!.why).toContain(COMMITTED_A);
    expect(r!.why).toContain(T1);
    expect(r!.why).toContain("R23");
    expect(r!.fix).toContain("`generated.at`");
    expect(r!.fix).toContain("`ksor.approval.at`");
  });

  it("passes the same edit once generated.at advanced past every committed stable version", () => {
    expect(
      judge(text({ body: EDITED, generatedAt: T2, approvalAt: A2 }), [
        version(SHA_A, COMMITTED_A, text()),
      ]),
    ).toEqual([]);
  });

  it("is about the body: a frontmatter-only edit under the same stamp passes", () => {
    const verified = 'verified: { by: "human:kim", at: 2026-08-26T09:00:00Z }\n';
    expect(judge(text({ extra: verified }), [version(SHA_A, COMMITTED_A, text())])).toEqual([]);
  });

  it("passes a concept with no committed version at all — stable for the first time, or renamed", () => {
    expect(judge(text({ body: EDITED }), [])).toEqual([]);
    expect(
      checkGeneratedStale(
        [concept(text({ body: EDITED }))],
        new Map([[PATH, text({ body: EDITED })]]),
        new Map(),
      ),
    ).toEqual([]);
  });

  it("catches the edit that was COMMITTED without a bump: the newest version matches the tree, an older stable one does not", () => {
    const refusals = judge(text({ body: EDITED }), [
      version(SHA_A, COMMITTED_A, text({ body: EDITED })),
      version(SHA_B, COMMITTED_B, text()),
    ]);
    expect(refusals.map((r) => r.slug)).toEqual(["ksor-generated-stale"]);
    expect(refusals[0]!.why).toContain("bbbbbbb");
    expect(refusals[0]!.why).not.toContain("aaaaaaa");
  });

  it("skips draft versions — a draft's body is free — but still compares the stable one behind it", () => {
    const draftOnly = [version(SHA_A, COMMITTED_A, text({ status: "draft", body: EDITED }))];
    expect(judge(text({ body: EDITED }), draftOnly)).toEqual([]);
    expect(judge(text({ body: "A third body.\n" }), draftOnly)).toEqual([]);

    const draftThenStable = [
      version(SHA_A, COMMITTED_A, text({ status: "draft", body: EDITED })),
      version(SHA_B, COMMITTED_B, text()),
    ];
    const refusals = judge(text({ body: "A third body.\n" }), draftThenStable);
    expect(refusals.map((r) => r.slug)).toEqual(["ksor-generated-stale"]);
    expect(refusals[0]!.why).toContain("bbbbbbb");
  });

  it("passes a stable version under an EARLIER stamp with a different body — the stamp already moved", () => {
    expect(
      judge(text({ body: EDITED }), [version(SHA_A, COMMITTED_A, text({ generatedAt: T0 }))]),
    ).toEqual([]);
  });

  it("refuses a stamp moved BACKWARD: a committed stable version under a LATER stamp is not advanced past", () => {
    const refusals = judge(text({ body: EDITED, generatedAt: T1, approvalAt: A1 }), [
      version(SHA_A, COMMITTED_A, text({ generatedAt: T2, approvalAt: A2 })),
    ]);
    expect(refusals.map((r) => r.slug)).toEqual(["ksor-generated-stale"]);
    expect(refusals[0]!.why).toContain(T2);
    expect(refusals[0]!.why).toContain(T1);
  });

  it("refuses a body edit that only RE-USES a stamp an older committed version already carried", () => {
    const refusals = judge(text({ body: "A third body.\n", generatedAt: T1 }), [
      version(SHA_A, COMMITTED_A, text({ body: EDITED, generatedAt: T2, approvalAt: A2 })),
      version(SHA_B, COMMITTED_B, text({ generatedAt: T1 })),
    ]);
    expect(refusals.map((r) => r.slug)).toEqual(["ksor-generated-stale"]);
    expect(refusals[0]!.why).toContain("aaaaaaa");
  });

  it("reads line endings and trailing whitespace as the checkout's, not the text's", () => {
    const crlf = text().replace(/\n/g, "\r\n");
    expect(judge(text(), [version(SHA_A, COMMITTED_A, crlf)])).toEqual([]);
    expect(judge(`${text()}\n\n`, [version(SHA_A, COMMITTED_A, text())])).toEqual([]);
  });

  it("skips a committed version the profile cannot read — no fence, broken YAML, no stamp", () => {
    const history = [
      version(SHA_A, COMMITTED_A, "no frontmatter at all\n"),
      version(SHA_B, COMMITTED_B, "---\nstatus: stable\ngenerated: [\n---\n\nbroken\n"),
      version("c".repeat(40), COMMITTED_B, "---\nstatus: stable\n---\n\nunstamped\n"),
    ];
    expect(judge(text({ body: EDITED }), history)).toEqual([]);
  });

  it("checks stable concepts only: a working-tree draft is never compared", () => {
    expect(
      judge(text({ status: "draft", body: EDITED }), [version(SHA_A, COMMITTED_A, text())]),
    ).toEqual([]);
  });
});
