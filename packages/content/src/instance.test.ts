import { describe, expect, it } from "vitest";

import {
  EMBED_DIM_MAX,
  InstanceParseError,
  NoDatabaseDeclared,
  parseInstanceText,
} from "./instance.js";
import { EMBED_DIM_MAX as SCHEMA_EMBED_DIM_MAX } from "./schema.js";

/** The slug a refusal CARRIES — it is no longer spelled inside the message (see below). */
function refusalOf(fn: () => unknown): InstanceParseError {
  try {
    fn();
  } catch (exc) {
    if (exc instanceof InstanceParseError) return exc;
    throw exc;
  }
  throw new Error("the instance was accepted");
}

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
    expect(instance.abstain).toEqual({ vectorFloor: null, keywordFloor: null, floorDigest: null });
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

  it("states the record's refusal ONCE — a why repeated as a second line is not two facts", () => {
    // `ksor serve`, `ingest`, `schema`, `calibrate`, `gc` and `grant` all print
    // this Error's message, and it carried the same sentence twice: once inline
    // on the `error:` line and again under `why:` (first-hour walkthrough,
    // 2026-08-26). A reader who has to check whether the second line says
    // something new is being charged for a line that never does.
    let message = "";
    try {
      parseInstanceText(base.replace("database:", "vector_floor: 0.664\ndatabase:"));
    } catch (exc) {
      message = (exc as Error).message;
    }
    const why = "unknown top-level key";
    const occurrences = message.split(why).length - 1;
    expect(occurrences, `the message repeats itself:\n${message}`).toBe(1);
    // …and the message is the why then the fix, with the machine-readable slug
    // carried BESIDE it rather than inside it — the CLI prints `error: <slug>`
    // as its own first stderr line, which is the contract docs/index.md states.
    expect(message.split("\n")[0]).toMatch(/^instance\.md declares an unknown top-level key/);
    expect(message).toMatch(/\n {2}fix: /);
  });

  it("carries the record's own slug, so every verb can print `error: <slug>` first", () => {
    // `ksor build` prints `error: ksor-instance-format`; `ksor schema` printed
    // no slug at all for the identical file (first-hour walkthrough, 2026-08-26).
    // The refusal that reaches the kernel has to CARRY the name so both can.
    expect(
      refusalOf(() =>
        parseInstanceText(base.replace("database:", "vector_floor: 0.664\ndatabase:")),
      ).slug,
    ).toBe("ksor-instance-format");
  });

  it("carries the site and discovery keys the kernel does not consume", () => {
    // `site.url` and `site.governance` are the site's, not the kernel's — it
    // passes them through. What it no longer does is tolerate a key nobody
    // reads: one reader validates the instance now (decision 26), so a
    // `site.title` left behind by the move of `title` to the top level is
    // refused rather than silently ignored.
    const withSite = base.replace(
      "database:",
      `site:
  url: https://records.example.com
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
      const refusal = refusalOf(() =>
        parseInstanceText(base.replace("database:", `${moved}\ndatabase:`)),
      );
      expect(refusal.slug, moved).toBe("ksor-instance-format");
      expect(refusal.message, moved).toMatch(/no longer live on the instance/);
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
    const one = refusalOf(() => parseInstanceText(base.replace("format: 2", "format: 1")));
    expect(one.slug).toBe("ksor-instance-format");
    expect(one.message).toMatch(/format: 1/);
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
    expect(
      refusalOf(() => parseInstanceText(base.replace("format: 2", "format: 2\nformat: 2"))).slug,
    ).toBe("ksor-frontmatter-invalid");
    expect(refusalOf(() => parseInstanceText("---\nformat: 2\n")).slug).toBe(
      "ksor-frontmatter-invalid",
    );
  });
});

/**
 * The dimension ceiling is declared twice — here and in `schema.ts` — and the
 * comment beside this one says it "mirrors" the other. This is what makes that
 * true.
 *
 * The split is deliberate: the parser refuses a bad `dim:` when `instance.md`
 * is READ, so an adopter hears about it before any DDL is rendered. Two
 * constants that must agree with nothing between them is how decision 18's
 * failure mode starts. Raising the ceiling is priced by decision 30 and not
 * forbidden — so this asserts EQUALITY, never the number, and both may move
 * together.
 *
 * It is load-bearing in one direction. A `schema.ts`-only edit already reddens
 * the `/1\.\.2000/` assertion in `schema.integration.test.ts`; an
 * `instance.ts`-only edit reddens nothing else.
 */
describe("the embedding dimension ceiling", () => {
  it("is the same number in the instance parser and in the DDL renderer", () => {
    expect(
      EMBED_DIM_MAX,
      `instance.ts declares ${EMBED_DIM_MAX}, schema.ts declares ${SCHEMA_EMBED_DIM_MAX} — ` +
        "the parser and the DDL renderer would refuse at different dims",
    ).toBe(SCHEMA_EMBED_DIM_MAX);
  });
});
