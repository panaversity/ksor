/**
 * A local stand-in for the OrcaRouter auth origin, for the suites that drive a
 * connect flow end to end.
 *
 * It is NOT a mock of our client — it is a fake SERVER, which is the only way
 * to test the half of the protocol the client owns: what it puts on the
 * authorize URL, where it posts the exchange, and what it does with each of the
 * statuses it can be handed. A suite that stubbed `fetch` instead would assert
 * our own idea of the protocol rather than the server's answer to it.
 *
 * Consent is never faked: this plays the BROWSER, delivering exactly the
 * callback the real consent screen delivers. Nothing here approves anything on
 * a user's behalf, and no reachable OrcaRouter endpoint is contacted.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface ExchangeRequest {
  readonly path: string;
  readonly method: string;
  readonly authorization: string | null;
  readonly body: Record<string, unknown>;
}

export interface ConsentBehaviour {
  /** `deny` plays the user declining on the consent screen. */
  readonly outcome?: "approve" | "deny";
  /** Override the state echoed back, to exercise the CSRF check. */
  readonly stateOverride?: string;
  /** Replace the exchange response entirely. */
  readonly exchange?: (req: ExchangeRequest) => { status: number; body: unknown };
}

export interface FakeAuthOrigin {
  readonly origin: string;
  readonly requests: ExchangeRequest[];
  readonly authorizeUrls: URL[];
  /** The code the consent screen last minted — what a human would have read. */
  lastCode(): string | null;
  close(): Promise<void>;
}

export const FAKE_ISSUED_KEY = "sk-orca-minted-by-the-fake-consent-screen-0001";

export async function startFakeAuthOrigin(
  behaviour: ConsentBehaviour = {},
): Promise<FakeAuthOrigin> {
  const requests: ExchangeRequest[] = [];
  const authorizeUrls: URL[] = [];
  let minted = 0;
  let lastCode: string | null = null;
  const spent = new Set<string>();

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");

      if (url.pathname === "/auth") {
        authorizeUrls.push(url);
        const callbackUrl = url.searchParams.get("callback_url") ?? "";
        const state = behaviour.stateOverride ?? url.searchParams.get("state") ?? "";
        if (behaviour.outcome === "deny") {
          res.writeHead(200).end("denied");
          if (callbackUrl !== "oob") {
            void fetch(`${callbackUrl}?error=access_denied&state=${encodeURIComponent(state)}`);
          }
          return;
        }
        const code = `code-${(minted += 1)}`;
        lastCode = code;
        res.writeHead(200).end("consent screen");
        // `oob` is not an address: the real screen DISPLAYS the code and the
        // human carries it back. Every other value is a callback_url and the
        // browser GETs it.
        if (callbackUrl !== "oob") {
          void fetch(`${callbackUrl}?code=${code}&state=${encodeURIComponent(state)}`);
        }
        return;
      }

      if (url.pathname === "/api/v1/auth/keys") {
        const body = raw === "" ? {} : (JSON.parse(raw) as Record<string, unknown>);
        const request: ExchangeRequest = {
          path: url.pathname,
          method: req.method ?? "",
          authorization: req.headers["authorization"] ?? null,
          body,
        };
        requests.push(request);
        if (behaviour.exchange !== undefined) {
          const out = behaviour.exchange(request);
          res.writeHead(out.status, { "content-type": "application/json" });
          res.end(JSON.stringify(out.body));
          return;
        }
        const code = String(body["code"] ?? "");
        if (spent.has(code)) {
          // Single-use with a 10 minute TTL: a second presentation is a 403.
          res.writeHead(403, { "content-type": "application/json" });
          res.end(
            JSON.stringify({ error: "invalid_grant", error_description: "code already used" }),
          );
          return;
        }
        spent.add(code);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ key: FAKE_ISSUED_KEY, user_id: "12345", scope: "api" }));
        return;
      }

      res.writeHead(404).end("not found");
    });
  };

  const server: Server = createServer(handler);
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the fake bound no port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    authorizeUrls,
    lastCode: () => lastCode,
    close: async () => {
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

/** Play the browser by fetching the authorize URL the client produced. */
export function browserAgainst(fake: FakeAuthOrigin): (url: string) => void {
  void fake;
  return (url: string): void => {
    void fetch(url).catch(() => {
      /* the assertion lands on the flow, not on this */
    });
  };
}
