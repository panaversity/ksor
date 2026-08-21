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

Everyone may read this handbook. It covers onboarding for new joiners, the
expense categories the finance team recognises, how to claim travel costs, and
which approvals a purchase needs before it is placed. New joiners should read
the onboarding section in their first week; everyone else can treat it as a
reference and search it when a question comes up rather than reading it end to
end.
`,
  "internal-salaries.md": `---
title: Internal salaries
status: approved
owner: hr@example.test
provenance: comp review 2026
visibility: internal
---

# Internal salaries

Band 4 engineers ${SECRET} receive between 180000 and 240000 depending on
location and the outcome of the annual review. Band 5 adds an equity component
that vests over four years. This document is the compensation reference for
managers preparing offers, and it is restricted to staff: the numbers here are
not published outside the company and must not appear in any external material
or job posting.
`,
  "hr/index.md": `---
title: HR section
status: approved
owner: hr@example.test
provenance: hr charter
visibility: internal
---

# HR section

The section itself is internal, and everything about how the HR team operates
belongs here: who owns which policy, when each is reviewed, and where the
signed originals are kept. It is deliberately marked internal even though some
of the documents beneath it are public, because the section index names
programmes that have not been announced.
`,
  "hr/holiday.md": `---
title: Holiday policy
status: approved
owner: hr@example.test
provenance: handbook v1
visibility: public
---

# Holiday policy

Everyone may read the holiday policy, even though the section it lives in is
internal. Full-time staff accrue twenty-five days a year plus public holidays,
booked through the usual system and approved by a line manager. Carry-over is
capped at five days and must be used in the first quarter. This document is
public on purpose: it is the one people link to from outside the HR section.
`,
  "hr/expenses.md": `---
title: Expense claims
status: approved
owner: hr@example.test
provenance: handbook v1
visibility: public
---

# Expense claims

Claims are submitted through the finance portal within thirty days of the
spend, with a receipt attached for anything over twenty pounds. Approvals
follow the usual line-manager chain, and the finance team reviews anything
booked to a project code. This document sits under the internal HR section and
is itself public, like the holiday policy beside it.
`,
  "hr/grievance.md": `---
title: Grievance procedure
status: approved
owner: hr@example.test
provenance: hr charter
visibility: public
---

# Grievance procedure

Anyone may raise a grievance in writing to their manager or, where that is not
appropriate, directly to the HR team. The first response is due within five
working days and the process is documented at each step so that both sides can
see what was decided and when. This is public deliberately: people need to be
able to read it before they decide whether to use it.
`,
  "undeclared-notes.md": `---
title: Undeclared notes
status: approved
owner: ops@example.test
provenance: notes
---

# Undeclared notes

This document declares no visibility at all, so it takes whatever
default_visibility the record declares. It exists to prove that an undeclared
document is resolved at serving time rather than at ingest, and that both tiers
of this record can see it while default_visibility is public. The body is long
enough to be classified as prose rather than navigation, so search reaches it
like any other document.
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
      const target = path.join(knowledge, name);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, body, "utf8");
    }

    instance = {
      name: TENANT,
      corpusId: TENANT,
      tenantId: TENANT,
      dsnEnv: "KSOR_DB_URL",
      abstain: { vectorFloor: null, keywordFloor: null },
      textSearchConfig: "english",
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

    const hits = await search(door, `${SECRET} salary bands compensation`, 10);
    const slugs = hits.ok ? hits.hits.map((h) => h.slug) : [];
    // The PRECONDITION. "Did not return the restricted document" is satisfied
    // by returning NOTHING, and a fixture whose bodies fall under
    // NAV_MAX_CHARS returns nothing for every query — which is exactly how
    // this assertion first passed while proving nothing (round-8 review of
    // #43 named this class).
    expect(
      slugs.length,
      `search returned no hits at all, so it filtered nothing: ${JSON.stringify(hits).slice(0, 200)}`,
    ).toBeGreaterThan(0);
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

  it("the outline's positions do not leak that a hidden sibling exists", async () => {
    // content_nodes.position is the rank in the WHOLE record, so a public
    // caller used to receive 1, 3, 4 — a gap exactly where the internal
    // document sits, disclosing that something is there and roughly where, to
    // the caller the record refuses to show it to. The same row's child_count
    // was already computed over visible children only, so one response
    // disagreed with itself about whether hidden siblings are disclosed (found
    // live 2026-08-21).
    const publicRows = (await outlineDocuments(doorFor("public"), {})).nodes;
    const internalRows = (await outlineDocuments(doorFor("internal"), {})).nodes;

    expect(
      internalRows.length,
      "precondition: the internal tier must see MORE, or this asserts nothing",
    ).toBeGreaterThan(publicRows.length);

    const dense = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);
    expect(
      publicRows.map((r) => r.position),
      `positions must be dense for the rows returned: ${JSON.stringify(publicRows.map((r) => [r.slug, r.position]))}`,
    ).toEqual(dense(publicRows.length));
    expect(internalRows.map((r) => r.position)).toEqual(dense(internalRows.length));

    // And the ORDER is unchanged — renumbering must not reshuffle anything.
    expect(publicRows.map((r) => r.slug)).toEqual(
      internalRows.map((r) => r.slug).filter((s) => publicRows.some((r) => r.slug === s)),
    );
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

  it("a PUBLIC document under an INTERNAL parent is reachable, not merely citable", async () => {
    // `visibility:` is a property of a DOCUMENT, not of its container: the site
    // stages per file and `AUDIENCE_CASES` is per document. The kernel's three
    // paths disagreed about that. `search` filtered only the chunk's own node,
    // so it returned the public child and told the agent to read that slug —
    // while `read` and `outline` walked the tree gating EVERY ancestor, so the
    // internal parent pruned the child and the suggested remedy failed with
    // "no document with slug". Citable and unreachable at once, and `outline`,
    // the fallback the error names, hid it too (round-9 review of #43).
    const door = doorFor("public");

    const listed = (await outlineDocuments(door, { depth: 5 })).nodes.map((n) => n.slug);
    expect(listed, "the public child is part of the record a public caller may see").toContain(
      "holiday",
    );
    expect(listed, "…and the internal parent is NOT").not.toContain("hr");

    const doc = await readDocument(door, "holiday");
    expect(doc.text, "and reading it returns the real document").toContain("holiday policy");

    const hits = await search(door, "holiday carry-over accrue days", 10);
    const slugs = hits.ok ? hits.hits.map((h) => h.slug) : [];
    expect(
      slugs,
      `search agrees — every path resolves the same document: ${JSON.stringify(hits).slice(0, 260)}`,
    ).toContain("holiday");
  });

  it("paging a DRILL-DOWN never repeats a row at a page boundary", async () => {
    // The existing paging acceptance walks the BROWSE path, where there is no
    // anchor row. A drill-down's depth-0 anchor used to ride inside
    // LIMIT/OFFSET and be stripped afterwards, so it cost a slot on the FIRST
    // page only — and next_offset, computed from the post-strip count, started
    // every later page one row early and repeated the previous page's last row
    // (round-9 review of #43).
    const door = doorFor("internal");
    const whole = await outlineDocuments(door, { node: "hr", depth: 1 });
    const all = whole.nodes.map((n) => n.slug);
    expect(all.length, "the hr section needs children to page through").toBeGreaterThan(0);

    const seen: string[] = [];
    let offset = 0;
    for (let page = 0; page < all.length + 4; page += 1) {
      const body = await outlineDocuments(door, { node: "hr", depth: 1, limit: 1, offset });
      seen.push(...body.nodes.map((n) => n.slug));
      if (!body.has_more) break;
      offset = body.next_offset!;
    }
    expect(seen, "one row per page reconstructs the children exactly once").toEqual(all);
    expect(new Set(seen).size, `a row repeated across pages: ${JSON.stringify(seen)}`).toBe(
      seen.length,
    );
  }, 60_000);

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
