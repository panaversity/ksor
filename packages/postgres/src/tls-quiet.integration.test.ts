/**
 * Booting must not print the driver's SECURITY WARNING at an adopter who wrote
 * an ordinary connection string.
 *
 * `pg-connection-string` emits a multi-line `process.emitWarning` whenever it
 * parses `sslmode=require|prefer|verify-ca`, telling the operator those modes
 * adopt libpq semantics in a future major. The remedy is one word, so
 * `pinnedTlsDsn` writes it — and this asserts the consequence rather than the
 * intent: with the pin, the warning does not fire; without it, it does.
 *
 * The pool is CHECKED OUT, not merely constructed: pg parses the DSN when it
 * builds a client. The host does not resolve and the connect fails, which is
 * fine — the warning fires during the parse, before any socket.
 *
 * In a CHILD PROCESS, because `process.emitWarning` is global: a listener in a
 * parallel vitest worker would catch warnings from unrelated suites, and this
 * must fail only when the pin stops working.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const REMOTE = "postgresql://u:p@db.example.com:5432/x?sslmode=require&channel_binding=require";

/**
 * Build a pool from `dsn` in a fresh process and report every process warning.
 * The pool never connects — the warning fires while the DSN is PARSED — so this
 * touches no network.
 */
function warningsFor(dsn: string, pin: boolean): readonly string[] {
  const script = `
    const warnings = [];
    process.on("warning", (w) => warnings.push(String(w.message).split("\\n")[0]));
    const pg = (await import("pg")).default;
    const { pinnedTlsDsn } = await import("./db.ts");  // cwd is this directory
    const dsn = ${JSON.stringify(dsn)};
    const pool = new pg.Pool({ connectionString: ${pin ? "pinnedTlsDsn(dsn)" : "dsn"} });
    pool.on("error", () => {});
    // pg parses the connection string when a CLIENT is built, not when the pool
    // is — so the checkout is what makes the driver read sslmode. It fails to
    // resolve db.example.com, which is fine: the warning fires before that.
    await pool.connect().then((c) => c.release()).catch(() => {});
    await new Promise((r) => setTimeout(r, 200));
    console.log(JSON.stringify(warnings));
    process.exit(0);
  `;
  const out = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings=ExperimentalWarning",
      "--input-type=module",
      "-e",
      script,
    ],
    { cwd: here, encoding: "utf8" },
  );
  return JSON.parse(out.trim().split("\n").at(-1) ?? "[]") as string[];
}

describe("the boot is quiet about TLS", () => {
  it("the driver DOES warn on the DSN an adopter writes — the warning is real", () => {
    const raw = warningsFor(REMOTE, false);
    expect(
      raw.join("\n"),
      "pg stopped warning on sslmode=require; if the pin is now unnecessary, retire it deliberately",
    ).toMatch(/SECURITY WARNING/);
  });

  it("and it does NOT warn once the mode is spelled out", () => {
    expect(warningsFor(REMOTE, true).join("\n")).not.toMatch(/SECURITY WARNING/);
  });
});
