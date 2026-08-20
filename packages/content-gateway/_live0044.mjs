import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const admin = new pg.Pool({ connectionString: process.env.KSOR_ADMIN, max: 1 });
const dbName = `ksor_v4_${Math.floor(Math.random() * 1e8)}`;
await admin.query(`CREATE DATABASE ${dbName}`);
const u = new URL(process.env.KSOR_ADMIN);
u.pathname = `/${dbName}`;
const dbUrl = u.toString();
const work = mkdtempSync(path.join(tmpdir(), "ksor-v4-"));
const R = [];
const ok = (l, c, x = "") => {
  R.push(`${c ? "PASS" : "FAIL"}  ${l}${x ? "  — " + x : ""}`);
  console.log(R.at(-1));
};
const run = (c, a, cwd, env = {}) =>
  spawnSync(c, a, { cwd, encoding: "utf8", env: { ...process.env, KSOR_DB_URL: dbUrl, ...env } });

const init = run("npx", ["--yes", "@panaversity/ksor@0.0.4", "init", "handbook"], work);
ok("npx @panaversity/ksor@0.0.4 init", init.status === 0, (init.stderr || "").slice(-120));
const proj = path.join(work, "handbook");
const pkg = JSON.parse(readFileSync(path.join(proj, "package.json"), "utf8"));
ok(
  "scaffold pins the publishing version",
  pkg.dependencies["@panaversity/ksor"] === "0.0.4",
  pkg.dependencies["@panaversity/ksor"],
);
const inst = run("pnpm", ["install", "--no-frozen-lockfile"], proj, { CI: "true" });
ok(
  "pnpm install resolves a minutes-old release",
  inst.status === 0,
  (inst.stderr || "").slice(-120),
);
const ip = path.join(proj, "instance.md");
writeFileSync(
  ip,
  readFileSync(ip, "utf8").replace(
    "---\n\n# Knowledge System of Record",
    "database:\n  dsn_env: KSOR_DB_URL\nembedding:\n  provider: gemini\n  model: gemini-embedding-001\n  dim: 1536\n---\n\n# Knowledge System of Record",
  ),
);
writeFileSync(
  path.join(proj, "knowledge", "retention.md"),
  "---\ntitle: Data retention\nstatus: approved\n---\n\nEmployee records are retained for seven years after departure, then permanently erased from every system of record. Payroll and tax documents follow the same seven-year schedule to satisfy statutory audit requirements. Access logs are kept for ninety days and purged automatically by the retention job.\n",
);
const check = run("pnpm", ["check"], proj);
ok(
  "pnpm check accepts the serve config",
  check.status === 0,
  (check.stdout || "").trim().split("\n").pop(),
);
ok("pnpm schema", run("pnpm", ["schema"], proj).status === 0);
const g = run("pnpm", ["grant"], proj);
ok("pnpm grant (no psql)", g.status === 0, (g.stdout || "").trim().split("\n").pop());
const ing = run("pnpm", ["ingest"], proj);
ok(
  "pnpm ingest activates the generation",
  ing.status === 0 && /FLIPPED/.test(ing.stdout || ""),
  (ing.stdout || "").match(/generation \d+ — [^\n]*/)?.[0] ?? (ing.stderr || "").slice(-140),
);

const port = 36000 + Math.floor(Math.random() * 4000);
const server = spawn("pnpm", ["serve"], {
  cwd: proj,
  env: { ...process.env, KSOR_DB_URL: dbUrl, KSOR_MCP_PORT: String(port), KSOR_AUTH_DISABLED: "1" },
});
let boot = "";
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("no boot: " + boot)), 60000);
  server.stderr.on("data", (d) => {
    boot += d;
    if (boot.includes("serving")) {
      clearTimeout(t);
      res();
    }
  });
  server.on("exit", (c) => rej(new Error(`serve exited ${c}: ${boot.slice(-300)}`)));
});
ok("pnpm serve booted", true);
const client = new Client({ name: "release-check", version: "0.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
const tools = await client.listTools();
ok("MCP tools listed", tools.tools.length === 3, tools.tools.map((t) => t.name).join(","));
const hit = await client.callTool({
  name: "search",
  arguments: { query: "how long are employee records kept", k: 2 },
});
const sc = hit.structuredContent;
const pv = sc?.hits?.[0]?.provenance ?? {};
ok(
  "search returns CITED passages",
  sc?.ok === true && (sc.hits ?? []).length > 0,
  `gen ${pv.generation} · ${pv.stable_id}`,
);
ok("snapshot token pins the generation", Boolean(sc?.snapshot?.token));
const miss = await client.callTool({
  name: "search",
  arguments: { query: "airspeed velocity of an unladen swallow", k: 2 },
});
ok(
  "out-of-corpus ABSTAINS",
  miss.structuredContent?.abstained === true,
  `reason=${miss.structuredContent?.reason}`,
);
const doc = await client.callTool({ name: "read", arguments: { slug: "retention" } });
ok(
  "read returns the document",
  /seven years after departure/.test(doc.structuredContent?.text ?? ""),
);
await client.close();
server.kill("SIGTERM");
await new Promise((r) => {
  const h = setTimeout(() => {
    server.kill("SIGKILL");
    r();
  }, 8000);
  server.once("exit", () => {
    clearTimeout(h);
    r();
  });
});
console.log(
  "\n" +
    (R.some((x) => x.startsWith("FAIL"))
      ? "FAILURES"
      : "ALL PASS — @panaversity/ksor@0.0.4 verified end to end"),
);
await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => {});
await admin.end();
rmSync(work, { recursive: true, force: true });
