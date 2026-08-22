import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import {
  applySchema,
  buildShippedProvider,
  WHOLE_RECORD_SCOPE,
  contentPool,
  embedInput,
  embedIntent,
  runIngest,
  runRead,
  topOneScore,
  vectorLiteral,
  VECTOR_TXN_GUCS,
} from "@panaversity/ksor-content";

const adminDsn = "postgresql://ksor:ksor@127.0.0.1:5432/ksorsec";
const DIM = 8;
const TENANT = "acme-handbook";
const WORK = process.argv[2];

const DOCS = [
  {
    stableId: "policies/compensation",
    slug: "compensation",
    title: "Compensation bands",
    content:
      "Zebra compensation bands are reviewed every fiscal year by the compensation committee and published to all staff.",
  },
  {
    stableId: "onboarding/checklist",
    slug: "onboarding",
    title: "Onboarding checklist",
    content:
      "New engineers complete the onboarding checklist: accounts, laptop setup, security training, and a first pull request.",
  },
];
const IN_Q = "when are zebra compensation bands reviewed";
const OOC_Q = "what does quantum blockchain weather forecasting cost";

const dbName = `ksor_sec_${randomBytes(4).toString("hex")}`;
const admin = new pg.Pool({ connectionString: adminDsn, max: 1 });
await admin.query(`CREATE DATABASE ${dbName}`);
const url = new URL(adminDsn);
url.pathname = `/${dbName}`;
const dbUrl = url.toString();
const pool = contentPool(dbUrl, 4);
await applySchema(pool, DIM);
await pool.query(
  "INSERT INTO ingest_tenant_grants (role_name, tenant_id) VALUES ('sor_content_ingest', $1)",
  [TENANT],
);

const provider = buildShippedProvider("fake", { apiKey: null, dim: DIM });
await runIngest(pool, TENANT, async (c) => {
  await c.query(
    "INSERT INTO corpora (tenant_id, corpus_id, active_generation) VALUES ($1, $1, 1)",
    [TENANT],
  );
  for (const doc of DOCS) {
    const node = await c.query(
      `INSERT INTO content_nodes (tenant_id, generation, stable_id, kind, slug, title)
       VALUES ($1, 1, $2, 'document', $3, $4) RETURNING node_id`,
      [TENANT, doc.stableId, doc.slug, doc.title],
    );
    await c.query(
      `INSERT INTO sources (tenant_id, generation, source_id, node_id, title, origin_path,
                            content_hash, embedding_model, chunk_policy)
       VALUES ($1, 1, $2, $3, $4, $2, 'hash', 'fake-embed-001', 'heading-aware-1500-content-only-v5')`,
      [TENANT, `${doc.slug}:prose`, node.rows[0].node_id, doc.title],
    );
    const [vector] = await embedIntent([embedInput(doc.title, "", doc.content)], {
      provider,
      intent: "document",
    });
    await c.query(
      `INSERT INTO chunks (tenant_id, generation, source_id, ordinal, content, chunk_hash,
                           labels, embedding, embedding_status, embedding_model)
       VALUES ($1, 1, $2, 0, $3, md5($3), '{"source_type": "prose"}', $4, 'embedded', 'fake-embed-001')`,
      [TENANT, `${doc.slug}:prose`, doc.content, vectorLiteral(vector ?? [])],
    );
  }
});

const score = async (q) => {
  const [qv] = await embedIntent([q], { provider, intent: "query" });
  return runRead(
    pool,
    TENANT,
    (c) =>
      topOneScore(
        c,
        { tenantId: TENANT, corpusId: TENANT, kinds: null, pinnedGeneration: null },
        qv ?? [],
      ),
    { ...VECTOR_TXN_GUCS, ...WHOLE_RECORD_SCOPE },
  );
};
const inS = await score(IN_Q),
  oocS = await score(OOC_Q);
const floor = Math.round(((inS + oocS) / 2) * 1000) / 1000;

mkdirSync(WORK, { recursive: true });
writeFileSync(
  `${WORK}/instance.md`,
  `---
format: 1
name: ${TENANT}
database:
  dsn_env: KSOR_TEST_DSN
embedding:
  provider: fake
  model: fake-embed-001
  dim: ${DIM}
retrieval:
  vector_floor: ${floor} # calibrated in-probe
---

# Acme Handbook

Answer ONLY from this record. Abstention is a correct answer.
`,
);
await pool.end();
await admin.end();
console.log(JSON.stringify({ dbUrl, floor, inS, oocS, instance: `${WORK}/instance.md` }));
