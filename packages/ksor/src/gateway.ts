/**
 * The public gateway surface: `@panaversity/ksor/gateway`.
 *
 * The ONE import an adopter's `system/gateways/content.ts` needs. It carries
 * `z` and `McpServer` too, so a registration file stays a FILE — no package,
 * no build step, and no dependencies the scaffold would have to declare. See
 * `gateway-api.ts` for why that re-export is deliberate rather than lazy.
 */

export * from "@panaversity/ksor-content-gateway/gateway-api";
