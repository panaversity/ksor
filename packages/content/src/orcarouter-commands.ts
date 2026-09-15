/**
 * `ksor connect` — the two ways a record gets an OrcaRouter credential, and
 * `ksor models` — what that credential can actually reach.
 *
 * The two entries are deliberately SEPARATE and both first-class:
 *
 *   `ksor connect orcarouter`        browser authorization (OAuth 2.0 + PKCE)
 *   `ksor connect orcarouter --key`  paste an `sk-orca-…` you already hold
 *
 * Neither replaces the other. A user who has a key from the console should
 * never have to open a browser to use it, and a user who has no key should
 * never have to go and make one by hand. They differ in exactly one place —
 * how the credential is obtained — and converge immediately on the same
 * `OrcaCredential`, which is why nothing downstream of `store.ts` can tell
 * which one was used.
 *
 * Exit codes follow the CLI contract: 1 refused, 3 environment.
 */

import { createInterface } from "node:readline/promises";

import {
  connectLoopback,
  connectOutOfBand,
  OrcaAuthError,
  scopeWarning,
} from "./lib/orcarouter/connect.js";
import {
  discoverCatalog,
  selectModels,
  type Capability,
  type InputModality,
} from "./lib/orcarouter/catalog.js";
import { resolveEndpoints, OrcaEndpointError } from "./lib/orcarouter/endpoints.js";
import { startConsole } from "./lib/orcarouter/console.js";
import { OrcaUnauthorizedError } from "./lib/orcarouter/transport.js";
import {
  clearStoredKey,
  currentSummary,
  operatorResolver,
  ORCA_KEY_VAR,
  writeStoredKey,
} from "./lib/orcarouter/store.js";
import { looksLikeOrcaKey } from "./lib/orcarouter/credential.js";

const REFUSED = 1;
const ENVIRONMENT = 3;

const CONNECT_USAGE = `ksor connect — give this record an AI provider credential

Usage: ksor connect orcarouter [options]

  (no flag)   authorize in your browser (OAuth 2.0 + PKCE, S256). The key is
              minted for THIS machine and belongs to YOUR OrcaRouter account.
  --key       paste an sk-orca-… you already hold, instead of authorizing.
              Read from stdin, or from ORCAROUTER_API_KEY when that is set.
  --oob       authorize with a code you copy across, for a session that cannot
              receive a browser redirect (SSH, a container, a locked-down box).
  --status    show which credential is configured, masked, and where it is kept.
  --clear     remove the stored credential.
  --no-browser  print the authorization URL instead of opening it.

Where the key is kept: ${ORCA_KEY_VAR} in the .env beside your record (the same
file your DSN lives in, already gitignored). A real environment variable wins.
`;

const MODELS_USAGE = `ksor models — what your OrcaRouter credential can reach

Usage: ksor models [--capability chat|embedding|image|video|rerank]
                   [--input image|audio|video] [--json]

The list comes from GET {api}/models and is never a hand-written sample. When
the endpoint cannot be reached the built-in verified seed is shown instead and
marked DEGRADED.
`;

const CONSOLE_USAGE = `ksor console — the OrcaRouter admin console, locally

Usage: ksor console [--no-browser] [--port N]

Serves ONE page on 127.0.0.1 that shows both ways to give this record an
OrcaRouter credential — paste an sk-orca-… key, or authorize in your browser
(OAuth 2.0 + PKCE) — plus the model list your credential can actually reach,
from GET {api}/models.

Why it is local: the record's site is a STATIC EXPORT, so every page the host
serves is public. A provider key is not a published document, so it never
reaches that surface. The console runs in the same process that already holds
your DSN, binds an ephemeral loopback port, and answers only requests carrying
a token minted for this run.
`;

/** Serve the admin console until interrupted. Resolves when it has closed. */
export async function runConsole(args: readonly string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    out(CONSOLE_USAGE);
    return 0;
  }
  let endpoints;
  try {
    endpoints = resolveEndpoints();
  } catch (exc) {
    if (exc instanceof OrcaEndpointError) return env(exc.message);
    throw exc;
  }
  const handle = await startConsole({ appName: "ksor" });
  out(
    `OrcaRouter console: ${handle.url}\n` +
      `  auth origin: ${endpoints.authBase}\n` +
      `  relay base:  ${endpoints.apiBase}\n` +
      "  The URL carries a token for THIS run — opening it elsewhere will be refused.\n" +
      "  Ctrl-C to stop.\n",
  );
  if (!args.includes("--no-browser")) {
    const { openInBrowser } = await import("./lib/orcarouter/connect.js");
    openInBrowser(handle.url);
  }
  // Serve until the process is interrupted; the caller owns the lifetime.
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      void handle.close().then(() => resolve());
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  return 0;
}

export interface CliResult {
  readonly code: number;
}

function out(text: string): void {
  process.stdout.write(`${text}\n`);
}

function err(text: string): void {
  process.stderr.write(`${text}\n`);
}

async function readLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

/** Read stdin to EOF — for a piped key, so it never has to appear in argv. */
async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trim();
}

export async function runConnect(args: readonly string[]): Promise<number> {
  const provider = args.find((a) => !a.startsWith("-"));
  if (provider === undefined || args.includes("--help") || args.includes("-h")) {
    out(CONNECT_USAGE);
    return provider === undefined && !args.includes("--help") && !args.includes("-h") ? REFUSED : 0;
  }
  if (provider !== "orcarouter") {
    return refuse(
      `"${provider}" is not a provider ksor can connect. The vocabulary is: orcarouter.\n` +
        "  note: the other providers ksor speaks (gemini, openai) take a plain " +
        "environment variable and have no connect flow.",
    );
  }

  let endpoints;
  try {
    endpoints = resolveEndpoints();
  } catch (exc) {
    if (exc instanceof OrcaEndpointError) return env(exc.message);
    throw exc;
  }

  if (args.includes("--status")) {
    const summary = currentSummary();
    if (summary === null) {
      out(
        `no OrcaRouter credential is configured\n` +
          `  fix: \`ksor connect orcarouter\` (browser) or \`ksor connect orcarouter --key\` (paste)`,
      );
      return 0;
    }
    out(
      `OrcaRouter credential: ${summary.masked} (${summary.source})\n` +
        `  auth origin: ${endpoints.authBase}\n` +
        `  relay base:  ${endpoints.apiBase}`,
    );
    return 0;
  }

  if (args.includes("--clear")) {
    const removed = clearStoredKey();
    out(removed ? "OrcaRouter credential removed." : "There was no stored credential to remove.");
    return 0;
  }

  if (args.includes("--key")) {
    const fromEnv = process.env[ORCA_KEY_VAR];
    const raw =
      fromEnv !== undefined && fromEnv.trim() !== ""
        ? fromEnv.trim()
        : process.stdin.isTTY === true
          ? (
              await readLine(
                `OrcaRouter API key (${ORCA_KEY_VAR}), input hidden from this repo's logs: `,
              )
            ).trim()
          : await readAllStdin();
    if (raw === "") return refuse("no key was entered");
    if (!looksLikeOrcaKey(raw)) {
      // FORMAT only. This catches a paste of the wrong thing; it cannot and
      // does not claim the key works — validity is established by the first
      // real request, and OrcaRouter exposes no free validation call.
      return refuse(`that does not look like an OrcaRouter key (expected an sk-orca-… value)`);
    }
    const file = writeStoredKey(raw);
    out(`Stored the OrcaRouter API key in ${file}.`);
    return await confirmCredential(endpoints.apiBase);
  }

  // The browser path. Flow A by default; Flow B when this session cannot
  // receive a redirect, which the operator knows and the client cannot guess.
  const outOfBand = args.includes("--oob");
  const openBrowser = (url: string): void => {
    if (args.includes("--no-browser")) return;
    void import("./lib/orcarouter/connect.js").then((m) => m.openInBrowser(url));
  };
  try {
    const issued = outOfBand
      ? await connectOutOfBand({
          authBase: endpoints.authBase,
          appName: "ksor",
          onAuthorizeUrl: (url) => {
            out(`Open this in a browser, then paste the code back here:\n  ${url}`);
          },
          openBrowser,
          readCode: async () => await readLine("Code: "),
        })
      : await connectLoopback({
          authBase: endpoints.authBase,
          appName: "ksor",
          onAuthorizeUrl: (url) => {
            out(`Authorize this machine in your browser:\n  ${url}`);
          },
          openBrowser,
        });
    const warning = scopeWarning("api", issued.scope);
    if (warning !== null) err(`warning: ${warning}`);
    const file = writeStoredKey(issued.apiKey);
    out(`Connected. The key was stored in ${file} and minted for your account.`);
    return await confirmCredential(endpoints.apiBase);
  } catch (exc) {
    if (exc instanceof OrcaAuthError) {
      return refuse(`error: ${exc.slug} (${exc.kind})\n${exc.message}\n  fix: ${exc.fix}`);
    }
    throw exc;
  }
}

/**
 * Prove the credential works by fetching the model catalog — a GET, so it
 * bills nothing. Deliberately NOT an inference request: a settings flow that
 * spends the user's money to display a green tick has made a bad trade.
 */
async function confirmCredential(apiBase: string): Promise<number> {
  const catalog = await discoverCatalog({ apiBase, resolver: operatorResolver() });
  if (catalog.degraded) {
    err(
      `warning: the credential was stored, but the model catalog did not answer (${catalog.reason ?? "unknown"}) — ` +
        "the key may still be fine; check the network and run `ksor models`",
    );
    return 0;
  }
  out(`${catalog.models.length} models are available to this credential.`);
  return 0;
}

export async function runModels(args: readonly string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    out(MODELS_USAGE);
    return 0;
  }
  const capability = (flagValue(args, "--capability") ?? "chat") as Capability;
  const inputModality = flagValue(args, "--input") as InputModality | undefined;
  let endpoints;
  try {
    endpoints = resolveEndpoints();
  } catch (exc) {
    if (exc instanceof OrcaEndpointError) return env(exc.message);
    throw exc;
  }
  try {
    const catalog = await discoverCatalog({
      apiBase: endpoints.apiBase,
      resolver: operatorResolver(),
    });
    const options = selectModels(catalog.models, {
      capability,
      ...(inputModality === undefined ? {} : { inputModality }),
    });
    if (args.includes("--json")) {
      out(
        JSON.stringify(
          {
            source: catalog.source,
            degraded: catalog.degraded,
            reason: catalog.reason,
            capability,
            input_modality: inputModality ?? null,
            count: options.length,
            models: options.map((m) => ({
              id: m.id,
              name: m.name,
              context_length: m.contextLength,
              input_modalities: m.inputModalities,
              endpoint_types: m.endpointTypes,
              reasoning_efforts: m.reasoningEfforts,
            })),
          },
          null,
          2,
        ),
      );
      return 0;
    }
    if (catalog.degraded) {
      err(
        `DEGRADED: the live catalog did not answer (${catalog.reason ?? "unknown"}) — ` +
          "showing the built-in verified seed, NOT your account's list.",
      );
    }
    if (options.length === 0) {
      out(
        `no model is available for capability "${capability}"` +
          (inputModality === undefined ? "" : ` with ${inputModality} input`),
      );
      return 0;
    }
    for (const model of options) {
      const bits = [
        model.contextLength === null ? null : `${Math.round(model.contextLength / 1000)}k ctx`,
        model.inputModalities.length === 0 ? null : model.inputModalities.join("+"),
        model.reasoningEfforts.length === 0 ? null : `effort: ${model.reasoningEfforts.join("/")}`,
      ].filter((b): b is string => b !== null);
      out(`${model.id}${bits.length === 0 ? "" : `  — ${bits.join(", ")}`}`);
    }
    return 0;
  } catch (exc) {
    if (exc instanceof OrcaUnauthorizedError) {
      return refuse(
        "error: ksor-orcarouter-unauthorized\n" +
          "the OrcaRouter key was rejected (401) — it has been revoked, or the authorization was withdrawn\n" +
          "  note: an OrcaRouter key is durable and there is no refresh grant; this clears only " +
          "when a new authorization succeeds\n" +
          "  fix: run `ksor connect orcarouter` again, or paste a new key with --key",
      );
    }
    throw exc;
  }
}

function flagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("-")) return undefined;
  return value;
}

function refuse(message: string): number {
  err(message);
  return REFUSED;
}

function env(message: string): number {
  err(message);
  return ENVIRONMENT;
}
