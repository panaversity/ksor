#!/usr/bin/env node
// The placeholder CLI. It exists so that `npx ksor` answers honestly rather than
// failing with a module error — the same rule the implementation holds itself to:
// an unimplemented verb says so, names what does exist, and exits non-zero.
//
// Exit 2 is deliberate and matches the framework's own convention: 2 means "this
// verb is not implemented in this build", distinct from 1 (refused / bad input)
// and 3 (environment). Nothing here should be taken as a released capability.

const pkg = require("../package.json");

process.stdout.write(
  `ksor ${pkg.version} — the name is reserved; this is not a release.\n` +
    "\n" +
    "Knowledge System of Record: one governed source of markdown, published as a\n" +
    "site people read and an MCP surface AI agents query — with citations, and an\n" +
    "honest refusal when the corpus does not cover the question.\n" +
    "\n" +
    `Follow along: ${pkg.homepage}\n`,
);

process.exit(2);
