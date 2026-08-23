export { buildServer, SERVER_NAME } from "./server.js";
export { compose, type Composition } from "./compose.js";
export { main, GATEWAY_VERSION } from "./main.js";
export { runHttp } from "./http.js";
export {
  contentTools,
  defineGateway,
  GatewayConfigError,
  resolveGateway,
  TOOL_DEFAULTS,
  type ContentToolKind,
  type GatewayConfig,
  type ResolvedGateway,
  type ResolvedTool,
  type SearchCustomization,
  type ToolCustomization,
  type ToolDescriptor,
} from "./gateway-config.js";
export { GATEWAY_FILE, gatewayPathFor, loadGateway } from "./gateway-load.js";
