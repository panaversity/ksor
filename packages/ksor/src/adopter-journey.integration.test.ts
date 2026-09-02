/**
 * The adopter's journey from `ksor init` to a record that is THEIRS, walked
 * against the built CLI — the sequence the scaffold's README tells them to
 * follow, and the two refusals it walked them into before this existed.
 *
 * Found on the published 0.0.55 (2026-09-02), by doing what the documents
 * said rather than reading them:
 *
 *   1. README's "replace the starters" said: run the interview, then "delete
 *      each starter document as your own knowledge arrives". Taken at its word
 *      — delete the five, then write yours — the build refused
 *      `ksor-record-empty`, wrote nothing, and named that slug in no document
 *      an adopter reads.
 *   2. The hello-world tutorial approves its document as `human:you`. The
 *      interview then "replaces the human:you placeholder with your real
 *      handle" — and the tutorial's own document, still approved by an actor
 *      the policy no longer names, refuses `ksor-approver-unauthorised`. The
 *      recommended order (tutorial first, interview second) turned a green
 *      record red, and nothing warned.
 *
 * No skill runs here — there is no agent in this tier. What is held is the
 * SEAM each skill's instructions now describe: the sequence that works, and
 * the exact state each refusal fires on, so the README's new step and the
 * interview's new re-attribution rule are asserted against the tool rather
 * than trusted as prose. Tutorial 2 is this walk written for a person.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const distCli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

interface Run {
  readonly status: number | null;
  readonly out: string;
}

function ksor(root: string, ...args: string[]): Run {
  const r = spawnSync(process.execPath, [distCli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, KSOR_AUDIENCE: undefined },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** A fresh scaffold, as `ksor init` emits it. */
function scaffold(label: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `ksor-journey-${label}-`));
  const r = ksor(dir, "init", "acme");
  if (r.status !== 0) throw new Error(`init failed: ${r.out}`);
  return path.join(dir, "acme");
}

const read = (root: string, rel: string): string => readFileSync(path.join(root, rel), "utf8");
const write = (root: string, rel: string, text: string): void => {
  writeFileSync(path.join(root, rel), text);
};

/** The starter actor as init stamped it — read, never guessed. */
function starterActor(root: string): string {
  const m = /(ksor-starter\/[0-9][^\s"',\]]*)/.exec(read(root, ".ksor/governance.yaml"));
  if (m === null) throw new Error("the emitted policy does not name a ksor-starter actor");
  return m[1] as string;
}

const STARTERS = [
  "knowledge/what-is-a-ksor.md",
  "knowledge/what-is-a-ksor.summary.md",
  "knowledge/governance-ladder.md",
  "knowledge/surfaces",
] as const;

function deleteStarters(root: string): void {
  for (const rel of STARTERS) rmSync(path.join(root, rel), { recursive: true, force: true });
}

/**
 * What the interview writes when the owner answers question 3 with a real
 * handle: the placeholder leaves both authority lists and the owner's handle
 * takes its place. The starter actor STAYS while any starter is present — the
 * skill says so, and this is where that sentence is held.
 */
function interviewRetiresPlaceholder(root: string, owner: string): void {
  const policy = read(root, ".ksor/governance.yaml");
  expect(policy, "the emitted policy ships the placeholder").toContain("human:you");
  write(root, ".ksor/governance.yaml", policy.replaceAll("human:you", owner));
  const people = read(root, ".ksor/people.yaml");
  write(
    root,
    ".ksor/people.yaml",
    people.replace(/people:\s*\{\}/, `people:\n  "${owner}": Owner Name`),
  );
}

/**
 * Drop the starter actor from the policy — the last step, once no starter
 * remains. The emitted policy is a flow list, `- actors: [human:you,
 * ksor-starter/0.0.55]`, so the actor is removed from INSIDE the list; deleting
 * the whole line would take the owner with it and refuse `ksor-policy-invalid`
 * — which is what the first version of this helper did, and is worth knowing
 * for an agent following the README's step 4 with a line-oriented edit.
 */
function retireStarterActor(root: string): void {
  const actor = starterActor(root);
  const policy = read(root, ".ksor/governance.yaml");
  const kept = policy.replace(`, ${actor}]`, "]").replace(`[${actor}, `, "[");
  expect(kept, "the starter actor was found inside an actors list").not.toBe(policy);
  write(root, ".ksor/governance.yaml", kept);
}

const draft = (owner: string): string => `---
type: Document
title: Refund policy
description: Customers may return an item within 30 days with a receipt.
status: draft
ksor:
  owner: "${owner}"
  audience: [public]
---

A customer may return an item within **30 days** of delivery, with proof of
purchase.
`;

const approved = (owner: string): string =>
  draft(owner).replace(
    "status: draft\nksor:\n",
    `status: stable\ngenerated: { by: "${owner}", at: 2026-09-01T09:00:00Z }\nksor:\n  approval: { by: "${owner}", at: 2026-09-01T10:00:00Z }\n`,
  );

describe("the adopter's journey (README → Make the record yours)", () => {
  let root = "";
  beforeAll(() => {
    expect(existsSync(distCli), `${distCli} is missing — run pnpm build first`).toBe(true);
    root = scaffold("happy");
  });
  afterAll(() => {
    if (root) rmSync(path.dirname(root), { recursive: true, force: true });
  });

  it("step 1 — the interview retires human:you; the starter actor stays; the record still builds", () => {
    interviewRetiresPlaceholder(root, "human:owner");
    const r = ksor(root, "build");
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("5 document(s), 5 admitted");
  });

  it("step 2 — one document of the owner's own: a draft admits nothing, an approval admits it", () => {
    write(root, "knowledge/refund-policy.md", draft("human:owner"));
    let r = ksor(root, "build");
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("6 document(s), 5 admitted");

    write(root, "knowledge/refund-policy.md", approved("human:owner"));
    r = ksor(root, "build");
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("6 document(s), 6 admitted");
  });

  it("step 3 — the starters go, and the record is one document, still admitted", () => {
    deleteStarters(root);
    const r = ksor(root, "build");
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("1 document(s), 1 admitted");
  });

  it("step 4 — the starter actor leaves the policy, and nothing of the owner's was approved by a tool", () => {
    const actor = starterActor(root);
    retireStarterActor(root);
    expect(read(root, ".ksor/governance.yaml")).not.toMatch(new RegExp(`^\\s*-\\s*${actor}`, "m"));
    const r = ksor(root, "build");
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("1 document(s), 1 admitted");
  });
});

describe("the two refusals on that path, and where each fires", () => {
  it("deleting every starter before writing one refuses ksor-record-empty and writes nothing", () => {
    const root = scaffold("empty");
    try {
      interviewRetiresPlaceholder(root, "human:owner");
      deleteStarters(root);
      const r = ksor(root, "build");
      expect(r.status, r.out).toBe(1);
      expect(r.out.split("\n")[0]).toMatch(/^error: ksor-record-empty/);
      expect(existsSync(path.join(root, "build.lock.json")), "nothing written").toBe(false);
      // …and this is why README step 2 now says to write one first.
    } finally {
      rmSync(path.dirname(root), { recursive: true, force: true });
    }
  });

  it("hello-world first, interview second: retiring human:you alone refuses the tutorial's own document", () => {
    const root = scaffold("tutorial-first");
    try {
      // The tutorial's step 4: approve as the placeholder, exactly as printed.
      write(root, "knowledge/refund-policy.md", approved("human:you"));
      let r = ksor(root, "build");
      expect(r.status, r.out).toBe(0);
      expect(r.out).toContain("6 document(s), 6 admitted");

      // The interview's write step, as it read before 1.6.0: the placeholder
      // leaves the policy and nothing else changes.
      interviewRetiresPlaceholder(root, "human:owner");
      r = ksor(root, "build");
      expect(r.status, r.out).toBe(1);
      expect(r.out.split("\n")[0]).toMatch(/^error: ksor-approver-unauthorised/);
      expect(r.out).toContain("refund-policy.md");

      // The rule intake-interview 1.6.0 adds: re-attribute what human:you
      // already did, in the same change. Same person — and green again.
      write(root, "knowledge/refund-policy.md", approved("human:owner"));
      r = ksor(root, "build");
      expect(r.status, r.out).toBe(0);
      expect(r.out).toContain("6 document(s), 6 admitted");
    } finally {
      rmSync(path.dirname(root), { recursive: true, force: true });
    }
  });
});
