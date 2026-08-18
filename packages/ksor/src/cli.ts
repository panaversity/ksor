#!/usr/bin/env node
// The placeholder CLI. It exists so that `npx ksor` answers honestly rather
// than failing with a module error — the same rule the implementation holds
// itself to: an unimplemented verb says so, names what does exist, and exits
// non-zero. Exit semantics are exported from the package root as `exitCodes`.
// process.exitCode (never process.exit) so buffered stdout always flushes.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { exitCodes, resolveCommand, verbs } from "./index.js";
import { runInit } from "./init/index.js";

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
  `Verbs (init is implemented; the rest exit 2 until they ship):\n` +
  "  init    create a new KSoR project (implemented)\n" +
  "  dev     run the human surface locally, watching\n" +
  "  build   validate and build both surfaces\n" +
  "  serve   expose the MCP agent surface\n" +
  "\n" +
  "Exit codes: 1 refused · 2 designed but not implemented · 3 environment\n" +
  `Docs: node_modules/${pkg.name}/docs · ${pkg.homepage}\n`;

function main(args: readonly string[]): number {
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

process.exitCode = main(process.argv.slice(2));
