import { describe, expect, it } from "vitest";

import {
  contentTools,
  defineGateway,
  GatewayConfigError,
  resolveGateway,
  TOOL_DEFAULTS,
} from "./gateway-config.js";

// Acceptance for specs/ksor/gateway/spec.md, written red-first.

describe("descriptors are plain data", () => {
  // Load-bearing: the CLI bundles the kernel, so an adopter's file importing
  // @panaversity/ksor/gateway resolves a SECOND copy of this module. Data has
  // no identity, so the two copies cannot disagree — behaviour would.
  it("carries no functions, no schemas, no closures", () => {
    const descriptor = contentTools.search({ name: "search_handbook", k: 5 });
    expect(descriptor).toEqual({ tool: "search", name: "search_handbook", k: 5 });
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
  });

  it("defineGateway returns the config unchanged", () => {
    const config = defineGateway({ tools: [contentTools.read()] });
    expect(config).toEqual({ tools: [{ tool: "read" }] });
  });
});

describe("the default is unchanged by construction", () => {
  // The whole feature must be invisible to a record that does not use it.
  it("no file yields today's three tools, with today's names and titles", () => {
    const resolved = resolveGateway(null);
    expect(resolved.serverName).toBe("ksor");
    expect(resolved.tools.map((t) => t.name)).toEqual(["search", "outline", "read"]);
    expect(resolved.tools.map((t) => t.title)).toEqual([
      "Search the record",
      "Outline the record",
      "Read a document",
    ]);
    for (const tool of resolved.tools) {
      expect(tool.description, `${tool.name} description`).toBe(
        TOOL_DEFAULTS[tool.tool].description,
      );
    }
  });
});

describe("customization", () => {
  it("renames a tool without changing which implementation it is", () => {
    const resolved = resolveGateway(
      defineGateway({ tools: [contentTools.search({ name: "search_handbook" })] }),
    );
    expect(resolved.tools).toHaveLength(1);
    expect(resolved.tools[0]?.name).toBe("search_handbook");
    expect(resolved.tools[0]?.tool).toBe("search");
  });

  it("omits a tool entirely — its definition cost is not paid", () => {
    const resolved = resolveGateway(defineGateway({ tools: [contentTools.search()] }));
    expect(resolved.tools.map((t) => t.name)).toEqual(["search"]);
    // The measured win: outline + read are 6,222 chars of always-resident
    // context an agent that never calls them should not carry.
    const rendered = JSON.stringify(resolved);
    expect(rendered).not.toContain(TOOL_DEFAULTS.outline.description);
    expect(rendered).not.toContain(TOOL_DEFAULTS.read.description);
  });

  it("carries a per-tool k default", () => {
    const resolved = resolveGateway(defineGateway({ tools: [contentTools.search({ k: 3 })] }));
    expect(resolved.tools[0]?.k).toBe(3);
  });

  it("takes a server name", () => {
    const resolved = resolveGateway(
      defineGateway({ serverName: "acme-handbook", tools: [contentTools.search()] }),
    );
    expect(resolved.serverName).toBe("acme-handbook");
  });
});

describe("covers composes ABOVE the floor, never instead of it", () => {
  const COVERS = "Leave policy, benefits, conduct and expenses. Not product questions.";
  const resolved = resolveGateway(
    defineGateway({ tools: [contentTools.search({ covers: COVERS })] }),
  );
  // ?? "" so a missing tool fails the assertions below rather than the indexing.
  const description = resolved.tools[0]?.description ?? "";

  it("puts the record's own prose first, where an agent reads it", () => {
    expect(description.startsWith(COVERS)).toBe(true);
  });

  // The reason this is composition and not replacement. Each of these sentences
  // is a guarantee: delete it and the record silently stops abstaining, or
  // starts obeying instructions written into its own corpus.
  it("keeps the abstention contract", () => {
    expect(description).toContain('reason="abstained"');
    expect(description).toContain("do not fall back on model knowledge");
  });

  it("keeps the gate semantics", () => {
    // Substrings chosen to sit inside one wrapped line: the floor is hard-wrapped
    // prose, so an assertion spanning a break fails on formatting, not meaning.
    expect(description).toContain("CANNOT abstain");
    expect(description).toContain("NOT evidence the record covers");
  });

  it("keeps the prompt-injection defence", () => {
    expect(description).toContain("UNTRUSTED corpus text");
  });

  it("keeps the whole framework floor byte-for-byte", () => {
    expect(description).toContain(TOOL_DEFAULTS.search.description);
  });
});

describe("refusals — each an argument error, before any DSN is resolved", () => {
  const slugOf = (fn: () => unknown): string => {
    try {
      fn();
    } catch (error) {
      if (error instanceof GatewayConfigError) return error.slug;
      return `unexpected: ${String(error)}`;
    }
    return "no error thrown";
  };

  it("refuses a gateway that registers no tools", () => {
    // It would boot, answer tools/list with nothing, and look healthy while
    // serving nobody — a misconfiguration, not a minimal deployment.
    expect(slugOf(() => resolveGateway(defineGateway({ tools: [] })))).toBe(
      "ksor-gateway-no-tools",
    );
  });

  it("refuses two tools sharing a name", () => {
    expect(
      slugOf(() =>
        resolveGateway(
          defineGateway({
            tools: [contentTools.search({ name: "ask" }), contentTools.read({ name: "ask" })],
          }),
        ),
      ),
    ).toBe("ksor-gateway-duplicate-tool");
  });

  it("refuses a name agents cannot call", () => {
    for (const name of ["Search", "search-handbook", "2search", "search handbook", ""]) {
      expect(
        slugOf(() => resolveGateway(defineGateway({ tools: [contentTools.search({ name })] }))),
        `name ${JSON.stringify(name)}`,
      ).toBe("ksor-gateway-bad-tool-name");
    }
  });

  it("refuses a k outside the served range", () => {
    for (const k of [0, -1, 51, 1.5]) {
      expect(
        slugOf(() => resolveGateway(defineGateway({ tools: [contentTools.search({ k })] }))),
        `k ${k}`,
      ).toBe("ksor-gateway-bad-k");
    }
  });

  it("names the offending value, so the message can be acted on", () => {
    try {
      resolveGateway(defineGateway({ tools: [contentTools.search({ name: "Search" })] }));
      expect.unreachable("should have refused");
    } catch (error) {
      expect((error as Error).message).toContain("Search");
    }
  });
});
