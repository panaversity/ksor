import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GATEWAY_FILE, gatewayPathFor, loadGateway } from "@panaversity/ksor-content-gateway";

// Acceptance 3 and 4 for specs/ksor/gateway/spec.md: the file an adopter owns,
// exercised against the BUILT CLI's scaffold — the tree they actually get.

const distCli = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "dist",
  "cli.mjs",
);

let workDirs: string[] = [];
afterEach(() => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
  workDirs = [];
});

function scaffold(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ksor-gwfile-"));
  workDirs.push(dir);
  const result = spawnSync(process.execPath, [distCli, "init", "demo"], {
    cwd: dir,
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  const project = path.join(dir, "demo");

  // The emitted file imports "@panaversity/ksor/gateway" — the REAL specifier an
  // adopter's file uses — so the resolution has to be real too. Linking the
  // built package in exercises the published `exports` map without paying a
  // `pnpm install` per case.
  const modules = path.join(project, "node_modules", "@panaversity");
  mkdirSync(modules, { recursive: true });
  symlinkSync(path.resolve(distCli, "..", ".."), path.join(modules, "ksor"), "dir");
  return project;
}

describe("the emitted gateway file", () => {
  it("ships with the scaffold, beside the record it serves", () => {
    const project = scaffold();
    expect(existsSync(path.join(project, GATEWAY_FILE))).toBe(true);
    expect(gatewayPathFor(path.join(project, "instance.md"))).toBe(
      path.join(project, "system", "gateways", "content.ts"),
    );
  });

  it("registers today's three tools out of the box — the default is unchanged", async () => {
    const project = scaffold();
    const gateway = await loadGateway(path.join(project, "instance.md"));
    expect(gateway.tools.map((t) => t.name)).toEqual(["search", "outline", "read"]);
    expect(gateway.serverName).toBe("ksor");
  });

  // The honest test of whether a default is a gift or a tax.
  it("is DELETABLE — the door falls back to exactly the same surface", async () => {
    const project = scaffold();
    const withFile = await loadGateway(path.join(project, "instance.md"));
    rmSync(path.join(project, GATEWAY_FILE));
    const without = await loadGateway(path.join(project, "instance.md"));
    expect(without).toEqual(withFile);
  });

  it("drops a tool the record does not list, and the omitted bytes are gone", async () => {
    const project = scaffold();
    writeFileSync(
      path.join(project, GATEWAY_FILE),
      `import { contentTools, defineGateway } from "@panaversity/ksor/gateway";\n` +
        `export default defineGateway({ tools: [contentTools.search({ name: "ask_handbook", k: 3 })] });\n`,
    );
    const gateway = await loadGateway(path.join(project, "instance.md"));
    expect(gateway.tools.map((t) => t.name)).toEqual(["ask_handbook"]);
    expect(gateway.tools[0]?.k).toBe(3);
    // The measured win: the two unlisted definitions are not merely unregistered,
    // their text is nowhere in what the door will hand an agent.
    const rendered = JSON.stringify(gateway);
    expect(rendered).not.toContain("List the record's structure in reading order");
    expect(rendered).not.toContain("Read one document from the record");
  });

  it("keeps the framework floor under a record's own prose", async () => {
    const project = scaffold();
    writeFileSync(
      path.join(project, GATEWAY_FILE),
      `import { contentTools, defineGateway } from "@panaversity/ksor/gateway";\n` +
        `export default defineGateway({ tools: [contentTools.search({ covers: "Only leave policy." })] });\n`,
    );
    const gateway = await loadGateway(path.join(project, "instance.md"));
    const description = gateway.tools[0]?.description ?? "";
    expect(description.startsWith("Only leave policy.")).toBe(true);
    // The guarantees a replacement would have deleted.
    expect(description).toContain("UNTRUSTED corpus text");
    expect(description).toContain('reason="abstained"');
  });

  it("refuses a broken file by slug, rather than serving a surface nobody asked for", async () => {
    const project = scaffold();
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["export default 42;\n", "ksor-gateway-unloadable"],
      ["export const notDefault = 1;\n", "ksor-gateway-unloadable"],
      ["this is not typescript at all (\n", "ksor-gateway-unloadable"],
      [
        `import { defineGateway } from "@panaversity/ksor/gateway";\n` +
          `export default defineGateway({ tools: [] });\n`,
        "ksor-gateway-no-tools",
      ],
      [
        `import { contentTools, defineGateway } from "@panaversity/ksor/gateway";\n` +
          `export default defineGateway({ tools: [contentTools.search({ name: "Search" })] });\n`,
        "ksor-gateway-bad-tool-name",
      ],
    ];
    for (const [source, slug] of cases) {
      // A fresh filename each time: an ES module is cached by URL, so reusing
      // one path would silently re-run the FIRST version of the file and every
      // later case would "pass" against source it never loaded.
      const project2 = scaffold();
      writeFileSync(path.join(project2, GATEWAY_FILE), source);
      await expect(
        loadGateway(path.join(project2, "instance.md")),
        `source: ${source.slice(0, 60)}`,
      ).rejects.toThrow(slug);
    }
    expect(readFileSync(path.join(project, GATEWAY_FILE), "utf8")).toContain("defineGateway");
  });
});
