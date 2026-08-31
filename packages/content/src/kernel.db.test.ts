/**
 * The kernel's database acceptance: the verbatim schema applied at a test
 * dimension, seeded through the ingest role (RLS + grant table enforced for
 * real), and read back through the one-statement hybrid search with the
 * HNSW GUCs bound — the same walk production takes. Gated on KSOR_DB_URL
 * (CI: pgvector service container; dev: local Postgres or a throwaway
 * Neon).
 */

import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runIngest, runRead } from "./db.js";
import {
  applySchema,
  assertSchemaCompatible,
  schemaVersion,
  SchemaVersionError,
} from "./schema.js";
import { hybridSearch, keywordSearch, VECTOR_TXN_GUCS, type SearchScope } from "./lib/search.js";
import { vectorAbstains } from "./lib/abstain.js";
import { GATE_PREDICATE_DIGEST } from "./lib/search.js";
import { keyRingFromEnv, mint, validate } from "./lib/snapshot.js";
import { readDocument, search, type ServiceContext } from "./service.js";
import type { ContentInstance } from "./instance.js";
import { WHOLE_RECORD_SCOPE } from "./lib/audience.js";
import { trustGucs } from "./lib/trust.js";
import { findDocument, outline, UnknownSlug, type ReadScope } from "./lib/read.js";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DIM = 8;
const TENANT = "acme";
const CORPUS = "acme-handbook";

const scope: SearchScope = {
  tenantId: TENANT,
  corpusId: CORPUS,
  kinds: null,
  pinnedGeneration: null,
};

const readScope: ReadScope = { tenantId: TENANT, corpusId: CORPUS, pinnedGeneration: null };

/** A hand-normalized unit vector: 1 at `hot`, small elsewhere. */
function unit(hot: number): number[] {
  const v = Array.from({ length: DIM }, (_, i) => (i === hot ? 1 : 0.01));
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

const PAD = " filler content well beyond the twenty-four character servable floor.";
// Distinct enough that finding it in a served body is unambiguous evidence.
const WITHDRAWN_TEXT =
  "Withdrawn zebra bands nobody may cite." + " filler content well beyond the servable floor.";

describe.runIf(adminDsn !== "")("kernel db acceptance", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  let dbName: string;

  beforeAll(async () => {
    dbName = `ksor_t_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
    admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminDsn);
    url.pathname = `/${dbName}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, DIM);
    // The grant table row is the ingest AUTHORIZATION (a CLI flag is not
    // authorization). The policy checks current_user AFTER the SET LOCAL
    // ROLE pin, so the row names the ingest role itself (found live: seeding
    // it with the admin user's name refused every write, 2026-08-19).
    await pool.query(
      "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', $1)",
      [TENANT],
    );

    await runIngest(pool, TENANT, async (c) => {
      await c.query(
        "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $2, 1)",
        [TENANT, CORPUS],
      );
      const node = async (
        stableId: string,
        slug: string,
        status = "published",
      ): Promise<string> => {
        const r = await c.query(
          // `audience` is what the serving predicate overlaps against; these
          // rows are about generations, denial and windowing, so they are
          // public — omitting it would make every one of them invisible to
          // every viewer, which is the profile's intent, not a serving bug.
          `INSERT INTO content_nodes (tenant_id, generation, stable_id, kind, slug, title, status, audience, doc_status)
           VALUES ($1, 1, $2, 'document', $3, $4, $5, ARRAY['public'], 'stable') RETURNING node_id`,
          [TENANT, stableId, slug, slug, status],
        );
        return String(r.rows[0].node_id);
      };
      const source = async (nodeId: string, sourceId: string): Promise<void> => {
        await c.query(
          `INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path,
                                content_hash, embedding_model, chunk_policy)
           VALUES ($1, 1, $2, $3, $2, $2, 'hash', 'fake-embed-001', 'heading-aware-1500-content-only-v5')`,
          [TENANT, sourceId, nodeId],
        );
      };
      const chunk = async (
        sourceId: string,
        ordinal: number,
        content: string,
        embedding: number[] | null,
      ): Promise<void> => {
        await c.query(
          `INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content, chunk_hash,
                               labels, embedding, embedding_status, embedding_model)
           VALUES ($1, 1, $2, $3, $4, md5($4), '{"source_type": "prose"}', $5, $6, 'fake-embed-001')`,
          [
            TENANT,
            sourceId,
            ordinal,
            content,
            embedding === null ? null : `[${embedding.join(",")}]`,
            embedding === null ? "pending" : "embedded",
          ],
        );
      };

      const zebra = await node("doc/zebra", "zebra");
      await source(zebra, "zebra:prose");
      await chunk("zebra:prose", 0, "Zebra compensation bands are reviewed yearly." + PAD, unit(0));

      const yak = await node("doc/yak", "yak");
      await source(yak, "yak:prose");
      await chunk("yak:prose", 0, "Yak onboarding checklist for new engineers." + PAD, unit(3));
      // A pending chunk must never serve, whatever its text matches.
      await chunk("yak:prose", 1, "Yak secret pending chunk about zebra bands." + PAD, null);

      const draft = await node("doc/draft", "draft-doc", "draft");
      await source(draft, "draft:prose");
      await chunk("draft:prose", 0, "Draft zebra policy nobody approved yet." + PAD, unit(0));

      // The §2.5 and §2.3 rows, as SERVED content rather than as rows in a
      // set: each of these is a document whose text a search would otherwise
      // rank first, so the only thing that can keep it out is the arm.
      const govern = async (
        stableId: string,
        slug: string,
        text: string,
        columns: string,
        values: readonly unknown[],
      ): Promise<void> => {
        const r = await c.query(
          `INSERT INTO content_nodes (tenant_id, generation, stable_id, kind, slug, title, status,
               audience, doc_status${columns === "" ? "" : ", " + columns})
           VALUES ($1, 1, $2, 'document', $3, $3, 'published', ARRAY['public'], 'stable'
                   ${values.map((_, i) => `, $${i + 4}`).join("")}) RETURNING node_id`,
          [TENANT, stableId, slug, ...values],
        );
        const id = String(r.rows[0].node_id);
        await source(id, `${slug}:prose`);
        await chunk(`${slug}:prose`, 0, text, unit(0));
      };
      await govern(
        "doc/reviewed",
        "reviewed",
        "Zebra bands, human reviewed." + PAD,
        "trust_tier",
        [2],
      );
      await govern(
        "doc/machine",
        "machine-doc",
        "Zebra bands, machine confirmed." + PAD,
        "trust_tier",
        [1],
      );
      await govern(
        "doc/future",
        "future-doc",
        "Zebra bands from next year." + PAD,
        "effective_from",
        [new Date(Date.now() + 86_400_000).toISOString()],
      );
      await govern(
        "doc/stale",
        "stale-doc",
        "Zebra bands, review date passed." + PAD,
        "stale_after",
        [new Date(Date.now() - 86_400_000).toISOString()],
      );
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (admin !== undefined) {
      if (dbName !== undefined)
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
  }, 60_000);

  it("hybrid search fuses both arms and carries the abstention signal out of the same walk", async () => {
    const { hits, topCosine } = await runRead(
      pool,
      TENANT,
      (c) => hybridSearch(c, scope, unit(0), "zebra compensation bands", 10),
      { ...VECTOR_TXN_GUCS, ...WHOLE_RECORD_SCOPE },
    );
    expect(hits.length, JSON.stringify(hits.map((h) => h.slug))).toBeGreaterThan(0);
    expect(hits[0]?.slug, "vector+keyword agreement must rank zebra first").toBe("zebra");
    expect(topCosine, "top cosine is the vector arm's own top-1").toBeGreaterThan(0.99);
    expect(hits[0]?.generation).toBe(1);
    expect(typeof hits[0]?.score).toBe("number");
    // A calibrated floor between the two arms' separations gates correctly.
    expect(
      vectorAbstains(topCosine, {
        vectorFloor: 0.9,
        keywordFloor: null,
        floorDigest: GATE_PREDICATE_DIGEST,
      }),
    ).toBe(false);
  });

  it("a far query abstains under a calibrated floor — and the draft and pending chunks never surface", async () => {
    const query = unit(6);
    const { hits, topCosine } = await runRead(
      pool,
      TENANT,
      (c) => hybridSearch(c, scope, query, "quantum blockchain weather", 10),
      { ...VECTOR_TXN_GUCS, ...WHOLE_RECORD_SCOPE },
    );
    const slugs = hits.map((h) => h.slug);
    expect(slugs, `draft leaked: ${slugs.join(",")}`).not.toContain("draft-doc");
    for (const hit of hits) {
      expect(hit.content, "pending chunk text must never serve").not.toContain("secret pending");
    }
    expect(
      vectorAbstains(topCosine, {
        vectorFloor: 0.9,
        keywordFloor: null,
        floorDigest: GATE_PREDICATE_DIGEST,
      }),
      `topCosine=${topCosine}`,
    ).toBe(true);
  });

  it("RLS fails closed: an unknown tenant reads zero rows, not an error", async () => {
    const { hits, topCosine } = await runRead(
      pool,
      "globex",
      (c) => hybridSearch(c, { ...scope, tenantId: "globex" }, unit(0), "zebra", 10),
      { ...VECTOR_TXN_GUCS, ...WHOLE_RECORD_SCOPE },
    );
    expect(hits, "another tenant must see nothing").toEqual([]);
    expect(topCosine).toBeNull();
  });

  it("takedown denial beats every generation, pre-fusion", async () => {
    await pool.query(
      "INSERT INTO takedown_denylist (tenant_id, corpus_id, stable_id, reason) VALUES ($1, $2, 'doc/zebra', 'test')",
      [TENANT, CORPUS],
    );
    try {
      const { hits } = await runRead(
        pool,
        TENANT,
        (c) => hybridSearch(c, scope, unit(0), "zebra compensation bands", 10),
        { ...VECTOR_TXN_GUCS, ...WHOLE_RECORD_SCOPE },
      );
      expect(
        hits.map((h) => h.slug),
        "denied node leaked",
      ).not.toContain("zebra");
    } finally {
      await pool.query("DELETE FROM takedown_denylist WHERE tenant_id = $1", [TENANT]);
    }
  });

  it("keyword-only degrade path serves without a vector", async () => {
    const hits = await runRead(
      pool,
      TENANT,
      (c) => keywordSearch(c, scope, "onboarding checklist", 10),
      WHOLE_RECORD_SCOPE,
    );
    expect(hits[0]?.slug, JSON.stringify(hits)).toBe("yak");
  });

  it("the service composes it into the typed envelope: served, abstained, audited", async () => {
    const ring = keyRingFromEnv("k1=test-secret");
    const instance: ContentInstance = {
      name: CORPUS,
      corpusId: CORPUS,
      tenantId: TENANT,
      dsnEnv: "KSOR_DB_URL",
      abstain: { vectorFloor: 0.9, keywordFloor: null, floorDigest: GATE_PREDICATE_DIGEST },
      textSearchConfig: "english",
      maximumResponseCharacters: 120_000,
      instructions: "Answer only from the record.",
      title: CORPUS,
      description: "The kernel test record.",
      toolchain: null,
      embeddingProvider: "fake",
      embeddingModel: "fake-embed-001",
      embeddingDim: DIM,
    };
    const ctx: ServiceContext = {
      pool,
      instance,
      ring,
      instanceDigest: "digest-1",
      embedQuery: async () => unit(0),
    };

    const served = await search(ctx, "zebra compensation bands", 5);
    expect(served.ok, JSON.stringify(served)).toBe(true);
    if (served.ok) {
      expect(served.hits[0]?.slug).toBe("zebra");
      expect(served.hits[0]?.provenance.generation, "citation carries the generation").toBe(1);
      const verdict = validate(ring, served.snapshot.token, {
        corpusId: CORPUS,
        tenantId: TENANT,
        instanceDigest: "digest-1",
        viewer: ["public"],
      });
      expect(verdict, "the snapshot must validate and pin the generation").toEqual({
        generation: 1,
        reason: null,
      });
    }

    const far: ServiceContext = { ...ctx, embedQuery: async () => unit(6) };
    const abstainedResult = await search(far, "quantum blockchain weather", 5);
    expect(abstainedResult.ok).toBe(false);
    if (!abstainedResult.ok) {
      expect(abstainedResult.reason).toBe("abstained");
      expect(abstainedResult.hits).toEqual([]);
      expect("snapshot" in abstainedResult, "snapshot key is UNIFORM on abstention").toBe(true);
    }

    // Embed outage WITH a declared floor: the gate cannot be evaluated, so
    // nothing may be served past it — serving ungated keyword results would
    // answer out-of-corpus questions during the outage (review finding #5,
    // 2026-08-19; ts_rank_cd does not separate in- from out-of-corpus).
    //
    // But WITHHOLDING is not ABSTAINING. "The record does not cover this" and
    // "I could not look" are different answers, and the tool description tells
    // the agent to state the first as fact and not fall back — so reporting an
    // outage as an abstention made the agent assert the record lacks something
    // it contains, for the whole outage (round-6 review of #43).
    const down = async (): Promise<never> => {
      throw new Error("provider down");
    };
    const degraded: ServiceContext = { ...ctx, embedQuery: down };
    const outage = await search(degraded, "onboarding checklist", 5);
    expect(outage.ok, "declared floor + embed outage must fail closed").toBe(false);
    if (!outage.ok) {
      expect(outage.reason, "an outage is not an abstention").toBe("unavailable");
      expect(outage.abstained, "and must not claim the record was checked").toBe(false);
      // Named for what actually happened: this branch runs NO keyword search,
      // so the previous "keyword_only" described a search that never ran.
      expect(outage.degraded_reason).toBe("embed_unavailable");
    }

    // Embed outage with NO declared floor (gate already off): the keyword
    // degrade serves exactly what an uncalibrated corpus always serves.
    const uncalibrated: ServiceContext = {
      ...ctx,
      instance: {
        ...instance,
        abstain: { vectorFloor: null, keywordFloor: null, floorDigest: null },
      },
      embedQuery: down,
    };
    const kwServed = await search(uncalibrated, "onboarding checklist", 5);
    expect(kwServed.ok, "uncalibrated + embed outage serves keyword-only").toBe(true);
    if (kwServed.ok) {
      expect(kwServed.degraded_reason).toBe("embed_unavailable_keyword_only");
      expect(kwServed.hits[0]?.slug).toBe("yak");
    }

    // …and the case that was NOT covered, which is the common one. The test
    // above picks a query the keyword arm can answer, so the degrade serves
    // real hits. Ask the way a person actually asks and that arm returns
    // NOTHING — `websearch_to_tsquery` ANDs its terms, so one word absent from
    // the corpus empties the result (measured 12/12 on natural questions,
    // 2026-08-21). The empty result then reached `keywordAbstains`, which
    // abstains on no rows, and the envelope reported "abstained".
    //
    // So during any provider outage an UNCALIBRATED record — the default state
    // of every fresh scaffold — told every caller it covered nothing, while the
    // tool description instructs the agent to state that as fact and never fall
    // back. The vector arm never ran; an empty result says nothing about
    // coverage. Found live against published 0.0.12 with an invalid key.
    const noKeywordMatch = await search(uncalibrated, "what does the flurbish protocol require", 5);
    expect(
      noKeywordMatch.ok,
      "an outage with nothing to serve must not be a success envelope",
    ).toBe(false);
    if (!noKeywordMatch.ok) {
      expect(
        noKeywordMatch.reason,
        `an outage is not an abstention, calibrated or not: ${JSON.stringify(noKeywordMatch)}`,
      ).toBe("unavailable");
      expect(
        noKeywordMatch.abstained,
        "and must never claim the record was checked and found wanting",
      ).toBe(false);
    }

    // The §7 rows exist for every act above (admin read bypasses RLS).
    const rows = await pool.query(
      "SELECT action, count(*)::int AS n FROM retrieval_log GROUP BY action",
    );
    const byAction = Object.fromEntries(rows.rows.map((r) => [r.action, r.n]));
    expect(byAction["similarity_searched"], JSON.stringify(byAction)).toBeGreaterThanOrEqual(2);
    expect(byAction["search_abstained"], JSON.stringify(byAction)).toBeGreaterThanOrEqual(1);
  });

  // "The generation is the authorization" must hold at READ time, not only at
  // issue time: a token pinned to a WITHDRAWN generation must refresh to active
  // rather than serve content an operator rolled back. A rollback does not
  // repoint rollback_generation at the withdrawn one, so gen 2 below is neither
  // the active nor the rollback pointer while its rows linger — exactly the
  // post-withdrawal state. (Review finding 2026-08-20: proven live, never in CI.)
  it("a snapshot pinned to a withdrawn generation refreshes instead of serving it", async () => {
    await runIngest(pool, TENANT, async (c) => {
      const r = await c.query(
        `INSERT INTO content_nodes (tenant_id, generation, stable_id, kind, slug, title, status, audience, doc_status)
         VALUES ($1, 2, 'doc/zebra', 'document', 'zebra', 'zebra', 'published', ARRAY['public'], 'stable') RETURNING node_id`,
        [TENANT],
      );
      const nodeId = String(r.rows[0].node_id);
      await c.query(
        `INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path,
                              content_hash, embedding_model, chunk_policy)
         VALUES ($1, 2, 'zebra:prose', $2, 'zebra', 'zebra', 'hash2', 'fake-embed-001',
                 'heading-aware-1500-content-only-v5')`,
        [TENANT, nodeId],
      );
      await c.query(
        `INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content, chunk_hash,
                             labels, embedding, embedding_status, embedding_model)
         VALUES ($1, 2, 'zebra:prose', 0, $2, md5($2), '{"source_type": "prose"}', $3, 'embedded',
                 'fake-embed-001')`,
        [TENANT, WITHDRAWN_TEXT, `[${unit(0).join(",")}]`],
      );
    });

    const ring = keyRingFromEnv("k1=test-secret");
    const instance: ContentInstance = {
      name: CORPUS,
      corpusId: CORPUS,
      tenantId: TENANT,
      dsnEnv: "KSOR_DB_URL",
      abstain: { vectorFloor: 0.9, keywordFloor: null, floorDigest: GATE_PREDICATE_DIGEST },
      textSearchConfig: "english",
      maximumResponseCharacters: 120_000,
      instructions: "Answer only from the record.",
      title: CORPUS,
      description: "The kernel test record.",
      toolchain: null,
      embeddingProvider: "fake",
      embeddingModel: "fake-embed-001",
      embeddingDim: DIM,
    };
    const ctx: ServiceContext = {
      pool,
      instance,
      ring,
      instanceDigest: "digest-1",
      embedQuery: async () => unit(0),
    };
    const scope = {
      corpusId: CORPUS,
      tenantId: TENANT,
      instanceDigest: "digest-1",
      viewer: ["public"],
    };

    // The withdrawn pin: a cryptographically VALID token for generation 2.
    const withdrawn = mint(ring, scope, 2);
    expect(
      validate(ring, withdrawn.token, scope),
      "the token itself must still be valid — the refusal is the SERVABILITY check, not the crypto",
    ).toEqual({ generation: 2, reason: null });

    const read = await readDocument(ctx, "zebra", { snapshotToken: withdrawn.token });
    expect(read.snapshot_status, "a withdrawn pin must say why it refreshed").toBe(
      "refreshed (withdrawn)",
    );
    expect(read.provenance.generation, "served from the ACTIVE generation").toBe(1);
    expect(read.text, "withdrawn content must never reach the caller").not.toContain(
      WITHDRAWN_TEXT,
    );

    // Positive control: a pin to the ACTIVE generation is honored, no refresh —
    // so the assertion above cannot pass merely because refresh always fires.
    const active = await readDocument(ctx, "zebra", {
      snapshotToken: mint(ring, scope, 1).token,
    });
    // Honoured pins are STATED, not silent: the field used to be absent on
    // success, so a caller could not tell an honoured pin from a server that
    // ignores the field entirely.
    expect(active.snapshot_status, "an honoured pin says so").toBe("pinned");
    expect(active.provenance.generation).toBe(1);
  });

  it("the trust floor is an ARM predicate: `human-reviewed` is never answered from a machine-confirmed document", async () => {
    const arm = async (floor: number): Promise<string[]> => {
      const { hits } = await runRead(
        pool,
        TENANT,
        (c) => hybridSearch(c, scope, unit(0), "zebra bands", 10),
        { ...VECTOR_TXN_GUCS, ...WHOLE_RECORD_SCOPE, ...trustGucs(floor) },
      );
      return hits.map((h) => h.slug);
    };
    // At the honest default every tier answers, including the unverified ones
    // — `verified` is never required and a record with none is level 0.
    const all = await arm(0);
    expect(all, JSON.stringify(all)).toEqual(expect.arrayContaining(["reviewed", "machine-doc"]));
    // At human-reviewed the machine-confirmed document is not "ranked lower",
    // it is not a candidate: a floor applied after ranking has already let a
    // lower-tier passage decide what the answer was.
    const reviewed = await arm(2);
    expect(reviewed, JSON.stringify(reviewed)).toContain("reviewed");
    expect(reviewed, "a machine-confirmed hit cannot satisfy human-reviewed").not.toContain(
      "machine-doc",
    );
  });

  it("a not-yet-effective and a past-review-date document are absent from search, read and outline", async () => {
    const { hits } = await runRead(
      pool,
      TENANT,
      (c) => hybridSearch(c, scope, unit(0), "zebra bands", 20),
      { ...VECTOR_TXN_GUCS, ...WHOLE_RECORD_SCOPE },
    );
    const slugs = hits.map((h) => h.slug);
    expect(slugs, JSON.stringify(slugs)).not.toContain("future-doc");
    expect(slugs, JSON.stringify(slugs)).not.toContain("stale-doc");

    for (const slug of ["future-doc", "stale-doc", "draft-doc"]) {
      await expect(
        runRead(pool, TENANT, (c) => findDocument(c, readScope, slug), WHOLE_RECORD_SCOPE),
        `read must refuse ${slug}`,
      ).rejects.toBeInstanceOf(UnknownSlug);
    }

    const rows = await runRead(
      pool,
      TENANT,
      async (c) => (await outline(c, readScope, { depth: 3, limit: 100 })).rows,
      WHOLE_RECORD_SCOPE,
    );
    const outlined = rows.map((r) => r.slug);
    expect(outlined, JSON.stringify(outlined)).not.toContain("future-doc");
    expect(outlined, JSON.stringify(outlined)).not.toContain("stale-doc");
    expect(outlined, "the control: an effective, in-window document IS outlined").toContain(
      "reviewed",
    );
  });

  it("ingest without a grant row is refused by the database, not by convention", async () => {
    await expect(
      runIngest(pool, "globex", async (c) => {
        await c.query(
          "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ('globex', 'g', 1)",
        );
      }),
    ).rejects.toThrowError();
  });

  it("assertSchemaCompatible refuses a STALE schema, with a raw (unwrapped) message", async () => {
    // At the applied version it passes.
    await expect(assertSchemaCompatible(pool)).resolves.toBeUndefined();
    // A stale database: an older schema_version. A newer gateway must refuse to
    // boot (SchemaVersionError → exit 3) rather than error per-request on the
    // missing takedown scope column (review 2026-08-19).
    await pool.query("UPDATE schema_meta SET schema_version = '2.0'");
    try {
      const err = await assertSchemaCompatible(pool).catch((e: unknown) => e);
      expect(err, "must refuse the stale schema").toBeInstanceOf(SchemaVersionError);
      expect((err as Error).message).toMatch(/2\.0.*requires >= /s);
      // #4: the message is the remediation itself, NOT wrapped in
      // ContentStoreError's "content store temporarily unavailable (…)".
      expect((err as Error).message).not.toContain("temporarily unavailable");
    } finally {
      await pool.query(`UPDATE schema_meta SET schema_version = '${schemaVersion()}'`);
    }
  });

  it("assertSchemaCompatible refuses an UNAPPLIED schema — the common uninitialized-DB case", async () => {
    // A reachable database with no schema at all (schema_meta absent → 42P01)
    // must REFUSE, not fall through to the caller's "unreachable" warning and
    // then error per-request (review 2026-08-19).
    const emptyName = `ksor_empty_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
    await admin.query(`CREATE DATABASE ${emptyName}`);
    const emptyUrl = new URL(adminDsn);
    emptyUrl.pathname = `/${emptyName}`;
    const emptyPool = contentPool(emptyUrl.toString(), 1);
    try {
      const err = await assertSchemaCompatible(emptyPool).catch((e: unknown) => e);
      expect(err, "unapplied schema must refuse").toBeInstanceOf(SchemaVersionError);
      expect((err as Error).message).toMatch(/never applied/);
    } finally {
      await emptyPool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${emptyName} WITH (FORCE)`).catch(() => undefined);
    }
  });
});

describe.runIf(adminDsn === "")("kernel db acceptance (gated)", () => {
  it("skipped — set KSOR_DB_URL to run against Postgres + pgvector", () => {
    expect(adminDsn).toBe("");
  });
});
