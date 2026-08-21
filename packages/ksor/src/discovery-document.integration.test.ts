/**
 * `/.well-known/mcp/server.json` must satisfy the published MCP schema.
 *
 * AGENTS.md critical rule 3 names this surface as one that must not break,
 * because agents finding a KSoR is how a KSoR gets used — and a document a
 * validating registry rejects IS broken. The emitted one was rejected on four
 * counts at once: `version` absent though required, `name` a bare record name
 * where the schema requires `<namespace>/<identifier>`, no `$schema`, and a
 * `capabilities` field that does not exist in the schema at all (round-6
 * review of #43, which built the scaffold and validated the output).
 *
 * The constraints are asserted against the route's SOURCE and against the
 * shape it produces, rather than by fetching the schema at test time: a test
 * that needs the network is a test that fails offline, and the schema URL is
 * pinned in the route itself so a drift is a deliberate edit.
 *
 * Checked against https://static.modelcontextprotocol.io/schemas/2025-12-11/
 * server.schema.json on 2026-08-21: definitions.ServerDetail requires
 * ["name", "description", "version"], name matches
 * ^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$, and the property set is
 * {$schema, _meta, description, icons, name, packages, remotes, repository,
 *  title, version, websiteUrl}.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROUTE = readFileSync(
  path.resolve(
    here,
    "..",
    "templates",
    "scaffold",
    "system",
    "site",
    "app",
    ".well-known",
    "mcp",
    "server.json",
    "route.ts",
  ),
  "utf8",
);

/** Every property the 2025-12-11 ServerDetail admits. */
const ALLOWED = new Set([
  "$schema",
  "_meta",
  "description",
  "icons",
  "name",
  "packages",
  "remotes",
  "repository",
  "title",
  "version",
  "websiteUrl",
]);

const NAME_PATTERN = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;

describe("the MCP discovery document", () => {
  it("emits the three REQUIRED fields", () => {
    for (const field of ["name", "description", "version"]) {
      expect(ROUTE, `${field} is required by the schema`).toMatch(new RegExp(`\\b${field}:`));
    }
  });

  it("declares the schema it claims to satisfy", () => {
    expect(ROUTE).toContain("static.modelcontextprotocol.io/schemas/");
    expect(ROUTE).toMatch(/\$schema: SCHEMA/);
  });

  it("emits NO field the schema does not define", () => {
    // The object literal's own keys, not those of nested structures.
    const body = ROUTE.slice(ROUTE.indexOf("Response.json("));
    const keys = [...body.matchAll(/^\s{6}([$A-Za-z_][\w$]*):/gm)].map((m) => m[1]!);
    const unknown = keys.filter((k) => !ALLOWED.has(k));
    expect(unknown, `not in the 2025-12-11 ServerDetail: ${unknown.join(", ")}`).toEqual([]);
  });

  it("never emits `capabilities` — invented, and the reason the document was rejected", () => {
    expect(ROUTE).not.toContain("capabilities:");
  });

  it("builds the name as namespace/identifier, which the pattern requires", () => {
    expect(ROUTE, "a bare record name has no slash and is rejected").toContain(
      "${mcpNamespace()}/${appName}",
    );
  });
});

/**
 * The namespace builder's own rules, in the frame the schema cares about: what
 * it produces has to satisfy the pattern for every input an adopter can give.
 */
describe("the namespace derived from a record's published URL", () => {
  const namespaceOf = (endpoint: string | null): string => {
    if (endpoint === null) return "local";
    try {
      const host = new URL(endpoint).hostname;
      const labels = host.split(".").filter((l) => l !== "");
      if (labels.length < 2 || /^\d+$/.test(labels[labels.length - 1] ?? "")) return "local";
      return labels.reverse().join(".");
    } catch {
      return "local";
    }
  };

  it.each([
    ["https://records.acme-corp.example.com/mcp", "com.example.acme-corp.records"],
    ["https://mcp.example.org/mcp", "org.example.mcp"],
    // No URL declared, a bare host, or an IP literal: nothing to reverse.
    [null, "local"],
    ["https://localhost:8787/mcp", "local"],
    ["https://127.0.0.1:8787/mcp", "local"],
    ["not a url", "local"],
  ])("%s -> %s", (endpoint, expected) => {
    expect(namespaceOf(endpoint as string | null)).toBe(expected);
  });

  it("every namespace produces a name the schema pattern accepts", () => {
    for (const endpoint of [
      "https://records.acme-corp.example.com/mcp",
      "https://mcp.example.org/mcp",
      null,
      "https://localhost:8787/mcp",
    ]) {
      const name = `${namespaceOf(endpoint as string | null)}/acme-handbook`;
      expect(NAME_PATTERN.test(name), name).toBe(true);
    }
  });
});
