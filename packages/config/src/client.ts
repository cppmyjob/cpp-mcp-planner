/**
 * Client-side configuration (compile-time constants)
 * USE IN: web-dashboard (Angular)
 *
 * WARNING: These are compile-time constants, not runtime variables.
 * Changes require rebuilding the Angular app.
 */

import { API_BASE_URL } from './constants.js';

/**
 * API base URL for Angular HttpClient
 * Used in API_BASE_URL injection token
 */
export const CLIENT_API_BASE_URL = API_BASE_URL;

/**
 * Re-export ports and API URL for Playwright and test configuration
 */
export { WEB_SERVER_PORT, WEB_DASHBOARD_PORT, API_BASE_URL } from './constants.js';
