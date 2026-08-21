/**
 * The WHOLE chain, on real markdown through real Postgres:
 *
 *     knowledge/*.md  →  content_nodes.visibility  →  the serving predicate  →  the response
 *
 * Every link had a test and the chain had none. Proved by mutation (round-8
 * review of #43), each of these passing the full suite — 591 unit, 123 db, 133
 * integration:
 *
 *   `audienceScope` replaced with the whole-record sentinel, so the door hands
 *   itself every tier on every serving path — the exact fail-open decision 15
 *   exists to end. GREEN.
 *
 *   `n.governance.visibility` replaced with `null` in the ingest INSERT, so
 *   governance never reaches the node row — the ORIGINAL decision-15 bug, where
 *   ingest dropped the key and the door had nothing to filter on. GREEN.
 *
 * Both passed because every test guarded a PIECE: the SQL predicate against
 * hand-INSERTed rows, the frontmatter reader against strings, the decision table
 * against `decideVisible`, and the binding against the source TEXT of
 * service.ts. Nothing carried a real document from disk to a served answer.
 *
 * So this is deliberately end-to-end and deliberately unmocked: it ingests
 * files, then asks the SERVICE — the same functions the MCP door calls — and
 * asserts what a caller at each tier can and cannot see. Both mutations were
 * re-run against it and both are caught.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runRead } from "./db.js";
import { grantIngest } from "./grant.js";
import { buildGeneration } from "./ingest/build.js";
import { buildShippedProvider } from "./lib/providers/registry.js";
import { embedQueryVlit } from "./lib/query-embed.js";
import { UnknownSlug } from "./lib/read.js";
import { keyRingFromEnv } from "./lib/snapshot.js";
import { applySchema } from "./schema.js";
import { outlineDocuments, readDocument, search } from "./service.js";
import type { ContentInstance } from "./instance.js";
import type { ServiceContext } from "./service.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = "ksor_governance_chain";
const TENANT = "chain-corp";

/** One shared, unmistakable word, so a leak is visible in any surface's output. */
const SECRET = "ZEBRAQUARTZ";

const DOCS: Record<string, string> = {
  "public-handbook.md": `---
title: Public handbook
status: approved
owner: ops@example.test
provenance: handbook v1
visibility: public
---

# Public handbook

Everyone may read about onboarding and expenses.
`,
  "internal-salaries.md": `---
title: Internal salaries
status: approved
owner: hr@example.test
provenance: comp review 2026
visibility: internal
---

# Internal salaries

Band 4 engineers ${SECRET} receive between 180000 and 240000.
`,
  "undeclared-notes.md": `---
title: Undeclared notes
status: approved
owner: ops@example.test
provenance: notes
---

# Undeclared notes

This document declares no visibility, so it takes default_visibility.
`,
};

describe.runIf(adminDsn !== "")("the governance chain, markdown to answer (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;
  let work: string;
  let instance: ContentInstance;

  /** A door serving exactly one tier — the shape `compose.ts` builds. */
  const doorFor = (audience: string | null): ServiceContext => ({
    pool,
    instance,
    ring: keyRingFromEnv(undefined),
    instanceDigest: createHash("sha256").update("chain").digest("hex"),
    embedQuery: (query: string) =>
      embedQueryVlit(query, { provider: buildShippedProvider("fake", { apiKey: null }) }),
    audience,
  });

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, 1536);
    await grantIngest(pool, TENANT);

    work = mkdtempSync(path.join(tmpdir(), "ksor-chain-"));
    const knowledge = path.join(work, "knowledge");
    mkdirSync(knowledge, { recursive: true });
    for (const [name, body] of Object.entries(DOCS)) {
      writeFileSync(path.join(knowledge, name), body, "utf8");
    }

    instance = {
      name: TENANT,
      corpusId: TENANT,
      tenantId: TENANT,
      dsnEnv: "KSOR_DB_URL",
      abstain: { vectorFloor: null, keywordFloor: null },
      maximumResponseCharacters: 120_000,
      instructions: "",
      audiences: ["public", "internal"],
      defaultVisibility: "public",
      embeddingProvider: "fake",
      embeddingModel: "fake-embed-001",
      embeddingDim: 1536,
    } as ContentInstance;

    await buildGeneration(pool, instance, {
      provider: buildShippedProvider("fake", { apiKey: null }),
      knowledgeDir: knowledge,
      flip: true,
      sourceCommit: "chain",
    });
  }, 300_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
    if (work !== undefined) rmSync(work, { recursive: true, force: true });
  });

  it("LINK 1 — ingest carries each document's declared visibility onto the node row", async () => {
    // The original decision-15 bug: ingest kept four frontmatter keys and
    // dropped the rest, so `visibility` existed only in markdown.
    const rows = await runRead(pool, TENANT, async (client) =>
      (
        await client.query(
          "SELECT slug, visibility FROM content_nodes WHERE tenant_id = $1 AND generation = " +
            "(SELECT active_generation FROM corpora WHERE tenant_id = $1) ORDER BY slug",
          [TENANT],
        )
      ).rows.map((r: { slug: string; visibility: string | null }) => [r.slug, r.visibility]),
    );
    const byslug = Object.fromEntries(rows) as Record<string, string | null>;
    expect(byslug["public-handbook"], "declared public").toBe("public");
    expect(byslug["internal-salaries"], "declared internal — the value that must survive").toBe(
      "internal",
    );
    expect(byslug["undeclared-notes"], "declares none: NULL, resolved at serving time").toBeNull();
  });

  it("LINK 2 — a PUBLIC door cannot search, read or outline the internal document", async () => {
    const door = doorFor("public");

    const hits = await search(door, `${SECRET} salary bands`, 10);
    const slugs = hits.ok ? hits.hits.map((h) => h.slug) : [];
    expect(slugs, "search must not return it").not.toContain("internal-salaries");
    const serialized = JSON.stringify(hits);
    expect(
      serialized.includes(SECRET),
      `the restricted body reached a public caller: ${serialized.slice(0, 300)}`,
    ).toBe(false);

    await expect(
      readDocument(door, "internal-salaries"),
      "read must be a not-found, indistinguishable from a document that does not exist",
    ).rejects.toBeInstanceOf(UnknownSlug);

    const listed = (await outlineDocuments(door, {})).nodes.map((n) => n.slug);
    expect(listed, "outline must not even name it").not.toContain("internal-salaries");
    expect(listed, "…while the public document IS listed").toContain("public-handbook");
  });

  it("LINK 3 — an INTERNAL door sees it, so the filter is a tier and not a mute button", async () => {
    const door = doorFor("internal");

    const read = await readDocument(door, "internal-salaries");
    expect(read.text, "the internal tier reads the real body").toContain(SECRET);

    const listed = (await outlineDocuments(door, {})).nodes.map((n) => n.slug);
    expect(listed).toContain("internal-salaries");
    expect(listed, "and still everything less restricted").toContain("public-handbook");
  });

  it("an UNIDENTIFIED caller gets the least-privileged tier, not the whole record", async () => {
    // A door that cannot establish who is asking must not hand out the
    // restricted half — before schema 2.2 it handed out ALL of it.
    const listed = (await outlineDocuments(doorFor(null), {})).nodes.map((n) => n.slug);
    expect(listed).not.toContain("internal-salaries");
    expect(listed).toContain("public-handbook");
  });

  it("an UNDECLARED document follows default_visibility on every surface", async () => {
    for (const tier of ["public", "internal"]) {
      const listed = (await outlineDocuments(doorFor(tier), {})).nodes.map((n) => n.slug);
      expect(listed, `default_visibility is public, so ${tier} sees it`).toContain(
        "undeclared-notes",
      );
    }
  });

  it("the tiers DIFFER — an assertion satisfied by both would prove nothing", async () => {
    // The control the mutation exposed: with the door handing itself the whole
    // record, public and internal return the same set.
    const publicSlugs = (await outlineDocuments(doorFor("public"), {})).nodes.map((n) => n.slug);
    const internalSlugs = (await outlineDocuments(doorFor("internal"), {})).nodes.map(
      (n) => n.slug,
    );
    expect(
      internalSlugs.length,
      `public saw ${JSON.stringify(publicSlugs)} and internal saw ${JSON.stringify(internalSlugs)} — ` +
        "if these match, the door is not narrowing at all",
    ).toBeGreaterThan(publicSlugs.length);
  });
});

describe.runIf(adminDsn === "")("the governance chain (db) — gated", () => {
  it("skips without KSOR_DB_URL", () => {
    expect(adminDsn).toBe("");
  });
});
