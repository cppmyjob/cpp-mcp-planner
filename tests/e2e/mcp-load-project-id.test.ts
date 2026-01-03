import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * RED: Phase 1.1.2 - Tests for loadProjectId() from MCP Server
 *
 * These tests verify new behavior after removing 'default' fallback:
 * - Should throw error when .mcp-config.json is not found
 * - Error message should include process.cwd() for diagnostics
 * - Should successfully load projectId when config exists
 */
describe('E2E: MCP Server loadProjectId()', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    // Save original cwd
    originalCwd = process.cwd();

    // Create temp directory for test
    testDir = path.join(process.cwd(), '.test-temp', 'load-project-' + String(Date.now()) + '-' + crypto.randomUUID());
    await fs.mkdir(testDir, { recursive: true });

    // Change to test directory
    process.chdir(testDir);
  });

  afterEach(async () => {
    // Restore original cwd
    process.chdir(originalCwd);

    // Cleanup test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // RED: This test should FAIL because loadProjectId() currently returns 'default' instead of throwing
  it('should throw error when .mcp-config.json is not found', async () => {
    // Import loadProjectId - will be exported in Phase 1.1.3
    const { loadProjectId } = await import('../../packages/mcp-server/src/cli.js');

    await expect(loadProjectId()).rejects.toThrow();
  });

  // RED: This test should FAIL because error message doesn't include cwd yet
  it('should include process.cwd() in error message when config not found', async () => {
    const { loadProjectId } = await import('../../packages/mcp-server/src/cli.js');

    try {
      await loadProjectId();
      throw new Error('Expected loadProjectId to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error) {
        expect(error.message).toContain(process.cwd());
      }
    }
  });

  // This test should PASS (existing behavior that we want to keep)
  it('should successfully load projectId when config exists', async () => {
    // Create valid .mcp-config.json
    const config = {
      projectId: 'test-project-123',
      name: 'Test Project'
    };
    await fs.writeFile(
      path.join(testDir, '.mcp-config.json'),
      JSON.stringify(config, null, 2)
    );

    const { loadProjectId } = await import('../../packages/mcp-server/src/cli.js');
    const result = await loadProjectId();

    expect(result).toBe('test-project-123');
  });

  // RED: This test should FAIL because loadProjectId() returns 'default' on read errors
  it('should throw error when config file is corrupted', async () => {
    // Create invalid JSON
    await fs.writeFile(
      path.join(testDir, '.mcp-config.json'),
      '{ invalid json }'
    );

    const { loadProjectId } = await import('../../packages/mcp-server/src/cli.js');

    await expect(loadProjectId()).rejects.toThrow();
  });

  // RED: This test should FAIL because error message doesn't include cwd yet
  it('should include process.cwd() in error message when config is corrupted', async () => {
    // Create invalid JSON
    await fs.writeFile(
      path.join(testDir, '.mcp-config.json'),
      '{ invalid json }'
    );

    const { loadProjectId } = await import('../../packages/mcp-server/src/cli.js');

    try {
      await loadProjectId();
      throw new Error('Expected loadProjectId to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error) {
        expect(error.message).toContain(process.cwd());
      }
    }
  });
});
