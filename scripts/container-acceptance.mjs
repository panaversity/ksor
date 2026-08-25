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
import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  // `ksor build` FIRST: ingest publishes only a tree the record checker has
  // passed, and records that build's id on the generation (record spec §1,
  // build spec §2). Without it ingest refuses `ksor-lock-missing` — which is
  // the deploy order every adopter's own scripts follow, so the walk follows
  // it too rather than reaching past it.
  // APPROVE the starter first, which `ksor init` cannot do for itself: R25
  // forbids the tool recording an approval no human performed, so an emitted
  // record is all drafts and a draft reaches no machine surface. Ingesting
  // one publishes a generation with nothing in it, and the first thing that
  // notices is the MCP question at the end of this walk — which abstained
  // with `hits: []` and read as a retrieval failure rather than as an
  // unapproved record (found in CI, 2026-08-25). `human:you` is the actor the
  // EMITTED `.ksor/governance.yaml` authorises, so this approves as the
  // record's own policy allows rather than rewriting the policy to suit the
  // walk.
  const knowledge = path.join(project, "knowledge");
  const starter = readdirSync(knowledge, { recursive: true, encoding: "utf8" }).filter(
    (file) =>
      file.endsWith(".md") && path.basename(file) !== "index.md" && !file.endsWith(".summary.md"),
  );
  if (starter.length === 0) fail("the starter ships no concept to approve");
  for (const file of starter) {
    const before = readFileSync(path.join(knowledge, file), "utf8");
    const after = before
      .replace(/^status: draft$/m, "status: stable")
      .replace(
        /^ {2}audience: \[public\]$/m,
        '  audience: [public]\n  approval: { by: "human:you", at: 2026-08-25T09:00:00Z }',
      );
    // A silent no-op would leave the record unpublished and fail far from here.
    if (after === before) fail(`${file} is not the starter shape this approval edits`);
    writeFileSync(path.join(knowledge, file), after);
  }

  ksor(["build"]);
  ksor(["schema", "--instance", "instance.md", "--apply"]);
  ksor(["grant", "--instance", "instance.md"]);
  ksor(["ingest", "--instance", "instance.md", "--flip"]);

  // 4b. Customize the tool surface, so the walk proves the registration file
  //     actually REACHES the image. It did not once: .dockerignore excluded all
  //     of system/, the door fell back to the compiled default, and every test
  //     stayed green because none of them looked at the served tool names.
  writeFileSync(
    path.join(project, "system", "gateways", "content.ts"),
    "import { FLOOR, McpServer, READ_ONLY, SEARCH_OUTPUT, composeInstructions, searchHandler, z }\n" +
      '  from "@panaversity/ksor/gateway";\n' +
      "export default function buildGateway(ctx, version) {\n" +
      '  const server = new McpServer({ name: "acceptance", version },\n' +
      "    { instructions: composeInstructions(ctx.instance.instructions) });\n" +
      '  server.registerTool("search_the_record", {\n' +
      '    title: "Search",\n' +
      "    description: `Acceptance corpus.\\n\\n${FLOOR.search}`,\n" +
      "    inputSchema: z.object({ query: z.string(), k: z.number().int().min(1).max(50).default(2) }),\n" +
      "    outputSchema: SEARCH_OUTPUT,\n" +
      "    annotations: READ_ONLY,\n" +
      "  }, searchHandler(ctx));\n" +
      "  return server;\n" +
      "}\n",
  );

  // 5. Build the emitted Dockerfile, plus exactly one line for the tarball.
  const emitted = readFileSync(path.join(project, "Dockerfile"), "utf8");
  const INSERT = "COPY ksor-local.tgz ./\n";
  const anchor = "RUN npm install";
  if (!emitted.includes(anchor)) fail("the emitted Dockerfile no longer installs with npm");
  const overlay = emitted.replace(anchor, INSERT + anchor);
  if (overlay.replace(INSERT, "") !== emitted) fail("the overlay changed more than one line");
  writeFileSync(path.join(project, "Dockerfile.citest"), overlay);

  // The emitted .dockerignore DENIES everything not explicitly allowed, which
  // correctly excludes the local tarball this walk injects. Allow it for the
  // test build only — appended to the scaffold's copy in a temp directory, so
  // the shipped file is untouched and `init.integration.test.ts` still asserts
  // the real one. If this line ever fails to help, the deny-all changed shape.
  const ignorePath = path.join(project, ".dockerignore");
  writeFileSync(
    ignorePath,
    `${readFileSync(ignorePath, "utf8")}\n# CI only: the locally packed build under test.\n!ksor-local.tgz\n`,
  );

  run("docker", ["build", "-f", "Dockerfile.citest", "-t", IMAGE, "."], {
    cwd: project,
    stdio: "inherit",
  });

  // An image the registry refuses is a failure that arrives from the HOST, long
  // after the change that caused it — a build output or a backup directory in
  // the project root riding in through a permissive .dockerignore (found live:
  // PAYLOAD_TOO_LARGE). The allow-list is what bounds this; the number is a
  // tripwire on the allow-list, not a performance target.
  const sizeBytes = Number(
    run("docker", ["image", "inspect", IMAGE, "--format", "{{.Size}}"]).trim(),
  );
  const sizeMb = Math.round(sizeBytes / 1_000_000);
  console.log(`image: ${sizeMb} MB`);
  if (sizeMb > 400) {
    fail(
      `the image is ${sizeMb} MB. Something in the project root is riding in — ` +
        "check .dockerignore still denies everything it does not explicitly allow",
    );
  }

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
    // A container sets $PORT, so the door binds 0.0.0.0 — a PUBLIC bind. The
    // posture has to SAY so: disabled-local refuses here, deliberately, and
    // that refusal is what this job first hit.
    "-e",
    "KSOR_AUTH=disabled-public",
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
  // The server NAME comes from the registration file, so this is already the
  // first evidence that the file reached the image: "ksor" would mean it did not.
  const served = init.result?.serverInfo;
  if (served?.name !== "acceptance") {
    fail(
      `initialize answered as ${JSON.stringify(served?.name)} — the registration file did ` +
        `not reach the image, so the door fell back to the compiled default`,
    );
  }
  console.log(`initialize: ${served.name} ${served.version} — from the registration file`);

  // The tool the REGISTRATION FILE names — not the default. If system/gateways/
  // never reached the image, this is "search" and the assertion says so.
  const listed = await mcp({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const names = (listed.result?.tools ?? []).map((t) => t.name);
  if (names.length !== 1 || names[0] !== "search_the_record") {
    fail(
      `the container served ${JSON.stringify(names)} — the registration file did not reach ` +
        `the image, so the door fell back to the compiled default`,
    );
  }
  console.log(`tools/list: ${JSON.stringify(names)} — the registration reached the image`);

  // The guarantee, not merely a reply: a search must come back CITED. Provenance
  // is what separates this from any other retrieval server, so it is what the
  // container walk asserts — a stable_id and the generation that authorized it.
  const search = await mcp({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "search_the_record",
      arguments: { query: "what is a knowledge system of record" },
    },
  });
  const found = search.result?.structuredContent;
  if (!found) fail(`search returned nothing: ${JSON.stringify(search).slice(0, 400)}`);
  const hits = found.hits ?? [];
  if (hits.length === 0) fail(`search found nothing: ${JSON.stringify(found).slice(0, 400)}`);
  // The file's own default is k=2; nothing asked for a count, so the file decided.
  if (hits.length > 2) fail(`the file's k=2 default was ignored: ${hits.length} hits`);
  for (const hit of hits) {
    const provenance = hit.provenance ?? {};
    if (!provenance.stable_id || provenance.generation === undefined) {
      fail(`a hit came back UNCITED: ${JSON.stringify(hit).slice(0, 300)}`);
    }
  }
  console.log(
    `search: ${hits.length} cited hits (file default k=2), gate=${found.gate}, ` +
      `first ${hits[0].provenance.stable_id} gen=${hits[0].provenance.generation}`,
  );

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
