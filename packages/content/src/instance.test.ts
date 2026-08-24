import { describe, expect, it } from "vitest";

import { InstanceParseError, NoDatabaseDeclared, parseInstanceText } from "./instance.js";

const base = `---
format: 2
name: acme-handbook
title: Acme Handbook
description: The governed handbook of Acme.
toolchain:
  requires: ">=0.0.3"
  scaffolded: "0.0.3"
database:
  dsn_env: KSOR_DB_URL
---

# Acme Handbook

Answer only from the record.
`;

describe("parseInstanceText", () => {
  it("parses the minimal served instance with eval-locked defaults", () => {
    const instance = parseInstanceText(base);
    expect(instance.name).toBe("acme-handbook");
    expect(instance.corpusId).toBe("acme-handbook");
    expect(instance.tenantId, "tenant defaults to the name (single-tenant install)").toBe(
      "acme-handbook",
    );
    expect(instance.title).toBe("Acme Handbook");
    expect(instance.description).toBe("The governed handbook of Acme.");
    expect(instance.toolchain).toEqual({ requires: ">=0.0.3", scaffolded: "0.0.3" });
    expect(instance.dsnEnv).toBe("KSOR_DB_URL");
    expect(instance.embeddingProvider).toBe("gemini");
    expect(instance.embeddingModel).toBe("gemini-embedding-001");
    expect(instance.embeddingDim).toBe(1536);
    expect(instance.abstain).toEqual({ vectorFloor: null, keywordFloor: null });
    expect(instance.maximumResponseCharacters).toBe(120_000);
    expect(instance.instructions.startsWith("# Acme Handbook")).toBe(true);
    expect(instance.instructions, "the WHOLE body is the instructions").toContain(
      "Answer only from the record.",
    );
  });

  it("reads floors, budgets, and tenant overrides — real YAML, so numbers are numbers", () => {
    const text = base.replace(
      "---\n\n",
      `retrieval:
  vector_floor: 0.634 # calibrated on generation 3
  keyword_floor: null
budgets:
  maximum_response_characters: 90000
---

`,
    );
    const instance = parseInstanceText(text);
    expect(instance.abstain.vectorFloor).toBe(0.634);
    expect(instance.abstain.keywordFloor).toBeNull();
    expect(instance.maximumResponseCharacters).toBe(90_000);
    expect(
      parseInstanceText(
        base.replace("---\n\n", "retrieval:\n  vector_floor: uncalibrated\n---\n\n"),
      ).abstain.vectorFloor,
    ).toBe("uncalibrated");
  });

  it("refuses a missing database block with the remedy, as the level-0 shape it is", () => {
    const text = base.replace("database:\n  dsn_env: KSOR_DB_URL\n", "");
    expect(() => parseInstanceText(text)).toThrowError(NoDatabaseDeclared);
    expect(() => parseInstanceText(text)).toThrowError(/database.*dsn_env/s);
  });

  it("REFUSES an unknown TOP-LEVEL key — a misspelled retrieval: must never silently disable the gate", () => {
    expect(() =>
      parseInstanceText(
        base
          .replace("mcp_url:", "mcp_url:")
          .replace("version:", "version:")
          .replace("database:", "retreival: 0.6\ndatabase:"),
      ),
    ).toThrowError(/unknown top-level key: retreival/);
    expect(() =>
      parseInstanceText(base.replace("database:", "vector_floor: 0.664\ndatabase:")),
    ).toThrowError(/unknown top-level key: vector_floor/);
  });

  it("tolerates the site and discovery keys the kernel does not consume", () => {
    const withSite = base.replace(
      "database:",
      `site:
  title: Acme
mcp_url: https://records.example.com/mcp
version: 0.1.0
database:`,
    );
    expect(() => parseInstanceText(withSite)).not.toThrow();
  });

  it("REFUSES the keys that left the instance — audiences, default_visibility, ksor — with the hint to move them", () => {
    for (const moved of [
      "audiences: [public, internal]",
      "default_visibility: public",
      "ksor:\n  requires: x",
    ]) {
      expect(
        () => parseInstanceText(base.replace("database:", `${moved}\ndatabase:`)),
        moved,
      ).toThrowError(/ksor-instance-format.*no longer live on the instance/);
    }
  });

  it("refuses an unknown key inside a kernel group (closed set)", () => {
    const text = base.replace("dsn_env: KSOR_DB_URL", "dsn_env: KSOR_DB_URL\n  dsn: postgres://x");
    expect(() => parseInstanceText(text)).toThrowError(InstanceParseError);
  });

  it("refuses a literal DSN shape where an env NAME belongs", () => {
    const text = base.replace("KSOR_DB_URL", "postgres://user:pw@host/db");
    expect(() => parseInstanceText(text)).toThrowError(/environment variable NAME/);
  });

  it("refuses an out-of-range embedding dim at parse, not at CREATE INDEX", () => {
    const text = base.replace("---\n\n", "embedding:\n  dim: 4096\n---\n\n");
    expect(() => parseInstanceText(text)).toThrowError(/embedding\.dim/);
  });

  it("a fake provider forces the fake model id, so a fake instance cannot wedge", () => {
    const text = base.replace("---\n\n", "embedding:\n  provider: fake\n---\n\n");
    expect(parseInstanceText(text).embeddingModel).toBe("fake-embed-001");
    expect(parseInstanceText(text).embeddingProvider).toBe("fake");
  });

  it("refuses format 1 (the pre-profile instance) and a bad name", () => {
    expect(() => parseInstanceText(base.replace("format: 2", "format: 1"))).toThrowError(
      /ksor-instance-format.*format: 1/,
    );
    expect(() => parseInstanceText(base.replace("acme-handbook", "Acme Handbook"))).toThrowError(
      /identity/,
    );
  });

  it("tolerates comments, blank lines, CRLF and a BOM — one YAML reader", () => {
    const text =
      "﻿" +
      base
        .replaceAll("\n", "\r\n")
        .replace("dsn_env: KSOR_DB_URL", "dsn_env: KSOR_DB_URL # the DSN's env NAME");
    expect(parseInstanceText(text).dsnEnv).toBe("KSOR_DB_URL");
  });

  it("refuses duplicate keys and an unclosed fence", () => {
    expect(() => parseInstanceText(base.replace("format: 2", "format: 2\nformat: 2"))).toThrowError(
      /ksor-frontmatter-invalid/,
    );
    expect(() => parseInstanceText("---\nformat: 2\n")).toThrowError(/ksor-frontmatter-invalid/);
  });
});
