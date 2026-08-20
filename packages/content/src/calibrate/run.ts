/**
 * The calibration runner (oracle calibrate.py's DB half): score every
 * in-corpus query and every out-of-corpus probe through the REAL gate
 * signal (the standalone top-1 cosine — deny applied pre-scoring), then
 * hand the distributions to the ported mathematics. Two doors:
 *
 * - SYNTHESIZED (default): passages sampled per node by a deterministic
 *   content-hash spread (NOT ordinal — first-by-ordinal samples only
 *   intros and tunes the floor to generic queries), one short question
 *   each from the text generator.
 * - QUERIES-FILE: human-authored in-corpus queries, one per line; no text
 *   generator is ever constructed — zero-LLM calibration.
 *
 * The tool never edits the authored instance.md — it prints the exact
 * line for a HUMAN to ratify.
 */

import type pg from "pg";

import { runRead } from "../db.js";
// Calibration measures the floor over the WHOLE record, deliberately — the
// threshold is a property of the corpus, not of one caller's tier. Stated,
// because an unbound scope now denies (the seam fails closed).
import { WHOLE_RECORD_SCOPE as CALIBRATION_SCOPE } from "../lib/audience.js";
import { aembedIntent, type EmbeddingProvider, type TextGenerator } from "../lib/embedding.js";
import { topOneScore, VECTOR_TXN_GUCS, type SearchScope } from "../lib/search.js";

import { DENIED_CTE, DENY } from "../lib/takedown.js";
import {
  buildReport,
  BUILT_IN_OOC,
  type CalibrationDoor,
  type CalibrationReport,
  type ScoredQuery,
} from "./math.js";

/** Deterministic content-hash spread; comment carried from the oracle. */
const SAMPLE_SQL = `
WITH RECURSIVE g AS (
    SELECT COALESCE($4::bigint, active_generation) AS gen
    FROM corpora WHERE tenant_id = $1 AND corpus_id = $2
),
${DENIED_CTE},
ranked AS (
    SELECT c.content, n.stable_id,
           row_number() OVER (PARTITION BY n.node_id ORDER BY md5(c.content)) AS rn
    FROM chunks c
    JOIN g ON c.generation = g.gen
    JOIN sources s ON s.source_id = c.source_id AND s.tenant_id = c.tenant_id
                  AND s.generation = c.generation
    JOIN content_nodes n ON n.node_id = s.node_id AND n.tenant_id = s.tenant_id
    WHERE c.tenant_id = $1 AND c.embedding_status = 'embedded'
      AND c.labels->>'source_type' = 'prose'
      AND n.status = 'published'
      AND ${DENY}
      AND length(regexp_replace(c.content, '\\s', '', 'g')) >= $3
)
SELECT content FROM ranked WHERE rn <= $5`;

const COUNT_SQL = `
SELECT count(*) FROM chunks c
JOIN corpora k ON k.tenant_id = c.tenant_id
             AND c.generation = COALESCE($3::bigint, k.active_generation)
WHERE c.tenant_id = $1 AND k.corpus_id = $2 AND c.embedding_status = 'embedded'`;

const QUERY_PROMPT = (passage: string): string =>
  "Write ONE short question (at most 12 words) that a reader would naturally ask, which the " +
  `following passage answers. Reply with the question only.\n\nPASSAGE:\n${passage}`;

/** THE one normalization, shared by every door (oracle normalize_queries). */
export function normalizeQueries(queries: readonly string[]): string[] {
  return queries.filter((q) => q.trim() !== "").map((q) => q.split(/\s+/).join(" ").trim());
}

/** One human-authored query per line; blank lines and #-comments ignored. */
export function parseQueriesFile(text: string): string[] {
  const queries = text.split("\n").filter((line) => {
    const stripped = line.trim();
    return stripped !== "" && !stripped.startsWith("#");
  });
  if (queries.length === 0) {
    throw new Error(
      "queries file is empty — one in-corpus question per line (# comments and blanks ignored)",
    );
  }
  return normalizeQueries(queries);
}

export interface CalibrationOptions {
  readonly tenantId: string;
  readonly corpusId: string;
  readonly provider: EmbeddingProvider;
  readonly generation?: number | null;
  readonly queries?: readonly string[] | null;
  readonly textGenerator?: TextGenerator | null;
  readonly oocProbes?: readonly string[] | null;
  readonly perNode?: number;
  readonly minChars?: number;
  readonly targetPrecision?: number;
}

async function scoreQueries(
  pool: pg.Pool,
  scope: SearchScope,
  provider: EmbeddingProvider,
  queries: readonly string[],
  inCorpus: boolean,
): Promise<ScoredQuery[]> {
  const out: ScoredQuery[] = [];
  for (const query of queries) {
    const [vector] = await aembedIntent([query], { provider, intent: "query" });
    const score = await runRead(
      pool,
      scope.tenantId,
      (client) => topOneScore(client, scope, vector ?? []),
      { ...VECTOR_TXN_GUCS, ...CALIBRATION_SCOPE },
    );
    if (score === null) {
      // The math treats a null score as fatal — surface it with the query.
      throw new Error(
        `query ${JSON.stringify(query)} scored null (no vector candidate at all) — ` +
          "is the corpus ingested and embedded in this space?",
      );
    }
    out.push({ query, in_corpus: inCorpus, score });
  }
  return out;
}

export async function runCalibration(
  pool: pg.Pool,
  options: CalibrationOptions,
): Promise<CalibrationReport> {
  const generation = options.generation ?? null;
  const scope: SearchScope = {
    tenantId: options.tenantId,
    corpusId: options.corpusId,
    kinds: null,
    pinnedGeneration: generation,
  };
  const embedded = await runRead(
    pool,
    options.tenantId,
    async (client) => {
      const r = await client.query(COUNT_SQL, [options.tenantId, options.corpusId, generation]);
      return Number(r.rows[0]?.count ?? 0);
    },
    CALIBRATION_SCOPE,
  );
  if (embedded === 0) {
    throw new Error(
      `no embedded chunks in ${generation === null ? "the served generation" : `generation ${generation}`} — ingest first`,
    );
  }

  let door: CalibrationDoor;
  let inQueries: string[];
  if (options.queries != null) {
    door = "queries-file";
    inQueries = normalizeQueries(options.queries);
  } else {
    door = "synthesized";
    const generator = options.textGenerator;
    if (generator == null) {
      throw new Error(
        "the synthesized door needs a text generator (a provider API key) — " +
          "or calibrate with zero LLM via --queries-file",
      );
    }
    const minChars = options.minChars ?? 200;
    const perNode = options.perNode ?? 2;
    const passages = await runRead(pool, options.tenantId, async (client) => {
      const r = await client.query(SAMPLE_SQL, [
        options.tenantId,
        options.corpusId,
        minChars,
        generation,
        perNode,
      ]);
      return r.rows.map((row: { content: string }) => row.content);
    });
    if (passages.length === 0) {
      throw new Error("no passages sampled although embedded chunks exist — lower --min-chars");
    }
    const synthesized: string[] = [];
    for (const passage of passages) {
      const truncated = [...passage].slice(0, 1500).join(""); // code points, Python [:1500] parity
      const generated = await generator.generate(QUERY_PROMPT(truncated), {
        maxOutputTokens: 64,
      });
      // FIRST line only (oracle parity — review finding 2026-08-19: keeping
      // a multi-line generation whole made an unfocused query, dragged the
      // min() down, and biased the recommended floor WEAKER); empty
      // generations are skipped with a note, never silently.
      const q = (generated.split("\n").find((line) => line.trim() !== "") ?? "").trim();
      if (q === "") {
        console.warn("calibrate: empty generation skipped");
        continue;
      }
      synthesized.push(q);
    }
    inQueries = normalizeQueries(synthesized);
  }

  const ooc = normalizeQueries(options.oocProbes ?? BUILT_IN_OOC);
  const detail = [
    ...(await scoreQueries(pool, scope, options.provider, inQueries, true)),
    ...(await scoreQueries(pool, scope, options.provider, ooc, false)),
  ];
  return buildReport(
    detail,
    {
      generation,
      pinned: generation !== null,
      model: options.provider.modelId,
      dim: options.provider.dim,
      door,
    },
    options.targetPrecision ?? 0.95,
  );
}
