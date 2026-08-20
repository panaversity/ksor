#!/usr/bin/env node
// The dev/test entry. Reads its own package version so the served
// serverInfo.version is real here too — the published path is `ksor serve`,
// which passes the CLI's version (see packages/ksor/src/cli.ts).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { main } from "./main.js";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { version: string };

await main(pkg.version);
