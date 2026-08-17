#!/usr/bin/env node
// The placeholder CLI. It exists so that `npx ksor` answers honestly rather
// than failing with a module error — the same rule the implementation holds
// itself to: an unimplemented verb says so, names what does exist, and exits
// non-zero. Exit semantics are exported from the package root as `exitCodes`.

import { readFileSync } from "node:fs";

import { exitCodes, resolveCommand, verbs } from "./index.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
  homepage: string;
};

const args = process.argv.slice(2);
const { verb } = resolveCommand(args);

// A word that is not in the design is refused (exit 1), never conflated with
// "designed but unimplemented" (exit 2). First stderr line is a stable slug.
const firstWord = args.find((arg) => !arg.startsWith("-")) ?? null;
if (firstWord !== null && verb === null) {
  process.stderr.write(
    `error: unknown-verb\n"${firstWord}" is not a ksor verb. The vocabulary is: ${verbs.join(", ")}.\n`,
  );
  process.exit(exitCodes.refused);
}

const heading =
  verb === null
    ? `ksor ${pkg.version} — the name is reserved; this is not a release.`
    : `ksor ${verb}: designed but not implemented in ${pkg.version}.`;

process.stdout.write(
  `${heading}\n` +
    "\n" +
    "Knowledge System of Record: one governed source of markdown, published as a\n" +
    "site people read and an MCP surface AI agents query — with citations, and an\n" +
    "honest refusal when the corpus does not cover the question.\n" +
    "\n" +
    `Follow along: ${pkg.homepage}\n`,
);

process.exit(exitCodes.notImplemented);
