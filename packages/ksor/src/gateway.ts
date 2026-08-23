/**
 * The public gateway surface: `@panaversity/ksor/gateway`.
 *
 * This is what an adopter's `system/gateways/content.ts` imports. It is
 * deliberately DATA and types only — no handlers, no schemas, no runtime the
 * adopter could hold a reference to. The CLI bundles the kernel, so this module
 * is resolved a SECOND time inside the adopter's project; plain data has no
 * identity, so the two copies cannot disagree.
 */

export {
  contentTools,
  defineGateway,
  GatewayConfigError,
  type ContentToolKind,
  type GatewayConfig,
  type ResolvedGateway,
  type ResolvedTool,
  type SearchCustomization,
  type ToolCustomization,
  type ToolDescriptor,
} from "@panaversity/ksor-content-gateway";
