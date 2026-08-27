import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { releaseNote } from "./release-note.js";

import {
  buildDefaultGateway,
  buildServer,
  listServedTools,
  type ServiceContext,
} from "@panaversity/ksor-content-gateway";

/**
 * The tool-definition sizes are printed in five documents and called "exact".
 * They were measured two ways at once: the "all three" figure is
 * `JSON.stringify(tools)` over the whole ARRAY, the per-tool figures are each
 * tool's own object, and the array carries 4 characters — `[`, `]` and two
 * separators — that no tool's row contains. So the published table did not add
 * up, in a number every document called exact.
 *
 * This pins both measurements against the real served surface and requires
 * every document that prints them to also print the reconciliation, so a
 * reader can check the arithmetic and a code change that moves a description
 * fails here instead of quietly making five documents wrong.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Registration only closes over ctx; nothing here reaches Postgres. */
const STUB = {
  instance: { instructions: "This record is authoritative for the acceptance suite." },
  pool: null,
  ring: null,
} as unknown as ServiceContext;

/** `1234` -> `1,234`, the form every one of these documents prints. */
function grouped(n: number): string {
  return n.toLocaleString("en-US");
}

describe("the documented tool-definition sizes", () => {
  it("are two measurements, and the array carries exactly 4 characters no tool's row does", async () => {
    const tools = await listServedTools(buildServer(STUB, "0.0.0", buildDefaultGateway));
    // The WIRE shape: in-process, optional keys are present with `undefined`.
    const wire = JSON.parse(JSON.stringify(tools)) as ReadonlyArray<{ name: string }>;

    const per = new Map(wire.map((t) => [t.name, JSON.stringify(t).length]));
    const sum = [...per.values()].reduce((a, b) => a + b, 0);
    const transmitted = JSON.stringify(wire).length;

    expect([...per.keys()].sort()).toEqual(["outline", "read", "search"]);
    expect(sum).toBe(16730);
    expect(transmitted).toBe(16734);
    // Named so a failure says WHY the two differ rather than only that they do.
    expect(transmitted - sum).toBe(2 /* brackets */ + (wire.length - 1) /* separators */);
  });

  it("are printed with their reconciliation everywhere they are called exact", async () => {
    const tools = await listServedTools(buildServer(STUB, "0.0.0", buildDefaultGateway));
    const wire = JSON.parse(JSON.stringify(tools)) as ReadonlyArray<{ name: string }>;
    const per = new Map(wire.map((t) => [t.name, JSON.stringify(t).length]));
    const sum = [...per.values()].reduce((a, b) => a + b, 0);
    const transmitted = JSON.stringify(wire).length;

    // Every document that prints the transmitted figure must also print the
    // per-tool sum, or its rows cannot be checked against each other.
    const documents = [
      "packages/ksor/docs/tool-surface.md",
      "specs/ksor/gateway/spec.md",
      "docs/status.md",
      "AGENTS.md",
      // Two more that quote the figure in prose rather than in a table. They
      // were the last places the array measure was still attributed to "the
      // three definitions", which is the misreading the whole exercise is about.
      "research/okf-native.md",
      ".changeset/okf-door-on-the-profile.md",
    ];
    for (const rel of documents) {
      // A changeset is consumed at release; its prose lives on in CHANGELOG.md.
      const text = rel.startsWith(".changeset/")
        ? releaseNote(ROOT, rel).text
        : readFileSync(path.join(ROOT, rel), "utf8");
      expect(text, `${rel} prints the transmitted figure`).toContain(grouped(transmitted));
      expect(text, `${rel} reconciles it with the per-tool sum`).toContain(grouped(sum));
    }

    // The two tables print every tool's own size, so the rows add up on the page.
    for (const rel of ["packages/ksor/docs/tool-surface.md", "specs/ksor/gateway/spec.md"]) {
      const text = readFileSync(path.join(ROOT, rel), "utf8");
      for (const [name, chars] of per) {
        expect(text, `${rel} prints ${name} = ${grouped(chars)}`).toContain(grouped(chars));
      }
    }
  });
});
