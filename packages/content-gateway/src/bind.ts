/**
 * Binding the door's port, and saying what to do when it will not bind.
 *
 * A port already held is the likeliest first failure of a first run — a
 * `pnpm serve` still alive in another tab is enough — and it was the ONE
 * refusal in this CLI that named no remedy: the boot lines printed, and then
 *
 *     error: listen EADDRINUSE: address already in use 127.0.0.1:8080
 *
 * a bare Node errno with no `fix:` and no mention of `KSOR_MCP_PORT`, which the
 * scaffold's env.example carries commented out (first-hour walkthrough,
 * 2026-08-26). Product principle 4 says every failure states what is wrong, why
 * the rule exists, and how to fix it; this is the file where a bind does that.
 *
 * The exit code does NOT move: a bind failure stays exit 3, the environment,
 * because a port held by another process is the operator's machine and not a
 * bad configuration — the same reading `main.ts` has always had. So `code` is
 * carried through the wrapper rather than lost inside a new message, and
 * `main.ts` classifies exactly as before.
 */
import { serve, type ServerType } from "@hono/node-server";

/**
 * The adaptor's own fetch signature, derived from `serve` rather than
 * hand-written: it is not exported from the package root, and a hand annotation
 * wider than the value is a downgrade (AGENTS.md coding principle 2).
 */
export type FetchCallback = Parameters<typeof serve>[0]["fetch"];

/** A bind that failed, with the errno intact so the exit contract still reads it. */
export class BindError extends Error {
  override readonly name: string = "BindError";
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export interface Bind {
  readonly host: string;
  readonly port: number;
}

/**
 * The remedy for each way a listen fails, because the operator's next command
 * differs: a held port is answered by finding the holder or moving the door, a
 * privileged port by picking one above 1023, an unroutable host by fixing the
 * host. An errno with no remedy of its own still says what was attempted —
 * honest absence, never a guessed instruction.
 */
export function bindRefusal(code: string, bind: Bind): string {
  const where = `${bind.host}:${bind.port}`;
  switch (code) {
    case "EADDRINUSE":
      return (
        `cannot bind ${where} — another process is already listening there\n` +
        "  why: one process at a time may hold a port, so the record is not served until this " +
        "one binds. Nothing was started and nothing was changed\n" +
        `  fix: find what holds it — lsof -nP -iTCP:${bind.port} -sTCP:LISTEN — and stop it ` +
        "(a `ksor serve` left running in another terminal is the usual answer),\n" +
        `       or serve on a different port: KSOR_MCP_PORT=${bind.port + 1} ksor serve`
      );
    case "EACCES":
      return (
        `cannot bind ${where} — this process may not listen on that port\n` +
        "  why: ports below 1024 are privileged on Unix, and a container that drops " +
        "capabilities cannot take one\n" +
        "  fix: use a port above 1023 — KSOR_MCP_PORT=8080 ksor serve — and map it on the " +
        "host side (docker run -p 80:8080), which is where privilege belongs"
      );
    case "EADDRNOTAVAIL":
      return (
        `cannot bind ${where} — ${bind.host} is not an address on this machine\n` +
        "  why: a listener binds a LOCAL interface; a name that resolves elsewhere, or an " +
        "address this host does not hold, has nothing here to listen on\n" +
        "  fix: set KSOR_MCP_HOST to an address this machine holds — 127.0.0.1 for a local " +
        "run, 0.0.0.0 to accept on every interface"
      );
    default:
      return (
        `cannot bind ${where}: ${code}\n` +
        "  why: the door refuses to report itself serving on a port it never took\n" +
        "  fix: check KSOR_MCP_HOST and KSOR_MCP_PORT (or $PORT, which a container host " +
        `injects), then re-run — the errno above is the operating system's own: ${code}`
      );
  }
}

/**
 * Bind, or reject with a remedied `BindError`.
 *
 * AWAITED by the caller on purpose: EADDRINUSE / EACCES / an unroutable host
 * must reach the CLI's exit contract, not escape as an uncaught 'error' event
 * and a stack trace (review, 2026-08-19). Once the bind succeeds the bind-time
 * rejecter is detached — a settled promise swallows it — and a PERSISTENT
 * handler takes over, so a post-bind server error (EMFILE, a socket fault) is
 * logged instead of vanishing.
 */
export async function listenOrExplain(fetch: FetchCallback, bind: Bind): Promise<ServerType> {
  return await new Promise<ServerType>((resolve, reject) => {
    const server = serve({ fetch, hostname: bind.host, port: bind.port }, () => {
      server.off("error", onBindError);
      server.on("error", (err: Error) => console.error(`gateway server error: ${err.message}`));
      resolve(server);
    });
    function onBindError(error: Error): void {
      const code = (error as { code?: unknown }).code;
      reject(
        typeof code === "string" ? new BindError(bindRefusal(code, bind), code) : (error as Error),
      );
    }
    server.once("error", onBindError);
  });
}
