import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The visibility spec's acceptance (specs/ksor/visibility/spec.md), run
// against BOTH shells with one canary corpus: a restricted document must
// leave no trace — title, description, body, asset name or asset bytes —
// in any build below its tier, and every probe carries a positive control
// (research/visibility.md §8: a sweep that cannot tell "filtered" from
// "broken" fails open). Heavy (installs + four builds per shell), gated:
//   KSOR_E2E=1 pnpm exec vitest run --config vitest.integration.config.ts packages/ksor/src/visibility-conformance.integration.test.ts
const enabled = process.env.KSOR_E2E === "1";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const distCli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const docusaurusShell = path.join(repoRoot, "workbench", "shells", "docusaurus");

// Distinct per-surface canaries, per the issue-#10 method.
const RESTRICTED_TITLE = "Zebra Bands CANARYTITLE9F3A";
const RESTRICTED_DESC = "CANARYDESC4A8C internal only";
const RESTRICTED_BODY = "CANARYBODY7B2E1";
const INTERNAL_BODY = "INTERNALCANARY7A1D";

// A real 4x4 PNG for the asset probe; its bytes are the probe.
const ASSET_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAARGVYSWZNTQAqAAAACAABh2kABAAAAAEAAAAaAAAAAAADoAEAAwAAAAEAAQAAoAIABAAAAAEAAAAEoAMABAAAAAEAAAAEAAAAAMVs/gIAAAHJaVRYdFhNTDpjb20uYWRvYmUueG1wAAAAAAA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJYTVAgQ29yZSA2LjAuMCI+CiAgIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgICAgIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiCiAgICAgICAgICAgIHhtbG5zOmV4aWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vZXhpZi8xLjAvIj4KICAgICAgICAgPGV4aWY6Q29sb3JTcGFjZT4xPC9leGlmOkNvbG9yU3BhY2U+CiAgICAgICAgIDxleGlmOlBpeGVsWERpbWVuc2lvbj4zMjwvZXhpZjpQaXhlbFhEaW1lbnNpb24+CiAgICAgICAgIDxleGlmOlBpeGVsWURpbWVuc2lvbj4zMjwvZXhpZjpQaXhlbFlEaW1lbnNpb24+CiAgICAgIDwvcmRmOkRlc2NyaXB0aW9uPgogICA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgqWsr5jAAAAP0lEQVQIHQE0AMv/Af////b7/f0B+wsDBgT2+PzL2urzAOk2Jh8CCQcE7ejq1sjrC/8MAP///+bs9dbg8Pz9/kfmIaM5XLTrAAAAAElFTkSuQmCC",
  "base64",
);
// The asset can ship two ways: raw bytes (a copied file) or base64 (an
// inlined data: URI — found live: Docusaurus inlines small images, so a
// bytes-only probe was blind to that shape in BOTH directions). Probe both:
// a 3-byte-aligned raw slice, and a substring of the full base64 string
// (alignment makes the standalone encoding a substring of any embedding).
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
}

const SHELLS: readonly Shell[] = [
  { shellName: "fumadocs", swap: null },
  {
    shellName: "docusaurus",
    swap: (project) => {
      // The swap recipe, as in shell-conformance (filtered copy).
      const GENERATED = new Set([
        "node_modules",
        ".docusaurus",
        ".generated",
        ".staged-knowledge",
        "out",
      ]);
      rmSync(path.join(project, "system", "site"), { recursive: true });
      cpSync(docusaurusShell, path.join(project, "system", "site"), {
        recursive: true,
        filter: (src) => !GENERATED.has(path.basename(src)),
      });
      rmSync(path.join(project, "system", "site", "README.md"));
      appendFileSync(
        path.join(project, ".gitignore"),
        "system/site/.docusaurus/\nsystem/site/.generated/\nsystem/site/.staged-knowledge/\n",
      );
      const workspaceYaml = path.join(project, "pnpm-workspace.yaml");
      writeFileSync(
        workspaceYaml,
        readFileSync(workspaceYaml, "utf8").replace(
          "allowBuilds:\n",
          "allowBuilds:\n  '@swc/core': false\n  core-js: false\n",
        ),
      );
    },
  },
];

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

describe.runIf(enabled).each(SHELLS)(
  "visibility conformance — $shellName shell",
  ({ shellName, swap }) => {
    let work: string;
    let project: string;
    let outDir: string;

    function build(audience?: string, opts?: { keepOut?: boolean }): SpawnSyncReturns<string> {
      // keepOut leaves the previous build in place — the stale-artifact case
      // tests whether the SHELL cleans its own output (review finding,
      // 2026-08-18: the suite's own pre-wipe made that structurally
      // invisible).
      if (!opts?.keepOut) rmSync(outDir, { recursive: true, force: true });
      return run(
        "pnpm",
        ["build"],
        project,
        audience === undefined ? { KSOR_AUDIENCE: "" } : { KSOR_AUDIENCE: audience },
      );
    }

    beforeAll(() => {
      work = mkdtempSync(path.join(tmpdir(), `ksor-vis-${shellName}-`));
      mustPass(run(process.execPath, [distCli, "init", `vis-${shellName}`], work), "init");
      project = path.join(work, `vis-${shellName}`);
      outDir = path.join(project, "system", "site", "out");

      // Declare the audience model in instance.md's frontmatter.
      const instance = path.join(project, "instance.md");
      const text = readFileSync(instance, "utf8");
      writeFileSync(
        instance,
        text.replace(
          /^---\n/,
          "---\naudiences:\n  - public\n  - internal\n  - restricted\ndefault_visibility: public\n",
        ),
      );

      const knowledge = path.join(project, "knowledge");
      writeFileSync(
        path.join(knowledge, "welcome.md"),
        "---\ntitle: Welcome\nstatus: approved\norder: 0\n---\n\nPublic welcome body.\n",
      );
      writeFileSync(
        path.join(knowledge, "internal-notes.md"),
        `---\ntitle: Internal notes\nstatus: draft\nvisibility: internal\n---\n\nNotes ${INTERNAL_BODY} for staff.\n`,
      );
      writeFileSync(
        path.join(knowledge, "compensation.md"),
        `---\ntitle: "${RESTRICTED_TITLE}"\ndescription: ${RESTRICTED_DESC}\nstatus: approved\nvisibility: restricted\n---\n\nBand 4 engineers ${RESTRICTED_BODY} receive between 180000 and 240000.\n\n![bands](./comp-chart.png)\n`,
      );
      writeFileSync(path.join(knowledge, "comp-chart.png"), ASSET_PNG);

      swap?.(project);
      mustPass(
        run("pnpm", ["install", ...(swap ? ["--no-frozen-lockfile"] : [])], project),
        "install",
      );

      // The record itself must be legal before any build claims anything.
      mustPass(
        run("node", [path.join(".agents", "skills", "format-checker", "check.mjs")], project),
        "pnpm check on the canary corpus",
      );
    }, 600_000);

    afterAll(() => {
      if (work) rmSync(work, { recursive: true, force: true });
    }, 180_000);

    it("public build (unset audience): zero restricted traces, with live controls", () => {
      mustPass(build(), "public build");

      // Positive controls FIRST: the sweep is only meaningful if the build
      // actually rendered the record (research §8).
      expect(
        filesContaining(outDir, "Public welcome body").length,
        "control: public body",
      ).toBeGreaterThan(0);

      for (const canary of [RESTRICTED_TITLE, RESTRICTED_DESC, RESTRICTED_BODY, INTERNAL_BODY]) {
        const hits = filesContaining(outDir, canary);
        expect(hits, `canary "${canary.slice(0, 24)}…" leaked into: ${hits.join(", ")}`).toEqual(
          [],
        );
      }
      // The asset: name and bytes.
      expect(filesContaining(outDir, "comp-chart"), "asset name leaked").toEqual([]);
      expect(assetHits(outDir), "asset bytes leaked (raw or base64)").toEqual([]);
      // The route is absent, and llms.txt lists only the public tier.
      expect(existsSync(path.join(outDir, "docs", "compensation"))).toBe(false);
      const llms = readFileSync(path.join(outDir, "llms.txt"), "utf8");
      expect(llms).toContain("(/docs/welcome)");
      expect(llms).not.toContain("compensation");
      expect(llms).not.toContain("internal-notes");
      // No audience label on the public build.
      expect(filesContaining(outDir, "not for publication")).toEqual([]);
    }, 300_000);

    it("internal build: internal included, restricted still absent, label present", () => {
      mustPass(build("internal"), "internal build");
      expect(
        filesContaining(outDir, INTERNAL_BODY).length,
        "internal canary must render at its own tier",
      ).toBeGreaterThan(0);
      for (const canary of [RESTRICTED_TITLE, RESTRICTED_DESC, RESTRICTED_BODY]) {
        expect(filesContaining(outDir, canary), `restricted canary in internal build`).toEqual([]);
      }
      expect(assetHits(outDir), "asset bytes in internal build (raw or base64)").toEqual([]);
      expect(
        filesContaining(outDir, "not for publication").length,
        "the internal build must name itself",
      ).toBeGreaterThan(0);
    }, 300_000);

    it("restricted build (the control): every canary present, asset shipped", () => {
      mustPass(build("restricted"), "restricted build");
      for (const canary of [RESTRICTED_TITLE, RESTRICTED_BODY, INTERNAL_BODY]) {
        expect(
          filesContaining(outDir, canary).length,
          `control: "${canary.slice(0, 24)}…" must exist at its own tier`,
        ).toBeGreaterThan(0);
      }
      expect(
        assetHits(outDir).length,
        "control: asset bytes (raw or base64) at its own tier",
      ).toBeGreaterThan(0);
    }, 300_000);

    it("an unrecognized audience fails the build with a named error", () => {
      const result = build("bogus-tier");
      expect(result.status, "bogus audience must refuse").not.toBe(0);
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      expect(output).toContain("bogus-tier");
      expect(output.toLowerCase()).toContain("audience");
    }, 300_000);

    it("no restricted artifact survives a rebuild to a lower tier", () => {
      mustPass(build("restricted"), "restricted build");
      expect(
        filesContaining(outDir, RESTRICTED_BODY).length,
        "control: restricted content present before the rebuild",
      ).toBeGreaterThan(0);
      // Rebuild public WITHOUT wiping: the shell's own output handling is
      // what must not leave restricted bytes behind.
      mustPass(build(undefined, { keepOut: true }), "public rebuild over restricted output");
      for (const canary of [RESTRICTED_TITLE, RESTRICTED_DESC, RESTRICTED_BODY, INTERNAL_BODY]) {
        const hits = filesContaining(outDir, canary);
        expect(
          hits,
          `stale "${canary.slice(0, 24)}…" survived the rebuild in: ${hits.join(", ")}`,
        ).toEqual([]);
      }
      expect(assetHits(outDir), "stale asset bytes survived the rebuild").toEqual([]);
    }, 300_000);

    it("a misordered audience model refuses at build time, checker or no checker", () => {
      const instance = path.join(project, "instance.md");
      const original = readFileSync(instance, "utf8");
      try {
        writeFileSync(
          instance,
          original.replace(
            /audiences:\n  - public\n  - internal\n  - restricted/,
            "audiences:\n  - restricted\n  - internal\n  - public",
          ),
        );
        const result = build();
        expect(result.status, "a restricted-first model must never default-build").not.toBe(0);
        expect(`${result.stdout ?? ""}${result.stderr ?? ""}`).toContain(
          "ksor-audiences-misordered",
        );
      } finally {
        writeFileSync(instance, original);
      }
    }, 300_000);

    it("the filter never reaches the client bundle", () => {
      mustPass(build(), "public build for bundle probe");
      const bundleDirs = ["_next", "assets"]
        .map((d) => path.join(outDir, d))
        .filter((d) => existsSync(d));
      expect(bundleDirs.length, "no bundle dir found").toBeGreaterThan(0);
      for (const dir of bundleDirs) {
        for (const probe of ["KSOR_AUDIENCE", "default_visibility", "compensation"]) {
          const hits = filesContaining(dir, probe);
          expect(hits, `"${probe}" serialized into: ${hits.join(", ")}`).toEqual([]);
        }
      }
    }, 300_000);
  },
);

describe.runIf(!enabled)("visibility conformance (gated)", () => {
  it("skipped — set KSOR_E2E=1 to run the canary sweep against both shells", () => {
    expect(enabled).toBe(false);
  });
});
