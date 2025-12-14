/**
 * E2E Tests for Phase Ordering Bugs
 * REQ-4: Fix Phase Ordering - Move, Reparent, Validation
 *
 * Bugs covered:
 * - BUG-005: Phase Move Does Not Recalculate Order
 * - BUG-017: Negative Phase Order Accepted
 * - BUG-031: Phase Reparenting Assigns Order 1,000,000,000
 * - BUG-033: Phase Order Accepts Float Values
 * - BUG-034: Phase Order Zero Accepted
 * - BUG-045: Huge Order Values Accepted
 *
 * TDD Phase: RED - All tests should FAIL initially
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '../../src/server/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// Constants for validation
const MAX_ORDER_VALUE = 10000;
const MIN_ORDER_VALUE = 1;

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

// Helper to check if result is error
function isErrorResult(result: unknown): boolean {
  const r = result as { isError?: boolean };
  return r.isError === true;
}

// Helper to get error text
function getErrorText(result: unknown): string {
  const r = result as { content: { type: string; text: string }[] };
  return r.content[0].text;
}

describe('E2E: Phase Ordering Bugs (REQ-4)', () => {
  let client: Client;
  let storagePath: string;
  let cleanup: () => Promise<void>;
  let testPlanId: string;

  beforeAll(async () => {
    storagePath = path.join(
      process.cwd(),
      '.test-temp',
      'phase-ordering-' + String(Date.now()) + '-' + crypto.randomUUID()
    );
    await fs.mkdir(storagePath, { recursive: true });

    const services = await createServices(storagePath);
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'phase-ordering-test', version: '1.0.0' }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    cleanup = async (): Promise<void> => {
      await client.close();
      await server.close();
      await removeDirectoryWithRetry(storagePath);
    };
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Create a fresh plan for each test
    const planResult = await client.callTool({
      name: 'plan',
      arguments: {
        action: 'create',
        name: 'Phase Ordering Test Plan ' + crypto.randomUUID(),
        description: 'Test plan for phase ordering bugs',
      },
    });
    const planContent = parseResult<{ planId: string }>(planResult);
    testPlanId = planContent.planId;
  });

  describe('BUG-017: Negative Phase Order Validation', () => {
    it('should reject negative order value (-5)', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: {
            title: 'Phase with negative order',
            order: -5,
          },
        },
      });

      // RED: Currently passes - should fail with validation error
      expect(isErrorResult(result)).toBe(true);
      const errorText = getErrorText(result);
      expect(errorText).toContain('order');
    });

    it('should reject negative order value (-1)', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: {
            title: 'Phase with -1 order',
            order: -1,
          },
        },
      });

      expect(isErrorResult(result)).toBe(true);
    });
  });

  describe('BUG-034: Zero Phase Order Validation', () => {
    it('should reject order value of 0', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: {
            title: 'Phase with zero order',
            order: 0,
          },
        },
      });

      // RED: Currently passes - should fail with validation error
      expect(isErrorResult(result)).toBe(true);
      const errorText = getErrorText(result);
      expect(errorText).toContain('order');
    });
  });

  describe('BUG-033: Float Phase Order Validation', () => {
    it('should reject float order value (1.5)', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: {
            title: 'Phase with float order',
            order: 1.5,
          },
        },
      });

      // RED: Currently passes - should fail with validation error
      expect(isErrorResult(result)).toBe(true);
      const errorText = getErrorText(result);
      expect(errorText).toContain('order');
    });

    it('should reject float order value (3.14159)', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: {
            title: 'Phase with pi order',
            order: 3.14159,
          },
        },
      });

      expect(isErrorResult(result)).toBe(true);
    });
  });

  describe('BUG-045: Huge Order Values Validation', () => {
    it('should reject order value of 999999999', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: {
            title: 'Phase with huge order',
            order: 999999999,
          },
        },
      });

      // RED: Currently passes - should fail with validation error
      expect(isErrorResult(result)).toBe(true);
      const errorText = getErrorText(result);
      expect(errorText).toContain('order');
    });

    it('should reject order value exceeding MAX_ORDER_VALUE (10000)', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: {
            title: 'Phase with order exceeding limit',
            order: MAX_ORDER_VALUE + 1,
          },
        },
      });

      expect(isErrorResult(result)).toBe(true);
    });

    it('should accept order value at MAX_ORDER_VALUE (10000)', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: {
            title: 'Phase at max order',
            order: MAX_ORDER_VALUE,
          },
        },
      });

      expect(isErrorResult(result)).toBe(false);
      const phaseContent = parseResult<{ phaseId: string }>(result);
      expect(phaseContent.phaseId).toBeDefined();
    });

    it('should accept order value at MIN_ORDER_VALUE (1)', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: {
            title: 'Phase at min order',
            order: MIN_ORDER_VALUE,
          },
        },
      });

      expect(isErrorResult(result)).toBe(false);
      const phaseContent = parseResult<{ phaseId: string }>(result);
      expect(phaseContent.phaseId).toBeDefined();
    });
  });

  describe('BUG-005: Phase Move Does Not Recalculate Order', () => {
    it('should recalculate order when moving phase to new parent without explicit newOrder', async () => {
      // Create parent phases
      const parent1Result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Parent 1', order: 1 },
        },
      });
      expect(isErrorResult(parent1Result)).toBe(false);

      const parent2Result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Parent 2', order: 2 },
        },
      });
      expect(isErrorResult(parent2Result)).toBe(false);
      const parent2Content = parseResult<{ phaseId: string }>(parent2Result);
      const parent2Id = parent2Content.phaseId;

      // Create child phase under parent 1 with order 3
      const childResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Child Phase', order: 3 },
        },
      });
      expect(isErrorResult(childResult)).toBe(false);
      const childContent = parseResult<{ phaseId: string }>(childResult);
      const childId = childContent.phaseId;

      // Move child to parent 2 WITHOUT specifying newOrder
      const moveResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'move',
          planId: testPlanId,
          phaseId: childId,
          newParentId: parent2Id,
          // NO newOrder specified - should auto-calculate
        },
      });
      expect(isErrorResult(moveResult)).toBe(false);

      // Get the moved phase
      const getResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get',
          planId: testPlanId,
          phaseId: childId,
        },
      });
      expect(isErrorResult(getResult)).toBe(false);
      const phaseContent = parseResult<{ phase: { order: number; path: string } }>(getResult);

      // RED: Currently order remains 3, path becomes "2.3"
      // EXPECTED: order should be 1 (first child of parent 2), path should be "2.1"
      expect(phaseContent.phase.order).toBe(1);
      expect(phaseContent.phase.path).toBe('2.1');
    });

    it('should recalculate order based on existing siblings when moving', async () => {
      // Create parent phase
      const parentResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Parent', order: 1 },
        },
      });
      expect(isErrorResult(parentResult)).toBe(false);
      const parentContent = parseResult<{ phaseId: string }>(parentResult);
      const parentId = parentContent.phaseId;

      // Create existing child under parent with order 1
      const existingChildResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Existing Child', parentId, order: 1 },
        },
      });
      expect(isErrorResult(existingChildResult)).toBe(false);

      // Create root phase with order 5
      const rootPhaseResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Root Phase', order: 5 },
        },
      });
      expect(isErrorResult(rootPhaseResult)).toBe(false);
      const rootContent = parseResult<{ phaseId: string }>(rootPhaseResult);
      const rootPhaseId = rootContent.phaseId;

      // Move root phase under parent WITHOUT specifying newOrder
      const moveResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'move',
          planId: testPlanId,
          phaseId: rootPhaseId,
          newParentId: parentId,
        },
      });
      expect(isErrorResult(moveResult)).toBe(false);

      // Get the moved phase
      const getResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get',
          planId: testPlanId,
          phaseId: rootPhaseId,
        },
      });
      expect(isErrorResult(getResult)).toBe(false);
      const phaseContent = parseResult<{ phase: { order: number; path: string } }>(getResult);

      // RED: Currently order remains 5, path becomes "1.5"
      // EXPECTED: order should be 2 (next after existing child), path should be "1.2"
      expect(phaseContent.phase.order).toBe(2);
      expect(phaseContent.phase.path).toBe('1.2');
    });
  });

  describe('BUG-031: Phase Reparenting After Delete Assigns Huge Order', () => {
    it('should assign reasonable order when parent is deleted and children reparented', async () => {
      // Create parent phase at root level with order 10
      const parentResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Parent Phase', order: 10 },
        },
      });
      expect(isErrorResult(parentResult)).toBe(false);
      const parentContent = parseResult<{ phaseId: string }>(parentResult);
      const parentId = parentContent.phaseId;

      // Create child phase under parent with order 1
      const childResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Child Phase', parentId, order: 1 },
        },
      });
      expect(isErrorResult(childResult)).toBe(false);
      const childContent = parseResult<{ phaseId: string }>(childResult);
      const childId = childContent.phaseId;

      // Delete parent (default: reparent children to root)
      const deleteResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'delete',
          planId: testPlanId,
          phaseId: parentId,
          deleteChildren: false,
        },
      });
      expect(isErrorResult(deleteResult)).toBe(false);

      // Get the reparented child
      const getResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get',
          planId: testPlanId,
          phaseId: childId,
        },
      });
      expect(isErrorResult(getResult)).toBe(false);
      const phaseContent = parseResult<{ phase: { order: number; path: string; parentId: string | null } }>(getResult);

      // Verify reparented to root
      expect(phaseContent.phase.parentId).toBeNull();

      // RED: Currently order becomes 1000000000, path becomes "1000000000"
      // EXPECTED: order should be reasonable (e.g., 11 = max existing + 1)
      expect(phaseContent.phase.order).toBeLessThanOrEqual(MAX_ORDER_VALUE);
      expect(phaseContent.phase.order).toBeGreaterThanOrEqual(MIN_ORDER_VALUE);

      // Path should match order (since it's at root level)
      expect(phaseContent.phase.path).toBe(String(phaseContent.phase.order));
    });

    it('should assign sequential order when multiple children are reparented', async () => {
      // Create parent phase
      const parentResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Parent Phase', order: 5 },
        },
      });
      expect(isErrorResult(parentResult)).toBe(false);
      const parentContent = parseResult<{ phaseId: string }>(parentResult);
      const parentId = parentContent.phaseId;

      // Create two children
      const child1Result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Child 1', parentId, order: 1 },
        },
      });
      expect(isErrorResult(child1Result)).toBe(false);
      const child1Content = parseResult<{ phaseId: string }>(child1Result);
      const child1Id = child1Content.phaseId;

      const child2Result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Child 2', parentId, order: 2 },
        },
      });
      expect(isErrorResult(child2Result)).toBe(false);
      const child2Content = parseResult<{ phaseId: string }>(child2Result);
      const child2Id = child2Content.phaseId;

      // Delete parent
      await client.callTool({
        name: 'phase',
        arguments: {
          action: 'delete',
          planId: testPlanId,
          phaseId: parentId,
          deleteChildren: false,
        },
      });

      // Get both children
      const get1Result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get',
          planId: testPlanId,
          phaseId: child1Id,
        },
      });
      const phase1Content = parseResult<{ phase: { order: number } }>(get1Result);

      const get2Result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get',
          planId: testPlanId,
          phaseId: child2Id,
        },
      });
      const phase2Content = parseResult<{ phase: { order: number } }>(get2Result);

      // Both should have reasonable orders
      expect(phase1Content.phase.order).toBeLessThanOrEqual(MAX_ORDER_VALUE);
      expect(phase2Content.phase.order).toBeLessThanOrEqual(MAX_ORDER_VALUE);

      // Orders should be different
      expect(phase1Content.phase.order).not.toBe(phase2Content.phase.order);
    });
  });

  describe('Order Validation in move operation', () => {
    it('should reject negative newOrder in move', async () => {
      // Create a phase
      const phaseResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Test Phase' },
        },
      });
      expect(isErrorResult(phaseResult)).toBe(false);
      const phaseContent = parseResult<{ phaseId: string }>(phaseResult);
      const phaseId = phaseContent.phaseId;

      // Try to move with negative order
      const moveResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'move',
          planId: testPlanId,
          phaseId: phaseId,
          newOrder: -5,
        },
      });

      expect(isErrorResult(moveResult)).toBe(true);
    });

    it('should reject zero newOrder in move', async () => {
      const phaseResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Test Phase' },
        },
      });
      expect(isErrorResult(phaseResult)).toBe(false);
      const phaseContent = parseResult<{ phaseId: string }>(phaseResult);
      const phaseId = phaseContent.phaseId;

      const moveResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'move',
          planId: testPlanId,
          phaseId: phaseId,
          newOrder: 0,
        },
      });

      expect(isErrorResult(moveResult)).toBe(true);
    });

    it('should reject float newOrder in move', async () => {
      const phaseResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Test Phase' },
        },
      });
      expect(isErrorResult(phaseResult)).toBe(false);
      const phaseContent = parseResult<{ phaseId: string }>(phaseResult);
      const phaseId = phaseContent.phaseId;

      const moveResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'move',
          planId: testPlanId,
          phaseId: phaseId,
          newOrder: 2.5,
        },
      });

      expect(isErrorResult(moveResult)).toBe(true);
    });

    it('should reject huge newOrder in move', async () => {
      const phaseResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId: testPlanId,
          phase: { title: 'Test Phase' },
        },
      });
      expect(isErrorResult(phaseResult)).toBe(false);
      const phaseContent = parseResult<{ phaseId: string }>(phaseResult);
      const phaseId = phaseContent.phaseId;

      const moveResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'move',
          planId: testPlanId,
          phaseId: phaseId,
          newOrder: 999999999,
        },
      });

      expect(isErrorResult(moveResult)).toBe(true);
    });
  });
});
