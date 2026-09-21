/**
 * The console's HTTP server — loopback only, token-guarded, and the ONE place
 * the browser talks to a credential.
 *
 * The key itself never leaves this process. The page can ask whether a
 * credential is configured (it gets a MASKED summary), it can submit a new one,
 * and it can start a browser authorization — but no endpoint returns a key, and
 * the model catalog is fetched HERE and handed to the page as a filtered list of
 * metadata. That is the same boundary the rest of the repo keeps for the DSN:
 * the browser is told what it needs to render, not what it would need to
 * impersonate the operator.
 *
 * The `x-ksor-token` header is a loopback CSRF guard, not a credential. The
 * bind address is the real control (a port only this machine can reach); the
 * token stops a page the user happens to have open from driving the console by
 * guessing that port — a real attack on a fixed-port server, and the reason the
 * port is ephemeral AND the token exists.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";

import { discoverCatalog, selectModels, type Capability, type InputModality } from "./catalog.js";
import { looksLikeOrcaKey, type IssuedKey } from "./credential.js";
import { connectLoopback, OrcaAuthError } from "./connect.js";
import { resolveEndpoints } from "./endpoints.js";
import { catalogPayload, renderConsolePage } from "./console-page.js";
import { OrcaUnauthorizedError } from "./transport.js";
import {
  clearStoredKey,
  currentSummary,
  operatorResolver,
  ORCA_KEY_VAR,
  writeStoredKey,
} from "./store.js";

const KEY_CONSOLE_URL = "https://www.orcarouter.ai/console";
const MAX_BODY_BYTES = 64 * 1024;

export interface ConsoleOptions {
  readonly appName: string;
  /** Injected in tests: a fake consent screen. Defaults to the real flow. */
  readonly connect?: (opts: {
    onAuthorizeUrl: (url: string) => void;
    signal: AbortSignal;
  }) => Promise<IssuedKey>;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface ConsoleHandle {
  readonly url: string;
  readonly token: string;
  close(): Promise<void>;
}

export async function startConsole(opts: ConsoleOptions): Promise<ConsoleHandle> {
  const token = randomBytes(24).toString("base64url");
  const endpoints = resolveEndpoints();

  /** The one authorization that may be in flight, and the way to stop it. */
  let pending: { cancel: () => void } | null = null;
  /** The last outcome, read once by the poll that asked for it. */
  let outcome: { status: string; message?: string } | null = null;

  const server: Server = createServer((req, res) => {
    void handle(req, res);
  });

  const json = (res: ServerResponse, status: number, body: unknown): void => {
    res
      .writeHead(status, { "content-type": "application/json; charset=utf-8" })
      .end(JSON.stringify(body));
  };

  const readBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY_BYTES) return {};
      chunks.push(Buffer.from(chunk as Buffer));
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (text === "") return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    try {
      // A page load carries the token in the query once (that is the URL the
      // CLI printed); everything the page then does carries it as a header.
      if (url.pathname === "/" && req.method === "GET") {
        const given = url.searchParams.get("token") ?? req.headers["x-ksor-token"];
        if (given !== token) {
          res.writeHead(403, { "content-type": "text/plain; charset=utf-8" }).end("forbidden");
          return;
        }
        const summary = currentSummary();
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(
          renderConsolePage({
            appName: opts.appName,
            authBase: endpoints.authBase,
            apiBase: endpoints.apiBase,
            keyVar: ORCA_KEY_VAR,
            maskedKey: summary === null ? null : summary.masked,
            credentialSource: summary === null ? null : summary.source,
            consoleUrl: KEY_CONSOLE_URL,
            token,
          }),
        );
        return;
      }

      if (req.headers["x-ksor-token"] !== token) {
        json(res, 403, { message: "forbidden" });
        return;
      }

      if (url.pathname === "/api/status" && req.method === "GET") {
        const summary = currentSummary();
        json(res, 200, {
          masked_key: summary?.masked ?? null,
          credential_source: summary?.source ?? null,
          catalog: await catalogFor(endpoints.apiBase, "chat", undefined, opts.fetchImpl),
        });
        return;
      }

      if (url.pathname === "/api/catalog" && req.method === "GET") {
        const capability = (url.searchParams.get("capability") ?? "chat") as Capability;
        const raw = url.searchParams.get("input");
        const input = raw === null || raw === "" ? undefined : (raw as InputModality);
        json(res, 200, await catalogFor(endpoints.apiBase, capability, input, opts.fetchImpl));
        return;
      }

      if (url.pathname === "/api/key" && req.method === "POST") {
        const { key } = (await readBody(req)) as { key?: unknown };
        if (typeof key !== "string" || key === "") {
          json(res, 400, { message: "No key was submitted." });
          return;
        }
        if (!looksLikeOrcaKey(key)) {
          // FORMAT only — it cannot and does not claim the key works.
          json(res, 400, {
            message: "That does not look like an OrcaRouter key (expected sk-orca-…).",
          });
          return;
        }
        writeStoredKey(key);
        json(res, 200, { message: `Saved. ${ORCA_KEY_VAR} now holds it.` });
        return;
      }

      if (url.pathname === "/api/key" && req.method === "DELETE") {
        const removed = clearStoredKey();
        json(res, 200, {
          message: removed ? "Credential removed." : "There was nothing to remove.",
        });
        return;
      }

      if (url.pathname === "/api/connect/start" && req.method === "POST") {
        if (pending !== null) {
          json(res, 409, { message: "An authorization is already in progress." });
          return;
        }
        const controller = new AbortController();
        pending = { cancel: () => controller.abort() };
        outcome = null;

        // The URL is known only once the loopback listener has bound its port,
        // so the response waits for it — the page must not be handed an empty
        // box to copy.
        let announce: (url: string) => void = () => {};
        const urlReady = new Promise<string>((resolve) => {
          announce = resolve;
        });
        void runConnect(opts, endpoints.authBase, controller.signal, announce)
          .then((issued) => {
            writeStoredKey(issued.apiKey);
            outcome = { status: "done", message: "Connected. The key is stored and now in use." };
          })
          .catch((exc: unknown) => {
            outcome = classify(exc);
          })
          .finally(() => {
            pending = null;
          });

        // A slow or failed flow must not hold this response open: whatever has
        // not arrived by the deadline is reported by the poll instead.
        const url = await Promise.race([
          urlReady,
          new Promise<string>((resolve) => setTimeout(() => resolve(""), 5000)),
        ]);
        json(res, 200, { url, out_of_band: false });
        return;
      }

      if (url.pathname === "/api/connect/poll" && req.method === "GET") {
        if (outcome !== null) {
          const answer = outcome;
          outcome = null;
          json(res, 200, answer);
          return;
        }
        json(res, 200, { status: pending === null ? "idle" : "pending" });
        return;
      }

      if (url.pathname === "/api/connect/cancel" && req.method === "POST") {
        // Settles the pending promise AND records the outcome, so a restore
        // from the back-forward cache finds the login over rather than waiting
        // on a listener the page will never come back to.
        pending?.cancel();
        pending = null;
        outcome = { status: "cancelled", message: "Authorization cancelled." };
        json(res, 200, { status: "cancelled" });
        return;
      }

      json(res, 404, { message: "not found" });
    } catch (exc) {
      if (exc instanceof OrcaUnauthorizedError) {
        json(res, 401, { message: "The stored OrcaRouter key was rejected. Connect again." });
        return;
      }
      json(res, 500, { message: exc instanceof Error ? exc.message : "error" });
    }
  }

  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the console bound no port");
  return {
    url: `http://127.0.0.1:${address.port}/?token=${token}`,
    token,
    close: async () => {
      pending?.cancel();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

async function runConnect(
  opts: ConsoleOptions,
  authBase: string,
  signal: AbortSignal,
  onAuthorizeUrl: (url: string) => void,
): Promise<IssuedKey> {
  if (opts.connect !== undefined) return await opts.connect({ onAuthorizeUrl, signal });
  return await connectLoopback({
    authBase,
    appName: opts.appName,
    signal,
    onAuthorizeUrl,
    // The console IS the browser tab: it shows the URL for the user to open
    // rather than shelling out to an opener, so the same page works over SSH
    // with a forwarded port and on a machine with no default browser.
    openBrowser: () => {},
    ...(opts.fetchImpl === undefined ? {} : { fetchImpl: opts.fetchImpl }),
    ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
  });
}

/** A failure, said in the page's language, with no key and no verifier in it. */
function classify(exc: unknown): { status: string; message: string } {
  if (exc instanceof OrcaAuthError) {
    return {
      status: exc.kind === "cancelled" ? "cancelled" : "error",
      message: `${exc.message} — ${exc.fix}`,
    };
  }
  return { status: "error", message: exc instanceof Error ? exc.message : "authorization failed" };
}

/**
 * The catalog the BROWSER is allowed to see: metadata only, never the key, and
 * always FILTERED to the capability asked for. An empty capability-appropriate
 * set is returned as an empty list rather than as the unfiltered one, because
 * the page draws a dropdown from exactly this.
 */
async function catalogFor(
  apiBase: string,
  capability: Capability,
  input: InputModality | undefined,
  fetchImpl: typeof fetch | undefined,
): Promise<{
  degraded: boolean;
  reason: string | null;
  api_base: string;
  capability: Capability;
  input_modality: InputModality | null;
  catalog_source: "live" | "seed";
  models: unknown[];
  count: number;
}> {
  const catalog = await discoverCatalog({
    apiBase,
    resolver: operatorResolver(),
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
  });
  const options = selectModels(catalog.models, {
    capability,
    ...(input === undefined ? {} : { inputModality: input }),
  });
  return {
    degraded: catalog.degraded,
    reason: catalog.reason,
    api_base: apiBase,
    capability,
    input_modality: input ?? null,
    catalog_source: catalog.source,
    // `catalogPayload` escapes `<`, so a model name from the vendor cannot
    // close a tag in the page.
    models: JSON.parse(catalogPayload(options)) as unknown[],
    count: options.length,
  };
}
