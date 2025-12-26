#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, createServices } from './server/index.js';
import type { Services } from './server/services.js';
import { FileConfigRepository } from '@mcp-planner/core';

const storagePath = process.env.MCP_PLANNING_STORAGE_PATH ?? './.mcp-plans';

/**
 * GREEN: Phase 4.10 - Load project config from workspace
 *
 * Reads .mcp-config.json from current working directory to get projectId.
 * If no config found, logs warning and returns 'default' as projectId.
 */
async function loadProjectId(): Promise<string> {
  const configRepo = new FileConfigRepository();
  await configRepo.initialize();

  try {
    const config = await configRepo.loadConfig(process.cwd());

    if (config === null) {
      console.error('⚠️  Warning: No .mcp-config.json found in current directory');
      console.error('   Run "mcp init-project" to initialize a project with a unique ID');
      console.error('   Using "default" as project ID');
      return 'default';
    }

    console.error(`📦 Loaded project: ${config.projectId}${config.name !== undefined ? ` (${config.name})` : ''}`);
    return config.projectId;
  } catch (error) {
    console.error('⚠️  Error loading .mcp-config.json:', error instanceof Error ? error.message : String(error));
    console.error('   Using "default" as project ID');
    return 'default';
  } finally {
    await configRepo.close();
  }
}

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
  // GREEN: Phase 4.10 - Load projectId from .mcp-config.json
  const projectId = await loadProjectId();

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

main().catch((error: unknown) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
