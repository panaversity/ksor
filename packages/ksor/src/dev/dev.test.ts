/**
 * Unit tests for the `ksor dev` governance and proxy logic. These exercise the
 * pure pieces (the record checker in `check` mode, the serve probe) without
 * spawning `next dev` — which would need a real scaffold and a long-lived
 * process. The end-to-end dev run is covered by the integration test that
 * asserts the missing-record-root refusal.
 */
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { checkRecord } from "@panaversity/ksor-content/record";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { VALID, REFUSALS } from "../__fixtures__/record-conformance.js";
import { govern } from "./govern.js";
import { probeServe } from "./proxy.js";

/** Write a conformance fixture's files (and empty dirs) into a real temp root. */
function writeFixture(
  dir: string,
  files: Readonly<Record<string, string>>,
  dirs: readonly string[] = [],
): void {
  for (const rel of dirs) mkdirSync(path.join(dir, rel), { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
}

let cleanDir: string;
let brokenDir: string;

beforeAll(() => {
  cleanDir = mkdtempSync(path.join(tmpdir(), "ksor-dev-govern-"));
  writeFixture(cleanDir, VALID.files, VALID.dirs ?? []);
  // The fixture commits indexes; in `check` mode checkRecord compares them to
  // what the tree generates, so regenerate them exactly as `ksor build` would
  // (build spec §1) and overwrite, then govern must come back clean.
  const tree = new Map(Object.entries(VALID.files));
  const indexes = checkRecord(
    { files: tree, dirs: VALID.dirs ?? [] },
    { mode: "build", ledgerBaselines: [] },
  ).indexes;
  for (const [rel, text] of indexes) writeFileSync(path.join(cleanDir, rel), text);
  // A record that is known to refuse, from the same fixture set build uses.
  const broken = REFUSALS.find((r) => r.name === "ksor-frontmatter-invalid")!;
  brokenDir = mkdtempSync(path.join(tmpdir(), "ksor-dev-broken-"));
  writeFixture(brokenDir, broken.files, broken.dirs ?? []);
});

afterAll(() => {
  rmSync(cleanDir, { recursive: true, force: true });
  rmSync(brokenDir, { recursive: true, force: true });
});

describe("ksor dev governance", () => {
  it("clears a conformant record (the same checker build runs)", () => {
    const result = govern(cleanDir);
    expect(result.refusals).toEqual([]);
    expect(result.line).toBe("ksor dev: governance clean");
  });

  it("reports refusals for a broken record, names the first slug", () => {
    const result = govern(brokenDir);
    expect(result.refusals.length).toBeGreaterThan(0);
    expect(result.line).toContain("governance problem(s)");
    expect(result.line).toContain(result.refusals[0]?.slug ?? "");
  });

  it("uses a committed lock as the ledger baseline when present", () => {
    writeFileSync(
      path.join(cleanDir, "build.lock.json"),
      `${JSON.stringify(
        {
          format: 1,
          build_id: "sha256:" + "0".repeat(64),
          ksor_version: "0.0.0",
          as_of: "2026-08-25T12:00:00.000Z",
          documents: [],
          ledger_entries: [{ id: "x", digest: "0".repeat(64) }],
        },
        null,
        2,
      )}\n`,
    );
    const result = govern(cleanDir);
    expect(result.refusals).toEqual([]);
    rmSync(path.join(cleanDir, "build.lock.json"), { force: true });
  });
});

describe("ksor dev MCP proxy probe", () => {
  let server: Server;
  let port = 0;

  beforeAll(async () => {
    server = createServer((_req, res) => res.end("ok"));
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        port = (server.address() as { port: number }).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("reaches a listening serve", async () => {
    await expect(probeServe(port)).resolves.toBe(true);
  });

  it("reports absence on a closed port", async () => {
    await expect(probeServe(port + 1)).resolves.toBe(false);
  });
});

// A guard that govern's tree load reads the same bytes checkRecord does.
describe("dev governance matches the checker", () => {
  it("the broken fixture produces at least one refusal via govern", () => {
    expect(readFileSync(path.join(brokenDir, "knowledge/bad.md"), "utf8")).toContain("unclosed");
    expect(govern(brokenDir).refusals.length).toBeGreaterThan(0);
  });
});
