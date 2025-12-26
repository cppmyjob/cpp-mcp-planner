import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '@mcp-planner/mcp-server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * MCP Server Discovery and Error Handling tests.
 *
 * NOTE: Comprehensive tool tests are in mcp-all-tools.test.ts.
 * This file focuses on:
 * - Tool discovery (listTools)
 * - Schema validation
 * - Error handling
 */
describe('E2E: MCP Server Discovery & Errors', () => {
  let client: Client;
  let storagePath: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    storagePath = path.join(process.cwd(), '.test-temp', 'mcp-server-' + String(Date.now()) + '-' + crypto.randomUUID());
    await fs.mkdir(storagePath, { recursive: true });

    // GREEN: Phase 4.10 - Pass projectId to createServices
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

  describe('Tool Discovery', () => {
    // RED: Phase 4.14 - Expect 10 tools (added project tool)
    it('should list all 10 tools', async () => {
      const result = await client.listTools();

      expect(result.tools).toHaveLength(10);

      const toolNames = result.tools.map(t => t.name).sort();
      expect(toolNames).toEqual([
        'artifact',
        'batch',
        'decision',
        'link',
        'phase',
        'plan',
        'project',
        'query',
        'requirement',
        'solution',
      ]);
    });

    it('should have correct schema for plan tool', async () => {
      const result = await client.listTools();
      const planTool = result.tools.find(t => t.name === 'plan');

      expect(planTool).toBeDefined();
      if (planTool === undefined) throw new Error('PlanTool should be defined');
      expect(planTool.inputSchema.properties).toHaveProperty('action');
      expect(planTool.inputSchema.required).toContain('action');
    });

    it('should have correct actions for each tool', async () => {
      const result = await client.listTools();

      const expectedActions: Record<string, string[]> = {
        plan: ['create', 'list', 'get', 'update', 'archive', 'set_active', 'get_active', 'get_summary'],
        requirement: ['add', 'get', 'get_many', 'update', 'list', 'delete', 'vote', 'unvote', 'reset_all_votes', 'get_history', 'diff', 'list_fields'],
        solution: ['propose', 'get', 'get_many', 'update', 'list', 'compare', 'select', 'delete', 'get_history', 'diff', 'list_fields'],
        decision: ['record', 'get', 'get_many', 'update', 'list', 'supersede', 'get_history', 'diff', 'list_fields'],
        phase: ['add', 'get', 'get_many', 'get_tree', 'update', 'update_status', 'move', 'delete', 'get_next_actions', 'complete_and_advance', 'get_history', 'diff', 'list_fields'],
        artifact: ['add', 'get', 'update', 'list', 'delete', 'get_history', 'diff', 'list_fields'],
        link: ['create', 'get', 'delete'],
        query: ['search', 'trace', 'validate', 'export', 'health'],
        // RED: Phase 4.14 - Project tool with init action
        // GREEN: Phase 4.15 - Added CRUD actions
        project: ['delete', 'get', 'init', 'list'],
      };

      for (const tool of result.tools) {
        // Skip tools without actions (like batch)
        if (!(tool.name in expectedActions)) continue;

        const toolName = tool.name;
        const actionProp = tool.inputSchema.properties?.action as { enum?: string[] } | undefined;
        expect(actionProp?.enum?.sort()).toEqual(expectedActions[toolName].sort());
      }
    });
  });

  describe('Error Handling via MCP', () => {
    it('should return error for unknown action', async () => {
      const result = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'unknown_action',
        },
      });
      expect(result.isError).toBe(true);
    });

    it('should return error for non-existent plan', async () => {
      const result = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'get',
          planId: 'non-existent-id',
        },
      });
      expect(result.isError).toBe(true);
    });

    it('should return error for unknown tool', async () => {
      const result = await client.callTool({
        name: 'unknown_tool',
        arguments: {},
      });
      expect(result.isError).toBe(true);
    });
  });
});
