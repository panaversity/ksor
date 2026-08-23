import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildDefaultGateway,
  buildServer,
  GATEWAY_FILE,
  gatewayPathFor,
  loadGateway,
  verifyGatewaySurface,
  type ServiceContext,
} from "@panaversity/ksor-content-gateway";

// Acceptance for specs/ksor/gateway/spec.md: the registration file an adopter
// owns, exercised against the BUILT CLI's scaffold — the tree they actually get.

const distCli = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "dist",
  "cli.mjs",
);

/**
 * Enough context to BUILD a server. Registration only closes over ctx; nothing
 * here touches Postgres, which is what lets the boot check run before the DSN is
 * resolved. If a future change makes registration read ctx.pool, this stub
 * throws on null and the coupling becomes visible rather than silent.
 */
const STUB = {
  instance: { instructions: "This record is authoritative for the acceptance suite." },
  pool: null,
  ring: null,
} as unknown as ServiceContext;

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

  // The emitted file imports "@panaversity/ksor/gateway" — the REAL specifier —
  // so resolution has to be real too. Linking the built package in exercises the
  // published `exports` map without paying a `pnpm install` per case.
  const modules = path.join(project, "node_modules", "@panaversity");
  mkdirSync(modules, { recursive: true });
  symlinkSync(path.resolve(distCli, "..", ".."), path.join(modules, "ksor"), "dir");
  return project;
}

/** Names of the tools a registration actually serves, over the protocol. */
async function servedToolNames(project: string): Promise<readonly string[]> {
  const registration = await loadGateway(path.join(project, "instance.md"));
  const tools = await verifyGatewaySurface(buildServer(STUB, "0.0.0", registration));
  return tools.map((t) => t.name);
}

const IMPORT = 'import { contentToolsPlaceholder } from "@panaversity/ksor/gateway";';

describe("the emitted registration file", () => {
  it("ships with the scaffold, beside the record it serves", () => {
    const project = scaffold();
    expect(existsSync(path.join(project, GATEWAY_FILE))).toBe(true);
    expect(gatewayPathFor(path.join(project, "instance.md"))).toBe(
      path.join(project, "system", "gateways", "content.ts"),
    );
  });

  it("serves today's three tools out of the box", async () => {
    expect(await servedToolNames(scaffold())).toEqual(["search", "outline", "read"]);
  });

  // The honest test of whether a default is a gift or a tax — and the reason the
  // package keeps a compiled twin at all.
  it("is DELETABLE, and the compiled default serves the identical surface", async () => {
    const project = scaffold();
    const withFile = await verifyGatewaySurface(
      buildServer(STUB, "0.0.0", await loadGateway(path.join(project, "instance.md"))),
    );
    rmSync(path.join(project, GATEWAY_FILE));
    const without = await verifyGatewaySurface(
      buildServer(STUB, "0.0.0", await loadGateway(path.join(project, "instance.md"))),
    );
    // Compared over the PROTOCOL, so this is the surface an agent receives —
    // not two objects we hoped were equal.
    expect(JSON.stringify(without)).toBe(JSON.stringify(withFile));
    expect(without.map((t) => t.name)).toEqual(["search", "outline", "read"]);
  });

  it("falls back to the compiled default when no file was ever written", async () => {
    const project = scaffold();
    rmSync(path.join(project, GATEWAY_FILE));
    const registration = await loadGateway(path.join(project, "instance.md"));
    expect(registration).toBe(buildDefaultGateway);
  });

  it("renames a tool, and drops one entirely", async () => {
    const project = scaffold();
    // A registration keeping only search, renamed — ordinary MCP, ordinary zod.
    const source = `
import { FLOOR, McpServer, SEARCH_OUTPUT, READ_ONLY, composeInstructions, searchHandler, z }
  from "@panaversity/ksor/gateway";
export default function buildGateway(ctx, version) {
  const server = new McpServer({ name: "handbook", version },
    { instructions: composeInstructions(ctx.instance.instructions) });
  server.registerTool("search_handbook", {
    title: "Search the handbook",
    description: \`Leave and benefits only.\\n\\n\${FLOOR.search}\`,
    inputSchema: z.object({ query: z.string(), k: z.number().int().min(1).max(50).default(3) }),
    outputSchema: SEARCH_OUTPUT,
    annotations: READ_ONLY,
  }, searchHandler(ctx));
  return server;
}
`;
    writeFileSync(path.join(project, GATEWAY_FILE), source);
    expect(await servedToolNames(project)).toEqual(["search_handbook"]);
  });

  // THE ONE THAT MATTERS. Under the old config API the floor could not be
  // dropped; under a registration file it is a template literal in adopter code,
  // so nothing structural stops it. This is what replaces that guarantee.
  it("REFUSES a served tool whose description lost the framework floor", async () => {
    const project = scaffold();
    const source = `
import { McpServer, SEARCH_OUTPUT, READ_ONLY, composeInstructions, searchHandler, z }
  from "@panaversity/ksor/gateway";
export default function buildGateway(ctx, version) {
  const server = new McpServer({ name: "handbook", version },
    { instructions: composeInstructions(ctx.instance.instructions) });
  server.registerTool("search", {
    title: "Search",
    description: "Search the handbook.",
    inputSchema: z.object({ query: z.string(), k: z.number().int().default(5) }),
    outputSchema: SEARCH_OUTPUT,
    annotations: READ_ONLY,
  }, searchHandler(ctx));
  return server;
}
`;
    writeFileSync(path.join(project, GATEWAY_FILE), source);
    await expect(servedToolNames(project)).rejects.toThrow("ksor-gateway-floor-missing");
  });

  it("refuses a registration that serves nothing", async () => {
    const project = scaffold();
    writeFileSync(
      path.join(project, GATEWAY_FILE),
      `import { McpServer, composeInstructions } from "@panaversity/ksor/gateway";
export default function buildGateway(ctx, version) {
  return new McpServer({ name: "empty", version },
    { instructions: composeInstructions(ctx.instance.instructions) });
}
`,
    );
    await expect(servedToolNames(project)).rejects.toThrow("ksor-gateway-no-tools");
  });

  it("refuses a broken file by slug, naming what to fix", async () => {
    for (const source of [
      "export default 42;\n",
      "export const notDefault = 1;\n",
      "this is not typescript at all (\n",
    ]) {
      // A fresh project per case: ES modules are cached by URL, so reusing one
      // path would silently re-run the FIRST version and every later case would
      // "pass" against source it never loaded.
      const project = scaffold();
      writeFileSync(path.join(project, GATEWAY_FILE), source);
      await expect(
        loadGateway(path.join(project, "instance.md")),
        `source: ${source.slice(0, 40)}`,
      ).rejects.toThrow("ksor-gateway-unloadable");
    }
    expect(IMPORT).toContain("@panaversity/ksor/gateway");
  });
});
