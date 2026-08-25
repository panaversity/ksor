/**
 * What the door checks about its own surface, before it opens.
 *
 * The registration file is adopter-owned code. It can rename tools, drop them,
 * add its own — all intended. What it must not do is serve a ksor tool that has
 * quietly stopped carrying a guarantee: a `search` whose description no longer
 * says "do not fall back on model knowledge". That would look completely healthy
 * — tools/list answers, searches return hits, every database oracle stays green
 * — and the only symptom is an agent that stops abstaining and starts obeying
 * instructions written into the corpus.
 *
 * The DESCRIPTION is what is inspected. This used to claim it also checked "an
 * output schema that no longer carries `provenance`", which it has never done:
 * an output schema is read only to RECOGNISE which ksor tool a record renamed,
 * never for its contents (security review, 2026-08-25). The envelope's shape is
 * held by the handlers, which the record cannot rewrite.
 *
 * So the guarantee is VERIFIED rather than prevented. That is this codebase's
 * posture everywhere else (assertGovernanceServable, decision 19's both-surfaces
 * refusal): hand the code over, then refuse to boot on a state that breaks it.
 *
 * It inspects over the PROTOCOL rather than the SDK's internals — `tools/list`
 * through an in-memory transport pair — because the SDK's tool registry is
 * private, and because the protocol is what an agent actually receives. Assert
 * on shipped bytes, not on what we think we registered.
 */

import {
  InMemoryTransport,
  LATEST_PROTOCOL_VERSION,
  McpServer,
} from "@modelcontextprotocol/server";

import { GatewayConfigError } from "./gateway-load.js";
import { FLOOR, type HandlerKind } from "./tools.js";

interface JsonRpcReply {
  readonly id?: number | string;
  readonly result?: { readonly tools?: unknown[] };
  readonly error?: { readonly message?: string };
}

/** A tool as `tools/list` describes it — the subset the check reads. */
interface ListedTool {
  readonly name: string;
  readonly description?: string | undefined;
  readonly inputSchema?: { readonly properties?: Record<string, unknown> } | undefined;
  readonly outputSchema?: { readonly properties?: Record<string, unknown> } | undefined;
}

/**
 * The floor each ksor tool must still be carrying, keyed by the property set its
 * output schema is recognised by.
 *
 * Recognition is by SHAPE rather than by name, because the name is exactly what
 * an adopter is invited to change: `search_handbook` is still the search tool.
 */
const EXPECTED: ReadonlyArray<{
  readonly kind: "search" | "outline" | "read";
  readonly marker: string;
  readonly floor: string;
}> = [
  { kind: "search", marker: "hits", floor: FLOOR.search },
  { kind: "outline", marker: "nodes", floor: FLOOR.outline },
  { kind: "read", marker: "remaining_outline", floor: FLOOR.read },
];

/**
 * Read `tools/list` back from a built server, over a real transport pair.
 *
 * Raw JSON-RPC rather than the client SDK on purpose: `@modelcontextprotocol/client`
 * is a devDependency here and is absent from the published `@panaversity/ksor`,
 * so a boot check that needed it would work in CI and throw on an adopter's
 * install. The handshake is paid in full — the MCP lifecycle permits a server to
 * reject requests before `initialize`, and a probe that relies on it not doing so
 * would start failing at BOOT, taking every deployment down at once, on an SDK
 * patch that changed nothing we own.
 */
export async function listServedTools(server: McpServer): Promise<readonly ListedTool[]> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);

  const pending = new Map<number, (value: JsonRpcReply) => void>();
  clientSide.onmessage = (message: unknown) => {
    const reply = message as JsonRpcReply;
    const resolve = typeof reply.id === "number" ? pending.get(reply.id) : undefined;
    if (resolve) {
      pending.delete(reply.id as number);
      resolve(reply);
    }
  };
  await clientSide.start();

  const call = async (id: number, method: string, params: unknown): Promise<JsonRpcReply> => {
    const answered = new Promise<JsonRpcReply>((resolve, reject) => {
      pending.set(id, resolve);
      // A probe that hangs would hold the boot open forever, which reads as a
      // deploy that never becomes ready rather than as a broken gateway file.
      setTimeout(() => reject(new Error(`gateway self-check timed out on ${method}`)), 10_000);
    });
    await clientSide.send({ jsonrpc: "2.0", id, method, params } as never);
    return answered;
  };

  try {
    await call(1, "initialize", {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "ksor-boot-check", version: "1" },
    });
    await clientSide.send({ jsonrpc: "2.0", method: "notifications/initialized" } as never);
    const listed = await call(2, "tools/list", {});
    return (listed.result?.tools ?? []) as readonly ListedTool[];
  } finally {
    // Close the PROBE's side only. Pointing this at the live server would tear
    // the door down; safe today because the door builds one server per request.
    await clientSide.close();
    await server.close();
  }
}

/**
 * Refuse a surface that has lost a guarantee.
 *
 * Deliberately checks VALUES, never key presence: in-process the reply is passed
 * by reference, so every optional key exists with the value `undefined` — a
 * `"description" in tool` test passes for a tool that has none, and then differs
 * from the wire, where serialization drops it.
 */
export function assertSurfaceGoverned(
  tools: readonly ListedTool[],
  registered?: Readonly<Record<HandlerKind, number>>,
): void {
  for (const { kind, marker, floor } of EXPECTED) {
    const tool = servedAs(tools, marker);
    if (tool === undefined) {
      // A record is allowed to drop a tool entirely — no handler, nothing to
      // verify. But if it CREATED the handler and no served tool carries that
      // kind's marker, the tool is being served through a surface this check
      // cannot inspect, and skipping it would mean the floor was never checked
      // on a door that boots clean. Proved by execution: a registration that
      // renamed `hits` to `results`, and one that omitted `outputSchema`
      // entirely, both booted with the floor deleted.
      if (registered !== undefined && registered[kind] > 0) {
        throw new GatewayConfigError(
          "ksor-gateway-unverifiable",
          `this registration creates the ksor ${kind} handler, but no served tool carries the ` +
            `\`${marker}\` property its output schema is recognised by — so the door cannot ` +
            "check that the tool still carries its framework description, which is what tells " +
            "an agent to abstain rather than fall back on model knowledge and that hit content " +
            "is untrusted. Declare the tool's `outputSchema` as the framework's " +
            `(${kind.toUpperCase()}_OUTPUT), or drop the handler if you no longer serve it. ` +
            "Renaming the TOOL is fine; the output schema is what identifies it",
        );
      }
      continue;
    }

    if (typeof tool.description !== "string" || !tool.description.includes(floor)) {
      throw new GatewayConfigError(
        "ksor-gateway-floor-missing",
        `the ${kind} tool is served as "${tool.name}" without its framework description. ` +
          `That text tells an agent how to read an abstention and that corpus content is ` +
          `untrusted — without it this record answers without ever declining, and follows ` +
          `instructions written into its own documents. Put FLOOR.${kind} back: a record's ` +
          `own prose goes ABOVE it, as \`\${yourText}\\n\\n\${FLOOR.${kind}}\`, never instead of it`,
      );
    }
  }
}

/**
 * The tool a shape marker recognises, whatever the record called it.
 *
 * Split out because both the refusal and the notice ask the same question, and
 * two copies of "which one is the search tool" is how a rename starts being
 * handled correctly in one place and not the other.
 */
function servedAs(tools: readonly ListedTool[], marker: string): ListedTool | undefined {
  return tools.find(
    (t) => t.outputSchema?.properties !== undefined && marker in t.outputSchema.properties,
  );
}

/**
 * What the door tells an operator about — without refusing.
 *
 * The distinction is the point. A missing FLOOR is a broken guarantee and
 * refuses; a missing `min_trust_tier` is a MISSING CAPABILITY, and every
 * guarantee still holds without it: the handler supplies `unverified` and the
 * deployment's own floor is untouched. Refusing would take a working record
 * off the air for a parameter that did not exist when its registration was
 * emitted — and the registration is adopter-owned code (decision 23), so
 * "regenerate it" is not something this package may do on their behalf.
 *
 * What IS lost is the only way a caller can ask to be answered from reviewed
 * material, and an absence nobody is told about is one nobody fixes.
 */
export function noticeSurface(tools: readonly ListedTool[], report: (line: string) => void): void {
  const search = servedAs(tools, "hits");
  if (search === undefined) return;
  if (
    search.inputSchema?.properties !== undefined &&
    "min_trust_tier" in search.inputSchema.properties
  ) {
    return;
  }
  report(
    `notice: the search tool is served as "${search.name}" without a \`min_trust_tier\` ` +
      "parameter, so a caller cannot ask to be answered only from documents someone has " +
      "reviewed. Nothing is weakened by this — the handler still applies `unverified` and this " +
      "deployment's own floor — but the capability is absent. Add it to that tool's inputSchema:\n" +
      "    min_trust_tier: z.enum(TRUST_TIERS).optional(),\n" +
      "  (import TRUST_TIERS from the same place as FLOOR; delete system/gateways/content.ts to " +
      "take the current default registration instead)",
  );
}

export interface VerifyOptions {
  /** Where boot NOTICES go. Defaults to stderr, beside every other boot line. */
  readonly report?: (line: string) => void;
  /**
   * How many ksor handlers the registration actually created (`tallyHandlers`).
   *
   * Omitted means the caller could not observe it and the unverifiable check is
   * skipped — which is how the in-tree suites that build a server directly still
   * work. `compose` always supplies it, so the production boot is covered.
   */
  readonly registered?: Readonly<Record<HandlerKind, number>>;
}

/** Build, inspect, refuse — the whole boot check, in one call. */
export async function verifyGatewaySurface(
  server: McpServer,
  options: VerifyOptions = {},
): Promise<readonly ListedTool[]> {
  const tools = await listServedTools(server);
  if (tools.length === 0) {
    throw new GatewayConfigError(
      "ksor-gateway-no-tools",
      "this registration registers no tools, so the door would boot, answer tools/list with " +
        "nothing, and look healthy while serving nobody. Register at least one, or delete " +
        "system/gateways/content.ts to take the default registration",
    );
  }
  assertSurfaceGoverned(tools, options.registered);
  noticeSurface(tools, options.report ?? console.error);
  return tools;
}
