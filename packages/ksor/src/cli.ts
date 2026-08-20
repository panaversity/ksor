#!/usr/bin/env node
// The placeholder CLI. It exists so that `npx ksor` answers honestly rather
// than failing with a module error — the same rule the implementation holds
// itself to: an unimplemented verb says so, names what does exist, and exits
// non-zero. Exit semantics are exported from the package root as `exitCodes`.
// process.exitCode (never process.exit) so buffered stdout always flushes.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { main as runGateway } from "@panaversity/ksor-content-gateway";
import { runContentCli } from "@panaversity/ksor-content";

import { exitCodes, resolveCommand, verbs } from "./index.js";
import { runInit } from "./init/index.js";
import { unsupportedPlatform } from "./init/platform.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  name: string;
  version: string;
  homepage: string;
};

const notice =
  "\n" +
  "Knowledge System of Record: one governed source of markdown, published as a\n" +
  "site people read and an MCP surface AI agents query — with citations, and an\n" +
  "honest refusal when the corpus does not cover the question.\n" +
  "\n" +
  `Follow along: ${pkg.homepage}\n`;

const usage =
  `ksor ${pkg.version} — Knowledge System of Record\n` +
  "\n" +
  "Usage: ksor <verb>\n" +
  "\n" +
  `Verbs (dev and build exit 2 until they ship; the rest are implemented):\n` +
  "  init       create a new KSoR project\n" +
  "  dev        run the human surface locally, watching\n" +
  "  build      validate and build both surfaces\n" +
  "  serve      start the MCP agent surface (reads ./instance.md)\n" +
  "  ingest     load / refresh the corpus into the database\n" +
  "  calibrate  measure the abstention floor\n" +
  "  schema     apply the database schema\n" +
  "  grant      authorize ingest for this corpus (or --revoke it)\n" +
  "  takedown   deny a document from every surface (or --list / --revoke it)\n" +
  "  gc         collect superseded generations\n" +
  "\n" +
  "Exit codes: 1 refused · 2 designed but not implemented · 3 environment\n" +
  `Docs: node_modules/${pkg.name}/docs · ${pkg.homepage}\n`;

/**
 * Load `./.env` when one exists, so the served rung's variables (the DSN the
 * instance names, the provider key) live in a file the adopter already
 * gitignores instead of being exported by hand into every shell. Node does
 * this natively — no dependency — and a REAL environment variable still wins
 * over the file, so CI and production overrides behave as they should.
 */
function loadDotEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    // No .env, or unreadable: exporting the variables directly still works.
  }
}

async function main(args: readonly string[]): Promise<number> {
  loadDotEnv();
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(usage);
    return 0;
  }
  if (args.includes("--version")) {
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }

  const { word, verb } = resolveCommand(args);

  if (verb === "init") {
    // Checked before anything is written: the scaffold's own toolchain needs
    // this Node, so a scaffold made by an older one would fail later, in the
    // adopter's repo, where the cause is no longer visible.
    const remedy = unsupportedPlatform(process.versions.node);
    if (remedy !== null) {
      process.stderr.write(`error: unsupported-platform\n${remedy}\n`);
      return exitCodes.environment;
    }
    return runInit(
      args.slice(args.indexOf("init") + 1),
      process.cwd(),
      {
        out: (text) => process.stdout.write(text),
        err: (text) => process.stderr.write(text),
      },
      {
        version: pkg.version,
        // Resolved from the built cli.mjs location: dist/ -> package root.
        templatesDir: fileURLToPath(new URL("../templates/scaffold", import.meta.url)),
      },
    );
  }

  if (verb === "serve") {
    // The kernel is bundled INTO this package (decision 12 publish revision),
    // so serve runs the gateway IN-PROCESS: this process becomes the MCP
    // server. runGateway reads ./instance.md + the DSN env it names, runs its
    // own fail-closed boot and exit contract (it process.exit()s on error and
    // holds the event loop while serving), and drains on SIGTERM/SIGINT.
    // Honour --instance like every sibling corpus verb. Without this the flag
    // was silently ignored and ./instance.md served instead — a user who
    // extrapolated from ingest/schema/grant/calibrate/gc served the WRONG
    // corpus with no signal (review, 2026-08-20). The gateway reads
    // KSOR_INSTANCE, so the flag sets it rather than growing a second path.
    const flag = args.indexOf("--instance");
    const instance = flag === -1 ? undefined : args[flag + 1];
    if (flag !== -1 && (instance === undefined || instance.startsWith("-"))) {
      process.stderr.write("error: bad-args\n--instance needs a path to an instance.md\n");
      return exitCodes.refused;
    }
    if (instance !== undefined) process.env["KSOR_INSTANCE"] = instance;
    // Pass the PUBLISHED version as an ARGUMENT. An env var set here would be
    // too late: this module's static import of the gateway (top of file) has
    // already evaluated its module body, so a module-level env read there is
    // baked before this line runs — which is exactly how the first attempt at
    // this shipped inert in 0.0.4 (review, 2026-08-20).
    await runGateway(pkg.version);
    return 0;
  }

  // The corpus operations the bundled kernel provides — delegated to its write-
  // plane dispatcher (schema --apply / ingest / calibrate / gc). It owns the
  // same exit contract (1 refused, 3 environment).
  if (
    verb === "ingest" ||
    verb === "schema" ||
    verb === "grant" ||
    verb === "takedown" ||
    verb === "calibrate" ||
    verb === "gc"
  ) {
    return runContentCli(args.slice(args.indexOf(verb)));
  }

  // A word that is not in the design is refused (exit 1), never conflated with
  // "designed but unimplemented" (exit 2). First stderr line is a stable slug.
  if (word !== null && verb === null) {
    process.stderr.write(
      `error: unknown-verb\n"${word}" is not a ksor verb. The vocabulary is: ${verbs.join(", ")}.\n`,
    );
    return exitCodes.refused;
  }

  const heading =
    verb === null
      ? `ksor ${pkg.version} — the name is reserved; this is not a release.`
      : `ksor ${verb}: designed but not implemented in ${pkg.version}.`;
  process.stdout.write(`${heading}\n${notice}`);
  return exitCodes.notImplemented;
}

process.exitCode = await main(process.argv.slice(2));
