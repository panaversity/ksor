/**
 * The emitted container, proven WITHOUT a hosting vendor.
 *
 * `ksor init` now ships a Dockerfile, and the claim attached to it is that the
 * served rung runs anywhere — "vendor-free is the ownership argument". A claim
 * only checked by deploying to one vendor is a claim about that vendor. So this
 * walks the artifact on plain Docker: scaffold, publish a generation, build the
 * image, boot it, and ask it a question over MCP.
 *
 * It installs the LOCAL build rather than the published one (the tier rule paid
 * for with shipped defects: the test must install the same tree the artifact
 * installs). The Dockerfile is used as emitted, with ONE line inserted to bring
 * the local tarball into the build context — and the insertion is asserted to be
 * the only difference, so this can never quietly drift into testing a different
 * recipe than adopters get.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cli = path.join(repoRoot, "packages", "ksor", "dist", "cli.mjs");
const DSN = process.env["KSOR_DB_URL"];
const PORT = "8099";
const IMAGE = "ksor-container-acceptance";

if (!DSN) {
  console.error("KSOR_DB_URL is required (this walk publishes a real generation)");
  process.exit(1);
}

const work = mkdtempSync(path.join(tmpdir(), "ksor-container-"));
const project = path.join(work, "demo");
let container = "";

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: "pipe", ...opts });
}

function ksor(args, env = {}) {
  return run(process.execPath, [cli, ...args], {
    cwd: project,
    env: { ...process.env, ...env },
  });
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  cleanup();
  process.exit(1);
}

function cleanup() {
  if (container) {
    try {
      // BOTH streams, through a shell: execFileSync returns stdout only, and
      // the door writes its boot report — including every refusal — to stderr.
      // Capturing stdout alone printed an empty string over a real failure.
      console.error("--- container state ---");
      console.error(
        run("sh", [
          "-c",
          `docker inspect -f '{{.State.Status}} exit={{.State.ExitCode}}' ${container}`,
        ]).trim(),
      );
      console.error("--- container logs ---");
      console.error(run("sh", ["-c", `docker logs ${container} 2>&1`]).slice(-6000));
    } catch (error) {
      console.error(`could not read the container's logs: ${error.message}`);
    }
    try {
      run("docker", ["rm", "-f", container]);
    } catch {
      /* already gone */
    }
  }
  rmSync(work, { recursive: true, force: true });
}

try {
  // 1. Scaffold with the local CLI.
  run(process.execPath, [cli, "init", "demo"], { cwd: work });

  // 2. Point the record at the database. The scaffold ships the block
  //    commented out, which is the adopter's first edit on this rung.
  const instancePath = path.join(project, "instance.md");
  const instance = readFileSync(instancePath, "utf8").replace(
    "# database:\n#   dsn_env: KSOR_DB_URL",
    "database:\n  dsn_env: KSOR_DB_URL",
  );
  if (!instance.includes("\ndatabase:\n")) fail("could not enable the database block");
  writeFileSync(instancePath, instance);

  // 3. Install the LOCAL build, not the published one.
  //
  //    PNPM pack, never npm pack. The manifest declares `"zod": "catalog:"`,
  //    a pnpm-only protocol that pnpm RESOLVES to a concrete range when it
  //    packs or publishes — so the registry serves `^4.4.3` and every consumer
  //    is fine. `npm pack` copies the manifest verbatim, leaving `catalog:` in
  //    the tarball, and the install then dies with EUNSUPPORTEDPROTOCOL. That
  //    would be a test failing on its own packaging while the shipped artifact
  //    was correct, which is the most expensive kind of red.
  const packed = run("pnpm", ["pack", "--pack-destination", project], {
    cwd: path.join(repoRoot, "packages", "ksor"),
  })
    .trim()
    .split("\n")
    .at(-1)
    .trim();
  copyFileSync(packed, path.join(project, "ksor-local.tgz"));

  // The property that makes the line above correct, asserted rather than
  // trusted: a pnpm-only protocol reaching the tarball would break every npm
  // and yarn consumer of the published package.
  const packedManifest = run("tar", ["-xzOf", "ksor-local.tgz", "package/package.json"], {
    cwd: project,
  });
  const packedDeps = JSON.stringify(JSON.parse(packedManifest).dependencies ?? {});
  if (packedDeps.includes("catalog:") || packedDeps.includes("workspace:")) {
    fail(`the packed manifest carries an unresolved pnpm protocol: ${packedDeps}`);
  }

  const pkgPath = path.join(project, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.dependencies["@panaversity/ksor"] = "file:./ksor-local.tgz";
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  // 4. Publish a generation. This is a DEPLOY step, never something the
  //    container does at boot — the whole point of the serve/ingest split.
  ksor(["schema", "--instance", "instance.md", "--apply"]);
  ksor(["grant", "--instance", "instance.md"]);
  ksor(["ingest", "--instance", "instance.md", "--knowledge", "knowledge", "--flip"]);

  // 5. Build the emitted Dockerfile, plus exactly one line for the tarball.
  const emitted = readFileSync(path.join(project, "Dockerfile"), "utf8");
  const INSERT = "COPY ksor-local.tgz ./\n";
  const anchor = "RUN npm install";
  if (!emitted.includes(anchor)) fail("the emitted Dockerfile no longer installs with npm");
  const overlay = emitted.replace(anchor, INSERT + anchor);
  if (overlay.replace(INSERT, "") !== emitted) fail("the overlay changed more than one line");
  writeFileSync(path.join(project, "Dockerfile.citest"), overlay);

  run("docker", ["build", "-f", "Dockerfile.citest", "-t", IMAGE, "."], {
    cwd: project,
    stdio: "inherit",
  });

  // 6. Boot it. --network host so the container reaches the Postgres service
  //    the same way the ingest above did.
  container = run("docker", [
    "run",
    "-d",
    "--network",
    "host",
    "-e",
    `PORT=${PORT}`,
    "-e",
    `KSOR_DB_URL=${DSN}`,
    "-e",
    `GEMINI_API_KEY=${process.env["GEMINI_API_KEY"] ?? ""}`,
    "-e",
    "KSOR_AUTH_DISABLED=1",
    // A container sets $PORT, so the door binds 0.0.0.0 — a PUBLIC bind, where
    // KSOR_AUTH_DISABLED alone is deliberately not enough ("the loopback-dev
    // flag, not a licence to serve the corpus to the internet with no auth").
    // This walk accepts that risk explicitly, exactly as a public deployment
    // must. The refusal is the posture working: it is what this job first hit.
    "-e",
    "KSOR_ALLOW_PUBLIC_UNAUTHENTICATED=1",
    "-e",
    "KSOR_SNAPSHOT_KEYS=k1=0123456789abcdef0123456789abcdef",
    IMAGE,
  ]).trim();

  const base = `http://127.0.0.1:${PORT}`;
  let health;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) {
        health = await res.json();
        break;
      }
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!health) fail(`the container never answered ${base}/health`);
  console.log("health:", JSON.stringify(health));
  if (health.corpus_id !== "demo") fail(`served the wrong corpus: ${health.corpus_id}`);

  // 7. Ask it a real question over MCP.
  const mcp = async (body) => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const line = text.split("\n").find((l) => l.startsWith("data: ") || l.startsWith("{"));
    if (!line) fail(`no JSON-RPC in the reply: ${text.slice(0, 300)}`);
    return JSON.parse(line.replace(/^data: /, ""));
  };

  const init = await mcp({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "container-acceptance", version: "1" },
    },
  });
  if (init.result?.serverInfo?.name !== "ksor") {
    fail(`initialize did not answer as ksor: ${JSON.stringify(init).slice(0, 300)}`);
  }
  console.log("initialize: ksor", init.result.serverInfo.version);

  const outline = await mcp({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "outline", arguments: {} },
  });
  const structured = outline.result?.structuredContent;
  if (!structured) fail(`outline returned nothing: ${JSON.stringify(outline).slice(0, 400)}`);
  const rendered = JSON.stringify(structured);
  if (!rendered.includes("knowledge/")) {
    fail(`the outline carries no record: ${rendered.slice(0, 400)}`);
  }
  console.log("outline: ok —", rendered.length, "bytes of governed record");

  // 8. And the claim the whole job exists for.
  const body = emitted
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n")
    .toLowerCase();
  for (const vendor of ["vercel", "cloud run", "fly.io", "heroku", "aws", "azure"]) {
    if (body.includes(vendor)) fail(`the emitted Dockerfile names a host: ${vendor}`);
  }
  console.log("\nthe emitted container serves the record, and names no host.");
} finally {
  cleanup();
}
