/**
 * The scaffold meets the adopter's package manager (issue #28).
 *
 * Decision 1 makes Node the one prerequisite; requiring a SPECIFIC manager on
 * top of it re-added the second-prerequisite tax that decision exists to
 * avoid. So `ksor init` reads `npm_config_user_agent` — every manager sets it
 * for the process it spawns, so the run that scaffolds is the run that knows
 * the toolchain — and emits that manager's scaffold. Unrecognized or absent
 * falls back to pnpm: the most-protected posture, and the one every scaffold
 * got before this existed.
 *
 * Three shapes, each proven end to end (install, bin resolution, full static
 * build) against the published CLI before this landed:
 *
 *   pnpm  today's scaffold, byte-for-byte — workspace file, committed
 *         site-only lockfile, 48h release quarantine, install-script denial
 *   npm   `workspaces` field, `.npmrc` with `ignore-scripts=true`, no
 *         lockfile (npm keeps ONE root lock and the stamped CLI version
 *         cannot be pre-resolved into it — the tarball hash does not exist
 *         when the template is built; the first install writes it)
 *   bun   `workspaces` field, cd-chain scripts (bun's own shell runs them on
 *         Windows too — `bun --cwd <dir> run <script>` executed the WRONG
 *         script in a workspace, observed live on 1.3.6), no lockfile; bun
 *         denies dependency lifecycle scripts by default, so the denial half
 *         of the posture is bun's own
 *
 * What npm and bun CANNOT give the adopter is pnpm's 48-hour quarantine on
 * newly published dependency versions. That absence is DISCLOSED in the
 * emitted scaffold (owner decision, 2026-08-24) — honest absence, never
 * silent weakness — rather than either refusing those managers or pretending
 * the postures are equal.
 */

export type PackageManager = "pnpm" | "npm" | "bun";

/** Every manager the scaffold can be emitted for. */
export const MANAGERS: readonly PackageManager[] = ["pnpm", "npm", "bun"];

/**
 * Which manager spawned this process, from `npm_config_user_agent`
 * (e.g. "pnpm/11.22.0 npm/? node/v24.5.0 darwin arm64"). The first token
 * names the manager; only managers we emit a scaffold for are recognized.
 */
export function detectManager(userAgent: string | undefined): PackageManager {
  const head = (userAgent ?? "").split("/")[0]?.trim();
  if (head === "npm") return "npm";
  if (head === "bun") return "bun";
  return "pnpm";
}

/** Template files that belong to exactly one manager's scaffold. */
export function isSkippedFor(templateName: string, manager: PackageManager): boolean {
  if (manager === "pnpm") return false;
  return templateName === "pnpm-workspace.yaml" || templateName === "pnpm-lock.yaml";
}

/**
 * The workspace globs, shared by every manager. pnpm reads them from
 * pnpm-workspace.yaml; npm and bun read a `workspaces` field. One constant so
 * the two spellings cannot drift.
 */
export const WORKSPACE_GLOBS: readonly string[] = [
  "system/site",
  "system/gateways/*",
  "system/packages/*",
];

/**
 * The root scripts, per manager. pnpm's are the template's own bytes; npm and
 * bun REPLACE the manager-specific bodies and inherit everything else.
 *
 * `refresh` builds first in ALL THREE. `ingest` publishes only a tree
 * `ksor build` has checked, so without it the emitted README's ordered path
 * (`provision` → `refresh` → `serve`) dies at step two with
 * `ksor-lock-missing`. Fixing the pnpm template alone left npm and bun broken,
 * because these bodies REPLACE it rather than extend it — the same shape as
 * every other divergence this file exists to prevent.
 * npm: `--prefix` is npm's spelling of "run it over there".
 * bun: cd-chains — see the module comment for why not `--cwd`.
 */
const SCRIPT_BODIES: Record<Exclude<PackageManager, "pnpm">, Record<string, string>> = {
  npm: {
    dev: "npm --prefix system/site run dev",
    build: "ksor build && npm --prefix system/site run build",
    provision: "npm run schema && npm run grant",
    refresh: "ksor build && npm run ingest && npm run gc",
  },
  bun: {
    dev: "cd system/site && bun run dev",
    build: "ksor build && cd system/site && bun run build",
    provision: "bun run schema && bun run grant",
    refresh: "ksor build && bun run ingest && bun run gc",
  },
};

/**
 * Rewrite the scaffold's root package.json for the manager. Structured — a
 * JSON transform, never string surgery — because the manifest is the one
 * file where a half-applied spelling map would still parse and then lie.
 */
export function transformManifest(source: string, manager: PackageManager): string {
  if (manager === "pnpm") return source;
  const parsed = JSON.parse(source) as Record<string, unknown> & {
    scripts: Record<string, string>;
  };
  const { packageManager: _dropped, ...rest } = parsed;
  const out: Record<string, unknown> = {
    ...rest,
    scripts: { ...parsed.scripts, ...SCRIPT_BODIES[manager] },
    workspaces: [...WORKSPACE_GLOBS],
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

/**
 * Ordered prose translation, longest spelling first so `pnpm install` is
 * never half-eaten by a shorter rule. Applied to every emitted text file
 * except package.json (structured above). The conformance test asserts ZERO
 * surviving "pnpm" tokens outside the quarantine disclosure, so a template
 * edit that adds a spelling this map misses goes red instead of shipping an
 * instruction the adopter cannot run.
 */
const SCRIPT_NAMES = [
  "dev",
  "build",
  "preview",
  "check",
  "serve",
  "provision",
  "refresh",
  "schema",
  "grant",
  "ingest",
  "gc",
] as const;

function spellings(manager: Exclude<PackageManager, "pnpm">): readonly [string, string][] {
  const run = (script: string): string =>
    manager === "npm" ? `npm run ${script}` : `bun run ${script}`;
  const pairs: [string, string][] = [
    ["pnpm install --no-frozen-lockfile", manager === "npm" ? "npm install" : "bun install"],
    ["pnpm install", manager === "npm" ? "npm install" : "bun install"],
    ["pnpm exec ksor", manager === "npm" ? "npx ksor" : "bunx ksor"],
    ["pnpm dlx", manager === "npm" ? "npx" : "bunx"],
    ["pnpm add -D", manager === "npm" ? "npm i -D" : "bun add -d"],
    [
      "pnpm -C system/site",
      manager === "npm" ? "npm --prefix system/site run" : "cd system/site && bun run",
    ],
  ];
  for (const script of SCRIPT_NAMES) pairs.push([`pnpm ${script}`, run(script)]);
  return pairs;
}

/**
 * Manager-conditional blocks in markdown templates:
 *
 *   <!-- ksor:pm pnpm npm -->
 *   ...lines kept only for those managers...
 *   <!-- /ksor:pm -->
 *
 * The marker lines themselves never survive into any scaffold, so the pnpm
 * output stays exactly what an adopter always got.
 */
const BLOCK_OPEN = /^[ \t]*<!-- ksor:pm ([a-z ]+?) -->[ \t]*$/;
const BLOCK_CLOSE = /^[ \t]*<!-- \/ksor:pm -->[ \t]*$/;

export function applyProse(text: string, manager: PackageManager): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let keeping = true;
  let inBlock = false;
  for (const line of lines) {
    const open = BLOCK_OPEN.exec(line);
    if (open !== null) {
      inBlock = true;
      keeping = (open[1] as string).split(/\s+/).includes(manager);
      continue;
    }
    if (BLOCK_CLOSE.test(line)) {
      inBlock = false;
      keeping = true;
      continue;
    }
    if (!inBlock || keeping) kept.push(line);
  }
  let out = kept.join("\n");
  if (manager !== "pnpm") {
    for (const [from, to] of spellings(manager)) out = out.replaceAll(from, to);
  }
  return out;
}

/**
 * Files a manager's scaffold gains beyond the template tree. npm's `.npmrc`
 * carries the denial half of the posture and DISCLOSES the missing half; bun
 * needs no file — denial is bun's own default — so its disclosure lives in
 * the README's lockfile note.
 */
export function extraFiles(manager: PackageManager): readonly [string, string][] {
  if (manager !== "npm") return [];
  return [
    [
      ".npmrc",
      "# Dependency install scripts are denied — the same posture the pnpm\n" +
        "# scaffold enforces per-package. Flip to false only with a comment naming\n" +
        "# what breaks without it.\n" +
        "#\n" +
        "# What npm cannot give you is pnpm's 48-hour quarantine on newly\n" +
        "# published dependency versions (minimumReleaseAge): under npm a routine\n" +
        "# install can pick up a day-zero compromised release the day it ships.\n" +
        "# That protection exists only under pnpm.\n" +
        "ignore-scripts=true\n",
    ],
  ];
}
