import { describe, expect, it } from "vitest";

import { applyProse, detectManager, isSkippedFor, transformManifest } from "./manager.js";

describe("detectManager", () => {
  it("names the manager from the first user-agent token", () => {
    expect(detectManager("npm/11.6.0 node/v24.5.0 darwin arm64")).toBe("npm");
    expect(detectManager("bun/1.3.6 npm/? node/v24.3.0")).toBe("bun");
    expect(detectManager("pnpm/11.22.0 npm/? node/v24")).toBe("pnpm");
  });

  it("falls back to pnpm — absent, unrecognized, or garbage", () => {
    expect(detectManager(undefined)).toBe("pnpm");
    expect(detectManager("")).toBe("pnpm");
    expect(detectManager("yarn/4.5.0 npm/? node/v24")).toBe("pnpm");
    expect(detectManager("npmate/1.0")).toBe("pnpm");
  });
});

describe("isSkippedFor", () => {
  it("keeps every template file for pnpm and drops only pnpm's machinery otherwise", () => {
    expect(isSkippedFor("pnpm-workspace.yaml", "pnpm")).toBe(false);
    expect(isSkippedFor("pnpm-lock.yaml", "npm")).toBe(true);
    expect(isSkippedFor("pnpm-workspace.yaml", "bun")).toBe(true);
    expect(isSkippedFor("package.json", "npm")).toBe(false);
  });
});

describe("transformManifest", () => {
  const source = JSON.stringify(
    {
      name: "demo",
      scripts: { dev: "pnpm -C system/site dev", check: "node check.mjs" },
      packageManager: "pnpm@11.22.0",
    },
    null,
    2,
  );

  it("is the identity for pnpm", () => {
    expect(transformManifest(source, "pnpm")).toBe(source);
  });

  it("rewrites manager-owned scripts, keeps the rest, drops the pnpm pin", () => {
    const npm = JSON.parse(transformManifest(source, "npm")) as {
      scripts: Record<string, string>;
      workspaces: string[];
      packageManager?: string;
    };
    expect(npm.scripts.dev).toBe("npm --prefix system/site run dev");
    expect(npm.scripts.check).toBe("node check.mjs");
    expect(npm.packageManager).toBeUndefined();
    expect(npm.workspaces).toContain("system/site");
  });
});

describe("applyProse", () => {
  const text = [
    "always",
    "<!-- ksor:pm pnpm -->",
    "pnpm-only",
    "<!-- /ksor:pm -->",
    "<!-- ksor:pm npm bun -->",
    "npm-and-bun",
    "<!-- /ksor:pm -->",
    "run `pnpm check` before pushing",
  ].join("\n");

  it("keeps a block for the managers it names, and strips every marker line", () => {
    const pnpm = applyProse(text, "pnpm");
    expect(pnpm).toContain("pnpm-only");
    expect(pnpm).not.toContain("npm-and-bun");
    expect(pnpm).not.toContain("ksor:pm");
    const bun = applyProse(text, "bun");
    expect(bun).not.toContain("pnpm-only");
    expect(bun).toContain("npm-and-bun");
  });

  it("translates command spellings for npm and bun, never for pnpm", () => {
    expect(applyProse(text, "pnpm")).toContain("run `pnpm check` before pushing");
    expect(applyProse(text, "npm")).toContain("run `npm run check` before pushing");
    expect(applyProse(text, "bun")).toContain("run `bun run check` before pushing");
  });

  it("orders spellings so the longest wins: install is never half-eaten", () => {
    expect(applyProse("pnpm install --no-frozen-lockfile", "npm")).toBe("npm install");
    expect(applyProse("pnpm install", "bun")).toBe("bun install");
    expect(applyProse("pnpm exec ksor serve", "npm")).toBe("npx ksor serve");
    expect(applyProse("pnpm dlx shadcn@latest add card", "bun")).toBe(
      "bunx shadcn@latest add card",
    );
  });
});
