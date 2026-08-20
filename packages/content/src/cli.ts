#!/usr/bin/env node
// The `ksor-content` bin — the top of the graph, never imported (boundary
// suite). All command logic lives in the library module `commands.ts`
// (runContentCli), which the bundled kernel package reuses as a second bin.
import { runContentCli } from "./commands.js";

process.exitCode = await runContentCli(process.argv.slice(2));
