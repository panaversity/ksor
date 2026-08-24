import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildScaffold } from "./e2e-build.js";
import { cleanupLocalKsor, expectLocalKsorResolved, injectLocalKsor } from "./e2e-local-ksor.js";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The record spec's acceptance 3, run against a real static export: a
// `[public]` build must contain NO BYTE of a concept it does not admit —
// title, description, body, asset name or asset bytes — through any page,
// index, sidebar row, search entry, `llms-full.txt` or twin. Every probe
// carries a positive control, because a sweep that cannot tell "filtered"
// from "broken" fails open (research/visibility.md §8).
//
// The audience model is the profile's (record spec §2.4) and it is NOT a
// ladder: a concept holds a LIST, a viewer holds a LIST, and the concept is
// visible when the two OVERLAP. So `KSOR_AUDIENCE=public,restricted` does not
// see an `[internal]` concept — the row this suite gained when the ordered
// tiers went away, and the one an adopter is most likely to assume wrongly.
//
// Heavy (install + several builds), gated:
//   KSOR_E2E=1 pnpm exec vitest run --config vitest.integration.config.ts packages/ksor/src/visibility-conformance.integration.test.ts
const enabled = process.env.KSOR_E2E === "1";

const distCli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

// Distinct per-surface canaries, per the issue-#10 method.
const RESTRICTED_TITLE = "Zebra Bands CANARYTITLE9F3A";
const RESTRICTED_DESC = "CANARYDESC4A8C restricted only";
const RESTRICTED_BODY = "CANARYBODY7B2E1";
const INTERNAL_BODY = "INTERNALCANARY7A1D";
// A concept declaring TWO audiences: visible to a viewer holding either, and
// to neither's public build. Before the overlap rule a document carried one
// ordered tier and this shape could not be written at all.
const BOTH_BODY = "BOTHCANARY3E7D";
// Study attachments of the RESTRICTED document. They carry no frontmatter and
// no audience of their own, so they are published only where their parent is —
// and before the attachment rule, a frontmatter-less summary read as "no
// visibility declared", took the record DEFAULT tier, and published a
// restricted document's precis to the public build (decision 24).
const SUMMARY_BODY = "SUMMARYCANARY6C4B";
const DECK_BODY = "DECKCANARY2F8E";

// A real 4x4 PNG for the asset probe; its bytes are the probe.
const ASSET_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAARGVYSWZNTQAqAAAACAABh2kABAAAAAEAAAAaAAAAAAADoAEAAwAAAAEAAQAAoAIABAAAAAEAAAAEoAMABAAAAAEAAAAEAAAAAMVs/gIAAAHJaVRYdFhNTDpjb20uYWRvYmUueG1wAAAAAAA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJYTVAgQ29yZSA2LjAuMCI+CiAgIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgICAgIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiCiAgICAgICAgICAgIHhtbG5zOmV4aWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vZXhpZi8xLjAvIj4KICAgICAgICAgPGV4aWY6Q29sb3JTcGFjZT4xPC9leGlmOkNvbG9yU3BhY2U+CiAgICAgICAgIDxleGlmOlBpeGVsWERpbWVuc2lvbj4zMjwvZXhpZjpQaXhlbFhEaW1lbnNpb24+CiAgICAgICAgIDxleGlmOlBpeGVsWURpbWVuc2lvbj4zMjwvZXhpZjpQaXhlbFlEaW1lbnNpb24+CiAgICAgIDwvcmRmOkRlc2NyaXB0aW9uPgogICA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgqWsr5jAAAAP0lEQVQIHQE0AMv/Af////b7/f0B+wsDBgT2+PzL2urzAOk2Jh8CCQcE7ejq1sjrC/8MAP///+bs9dbg8Pz9/kfmIaM5XLTrAAAAAElFTkSuQmCC",
  "base64",
);
// The asset can ship two ways: raw bytes (a copied file) or base64 (an
// inlined data: URI). Probe both: a 3-byte-aligned raw slice, and a substring
// of the full base64 string (alignment makes the standalone encoding a
// substring of any embedding).
const ASSET_RAW_PROBE = ASSET_PNG.subarray(ASSET_PNG.length - 48, ASSET_PNG.length - 12);
const ASSET_B64 = ASSET_PNG.toString("base64");
const ASSET_B64_PROBE = ASSET_B64.slice(ASSET_B64.length - 64, ASSET_B64.length - 16);

function assetHits(root: string): string[] {
  return [
    ...new Set([
      ...filesContaining(root, ASSET_RAW_PROBE),
      ...filesContaining(root, ASSET_B64_PROBE),
    ]),
  ];
}

interface Shell {
  readonly shellName: string;
  readonly swap: ((project: string) => void) | null;
  /**
   * Whether this shell RENDERS study attachments, as opposed to merely
   * excluding them. The surface contract requires every shell to keep an
   * attachment off the route table; rendering one as a summary tab and a deck
   * is the reference shell's own design, not a clause of the contract. The
   * distinction decides which positive control this suite is entitled to: on a
   * shell that renders them, "published at its own audience" proves the leak
   * sweep is not passing over a broken feature; on a shell that does not, the
   * same assertion is simply false, and the sweep leans on the parent
   * document's control instead.
   */
  readonly rendersAttachments: boolean;
}

// ONE shell. The second (workbench/shells/docusaurus) was retired 2026-08-24
// — decision 9 revision. The `.each(SHELLS)` shape stays because the surface
// contract is what this suite asserts, and it is unchanged; only the number of
// implementations it runs against is. A shell added back here restores the
// swap proof without restructuring the suite.
const SHELLS: readonly Shell[] = [{ shellName: "fumadocs", swap: null, rendersAttachments: true }];

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env?: Record<string, string>,
): SpawnSyncReturns<string> {
  return spawnSync(command, [...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function mustPass(result: SpawnSyncReturns<string>, what: string): void {
  const detail =
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim() ||
    String(result.error ?? "spawn failed");
  expect(result.status, `${what}: ${detail.slice(-2000)}`).toBe(0);
}

/** Every file under a tree, as absolute paths. */
function walkFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(p) : [p];
  });
}

/** Files whose bytes contain the probe (works for text and binary). */
function filesContaining(root: string, probe: string | Buffer): string[] {
  const needle = typeof probe === "string" ? Buffer.from(probe) : probe;
  return walkFiles(root).filter((file) => readFileSync(file).includes(needle));
}

/** A stable, approved concept in the profile's shape (record spec §2). */
function concept(options: {
  title: string;
  description: string;
  audience: readonly string[];
  body: string;
  order?: number;
}): string {
  const { title, description, audience, body, order } = options;
  return `---
type: Document
title: "${title}"
description: "${description}"
status: stable
${order === undefined ? "" : `order: ${order}\n`}generated: { by: "ksor-test/1.0", at: 2026-08-01T00:00:00Z }
ksor:
  audience: [${audience.join(", ")}]
  approval: { by: "human:kim", at: 2026-08-02T00:00:00Z }
---

${body}
`;
}

describe.runIf(enabled).each(SHELLS)(
  "visibility conformance — $shellName shell",
  ({ shellName, swap, rendersAttachments }) => {
    let work: string;
    let project: string;
    let outDir: string;

    /**
     * A build for one viewer list. `undefined` leaves KSOR_AUDIENCE unset,
     * which is `[public]` — the only default that cannot leak.
     */
    function build(audience?: string, opts?: { keepOut?: boolean }): SpawnSyncReturns<string> {
      // keepOut leaves the previous build in place — the stale-artifact case
      // tests whether the SHELL cleans its own output (review finding,
      // 2026-08-18: the suite's own pre-wipe made that structurally
      // invisible).
      if (!opts?.keepOut) rmSync(outDir, { recursive: true, force: true });
      return buildScaffold(
        project,
        audience === undefined ? { KSOR_AUDIENCE: "" } : { KSOR_AUDIENCE: audience },
      );
    }

    beforeAll(() => {
      work = mkdtempSync(path.join(tmpdir(), `ksor-vis-${shellName}-`));
      mustPass(run(process.execPath, [distCli, "init", `vis-${shellName}`], work), "init");
      project = path.join(work, `vis-${shellName}`);
      outDir = path.join(project, "system", "site", "out");

      // The registry lives in the Governance Policy, not in instance.md
      // (record spec §4): `public` is reserved and may not be declared, and
      // every other identifier a concept names must appear here.
      writeFileSync(
        path.join(project, ".ksor", "governance.yaml"),
        `version: "0.1"
audiences:
  internal:
    description: Employees
  restricted:
    description: Compensation committee
approval_authorities:
  - actors: [human:kim]
takedown_authorities:
  actors: [human:ciso]
`,
      );

      const knowledge = path.join(project, "knowledge");
      writeFileSync(
        path.join(knowledge, "welcome.md"),
        concept({
          title: "Welcome",
          description: "The public front of the record.",
          audience: ["public"],
          body: "Public welcome body.",
          order: 0,
        }),
      );
      writeFileSync(
        path.join(knowledge, "internal-notes.md"),
        concept({
          title: "Internal notes",
          description: "Notes for staff.",
          audience: ["internal"],
          body: `Notes ${INTERNAL_BODY} for staff.`,
          order: 1,
        }),
      );
      writeFileSync(
        path.join(knowledge, "compensation.md"),
        concept({
          title: RESTRICTED_TITLE,
          description: RESTRICTED_DESC,
          audience: ["restricted"],
          body: `Band 4 engineers ${RESTRICTED_BODY} receive between 180000 and 240000.\n\n![bands](./comp-chart.png)`,
          order: 2,
        }),
      );
      writeFileSync(path.join(knowledge, "comp-chart.png"), ASSET_PNG);
      writeFileSync(
        path.join(knowledge, "compensation.summary.md"),
        `---\ntype: Summary\n---\n\nBands run to 240000 ${SUMMARY_BODY}.\n`,
      );
      writeFileSync(
        path.join(knowledge, "compensation.flashcards.yaml"),
        `deck:\n  title: Bands\ncards:\n  - front: Top of band 4?\n    back: 240000 ${DECK_BODY}.\n`,
      );
      // Two audiences on one concept — the shape the overlap rule made
      // writable, and the one that tells an overlap from a ladder.
      writeFileSync(
        path.join(knowledge, "board-minutes.md"),
        concept({
          title: "Board minutes",
          description: "What the board decided.",
          audience: ["internal", "restricted"],
          body: `Minutes ${BOTH_BODY} of the board.`,
          order: 3,
        }),
      );

      swap?.(project);
      // Resolve the scaffold's `@panaversity/ksor` self-pin to the LOCAL build
      // (the pinned exact version is unpublished in CI/dev).
      const localKsor = injectLocalKsor(project);
      // Non-frozen by design: the scaffold pins `@panaversity/ksor` to the exact
      // CLI version, absent from the committed site-only lockfile, so the first
      // install adds it (decision 11 revision 2026-08-20); a shell swap changes
      // the dependency set the same way. CI defaults frozen-lockfile on.
      // --config.minimumReleaseAge=0: the scaffold's 48h quarantine is right for an
      // adopter but non-deterministic in CI (any transitive dep publishing today
      // fails the job).
      mustPass(
        run("pnpm", ["install", "--no-frozen-lockfile", "--config.minimumReleaseAge=0"], project),
        "install",
      );
      expectLocalKsorResolved(project, localKsor);
      cleanupLocalKsor(localKsor);
    }, 600_000);

    afterAll(() => {
      if (work) rmSync(work, { recursive: true, force: true });
    }, 180_000);

    it("public build (unset viewer): zero restricted traces, with live controls", () => {
      mustPass(build(), "public build");

      // Positive controls FIRST: the sweep is only meaningful if the build
      // actually rendered the record (research §8).
      expect(
        filesContaining(outDir, "Public welcome body").length,
        "control: public body",
      ).toBeGreaterThan(0);

      for (const canary of [
        RESTRICTED_TITLE,
        RESTRICTED_DESC,
        RESTRICTED_BODY,
        INTERNAL_BODY,
        BOTH_BODY,
        SUMMARY_BODY,
        DECK_BODY,
      ]) {
        const hits = filesContaining(outDir, canary);
        expect(hits, `canary "${canary.slice(0, 24)}…" leaked into: ${hits.join(", ")}`).toEqual(
          [],
        );
      }
      // The asset: name and bytes.
      expect(filesContaining(outDir, "comp-chart"), "asset name leaked").toEqual([]);
      expect(assetHits(outDir), "asset bytes leaked (raw or base64)").toEqual([]);
      // The route is absent, and llms.txt lists only what this viewer admits.
      expect(existsSync(path.join(outDir, "docs", "compensation"))).toBe(false);
      const llms = readFileSync(path.join(outDir, "llms.txt"), "utf8");
      expect(llms).toContain("(/docs/welcome)");
      expect(llms).not.toContain("compensation");
      expect(llms).not.toContain("internal-notes");
      expect(llms).not.toContain("board-minutes");
      // No audience label on the public build.
      expect(filesContaining(outDir, "not for publication")).toEqual([]);
    }, 300_000);

    it("public,internal: the internal concepts appear, the restricted one does not, label present", () => {
      mustPass(build("public,internal"), "internal build");
      expect(
        filesContaining(outDir, INTERNAL_BODY).length,
        "internal canary must render for a viewer holding internal",
      ).toBeGreaterThan(0);
      expect(
        filesContaining(outDir, BOTH_BODY).length,
        "a concept declaring [internal, restricted] overlaps an internal viewer",
      ).toBeGreaterThan(0);
      for (const canary of [RESTRICTED_TITLE, RESTRICTED_DESC, RESTRICTED_BODY]) {
        expect(filesContaining(outDir, canary), `restricted canary in internal build`).toEqual([]);
      }
      expect(assetHits(outDir), "asset bytes in internal build (raw or base64)").toEqual([]);
      expect(
        filesContaining(outDir, "not for publication").length,
        "a build for more than public must name itself",
      ).toBeGreaterThan(0);
    }, 300_000);

    it("public,restricted (the control): every restricted canary present — and INTERNAL still absent", () => {
      mustPass(build("public,restricted"), "restricted build");
      for (const canary of [RESTRICTED_TITLE, RESTRICTED_BODY, BOTH_BODY]) {
        expect(
          filesContaining(outDir, canary).length,
          `control: "${canary.slice(0, 24)}…" must exist for a viewer holding restricted`,
        ).toBeGreaterThan(0);
      }
      // The row the ladder used to hide: audiences OVERLAP, they do not rank
      // (record spec §2.4). A restricted viewer is not "above" an internal
      // one, so an `[internal]` concept is as absent here as in the public
      // build — and an adopter migrating from the ordered model will assume
      // otherwise until something says so.
      expect(
        filesContaining(outDir, INTERNAL_BODY),
        "an [internal] concept must not appear for a [public, restricted] viewer",
      ).toEqual([]);
      expect(
        assetHits(outDir).length,
        "control: asset bytes (raw or base64) for the viewer that may see them",
      ).toBeGreaterThan(0);
    }, 300_000);

    it("a viewer naming an audience the registry does not declare refuses the build", () => {
      const result = build("public,bogus-tier");
      expect(result.status, "an unregistered audience must refuse").not.toBe(0);
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      expect(output).toContain("ksor-viewer-unregistered");
      expect(output).toContain("bogus-tier");
      // …and the remedy names what IS registered, so the fix is one edit away.
      expect(output).toContain("internal");
    }, 300_000);

    it("a viewer that omits public refuses the build", () => {
      // A build for a restricted audience ALONE would silently drop every
      // public concept — a site that looks complete and is not.
      const result = build("internal");
      expect(result.status, "a viewer without public must refuse").not.toBe(0);
      expect(`${result.stdout ?? ""}${result.stderr ?? ""}`).toContain("ksor-viewer-omits-public");
    }, 300_000);

    it("no restricted artifact survives a rebuild to a narrower viewer", () => {
      mustPass(build("public,internal,restricted"), "widest build");
      expect(
        filesContaining(outDir, RESTRICTED_BODY).length,
        "control: restricted content present before the rebuild",
      ).toBeGreaterThan(0);
      // The attachment canaries need their own control, or the sweep below
      // passes for the wrong reason: an attachment that is published NOWHERE,
      // at any audience, would satisfy every "did not leak" assertion in this
      // file while the feature was simply broken (research/visibility.md §8).
      // Which control is the true one depends on the shell — see
      // `rendersAttachments`. Both are asserted rather than one being skipped,
      // so a shell that starts or stops rendering attachments fails here and
      // has to say so in the table.
      if (rendersAttachments) {
        expect(
          filesContaining(outDir, SUMMARY_BODY).length,
          "control: a restricted document's summary IS published where its parent is",
        ).toBeGreaterThan(0);
        expect(
          filesContaining(outDir, DECK_BODY).length,
          "control: a restricted document's deck IS published where its parent is",
        ).toBeGreaterThan(0);
      } else {
        expect(
          filesContaining(outDir, SUMMARY_BODY),
          "this shell excludes attachments without rendering them, so a summary is published nowhere",
        ).toEqual([]);
        expect(
          filesContaining(outDir, DECK_BODY),
          "this shell excludes attachments without rendering them, so a deck is published nowhere",
        ).toEqual([]);
      }
      // Rebuild public WITHOUT wiping: the shell's own output handling is
      // what must not leave restricted bytes behind.
      mustPass(build(undefined, { keepOut: true }), "public rebuild over the widest output");
      for (const canary of [
        RESTRICTED_TITLE,
        RESTRICTED_DESC,
        RESTRICTED_BODY,
        INTERNAL_BODY,
        BOTH_BODY,
        SUMMARY_BODY,
        DECK_BODY,
      ]) {
        const hits = filesContaining(outDir, canary);
        expect(
          hits,
          `stale "${canary.slice(0, 24)}…" survived the rebuild in: ${hits.join(", ")}`,
        ).toEqual([]);
      }
      expect(assetHits(outDir), "stale asset bytes survived the rebuild").toEqual([]);
    }, 300_000);

    it("a concept naming an unregistered audience refuses the build, checker or no checker", () => {
      // Fail CLOSED at staging time: staging runs the record checker itself,
      // so this refuses even in a project whose `pnpm check` was never run.
      // Under the ordered model the equivalent shape (a `visibility:` the
      // record never declared) had a DEFAULT to fall back on; the profile has
      // none — omission and unknown identifiers are both refusals (§2.4).
      const stray = path.join(project, "knowledge", "stray.md");
      try {
        writeFileSync(
          stray,
          concept({
            title: "Stray",
            description: "Names an audience nobody registered.",
            audience: ["board"],
            body: "STRAYCANARY body.",
          }),
        );
        const result = build();
        expect(result.status, "an unregistered concept audience must refuse").not.toBe(0);
        const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
        expect(output).toContain("ksor-audience-unregistered");
        expect(output).toContain("board");
      } finally {
        rmSync(stray, { force: true });
      }
    }, 300_000);

    it("a pre-profile `visibility:` key refuses rather than being read as an audience", () => {
      // The migration hazard: a record carried over from the ordered model
      // still declares `visibility:`. Read as an unknown key it would take
      // whatever the profile's default is and publish; record spec §2.7
      // refuses it BY NAME instead, with the migration hint.
      const legacy = path.join(project, "knowledge", "legacy.md");
      try {
        writeFileSync(
          legacy,
          `---
type: Document
title: Legacy
description: Carried over from the ordered model.
status: draft
visibility: internal
ksor:
  audience: [public]
---

LEGACYCANARY body.
`,
        );
        const result = build();
        expect(result.status, "a pre-profile visibility: must refuse").not.toBe(0);
        expect(`${result.stdout ?? ""}${result.stderr ?? ""}`).toContain("ksor-legacy-key");
      } finally {
        rmSync(legacy, { force: true });
      }
    }, 300_000);

    it("the filter never reaches the client bundle", () => {
      mustPass(build(), "public build for bundle probe");
      const bundleDirs = ["_next", "assets"]
        .map((d) => path.join(outDir, d))
        .filter((d) => existsSync(d));
      expect(bundleDirs.length, "no bundle dir found").toBeGreaterThan(0);
      for (const dir of bundleDirs) {
        for (const probe of ["KSOR_AUDIENCE", "compensation", "internal-notes"]) {
          const hits = filesContaining(dir, probe);
          expect(hits, `"${probe}" serialized into: ${hits.join(", ")}`).toEqual([]);
        }
      }
    }, 300_000);
  },
);

describe.runIf(!enabled)("visibility conformance (gated)", () => {
  it("skipped — set KSOR_E2E=1 to run the canary sweep", () => {
    expect(enabled).toBe(false);
  });
});
