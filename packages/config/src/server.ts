/**
 * Server-side configuration with environment variable support
 * USE IN: web-server, mcp-server (Node.js only)
 */

import {
  WEB_SERVER_PORT,
  WEB_DASHBOARD_PORT,
  ENV_VAR_NAMES,
  API_VERSION,
  API_PREFIX,
  CORS_ORIGINS,
} from './constants.js';

/**
 * Server configuration interface
 */
export interface ServerConfig {
  readonly port: number;
  readonly apiVersion: string;
  readonly apiPrefix: string;
  corsOrigins: string[];
}

/**
 * Get web server port with environment override
 */
export function getWebServerPort(): number {
  const envPort = process.env[ENV_VAR_NAMES.WEB_SERVER_PORT];
  return envPort !== undefined ? parseInt(envPort, 10) : WEB_SERVER_PORT;
}

/**
 * Get web dashboard port with environment override
 */
export function getWebDashboardPort(): number {
  const envPort = process.env[ENV_VAR_NAMES.WEB_DASHBOARD_PORT];
  return envPort !== undefined ? parseInt(envPort, 10) : WEB_DASHBOARD_PORT;
}

/**
 * Get complete server configuration
 * Use this in NestJS ConfigModule
 */
export function getServerConfig(): ServerConfig {
  const port = getWebServerPort();
  const dashboardPort = getWebDashboardPort();

  return {
    port,
    apiVersion: API_VERSION,
    apiPrefix: API_PREFIX,
    corsOrigins: [`http://localhost:${dashboardPort.toString()}`, ...CORS_ORIGINS],
  };
}

/**
 * Re-export constants for convenience
 */
export {
  WEB_SERVER_PORT,
  WEB_DASHBOARD_PORT,
  ENV_VAR_NAMES,
  API_VERSION,
  API_PREFIX,
  CORS_ORIGINS,
} from './constants.js';
