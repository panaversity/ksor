import { describe, expect, it } from "vitest";

import { InstanceParseError, parseFrontmatter, parseInstanceText } from "./instance.js";

const base = `---
format: 1
name: acme-handbook
ksor: 0.0.3
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
    expect(instance.dsnEnv).toBe("KSOR_DB_URL");
    expect(instance.embeddingProvider).toBe("gemini");
    expect(instance.embeddingModel).toBe("gemini-embedding-001");
    expect(instance.embeddingDim).toBe(1536);
    expect(instance.abstain).toEqual({ vectorFloor: null, keywordFloor: null });
    expect(instance.maximumResponseCharacters).toBe(120_000);
    expect(instance.instructions.startsWith("# Acme Handbook")).toBe(true);
  });

  it("reads floors, budgets, and tenant overrides", () => {
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
  });

  it("refuses a missing database block with the remedy", () => {
    const text = base.replace("database:\n  dsn_env: KSOR_DB_URL\n", "");
    expect(() => parseInstanceText(text)).toThrowError(/database.*dsn_env/s);
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

  it("refuses format 2 and a bad name", () => {
    expect(() => parseInstanceText(base.replace("format: 1", "format: 2"))).toThrowError(
      /format.*unsupported/,
    );
    expect(() => parseInstanceText(base.replace("acme-handbook", "Acme Handbook"))).toThrowError(
      /legal identity/,
    );
  });
});

describe("parseFrontmatter (the checker's grammar)", () => {
  it("tolerates comments, blank lines, CRLF and a ---- close", () => {
    const fm = parseFrontmatter(
      "---\r\nformat: 1 # one\r\n\r\ndatabase:\r\n  dsn_env: KSOR_DB_URL\r\n----\r\nbody",
    );
    expect(fm.scalars.get("format")).toBe("1");
    expect(fm.maps.get("database")?.get("dsn_env")).toBe("KSOR_DB_URL");
  });

  it("refuses duplicates and unreadable lines", () => {
    expect(() => parseFrontmatter("---\nformat: 1\nformat: 2\n---\n")).toThrowError(/duplicate/);
    expect(() => parseFrontmatter("---\nformat 1\n---\n")).toThrowError(/unreadable/);
  });
});
