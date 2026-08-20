/**
 * Resolution semantics, offline: leaf extraction, suffix disambiguation,
 * loud ambiguity with shortest qualified addresses (every read keys on
 * node_id — duplicate slugs are routine), the typed UnknownSlug, the pure
 * root-absolute re-base, and the projection width contracts that caught a
 * shipped prod crash in the oracle. SQL arms run live in read.db.test.ts.
 */

import type pg from "pg";
import { describe, expect, it } from "vitest";

import {
  DOCUMENT_CHUNKS_SQL,
  leafSlug,
  NODE_BY_SLUG_SQL,
  NODE_BY_STABLE_ID_SQL,
  NODE_COLUMNS,
  nodeRows,
  outline,
  OUTLINE_COLUMNS,
  OUTLINE_SQL,
  outlineRows,
  rebaseOutlineRows,
  resolveDocumentNode,
  UNIT_TREE_SQL,
  UnknownSlug,
  UP_WALK_SQL,
  type DocumentNode,
  type OutlineRow,
} from "./read.js";

function node(path: string): DocumentNode {
  return {
    nodeId: path,
    slug: path.slice(path.lastIndexOf("/") + 1),
    title: path,
    stableId: "s-" + path,
    path,
    generation: 1,
    permalink: null,
  };
}

describe("leafSlug", () => {
  it("extracts the leaf from paths, bare slugs, and trailing slashes", () => {
    expect(leafSlug("a/b/c")).toBe("c");
    expect(leafSlug("bare")).toBe("bare");
    expect(leafSlug("trailing/slash/")).toBe("slash");
  });
});

describe("resolveDocumentNode (the pure resolution decision)", () => {
  it("a unique leaf resolves from a bare slug", () => {
    expect(resolveDocumentNode([node("part-1/intro")], "intro").path).toBe("part-1/intro");
  });

  it("a path suffix disambiguates duplicate leaves", () => {
    const cands = [node("course-a/setup"), node("course-b/setup")];
    expect(resolveDocumentNode(cands, "course-b/setup").path).toBe("course-b/setup");
  });

  it("an ambiguous leaf fails loud with the shortest qualified addresses", () => {
    const cands = [node("course-a/setup"), node("course-b/setup")];
    expect(() => resolveDocumentNode(cands, "setup")).toThrowError(
      /course-a\/setup.*course-b\/setup|course-b\/setup.*course-a\/setup/,
    );
  });

  it("shortest-unique suffixes grow only as far as uniqueness requires", () => {
    const cands = [node("a/deep/x/setup"), node("b/deep/y/setup")];
    let message = "";
    try {
      resolveDocumentNode(cands, "setup");
    } catch (error) {
      message = (error as Error).message;
    }
    // two segments (x/setup, y/setup) already disambiguate — no full paths
    expect(message, message).toContain("x/setup");
    expect(message).toContain("y/setup");
    expect(message).not.toContain("a/deep");
  });

  it("unknown slug raises the TYPED UnknownSlug pointing at the outline tool", () => {
    // A TYPE the composition root matches — never string-match the prose
    // (oracle sixth-pass review 2026-08-16: a bridge string-matched the
    // message, which any legal reword would have silently disabled).
    let caught: unknown;
    try {
      resolveDocumentNode([], "no-such");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnknownSlug);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("outline");
    expect((caught as Error).message).toContain("no document with slug");
  });

  it("a '/' in an unmatched request never falls back to the lone candidate", () => {
    expect(() => resolveDocumentNode([node("course-a/setup")], "elsewhere/setup2")).toThrowError(
      UnknownSlug,
    );
  });
});

describe("rebaseOutlineRows (pure re-base)", () => {
  const anchorRow: OutlineRow = {
    slug: "phase-3",
    kind: "section",
    title: "Phase 3",
    headingPath: "phase-3",
    position: 0,
    depth: 0,
    childCount: 1,
    hasContent: false,
    permalink: null,
  };
  const childRow: OutlineRow = {
    slug: "lesson-a",
    kind: "document",
    title: "Lesson A",
    headingPath: "phase-3/lesson-a",
    position: 0,
    depth: 1,
    childCount: 0,
    hasContent: true,
    permalink: "/docs/lesson-a",
  };

  it("prefixes from the anchor's OWN absolute path and skips the anchor row", () => {
    const rows = rebaseOutlineRows([anchorRow, childRow], "getting-started/mode-2/phase-3", 2);
    expect(rows).toEqual([
      {
        ...childRow,
        headingPath: "getting-started/mode-2/phase-3/lesson-a",
        depth: 3,
        // the permalink must SURVIVE the re-base — the service reads it for
        // the url (column 8; dropped once in prod, found live 2026-07-31)
        permalink: "/docs/lesson-a",
      },
    ]);
  });

  it("a leaf (anchor only) yields [] — the anchor is never echoed back", () => {
    expect(rebaseOutlineRows([anchorRow], "getting-started/mode-2/phase-3", 2)).toEqual([]);
  });

  it("a root anchor (no parents) prefixes nothing", () => {
    const rows = rebaseOutlineRows([anchorRow, childRow], "phase-3", 0);
    expect(rows[0]?.headingPath).toBe("phase-3/lesson-a");
    expect(rows[0]?.depth).toBe(1);
  });
});

/** psycopg-style canned rows keyed by a marker substring of the SQL. */
interface Canned {
  readonly rows: readonly (readonly unknown[])[];
  readonly fields: readonly string[];
}

function fakeClient(
  byMarker: Record<string, Canned>,
  log?: { values: unknown[][] },
): pg.PoolClient {
  const client = {
    query(args: { text: string; values: unknown[] }): Promise<unknown> {
      for (const [marker, canned] of Object.entries(byMarker)) {
        if (args.text.includes(marker)) {
          log?.values.push(args.values);
          return Promise.resolve({
            rows: canned.rows,
            fields: canned.fields.map((name) => ({ name })),
            rowCount: canned.rows.length,
          });
        }
      }
      throw new Error(`unexpected SQL: ${args.text.slice(0, 60)}`);
    },
  };
  return client as unknown as pg.PoolClient;
}

const NODE_FIELDS = ["node_id", "slug", "title", "stable_id", "path", "generation", "permalink"];
const OUTLINE_FIELDS = [
  "slug",
  "kind",
  "title",
  "heading_path",
  "position",
  "depth",
  "child_count",
  "has_content",
  "permalink",
];

// NODE_BY_SLUG_SQL candidate: SEVEN columns. The oracle's six-wide fixture
// sat green for the life of the permalink column because the defaulted
// trailing field absorbed the truncation — here nodeRows width-guards.
const CANDIDATE = [
  "nid-3",
  "phase-3",
  "Phase 3",
  "sid-3",
  "getting-started/mode-2/phase-3",
  "1",
  "/docs/phase-3",
];
// OUTLINE_SQL rows are NINE wide — the last is w.permalink (the prod scar).
const ANCHOR = ["phase-3", "section", "Phase 3", "phase-3", 0, 0, "1", false, null];
const CHILD = [
  "lesson-a",
  "document",
  "Lesson A",
  "phase-3/lesson-a",
  0,
  1,
  "0",
  true,
  "/docs/lesson-a",
];
const UP = ["getting-started/mode-2/phase-3", 2];

const SCOPE = { tenantId: "t", corpusId: "c", pinnedGeneration: null };

describe("outline() against a fake client", () => {
  it("accepts a path address and re-bases children root-absolute, permalink carried", async () => {
    // field test #2: outline must accept the very '/'-paths it emits.
    const client = fakeClient({
      "tree AS": { rows: [CANDIDATE], fields: NODE_FIELDS },
      "walk AS": { rows: [ANCHOR, CHILD], fields: OUTLINE_FIELDS },
      "up AS": { rows: [UP], fields: ["path", "climbed"] },
    });
    const rows = await outline(client, SCOPE, { root: "getting-started/mode-2/phase-3", depth: 1 });
    expect(rows).toEqual([
      {
        slug: "lesson-a",
        kind: "document",
        title: "Lesson A",
        headingPath: "getting-started/mode-2/phase-3/lesson-a",
        position: 0,
        depth: 3,
        childCount: 0,
        hasContent: true,
        permalink: "/docs/lesson-a",
      },
    ]);
  });

  it("still accepts a bare leaf slug and re-bases to the same breadcrumb", async () => {
    const client = fakeClient({
      "tree AS": { rows: [CANDIDATE], fields: NODE_FIELDS },
      "walk AS": { rows: [ANCHOR, CHILD], fields: OUTLINE_FIELDS },
      "up AS": { rows: [UP], fields: ["path", "climbed"] },
    });
    const rows = await outline(client, SCOPE, { root: "phase-3", depth: 1 });
    expect(rows[0]?.headingPath).toBe("getting-started/mode-2/phase-3/lesson-a");
    expect(rows[0]?.permalink, "width contract holds on the bare-slug path too").toBe(
      "/docs/lesson-a",
    );
  });

  it("pins the walk to the generation the anchor resolved into", async () => {
    // READ COMMITTED: a flip between resolve and walk would query a gen-N
    // node_id against gen N+1 and spuriously return no children.
    const log = { values: [] as unknown[][] };
    const client = fakeClient(
      {
        "tree AS": { rows: [CANDIDATE], fields: NODE_FIELDS },
        "walk AS": { rows: [ANCHOR, CHILD], fields: OUTLINE_FIELDS },
        "up AS": { rows: [UP], fields: ["path", "climbed"] },
      },
      log,
    );
    await outline(client, SCOPE, { root: "phase-3", depth: 1 });
    const [resolveValues, walkValues, upValues] = log.values;
    expect(resolveValues?.[2], "resolution runs unpinned").toBeNull();
    expect(walkValues?.[2], "walk pinned to the anchor's generation").toBe(1);
    expect(upValues?.[2], "up-walk pinned too").toBe(1);
  });

  it("an unknown root is loud and points back at browsing", async () => {
    const client = fakeClient({ "tree AS": { rows: [], fields: NODE_FIELDS } });
    await expect(outline(client, SCOPE, { root: "nope" })).rejects.toThrowError(
      /no node with slug "nope" — browse from the root/,
    );
  });

  it("a denied anchor (empty up-walk) is loud, never silently mis-based", async () => {
    const client = fakeClient({
      "tree AS": { rows: [CANDIDATE], fields: NODE_FIELDS },
      "walk AS": { rows: [], fields: OUTLINE_FIELDS },
      "up AS": { rows: [], fields: ["path", "climbed"] },
    });
    await expect(outline(client, SCOPE, { root: "phase-3" })).rejects.toThrowError(
      /no node with slug/,
    );
  });

  it("browse (no root) returns the walk rows untouched", async () => {
    const log = { values: [] as unknown[][] };
    const client = fakeClient({ "walk AS": { rows: [ANCHOR], fields: OUTLINE_FIELDS } }, log);
    const rows = await outline(client, SCOPE, {});
    expect(rows.length).toBe(1);
    expect(rows[0]?.depth).toBe(0);
    // depth/limit clamps: defaults 0 and 200
    expect(log.values[0]?.[4]).toBe(0);
    expect(log.values[0]?.[5]).toBe(200);
  });

  it("clamps depth to ≥0 and limit into [1, 5000]", async () => {
    const log = { values: [] as unknown[][] };
    const client = fakeClient({ "walk AS": { rows: [], fields: OUTLINE_FIELDS } }, log);
    await outline(client, SCOPE, { depth: -3, limit: 999_999 });
    expect(log.values[0]?.[4]).toBe(0);
    expect(log.values[0]?.[5]).toBe(5000);
    await outline(client, SCOPE, { limit: 0 });
    expect(log.values[1]?.[5]).toBe(1);
  });
});

describe("projection width contracts (the prod-crash class, made loud)", () => {
  function countTopLevelColumns(selectBody: string): number {
    let depth = 0;
    let n = 1;
    for (const ch of selectBody) {
      if (ch === "(" || ch === "[") depth += 1;
      else if (ch === ")" || ch === "]") depth -= 1;
      else if (ch === "," && depth === 0) n += 1;
    }
    return n;
  }

  it("OUTLINE_SQL projects exactly OUTLINE_COLUMNS", () => {
    const select = OUTLINE_SQL.split("FROM walk w")[0]?.split("SELECT w.slug").at(-1) ?? "";
    expect(countTopLevelColumns(select), select).toBe(OUTLINE_COLUMNS);
  });

  it("both node lookups project exactly NODE_COLUMNS", () => {
    for (const [name, sql] of [
      ["NODE_BY_SLUG_SQL", NODE_BY_SLUG_SQL],
      ["NODE_BY_STABLE_ID_SQL", NODE_BY_STABLE_ID_SQL],
    ] as const) {
      const start = sql.lastIndexOf("SELECT n.node_id");
      const body = sql.slice(start + "SELECT".length);
      const end = body.search(/\nFROM /);
      expect(end, `${name} lost its FROM clause — re-point this test`).toBeGreaterThan(0);
      expect(countTopLevelColumns(body.slice(0, end)), name).toBe(NODE_COLUMNS);
    }
  });

  it("nodeRows and outlineRows refuse a drifted width instead of truncating silently", () => {
    const short = {
      rows: [["a"]],
      fields: [{ name: "node_id" }],
    } as unknown as pg.QueryArrayResult;
    expect(() => nodeRows(short)).toThrowError(/node projection drift: expected 7/);
    expect(() => outlineRows(short)).toThrowError(/outline projection drift: expected 9/);
  });

  it("every read arm carries the v2 predicates", () => {
    // denylist + generation pinning on the resolution and outline arms;
    // published-only on every node walk.
    for (const sql of [NODE_BY_SLUG_SQL, NODE_BY_STABLE_ID_SQL, OUTLINE_SQL]) {
      expect(sql).toContain("takedown_denylist"); // via the shared `denied` CTE
      expect(sql).toContain("COALESCE");
      expect(sql).toContain("active_generation");
      expect(sql).toContain("n.status = 'published'");
    }
    for (const sql of [DOCUMENT_CHUNKS_SQL, UNIT_TREE_SQL, UP_WALK_SQL]) {
      expect(sql).toContain("COALESCE");
      expect(sql).toContain("active_generation");
    }
    // the outline walk denies at the anchor seed, on the final rows, AND in
    // the child_count subquery (a section must not advertise a denied child —
    // review 2026-08-19), all three now through the scoped `denied` set
    // (decision 14): three `FROM denied` references.
    expect(OUTLINE_SQL.split("SELECT node_id FROM denied").length - 1).toBe(3);
  });
});
