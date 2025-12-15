/**
 * @mcp-planner/mcp-server
 * MCP stdio server for planning and task management with Claude Code.
 *
 * This package provides infrastructure (file-based persistence) and
 * MCP server implementation for the planning system.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Infrastructure - Factory
// ═══════════════════════════════════════════════════════════════════════════
export { RepositoryFactory } from './infrastructure/factory/repository-factory.js';
export type { StorageConfig } from './infrastructure/factory/repository-factory.js';

// ═══════════════════════════════════════════════════════════════════════════
// Infrastructure - File Repositories
// ═══════════════════════════════════════════════════════════════════════════
export { FilePlanRepository } from './infrastructure/repositories/file/file-plan-repository.js';
export { FileRepository } from './infrastructure/repositories/file/file-repository.js';
export { FileLinkRepository } from './infrastructure/repositories/file/file-link-repository.js';
export { FileUnitOfWork } from './infrastructure/repositories/file/file-unit-of-work.js';
export { BaseFileRepository } from './infrastructure/repositories/file/base-file-repository.js';

// ═══════════════════════════════════════════════════════════════════════════
// Infrastructure - Lock Manager
// ═══════════════════════════════════════════════════════════════════════════
export { FileLockManager } from './infrastructure/repositories/file/file-lock-manager.js';

// ═══════════════════════════════════════════════════════════════════════════
// Infrastructure - Index Manager
// ═══════════════════════════════════════════════════════════════════════════
export { IndexManager } from './infrastructure/repositories/file/index-manager.js';

// ═══════════════════════════════════════════════════════════════════════════
// Infrastructure - File Utils
// ═══════════════════════════════════════════════════════════════════════════
export { atomicWriteJSON, loadJSON } from './infrastructure/repositories/file/file-utils.js';

// ═══════════════════════════════════════════════════════════════════════════
// Infrastructure - Types
// ═══════════════════════════════════════════════════════════════════════════
export {
  DEFAULT_CACHE_OPTIONS,
  type CacheOptions,
  type IndexMetadata,
  type LinkIndexMetadata,
} from './infrastructure/repositories/file/types.js';

// ═══════════════════════════════════════════════════════════════════════════
// Server - Core
// ═══════════════════════════════════════════════════════════════════════════
export { createMcpServer, type McpServerResult } from './server/create-server.js';
export { createServices, type Services } from './server/services.js';

// ═══════════════════════════════════════════════════════════════════════════
// Server - Handlers
// ═══════════════════════════════════════════════════════════════════════════
export { handleToolCall, ToolError } from './server/handlers/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Server - Schemas (Tool Definitions)
// ═══════════════════════════════════════════════════════════════════════════
export { tools } from './server/schemas/index.js';
