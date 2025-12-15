/**
 * @mcp-planner/mcp-server
 *
 * MCP stdio server for planning and task management with Claude Code.
 * This package provides the MCP protocol transport layer.
 *
 * For domain logic, entities, and repository implementations,
 * use @mcp-planner/core.
 */

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
