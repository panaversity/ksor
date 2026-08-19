#!/usr/bin/env node
// The `ksor-content` bin, re-exposed from the bundled kernel package: corpus
// setup (schema --apply, ingest, calibrate, gc). The kernel package ships both
// this and `ksor-content-gateway` (serve) so an adopter installs ONE package
// for the whole served rung. runContentCli is a plain export (no side-effect
// run), so this wrapper is the only executable entry.
import { runContentCli } from "@panaversity/ksor-content";

process.exitCode = await runContentCli(process.argv.slice(2));
