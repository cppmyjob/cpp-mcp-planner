import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '@mcp-planner/mcp-server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * RED PHASE - REQ-8: Validation Bug Fixes
 *
 * E2E tests for 6 validation bugs:
 * - BUG-018: Negative limit/offset accepted
 * - BUG-019: limit=0 returns empty with hasMore=true
 * - BUG-022: Invalid filter values return empty
 * - BUG-035: Whitespace-only tag keys accepted
 * - BUG-042: Empty description accepted
 * - BUG-012: No length limits on title/description
 *
 * These tests should FAIL initially, then PASS after GREEN phase fixes.
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

describe('E2E: Validation Bug Fixes (RED Phase)', () => {
  let client: Client;
  let storagePath: string;
  let cleanup: () => Promise<void>;
  let planId: string;

  beforeAll(async () => {
    storagePath = path.join(
      process.cwd(),
      '.test-temp',
      'validation-bugs-' + String(Date.now()) + '-' + crypto.randomUUID()
    );
    await fs.mkdir(storagePath, { recursive: true });

    const services = await createServices(storagePath, 'test-project');
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: 'validation-bugs-test', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    cleanup = async (): Promise<void> => {
      await client.close();
      await server.close();
      await removeDirectoryWithRetry(storagePath);
    };

    // Setup: Create test plan
    const planResult = await client.callTool({
      name: 'plan',
      arguments: {
        action: 'create',
        name: 'Validation Bugs Test Plan',
        description: 'Testing validation bug fixes',
      },
    });
    const plan = parseResult<{ planId: string }>(planResult);
    planId = plan.planId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================================
  // RED: BUG-018 - Negative limit/offset Accepted
  // ============================================================
  describe('BUG-018: negative limit/offset accepted', () => {
    it('RED: should reject negative limit in list operations', async () => {
      const listResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'list',
          planId,
          limit: -1,
        },
      });

      // RED: This should FAIL because negative limit is not validated
      expect((listResult as { isError?: boolean }).isError).toBe(true);
    });

    it('RED: should reject negative offset in list operations', async () => {
      const listResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'list',
          planId,
          offset: -5,
        },
      });

      // RED: This should FAIL because negative offset is not validated
      expect((listResult as { isError?: boolean }).isError).toBe(true);
    });
  });

  // ============================================================
  // RED: BUG-019 - limit=0 Returns Empty with hasMore=true
  // ============================================================
  describe('BUG-019: limit=0 behavior', () => {
    it('RED: should reject limit=0 in list operations', async () => {
      const listResult = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'list',
          limit: 0,
        },
      });

      // RED: This should FAIL - limit=0 should be rejected
      expect((listResult as { isError?: boolean }).isError).toBe(true);
    });
  });

  // ============================================================
  // RED: BUG-022 - Invalid Filter Values Return Empty
  // ============================================================
  describe('BUG-022: invalid filter values', () => {
    it('RED: should reject invalid priority filter', async () => {
      const listResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'list',
          planId,
          filters: {
            priority: 'super_critical', // Invalid!
          },
        },
      });

      // RED: This should FAIL - invalid priority should be rejected
      expect((listResult as { isError?: boolean }).isError).toBe(true);
    });

    it('RED: should reject invalid category filter', async () => {
      const listResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'list',
          planId,
          filters: {
            category: 'invalid-category',
          },
        },
      });

      // RED: This should FAIL - invalid category should be rejected
      expect((listResult as { isError?: boolean }).isError).toBe(true);
    });

    it('RED: should reject invalid status filter', async () => {
      const listResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'list',
          planId,
          filters: {
            status: 'invalid-status',
          },
        },
      });

      // RED: This should FAIL - invalid status should be rejected
      expect((listResult as { isError?: boolean }).isError).toBe(true);
    });
  });

  // ============================================================
  // RED: BUG-035 - Whitespace-Only Tag Keys Accepted
  // ============================================================
  describe('BUG-035: whitespace-only tag keys', () => {
    it('RED: should reject tag with whitespace-only key', async () => {
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Test Requirement',
            description: 'Testing whitespace tags',
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'medium',
            tags: [{ key: '   ', value: 'whitespace key' }],
          },
        },
      });

      // RED: This should FAIL - whitespace-only key should be rejected
      expect((addResult as { isError?: boolean }).isError).toBe(true);
    });

    it('RED: should reject tag with tab-only key', async () => {
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Test Requirement 2',
            description: 'Testing tab tags',
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'medium',
            tags: [{ key: '\t\t\t', value: 'tab key' }],
          },
        },
      });

      // RED: This should FAIL - tab-only key should be rejected
      expect((addResult as { isError?: boolean }).isError).toBe(true);
    });

    it('RED: should reject tag with whitespace-only value', async () => {
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Test Requirement 3',
            description: 'Testing whitespace tag value',
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'medium',
            tags: [{ key: 'valid-key', value: '   ' }],
          },
        },
      });

      // RED: This should FAIL - whitespace-only value should be rejected
      expect((addResult as { isError?: boolean }).isError).toBe(true);
    });
  });

  // ============================================================
  // RED: BUG-042 - Empty Description Accepted
  // ============================================================
  describe('BUG-042: empty description accepted', () => {
    it('RED: should reject empty string description', async () => {
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Test Requirement',
            description: '', // Empty string
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'medium',
          },
        },
      });

      // RED: This should FAIL - empty description should be rejected
      expect((addResult as { isError?: boolean }).isError).toBe(true);
    });

    it('RED: should allow undefined description', async () => {
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Test Requirement Without Description',
            // description intentionally omitted (undefined)
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'medium',
          },
        },
      });

      // This should SUCCEED - undefined description is OK
      const result = parseResult<{ requirementId: string }>(addResult);
      expect(result.requirementId).toBeDefined();
    });

    it('RED: should reject empty string rationale', async () => {
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Test Requirement',
            description: 'Valid description',
            rationale: '', // Empty string
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'medium',
          },
        },
      });

      // RED: This should FAIL - empty rationale should be rejected
      expect((addResult as { isError?: boolean }).isError).toBe(true);
    });
  });

  // ============================================================
  // RED: BUG-012 - No Length Limits
  // ============================================================
  describe('BUG-012: no length limits on text fields', () => {
    it('RED: should reject title exceeding 200 characters', async () => {
      const longTitle = 'A'.repeat(201);

      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: longTitle,
            description: 'Valid description',
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'medium',
          },
        },
      });

      // RED: This should FAIL - title too long
      expect((addResult as { isError?: boolean }).isError).toBe(true);
    });

    it('RED: should accept title with exactly 200 characters', async () => {
      const title200 = 'A'.repeat(200);

      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: title200,
            description: 'Valid description',
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'medium',
          },
        },
      });

      // This should SUCCEED - exactly at limit
      const result = parseResult<{ requirementId: string }>(addResult);
      expect(result.requirementId).toBeDefined();
    });

    it('RED: should reject description exceeding 2000 characters', async () => {
      const longDesc = 'B'.repeat(2001);

      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Valid Title',
            description: longDesc,
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'medium',
          },
        },
      });

      // RED: This should FAIL - description too long
      expect((addResult as { isError?: boolean }).isError).toBe(true);
    });

    it('RED: should accept description with exactly 2000 characters', async () => {
      const desc2000 = 'B'.repeat(2000);

      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Valid Title',
            description: desc2000,
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'medium',
          },
        },
      });

      // This should SUCCEED - exactly at limit
      const result = parseResult<{ requirementId: string }>(addResult);
      expect(result.requirementId).toBeDefined();
    });

    it('RED: should reject rationale exceeding 1000 characters', async () => {
      const longRationale = 'C'.repeat(1001);

      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Valid Title',
            description: 'Valid description',
            rationale: longRationale,
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'medium',
          },
        },
      });

      // RED: This should FAIL - rationale too long
      expect((addResult as { isError?: boolean }).isError).toBe(true);
    });
  });
});
