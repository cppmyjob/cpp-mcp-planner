import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '@mcp-planner/mcp-server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * RED PHASE - REQ-7: Requirement Service Bug Fixes
 *
 * E2E tests for 4 bugs:
 * - BUG-007: reset_all_votes returns incorrect count
 * - BUG-021: votes field readonly validation missing
 * - BUG-013: requirement status ignored on creation
 * - BUG-011: source.parentId not validated for derived requirements
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

describe('E2E: Requirement Service Bug Fixes (RED Phase)', () => {
  let client: Client;
  let storagePath: string;
  let cleanup: () => Promise<void>;
  let planId: string;

  beforeAll(async () => {
    storagePath = path.join(
      process.cwd(),
      '.test-temp',
      'req-bugs-' + String(Date.now()) + '-' + crypto.randomUUID()
    );
    await fs.mkdir(storagePath, { recursive: true });

    const services = await createServices(storagePath);
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: 'requirement-bugs-test', version: '1.0.0' },
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
        name: 'Requirement Bugs Test Plan',
        description: 'Testing requirement service bug fixes',
      },
    });
    const plan = parseResult<{ planId: string }>(planResult);
    planId = plan.planId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================================
  // RED: BUG-007 - reset_all_votes Returns Incorrect Count
  // ============================================================
  describe('BUG-007: reset_all_votes returns incorrect count', () => {
    it('RED: should return count of requirements that were actually reset', async () => {
      // Step 1: Create 3 requirements
      const req1Result = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Requirement 1',
            description: 'Has votes',
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'high',
          },
        },
      });
      const req1 = parseResult<{ requirementId: string }>(req1Result);

      const req2Result = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Requirement 2',
            description: 'Has votes',
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'medium',
          },
        },
      });
      const req2 = parseResult<{ requirementId: string }>(req2Result);

      await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Requirement 3',
            description: 'No votes',
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'low',
          },
        },
      });

      // Step 2: Vote for req1 and req2
      await client.callTool({
        name: 'requirement',
        arguments: { action: 'vote', planId, requirementId: req1.requirementId },
      });

      await client.callTool({
        name: 'requirement',
        arguments: { action: 'vote', planId, requirementId: req1.requirementId },
      });

      await client.callTool({
        name: 'requirement',
        arguments: { action: 'vote', planId, requirementId: req2.requirementId },
      });

      // Step 3: Reset all votes
      const resetResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'reset_all_votes',
          planId,
        },
      });

      const resetData = parseResult<{ success: boolean; updated: number }>(resetResult);

      // RED: This MIGHT pass if logic is correct - verify actual count
      expect(resetData.success).toBe(true);
      expect(resetData.updated).toBe(2); // Only req1 and req2 had votes

      // Step 4: Verify all votes are now 0
      const listResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'list',
          planId,
        },
      });

      const listData = parseResult<{ requirements: { votes: number }[] }>(listResult);
      expect(listData.requirements.every((r) => r.votes === 0)).toBe(true);
    });
  });

  // ============================================================
  // RED: BUG-021 - Votes Field Update Returns Success But Doesn't Apply
  // ============================================================
  describe('BUG-021: votes field is readonly', () => {
    it('RED: should throw ValidationError when trying to update votes field', async () => {
      // Step 1: Create a requirement
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Test Requirement for Votes Update',
            description: 'Testing readonly votes field',
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'high',
          },
        },
      });
      const req = parseResult<{ requirementId: string }>(addResult);

      // Step 2: Try to update votes field directly
      const updateResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'update',
          planId,
          requirementId: req.requirementId,
          updates: {
            votes: 999,
          },
        },
      });

      // RED: This should FAIL because votes field is not validated as readonly
      // Expected: isError should be true with ValidationError
      expect((updateResult as { isError?: boolean }).isError).toBe(true);

      // Verify error message mentions votes is readonly
      const errorContent = (updateResult as { content?: { type: string; text: string }[] }).content;
      if (errorContent !== undefined) {
        // MCP error might be JSON or plain text
        let errorText = errorContent[0].text;
        try {
          const errorJson = JSON.parse(errorText) as { message?: string };
          if (errorJson.message !== undefined && errorJson.message !== '') {
            errorText = errorJson.message;
          }
        } catch {
          // Not JSON, use as-is
        }
        errorText = errorText.toLowerCase();
        expect(errorText).toContain('votes');
        expect(errorText).toMatch(/read-only|readonly/);
      }

      // Step 3: Verify votes field wasn't silently changed
      const getResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'get',
          planId,
          requirementId: req.requirementId,
        },
      });

      const getData = parseResult<{ requirement: { votes: number } }>(getResult);
      expect(getData.requirement.votes).toBe(0); // Should still be 0, not 999
    });
  });

  // ============================================================
  // RED: BUG-013 - Requirement Status Ignored on Creation
  // ============================================================
  describe('BUG-013: requirement status ignored on creation', () => {
    it('RED: should respect initial status when creating requirement', async () => {
      // Step 1: Create requirement with explicit status "approved"
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Pre-approved Requirement',
            description: 'Should be created with approved status',
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'high',
            status: 'approved',
          },
        },
      });

      // RED: This might FAIL at Zod validation level if status is not in schema
      const req = parseResult<{ requirementId: string }>(addResult);

      // Step 2: Verify status is "approved"
      const getResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'get',
          planId,
          requirementId: req.requirementId,
        },
      });

      const getData = parseResult<{ requirement: { status: string } }>(getResult);
      expect(getData.requirement.status).toBe('approved'); // Should be 'approved', not 'draft'
    });

    it('RED: should default to draft when status not provided', async () => {
      // Step 1: Create requirement WITHOUT status
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Default Status Requirement',
            description: 'Should default to draft',
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'medium',
          },
        },
      });

      const req = parseResult<{ requirementId: string }>(addResult);

      // Step 2: Verify status is "draft"
      const getResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'get',
          planId,
          requirementId: req.requirementId,
        },
      });

      const getData = parseResult<{ requirement: { status: string } }>(getResult);
      expect(getData.requirement.status).toBe('draft');
    });
  });

  // ============================================================
  // RED: BUG-011 - source.parentId Not Validated
  // ============================================================
  describe('BUG-011: source.parentId not validated for derived requirements', () => {
    it('RED: should reject invalid UUID format in parentId', async () => {
      // Step 1: Try to create requirement with invalid parentId
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Derived Requirement with Invalid Parent',
            description: 'Should fail validation',
            source: {
              type: 'derived',
              parentId: 'invalid-not-a-uuid',
            },
            category: 'functional',
            priority: 'high',
          },
        },
      });

      // RED: This should FAIL because parentId format is not validated
      expect((addResult as { isError?: boolean }).isError).toBe(true);

      const errorContent = (addResult as { content?: { type: string; text: string }[] }).content;
      if (errorContent !== undefined) {
        let errorText = errorContent[0].text;
        try {
          const errorJson = JSON.parse(errorText) as { message?: string };
          if (errorJson.message !== undefined && errorJson.message !== '') {
            errorText = errorJson.message;
          }
        } catch {
          // Not JSON, use as-is
        }
        errorText = errorText.toLowerCase();
        expect(errorText).toContain('parentid');
        expect(errorText).toMatch(/uuid|invalid/);
      }
    });

    it('RED: should reject non-existent parentId', async () => {
      // Step 1: Try to create requirement with non-existent parent UUID
      const fakeUuid = '00000000-0000-0000-0000-000000000000';

      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Derived Requirement with Non-existent Parent',
            description: 'Should fail validation',
            source: {
              type: 'derived',
              parentId: fakeUuid,
            },
            category: 'functional',
            priority: 'high',
          },
        },
      });

      // RED: This should FAIL because parentId existence is not checked
      expect((addResult as { isError?: boolean }).isError).toBe(true);

      const errorContent = (addResult as { content?: { type: string; text: string }[] }).content;
      if (errorContent !== undefined) {
        let errorText = errorContent[0].text;
        try {
          const errorJson = JSON.parse(errorText) as { message?: string };
          if (errorJson.message !== undefined && errorJson.message !== '') {
            errorText = errorJson.message;
          }
        } catch {
          // Not JSON, use as-is
        }
        errorText = errorText.toLowerCase();
        expect(errorText).toContain('parent');
        expect(errorText).toMatch(/not found|does not exist/);
      }
    });

    it('RED: should require parentId when source.type is derived', async () => {
      // Step 1: Try to create derived requirement WITHOUT parentId
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Derived Requirement without ParentId',
            description: 'Should fail validation',
            source: {
              type: 'derived',
              // parentId intentionally omitted
            },
            category: 'functional',
            priority: 'high',
          },
        },
      });

      // RED: This should FAIL because parentId is required for derived type
      expect((addResult as { isError?: boolean }).isError).toBe(true);

      const errorContent = (addResult as { content?: { type: string; text: string }[] }).content;
      if (errorContent !== undefined) {
        let errorText = errorContent[0].text;
        try {
          const errorJson = JSON.parse(errorText) as { message?: string };
          if (errorJson.message !== undefined && errorJson.message !== '') {
            errorText = errorJson.message;
          }
        } catch {
          // Not JSON, use as-is
        }
        errorText = errorText.toLowerCase();
        expect(errorText).toContain('parentid');
        expect(errorText).toMatch(/required/);
      }
    });

    it('RED: should accept valid parentId for derived requirements', async () => {
      // Step 1: Create parent requirement
      const parentResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Parent Requirement',
            description: 'This is the parent',
            source: { type: 'user-request' },
            category: 'functional',
            priority: 'high',
          },
        },
      });

      const parent = parseResult<{ requirementId: string }>(parentResult);

      // Step 2: Create derived requirement with valid parentId
      const childResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Derived Child Requirement',
            description: 'Derived from parent',
            source: {
              type: 'derived',
              parentId: parent.requirementId,
            },
            category: 'functional',
            priority: 'medium',
          },
        },
      });

      // This should SUCCEED
      const child = parseResult<{ requirementId: string }>(childResult);
      expect(child.requirementId).toBeDefined();

      // Step 3: Verify child requirement was created correctly
      const getResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'get',
          planId,
          requirementId: child.requirementId,
        },
      });

      const getData = parseResult<{
        requirement: { source: { type: string; parentId: string } };
      }>(getResult);
      expect(getData.requirement.source.type).toBe('derived');
      expect(getData.requirement.source.parentId).toBe(parent.requirementId);
    });
  });
});
