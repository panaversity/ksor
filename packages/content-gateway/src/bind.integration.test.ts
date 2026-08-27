/**
 * The likeliest first-run failure of the whole walk, and the one refusal in
 * this CLI that named no remedy.
 *
 * `ksor serve` printed its boot lines and then:
 *
 *     error: listen EADDRINUSE: address already in use 127.0.0.1:8080
 *
 * A bare Node errno — no `fix:`, no mention of `KSOR_MCP_PORT` (which the
 * scaffold's env.example carries, commented out), nothing to try next. Every
 * other refusal in this CLI names its remedy (product principle 4), and this is
 * the one an adopter meets while a `pnpm serve` they forgot about is still
 * running in another tab (first-hour walkthrough, 2026-08-26).
 *
 * A real socket, so the errno is the operating system's rather than a fixture's
 * idea of it — the message is built from `code`, and a code this never sees is
 * a message nobody ever reads.
 */
import { createServer, type Server } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { bindRefusal, BindError, listenOrExplain } from "./bind.js";

let holder: Server | null = null;
afterEach(async () => {
  const s = holder;
  holder = null;
  if (s !== null) await new Promise<void>((resolve) => s.close(() => resolve()));
});

/** Occupy a loopback port and report which one. */
async function occupy(): Promise<number> {
  const server = createServer();
  holder = server;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

describe("a port that is already held", () => {
  it("refuses with the remedy, and stays an ENVIRONMENT failure", async () => {
    const port = await occupy();
    const failure = await listenOrExplain(() => new Response("never reached"), {
      host: "127.0.0.1",
      port,
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure, "binding a held port must reject").toBeInstanceOf(BindError);
    const error = failure as BindError;
    // The exit contract reads `code`: a bind failure is exit 3 (the operator's
    // environment), never exit 1. Wrapping the error must not lose it.
    expect(error.code).toBe("EADDRINUSE");
    expect(error.message, error.message).toContain(`127.0.0.1:${port}`);
    expect(error.message, "the variable that moves the port").toContain("KSOR_MCP_PORT");
    expect(error.message, "the remedy, not just the fault").toMatch(/\n {2}fix: /);
    // Naming the process that holds it is what turns "something is there" into
    // one command to run.
    expect(error.message, "how to find what holds it").toContain("lsof");
  });

  it("binds and resolves when the port is free, so the remedy is reachable", async () => {
    const port = await occupy();
    const holderPort = port;
    // Release it, then bind the same port through the door's own path.
    await new Promise<void>((resolve) => holder!.close(() => resolve()));
    holder = null;
    const server = await listenOrExplain(() => new Response("ok"), {
      host: "127.0.0.1",
      port: holderPort,
    });
    try {
      const response = await fetch(`http://127.0.0.1:${holderPort}/`);
      expect(await response.text()).toBe("ok");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("bindRefusal — one message per way a bind fails", () => {
  const bind = { host: "127.0.0.1", port: 8080 };

  it("EACCES names the privilege, not the port variable alone", () => {
    const message = bindRefusal("EACCES", { host: "0.0.0.0", port: 80 });
    expect(message).toContain("0.0.0.0:80");
    expect(message).toMatch(/privileg|1024/);
    expect(message).toMatch(/\n {2}fix: /);
  });

  it("EADDRNOTAVAIL names the HOST variable, because the port is not what is wrong", () => {
    const message = bindRefusal("EADDRNOTAVAIL", { host: "10.1.2.3", port: 8080 });
    expect(message).toContain("10.1.2.3");
    expect(message).toContain("KSOR_MCP_HOST");
    expect(message).toMatch(/\n {2}fix: /);
  });

  it("an errno with no remedy of its own still says what was attempted", () => {
    const message = bindRefusal("EPERM", bind);
    expect(message).toContain("127.0.0.1:8080");
    expect(message).toContain("EPERM");
  });
});
