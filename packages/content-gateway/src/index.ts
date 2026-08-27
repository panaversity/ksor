export {
  buildServer,
  composeInstructions,
  recordIsUndescribed,
  type Registration,
} from "./server.js";
export { compose, type Composition } from "./compose.js";
export { main, GATEWAY_VERSION } from "./main.js";
export { runHttp } from "./http.js";
export { GATEWAY_FILE, GatewayConfigError, gatewayPathFor, loadGateway } from "./gateway-load.js";
export {
  assertSurfaceGoverned,
  listServedTools,
  noticeSurface,
  verifyGatewaySurface,
  type VerifyOptions,
} from "./gateway-verify.js";
export { default as buildDefaultGateway } from "./default-gateway.js";
export * from "./gateway-api.js";
