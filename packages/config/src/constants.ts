/**
 * Shared configuration constants for MCP Planning monorepo
 * SINGLE SOURCE OF TRUTH - all other files import from here
 */

/**
 * Port configuration
 */
export const WEB_SERVER_PORT = 8790;
export const WEB_DASHBOARD_PORT = 8791;

/**
 * API configuration
 */
export const API_VERSION = 'v1';
export const API_PREFIX = 'api';

/**
 * Development URLs (based on default ports)
 */
export const WEB_SERVER_BASE_URL = `http://localhost:${WEB_SERVER_PORT.toString()}`;
export const WEB_DASHBOARD_BASE_URL = `http://localhost:${WEB_DASHBOARD_PORT.toString()}`;
export const API_BASE_URL = `${WEB_SERVER_BASE_URL}/${API_PREFIX}/${API_VERSION}`;

/**
 * Environment variable names
 */
export const ENV_VAR_NAMES = {
  WEB_SERVER_PORT: 'MCP_PLANNER_SERVER_PORT',
  WEB_DASHBOARD_PORT: 'MCP_PLANNER_DASHBOARD_PORT',
  NODE_ENV: 'NODE_ENV',
  STORAGE_PATH: 'STORAGE_PATH',
} as const;

/**
 * CORS origins for development
 */
export const CORS_ORIGINS = [WEB_DASHBOARD_BASE_URL];
