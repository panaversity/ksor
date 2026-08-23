/**
 * What the door checks about its own surface, before it opens.
 *
 * The registration file is adopter-owned code. It can rename tools, drop them,
 * add its own — all intended. What it must not do is serve a ksor tool that has
 * quietly stopped carrying a guarantee: a `search` whose description no longer
 * says "do not fall back on model knowledge", or whose output schema no longer
 * carries `provenance`. Both would look completely healthy — tools/list answers,
 * searches return hits, every database oracle stays green — and the only symptom
 * is an agent that stops abstaining and starts obeying instructions written into
 * the corpus.
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
import { FLOOR } from "./tools.js";

interface JsonRpcReply {
  readonly id?: number | string;
  readonly result?: { readonly tools?: unknown[] };
  readonly error?: { readonly message?: string };
}

/** A tool as `tools/list` describes it — the subset the check reads. */
interface ListedTool {
  readonly name: string;
  readonly description?: string | undefined;
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
export function assertSurfaceGoverned(tools: readonly ListedTool[]): void {
  for (const { kind, marker, floor } of EXPECTED) {
    const tool = tools.find(
      (t) => t.outputSchema?.properties !== undefined && marker in t.outputSchema.properties,
    );
    // A record is allowed to drop a tool entirely; only a tool that IS served
    // has to be intact.
    if (tool === undefined) continue;

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

/** Build, inspect, refuse — the whole boot check, in one call. */
export async function verifyGatewaySurface(server: McpServer): Promise<readonly ListedTool[]> {
  const tools = await listServedTools(server);
  if (tools.length === 0) {
    throw new GatewayConfigError(
      "ksor-gateway-no-tools",
      "this registration registers no tools, so the door would boot, answer tools/list with " +
        "nothing, and look healthy while serving nobody. Register at least one, or delete " +
        "system/gateways/content.ts to take the default registration",
    );
  }
  assertSurfaceGoverned(tools);
  return tools;
}
