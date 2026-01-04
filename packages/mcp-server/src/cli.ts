#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, createServices } from './server/index.js';
import type { Services } from './server/services.js';
import { setFallbackProjectId } from '@mcp-planner/core';
import { loadProjectId } from './config-loader.js';

const storagePath = process.env.MCP_PLANNING_STORAGE_PATH ?? './.mcp-plans';

/**
 * Cleanup resources on shutdown
 */
async function cleanup(services: Services): Promise<void> {
  console.error('Shutting down MCP Planning Server...');
  try {
    await services.repositoryFactory.close();
    await services.lockManager.dispose();
    console.error('Cleanup completed');
  } catch (error: unknown) {
    console.error('Error during cleanup:', error instanceof Error ? error.message : String(error));
  }
}

async function main(): Promise<void> {
  // GREEN: Phase 1.1.3 - Load projectId from .mcp-config.json (no default fallback)
  const projectId = await loadProjectId();

  // GREEN: Phase 2.9.3 - Set fallback projectId for single-project mode
  // This allows getProjectId() to work without AsyncLocalStorage context
  setFallbackProjectId(projectId);

  const services = await createServices(storagePath, projectId);
  const { server } = createMcpServer(services);

  // Setup graceful shutdown handlers
  let isShuttingDown = false;

  const handleShutdown = async (): Promise<void> => {
    if (isShuttingDown) {
      return; // Prevent multiple cleanup attempts
    }
    isShuttingDown = true;
    await cleanup(services);
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void handleShutdown();
  });

  process.on('SIGTERM', () => {
    void handleShutdown();
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Planning Server started');
}

// Only run main() when file is executed directly, not when imported for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
