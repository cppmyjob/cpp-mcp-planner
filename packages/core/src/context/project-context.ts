/**
 * Project Context using AsyncLocalStorage
 *
 * Provides framework-agnostic project context isolation for multi-tenant architecture.
 * Uses native Node.js AsyncLocalStorage with run() method (NOT enterWith()).
 *
 * Phase: 2.2.3 - Multi-project context isolation
 *
 * Architecture:
 * - MCP Server: Uses setFallbackProjectId() at startup (single-project mode)
 * - Web Server: Uses runWithProjectContext() in middleware (multi-project mode)
 * - DynamicRepositoryFactory: Uses getProjectId() to select factory per projectId
 *
 * References:
 * - Decision 20: Hybrid Approach (native AsyncLocalStorage + nestjs-cls wrapper)
 * - Decision 23: DynamicRepositoryFactory with projectId caching
 */

import { AsyncLocalStorage } from 'async_hooks';
import { isValidProjectId } from '../domain/services/validators.js';

interface ProjectContext {
  projectId: string;
}

/**
 * AsyncLocalStorage instance for projectId context.
 * Provides request-scoped isolation in multi-project mode.
 */
const asyncLocalStorage = new AsyncLocalStorage<ProjectContext>();

/**
 * Fallback projectId for MCP Server single-project mode.
 * Used when no AsyncLocalStorage context exists.
 */
let fallbackProjectId: string | undefined;

/**
 * Get current projectId from AsyncLocalStorage context or fallback.
 *
 * Priority:
 * 1. AsyncLocalStorage context (if inside runWithProjectContext)
 * 2. Fallback projectId (if set via setFallbackProjectId)
 * 3. undefined (no context available)
 *
 * @returns Current projectId or undefined
 */
export function getProjectId(): string | undefined {
  const store = asyncLocalStorage.getStore();
  return store?.projectId ?? fallbackProjectId;
}

/**
 * Set fallback projectId for MCP Server single-project mode.
 *
 * This fallback is used when no AsyncLocalStorage context exists.
 * Web Server does NOT use this - it uses runWithProjectContext() instead.
 *
 * @param projectId - The fallback project ID
 * @throws Error if projectId format is invalid
 */
export function setFallbackProjectId(projectId: string): void {
  if (!isValidProjectId(projectId)) {
    throw new Error(
      `Invalid projectId: "${projectId}". ` +
      `Must be lowercase alphanumeric with hyphens, 3-50 chars.`
    );
  }
  fallbackProjectId = projectId;
}

/**
 * Run callback with projectId scoped to AsyncLocalStorage context.
 *
 * Uses run() method (NOT enterWith()) for proper context isolation.
 * The run() method creates a new isolated context for each callback execution,
 * ensuring no context leakage across concurrent requests. In contrast,
 * enterWith() would leak context across requests in multi-tenant scenarios.
 *
 * Context is automatically propagated through async boundaries.
 *
 * @param projectId - Project ID for this execution context
 * @param callback - Sync or async function to execute with context
 * @returns Result of callback execution
 * @throws Error if projectId format is invalid
 */
export function runWithProjectContext<T>(
  projectId: string,
  callback: () => T | Promise<T>
): T | Promise<T> {
  if (!isValidProjectId(projectId)) {
    throw new Error(
      `Invalid projectId: "${projectId}". ` +
      `Must be lowercase alphanumeric with hyphens, 3-50 chars.`
    );
  }
  return asyncLocalStorage.run({ projectId }, callback);
}

/**
 * Disable AsyncLocalStorage and clear fallback.
 *
 * Used for cleanup and garbage collection, primarily in tests.
 *
 * Behavior:
 * - Clears fallbackProjectId immediately
 * - Calls AsyncLocalStorage.disable() which prevents new context creation
 * - After calling disable(), getProjectId() returns undefined even inside active contexts
 *
 * Note: AsyncLocalStorage.disable() behavior is implementation-dependent in Node.js.
 * The method disables the storage and clears any existing store data. Any code running
 * in an async context after disable() will see undefined. This is verified by tests
 * in tests/infrastructure/project-context.test.ts.
 *
 * WARNING: After disable(), the AsyncLocalStorage instance is unusable.
 * To re-enable, a new AsyncLocalStorage instance must be created.
 * This function is intended for cleanup during shutdown or test teardown.
 */
export function disable(): void {
  fallbackProjectId = undefined;
  asyncLocalStorage.disable();
}
