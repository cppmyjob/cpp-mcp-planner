import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '@mcp-planner/mcp-server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * RED PHASE - list_fields introspection feature
 *
 * E2E tests for new action: list_fields
 * - Returns structured field metadata for each entity type
 * - Helps MCP clients discover available fields without trial-and-error
 * - Minimizes context by lazy loading field information
 *
 * Expected response:
 * {
 *   entity: 'requirement',
 *   summary: ['id', 'title', 'priority', 'status', 'votes'],
 *   all: [...all valid fields],
 *   metadata: ['createdAt', 'updatedAt', 'version', 'metadata', 'type'],
 *   computed: []  // or ['depth', 'path', 'childCount'] for phases
 * }
 */

// Helper to retry directory removal on Windows
async function removeDirectoryWithRetry(dir: string, maxRetries = 3): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      if (i === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
    }
  }
}

// Helper to parse MCP tool result
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function parseResult<T>(result: unknown): T {
  const r = result as { content: { type: string; text: string }[] };
  return JSON.parse(r.content[0].text) as T;
}

describe('E2E: list_fields Introspection (RED Phase)', () => {
  let client: Client;
  let storagePath: string;
  let cleanup: () => Promise<void>;
  let planId: string;

  beforeAll(async () => {
    storagePath = path.join(
      process.cwd(),
      '.test-temp',
      'list-fields-' + String(Date.now()) + '-' + crypto.randomUUID()
    );
    await fs.mkdir(storagePath, { recursive: true });

    const services = await createServices(storagePath);
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: 'list-fields-test', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    cleanup = async (): Promise<void> => {
      await client.close();
      await server.close();
      await removeDirectoryWithRetry(storagePath);
    };

    // Setup: Create plan
    const planResult = await client.callTool({
      name: 'plan',
      arguments: {
        action: 'create',
        name: 'Fields Introspection Test Plan',
        description: 'Testing list_fields action',
      },
    });
    const plan = parseResult<{ planId: string }>(planResult);
    planId = plan.planId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('should return field metadata for requirement tool', async () => {
    const result = await client.callTool({
      name: 'requirement',
      arguments: {
        action: 'list_fields',
        planId,
      },
    });

    const fields = parseResult<{
      entity: string;
      summary: string[];
      all: string[];
      metadata: string[];
      computed: string[];
    }>(result);

    // Verify structure
    expect(fields.entity).toBe('requirement');
    expect(fields.summary).toBeInstanceOf(Array);
    expect(fields.all).toBeInstanceOf(Array);
    expect(fields.metadata).toBeInstanceOf(Array);
    expect(fields.computed).toBeInstanceOf(Array);

    // Verify summary contains essential fields
    expect(fields.summary).toContain('id');
    expect(fields.summary).toContain('title');
    expect(fields.summary).toContain('priority');
    expect(fields.summary).toContain('status');

    // Verify all contains more fields than summary
    expect(fields.all.length).toBeGreaterThan(fields.summary.length);

    // Verify all contains expected requirement fields
    expect(fields.all).toContain('id');
    expect(fields.all).toContain('title');
    expect(fields.all).toContain('description');
    expect(fields.all).toContain('rationale');
    expect(fields.all).toContain('category');
    expect(fields.all).toContain('priority');
    expect(fields.all).toContain('status');
    expect(fields.all).toContain('votes');
    expect(fields.all).toContain('acceptanceCriteria');
    expect(fields.all).toContain('impact');
    expect(fields.all).toContain('source');

    // Verify metadata fields
    expect(fields.metadata).toContain('createdAt');
    expect(fields.metadata).toContain('updatedAt');
    expect(fields.metadata).toContain('version');
    expect(fields.metadata).toContain('metadata');
    expect(fields.metadata).toContain('type');

    // Requirement has no computed fields
    expect(fields.computed).toEqual([]);
  });

  it('should return field metadata for phase tool with computed fields', async () => {
    const result = await client.callTool({
      name: 'phase',
      arguments: {
        action: 'list_fields',
        planId,
      },
    });

    const fields = parseResult<{
      entity: string;
      summary: string[];
      all: string[];
      metadata: string[];
      computed: string[];
    }>(result);

    expect(fields.entity).toBe('phase');

    // Phase has computed fields
    expect(fields.computed).toContain('depth');
    expect(fields.computed).toContain('path');
    expect(fields.computed).toContain('childCount');

    // Verify phase-specific fields
    expect(fields.all).toContain('parentId');
    expect(fields.all).toContain('order');
    expect(fields.all).toContain('objectives');
    expect(fields.all).toContain('deliverables');
    expect(fields.all).toContain('schedule');
  });

  it('should return field metadata for solution tool', async () => {
    const result = await client.callTool({
      name: 'solution',
      arguments: {
        action: 'list_fields',
        planId,
      },
    });

    const fields = parseResult<{
      entity: string;
      summary: string[];
      all: string[];
      metadata: string[];
      computed: string[];
    }>(result);

    expect(fields.entity).toBe('solution');
    expect(fields.all).toContain('addressing');
    expect(fields.all).toContain('tradeoffs');
    expect(fields.all).toContain('evaluation');
  });

  it('should return field metadata for decision tool', async () => {
    const result = await client.callTool({
      name: 'decision',
      arguments: {
        action: 'list_fields',
        planId,
      },
    });

    const fields = parseResult<{
      entity: string;
      summary: string[];
      all: string[];
      metadata: string[];
      computed: string[];
    }>(result);

    expect(fields.entity).toBe('decision');
    expect(fields.all).toContain('question');
    expect(fields.all).toContain('context');
    expect(fields.all).toContain('decision');
    expect(fields.all).toContain('alternativesConsidered');
  });

  it('should return field metadata for artifact tool', async () => {
    const result = await client.callTool({
      name: 'artifact',
      arguments: {
        action: 'list_fields',
        planId,
      },
    });

    const fields = parseResult<{
      entity: string;
      summary: string[];
      all: string[];
      metadata: string[];
      computed: string[];
    }>(result);

    expect(fields.entity).toBe('artifact');
    expect(fields.all).toContain('artifactType');
    expect(fields.all).toContain('content');
    expect(fields.all).toContain('targets');
  });
});
