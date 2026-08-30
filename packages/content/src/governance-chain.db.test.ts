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

import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentPool, runRead } from "./db.js";
import { grantIngest } from "./grant.js";
import { buildGeneration } from "./ingest/build.js";
import {
  instanceOf,
  profileDoc,
  writeIndexesAndLock,
  writeRecord,
} from "./ingest/fixtures/record-fixture.js";
import { buildShippedProvider } from "./lib/providers/registry.js";
import { embedQueryVlit } from "./lib/query-embed.js";
import { UnknownSlug } from "./lib/read.js";
import { mint } from "./lib/snapshot.js";
import { keyRingFromEnv } from "./lib/snapshot.js";
import { applySchema } from "./schema.js";
import { outlineDocuments, readDocument, search } from "./service.js";
import type { ContentInstance } from "./instance.js";
import type { ServiceContext } from "./service.js";
import type pg from "pg";

const adminDsn = process.env["KSOR_DB_URL"] ?? "";
const DB = `ksor_governance_chain_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
const TENANT = "chain-corp";

/** One shared, unmistakable word, so a leak is visible in any surface's output. */
const SECRET = "ZEBRAQUARTZ";

const DOCS: Record<string, string> = {
  "public-handbook.md": profileDoc({
    title: "Public handbook",
    audience: ["public"],
    body: `
# Public handbook

Everyone may read this handbook. It covers onboarding for new joiners, the
expense categories the finance team recognises, how to claim travel costs, and
which approvals a purchase needs before it is placed. New joiners should read
the onboarding section in their first week; everyone else can treat it as a
reference and search it when a question comes up rather than reading it end to
end.
`,
  }),
  "internal-salaries.md": profileDoc({
    title: "Internal salaries",
    audience: ["internal"],
    body: `
# Internal salaries

Band 4 engineers ${SECRET} receive between 180000 and 240000 depending on
location and the outcome of the annual review. Band 5 adds an equity component
that vests over four years. This document is the compensation reference for
managers preparing offers, and it is restricted to staff: the numbers here are
not published outside the company and must not appear in any external material
or job posting.
`,
  }),
  "hr/overview.md": profileDoc({
    title: "HR section",
    audience: ["internal"],
    body: `
# HR section

This overview is internal, and everything about how the HR team operates
belongs here: who owns which policy, when each is reviewed, and where the
signed originals are kept. It is deliberately marked internal even though some
of the documents beside it are public, because it names programmes that have
not been announced. The SECTION it lives in is a shell with no governance of
its own, admitted to a viewer iff one of its descendants is.
`,
  }),
  "hr/holiday.md": profileDoc({
    title: "Holiday policy",
    audience: ["public"],
    body: `
# Holiday policy

Everyone may read the holiday policy, even though the section it lives in is
internal. Full-time staff accrue twenty-five days a year plus public holidays,
booked through the usual system and approved by a line manager. Carry-over is
capped at five days and must be used in the first quarter. This document is
public on purpose: it is the one people link to from outside the HR section.
`,
  }),
  "hr/expenses.md": profileDoc({
    title: "Expense claims",
    audience: ["public"],
    body: `
# Expense claims

Claims are submitted through the finance portal within thirty days of the
spend, with a receipt attached for anything over twenty pounds. Approvals
follow the usual line-manager chain, and the finance team reviews anything
booked to a project code. This document sits under the internal HR section and
is itself public, like the holiday policy beside it.
`,
  }),
  "hr/grievance.md": profileDoc({
    title: "Grievance procedure",
    audience: ["public"],
    body: `
# Grievance procedure

Anyone may raise a grievance in writing to their manager or, where that is not
appropriate, directly to the HR team. The first response is due within five
working days and the process is documented at each step so that both sides can
see what was decided and when. This is public deliberately: people need to be
able to read it before they decide whether to use it.
`,
  }),
  "shared-notes.md": profileDoc({
    title: "Shared notes",
    audience: ["public", "internal"],
    body: `
# Shared notes

This document names BOTH audiences, so a public viewer and an internal viewer
each hold an identifier its list contains. It exists to prove that membership
is a LIST on the document and rank a list on the viewer, and that a document
for two audiences is visible to a viewer holding either. The body is long
enough to be classified as prose rather than navigation, so search reaches it
like any other document.
`,
  }),
};

describe.runIf(adminDsn !== "")("the governance chain, markdown to answer (db)", () => {
  let pool: pg.Pool;
  let admin: pg.Pool;
  let work: string;
  let instance: ContentInstance;

  /** A door serving one viewer list — the shape `compose.ts` builds; null = an unidentified caller. */
  const VIEWER: Record<string, readonly string[]> = {
    public: ["public"],
    internal: ["public", "internal"],
  };
  const doorFor = (audience: string | null): ServiceContext => ({
    pool,
    instance,
    ring: keyRingFromEnv(undefined),
    instanceDigest: createHash("sha256").update("chain").digest("hex"),
    embedQuery: (query: string) =>
      embedQueryVlit(query, { provider: buildShippedProvider("fake", { apiKey: null }) }),
    ...(audience === null ? {} : { viewer: VIEWER[audience]! }),
  });

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin = new Pool({ connectionString: adminDsn });
    await admin.query(`CREATE DATABASE ${DB}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB}`;
    pool = contentPool(url.toString(), 4);
    await applySchema(pool, 1536);
    await grantIngest(pool, TENANT);

    work = mkdtempSync(path.join(tmpdir(), "ksor-chain-"));
    writeRecord(work, { name: TENANT, audiences: ["internal"], docs: DOCS });
    instance = instanceOf(TENANT, TENANT);

    await buildGeneration(pool, instance, {
      provider: buildShippedProvider("fake", { apiKey: null }),
      recordRoot: work,
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

  it("LINK 1 — ingest carries each document's declared audience list onto the node row", async () => {
    // The original decision-15 bug: ingest kept four frontmatter keys and
    // dropped the rest, so `visibility` existed only in markdown.
    const rows = await runRead(pool, TENANT, async (client) =>
      (
        await client.query(
          "SELECT slug, audience FROM content_nodes WHERE tenant_id = $1 AND generation = " +
            "(SELECT active_generation FROM corpora WHERE tenant_id = $1) ORDER BY slug",
          [TENANT],
        )
      ).rows.map((r: { slug: string; audience: string[] | null }) => [r.slug, r.audience]),
    );
    const byslug = Object.fromEntries(rows) as Record<string, string[] | null>;
    expect(byslug["public-handbook"], "declared public").toEqual(["public"]);
    expect(byslug["internal-salaries"], "declared internal — the value that must survive").toEqual([
      "internal",
    ]);
    expect(byslug["shared-notes"], "a two-audience list survives whole").toEqual([
      "public",
      "internal",
    ]);
    expect(byslug["hr"], "a section carries the union of its descendants' lists").toEqual([
      "internal",
      "public",
    ]);
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

  it("a document for TWO audiences is visible to a viewer holding either", async () => {
    for (const tier of ["public", "internal"]) {
      const listed = (await outlineDocuments(doorFor(tier), {})).nodes.map((n) => n.slug);
      expect(listed, `[public, internal] overlaps the ${tier} viewer's list`).toContain(
        "shared-notes",
      );
    }
  });

  it("a PUBLIC document beside an INTERNAL overview is reachable, and its section is admitted through it", async () => {
    // Audience is a property of a DOCUMENT, not of its container: the site
    // stages per file and `OVERLAP_CASES` is per document. The kernel's three
    // paths once disagreed about that (round-9 review of #43). A section is a
    // shell with no governance of its own: it carries the union of its
    // descendants' lists, so the one predicate admits it iff a descendant is
    // visible — the public child admits `hr`, and the internal overview stays hidden.
    const door = doorFor("public");

    const listed = (await outlineDocuments(door, { depth: 5 })).nodes.map((n) => n.slug);
    expect(listed, "the public child is part of the record a public caller may see").toContain(
      "holiday",
    );
    expect(listed, "…and so is the section that holds it").toContain("hr");
    expect(listed, "…while the internal overview beside it is NOT").not.toContain("overview");

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

/**
 * Issue #87 — a pin decides which generation's CONTENT is served, never whether
 * the caller may still have it.
 *
 * A snapshot token exists so a citation keeps resolving to the same bytes. It
 * pins a generation, and the audience predicate evaluated `visibility` on the
 * PINNED row — which still said `public` for a document the record had since
 * restricted. Reproduced end to end: `outline` omitted it, an unpinned `read`
 * refused it, and `read` with a pre-flip token served it in full to a public
 * caller. Three routes refusing and one serving, on the same surface, in the
 * same second — decision 19 failing inside one door.
 *
 * `servableGenerations` did not catch it: a flip sets `rollback_generation` to
 * the generation just superseded, so a pre-flip pin IS the rollback pointer and
 * is servable by design.
 *
 * The rule now: governance is read from the record as it stands. Pins yield.
 * A citation may stop resolving within the token's life, which is what "the
 * record changed" should look like — and the alternative is a window in which a
 * withdrawal is not a withdrawal.
 */
describe.runIf(adminDsn !== "")("a pin does not outlive a restriction (db)", () => {
  const DB2 = `ksor_pin_governance_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const T = "pincorp";
  let pool2: pg.Pool;
  let admin2: pg.Pool;
  let work2: string;
  let inst2: ContentInstance;

  // ONE ring for the whole suite. `keyRingFromEnv(undefined)` mints a RANDOM key
  // per call, so minting with one and validating with another makes every token
  // silently invalid — the read then "refreshes" to the active generation and
  // looks like a refusal. That artifact hid this defect from a first draft of
  // these tests; the token has to be genuinely valid for the assertion to mean
  // anything.
  const RING = keyRingFromEnv(undefined);

  const doorAt = (audience: string | null): ServiceContext => ({
    pool: pool2,
    instance: inst2,
    ring: RING,
    instanceDigest: createHash("sha256").update("pin").digest("hex"),
    embedQuery: (q: string) =>
      embedQueryVlit(q, { provider: buildShippedProvider("fake", { apiKey: null }) }),
    ...(audience === null
      ? {}
      : { viewer: audience === "internal" ? ["public", "internal"] : ["public"] }),
  });

  const pinFor = (generation: number): string =>
    mint(
      RING,
      {
        corpusId: inst2.corpusId,
        tenantId: inst2.tenantId,
        instanceDigest: createHash("sha256").update("pin").digest("hex"),
        viewer: ["public"],
      },
      generation,
    ).token;

  const write = async (visibility: string): Promise<void> => {
    writeFileSync(
      path.join(work2, "knowledge", "layoffs.md"),
      profileDoc({
        title: "Layoffs",
        audience: [visibility],
        body:
          `# Layoffs\n\nThe restructuring plan ${SECRET} covers three sites and the timetable ` +
          `for consultation, including which roles are affected and when each group is told. ` +
          `It is the reference managers use when preparing individual conversations.\n`,
      }),
      "utf8",
    );
    writeIndexesAndLock(work2, `sha256:${visibility}`);
  };

  beforeAll(async () => {
    const { Pool } = (await import("pg")).default;
    admin2 = new Pool({ connectionString: adminDsn });
    await admin2.query(`CREATE DATABASE ${DB2}`);
    const url = new URL(adminDsn);
    url.pathname = `/${DB2}`;
    pool2 = contentPool(url.toString(), 4);
    await applySchema(pool2, 1536);
    await grantIngest(pool2, T);
    work2 = mkdtempSync(path.join(tmpdir(), "ksor-pin-"));
    writeRecord(work2, {
      name: T,
      audiences: ["internal"],
      docs: {
        "handbook.md": profileDoc({
          title: "Handbook",
          body:
            `# Handbook\n\nOnboarding, expenses and travel, written for everyone and left untouched by this ` +
            `test so the control means something.\n`,
        }),
      },
    });
    await write("public");
    inst2 = instanceOf(T, T);
    await buildGeneration(pool2, inst2, {
      provider: buildShippedProvider("fake", { apiKey: null }),
      recordRoot: work2,
      flip: true,
      sourceCommit: "gen1",
    });
  }, 600_000);

  afterAll(async () => {
    await pool2?.end().catch(() => undefined);
    await admin2?.query(`DROP DATABASE IF EXISTS ${DB2} WITH (FORCE)`).catch(() => undefined);
    await admin2?.end().catch(() => undefined);
    if (work2 !== undefined && work2 !== "") rmSync(work2, { recursive: true, force: true });
  });

  it("serves the pinned read while the document is still public — the control", async () => {
    const doc = await readDocument(doorAt("public"), "layoffs", { snapshotToken: pinFor(1) });
    expect(doc.text, "a public caller may pin and read a public document").toContain(SECRET);
  }, 120_000);

  it("REFUSES the same pinned read once the record restricts it", async () => {
    await write("internal");
    await buildGeneration(pool2, inst2, {
      provider: buildShippedProvider("fake", { apiKey: null }),
      recordRoot: work2,
      flip: true,
      sourceCommit: "gen2",
    });

    // Every other route already refuses; this is the fourth.
    await expect(
      readDocument(doorAt("public"), "layoffs"),
      "unpinned read — already refused before this fix",
    ).rejects.toBeInstanceOf(UnknownSlug);
    await expect(
      readDocument(doorAt("public"), "layoffs", { snapshotToken: pinFor(1) }),
      "and the PIN must not re-open what the record just closed",
    ).rejects.toBeInstanceOf(UnknownSlug);
  }, 120_000);

  it("still serves the pinned read to the tier the record DOES allow", async () => {
    const doc = await readDocument(doorAt("internal"), "layoffs", { snapshotToken: pinFor(1) });
    expect(doc.text, "governance decides, not the pin — internal may still read it").toContain(
      SECRET,
    );
  }, 120_000);

  it("leaves an untouched document pinning exactly as before", async () => {
    const doc = await readDocument(doorAt("public"), "handbook", { snapshotToken: pinFor(1) });
    expect(doc.text, "the property pins exist for is unaffected").toContain("Onboarding");
  }, 120_000);
});
