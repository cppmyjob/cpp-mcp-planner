/**
 * GREEN: Configuration loader for MCP Server
 *
 * Loads project configuration from .mcp-config.json in the current working directory.
 * Separated from cli.ts to keep testable logic isolated from execution entry point.
 */

import { FileConfigRepository } from '@mcp-planner/core';

/**
 * Load project config from workspace.
 *
 * Reads .mcp-config.json from current working directory to get projectId.
 * Throws error if config is not found or invalid - no fallback to 'default'.
 *
 * @throws {Error} If .mcp-config.json is not found or cannot be parsed
 */
export async function loadProjectId(): Promise<string> {
  const configRepo = new FileConfigRepository();
  const cwd = process.cwd();

  await configRepo.initialize();

  try {
    const config = await configRepo.loadConfig(cwd);

    if (config === null) {
      throw new Error(
        `No .mcp-config.json found in current directory: ${cwd}\n` +
        `Run "mcp init-project" to initialize a project with a unique ID`
      );
    }

    console.error(`📦 Loaded project: ${config.projectId}${config.name !== undefined ? ` (${config.name})` : ''}`);
    return config.projectId;
  } catch (error) {
    // Re-throw with cwd context if not already added
    if (error instanceof Error && !error.message.includes(cwd)) {
      throw new Error(
        `Error loading .mcp-config.json in ${cwd}: ${error.message}`
      );
    }
    throw error;
  } finally {
    // Ensure close() is idempotent and handles errors gracefully
    try {
      await configRepo.close();
    } catch (closeError) {
      // Log but don't throw - we're already in error state or successful exit
      console.error('Warning: Error closing ConfigRepository:', closeError instanceof Error ? closeError.message : String(closeError));
    }
  }
}
