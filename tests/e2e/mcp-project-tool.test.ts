import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '@mcp-planner/mcp-server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * RED: Phase 4.14 - MCP Project Tool tests
 *
 * Tests project initialization via MCP protocol.
 */
describe('E2E: MCP Project Tool', () => {
  let client: Client;
  let storagePath: string;
  let testWorkspacePath: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    storagePath = path.join(process.cwd(), '.test-temp', 'mcp-project-tool-' + String(Date.now()) + '-' + crypto.randomUUID());
    testWorkspacePath = path.join(storagePath, 'test-workspace');
    await fs.mkdir(testWorkspacePath, { recursive: true });

    const services = await createServices(storagePath, 'test-project');
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    cleanup = async () => {
      await client.close();
      await server.close();
      await fs.rm(storagePath, { recursive: true, force: true });
    };
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('Project Init', () => {
    // RED: Phase 4.15 - Init tests from Phase 4.14
    it('should initialize project with projectId', async () => {
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: testWorkspacePath,
          projectId: 'my-test-project',
        },
      });

      expect(result.isError).toBe(false);
      const content = result.content[0];
      expect(content.type).toBe('text');
      const parsed = JSON.parse(content.text);

      expect(parsed.success).toBe(true);
      expect(parsed.projectId).toBe('my-test-project');
      expect(parsed.configPath).toBe(path.join(testWorkspacePath, '.mcp-config.json'));

      // Verify config file was created
      const configExists = await fs.access(parsed.configPath).then(() => true).catch(() => false);
      expect(configExists).toBe(true);

      // Verify config content
      const configContent = await fs.readFile(parsed.configPath, 'utf-8');
      const config = JSON.parse(configContent);
      expect(config.projectId).toBe('my-test-project');
    });

    it('should initialize project with optional name', async () => {
      const workspace2 = path.join(storagePath, 'test-workspace-2');
      await fs.mkdir(workspace2, { recursive: true });

      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: workspace2,
          projectId: 'project-with-name',
          name: 'My Project Name',
        },
      });

      expect(result.isError).toBe(false);
      const content = result.content[0];
      const parsed = JSON.parse(content.text);

      expect(parsed.success).toBe(true);
      expect(parsed.projectId).toBe('project-with-name');

      // Verify config has name
      const configContent = await fs.readFile(parsed.configPath, 'utf-8');
      const config = JSON.parse(configContent);
      expect(config.name).toBe('My Project Name');
    });

    it('should fail if projectId is missing', async () => {
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: testWorkspacePath,
          // projectId missing
        },
      });

      expect(result.isError).toBe(true);
    });

    it('should fail if workspacePath is missing', async () => {
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          projectId: 'test-project',
          // workspacePath missing
        },
      });

      expect(result.isError).toBe(true);
    });

    it('should fail if project already initialized', async () => {
      const workspace3 = path.join(storagePath, 'test-workspace-3');
      await fs.mkdir(workspace3, { recursive: true });

      // Initialize first time
      await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: workspace3,
          projectId: 'duplicate-test',
        },
      });

      // Try to initialize again
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: workspace3,
          projectId: 'duplicate-test-2',
        },
      });

      expect(result.isError).toBe(true);
      // Should contain error message about already initialized
      const content = result.content[0];
      expect(content.text).toContain('already initialized');
    });

    it('should fail if projectId format is invalid', async () => {
      const workspace4 = path.join(storagePath, 'test-workspace-4');
      await fs.mkdir(workspace4, { recursive: true });

      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: workspace4,
          projectId: 'INVALID_CAPS', // Invalid: contains uppercase
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('Invalid projectId');
    });
  });

  // RED: Phase 4.15 - CRUD actions tests
  describe('Project Get', () => {
    it('should get project from workspace', async () => {
      const workspace = path.join(storagePath, 'test-get-workspace');
      await fs.mkdir(workspace, { recursive: true });

      // Initialize first
      await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: workspace,
          projectId: 'test-get-project',
          name: 'Test Get Project',
        },
      });

      // Get project
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'get',
          workspacePath: workspace,
        },
      });

      expect(result.isError).toBe(false);
      const content = result.content[0];
      const parsed = JSON.parse(content.text);

      expect(parsed.projectId).toBe('test-get-project');
      expect(parsed.name).toBe('Test Get Project');
    });

    it('should return null if no project in workspace', async () => {
      const workspace = path.join(storagePath, 'test-get-empty');
      await fs.mkdir(workspace, { recursive: true });

      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'get',
          workspacePath: workspace,
        },
      });

      expect(result.isError).toBe(false);
      const content = result.content[0];
      const parsed = JSON.parse(content.text);

      expect(parsed).toBeNull();
    });

    it('should fail if workspacePath is missing', async () => {
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'get',
          // workspacePath missing
        },
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('Project List', () => {
    it('should list all projects', async () => {
      // Create some test projects
      const ws1 = path.join(storagePath, 'list-test-1');
      const ws2 = path.join(storagePath, 'list-test-2');
      await fs.mkdir(ws1, { recursive: true });
      await fs.mkdir(ws2, { recursive: true });

      await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: ws1,
          projectId: 'list-project-1',
        },
      });

      await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: ws2,
          projectId: 'list-project-2',
        },
      });

      // List projects
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'list',
        },
      });

      expect(result.isError).toBe(false);
      const content = result.content[0];
      const parsed = JSON.parse(content.text);

      expect(parsed.projects).toBeDefined();
      expect(Array.isArray(parsed.projects)).toBe(true);
      expect(parsed.total).toBeGreaterThanOrEqual(2);

      // Check that our test projects are in the list
      const projectIds = parsed.projects.map((p: { id: string }) => p.id);
      expect(projectIds).toContain('list-project-1');
      expect(projectIds).toContain('list-project-2');
    });

    it('should support pagination with limit and offset', async () => {
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'list',
          limit: 1,
          offset: 0,
        },
      });

      expect(result.isError).toBe(false);
      const content = result.content[0];
      const parsed = JSON.parse(content.text);

      expect(parsed.projects).toBeDefined();
      expect(parsed.projects.length).toBeLessThanOrEqual(1);
      expect(parsed.hasMore).toBeDefined();
    });
  });

  describe('Project Delete', () => {
    it('should delete project config from workspace', async () => {
      const workspace = path.join(storagePath, 'test-delete-workspace');
      await fs.mkdir(workspace, { recursive: true });

      // Initialize first
      await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: workspace,
          projectId: 'test-delete-project',
        },
      });

      // Verify config exists
      const configPath = path.join(workspace, '.mcp-config.json');
      let configExists = await fs.access(configPath).then(() => true).catch(() => false);
      expect(configExists).toBe(true);

      // Delete project
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'delete',
          workspacePath: workspace,
        },
      });

      expect(result.isError).toBe(false);
      const content = result.content[0];
      const parsed = JSON.parse(content.text);

      expect(parsed.success).toBe(true);

      // Verify config was deleted
      configExists = await fs.access(configPath).then(() => true).catch(() => false);
      expect(configExists).toBe(false);
    });

    it('should fail if workspacePath is missing', async () => {
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'delete',
          // workspacePath missing
        },
      });

      expect(result.isError).toBe(true);
    });
  });

  // RED: Phase 4.19 - Workspace path validation tests
  describe('Workspace Path Validation', () => {
    it('should reject relative paths', async () => {
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: './relative/path',
          projectId: 'test-project',
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('must be an absolute path');
    });

    it('should reject paths with parent directory traversal', async () => {
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: storagePath + '/../malicious',
          projectId: 'test-project',
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('path traversal');
    });

    it('should reject paths with embedded parent directory traversal', async () => {
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: storagePath + '/safe/../malicious',
          projectId: 'test-project',
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('path traversal');
    });

    it('should accept valid absolute paths', async () => {
      const validWorkspace = path.join(storagePath, 'valid-workspace');
      await fs.mkdir(validWorkspace, { recursive: true });

      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: validWorkspace,
          projectId: 'valid-project',
        },
      });

      expect(result.isError).toBe(false);
      const content = result.content[0];
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
    });

    it('should reject empty workspace path', async () => {
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: '',
          projectId: 'test-project',
        },
      });

      expect(result.isError).toBe(true);
    });

    it('should reject workspace path with only whitespace', async () => {
      const result = await client.callTool({
        name: 'project',
        arguments: {
          action: 'init',
          workspacePath: '   ',
          projectId: 'test-project',
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content[0];
      expect(content.text).toContain('must be an absolute path');
    });
  });
});
