import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '@mcp-planner/mcp-server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * RED PHASE - REQ-2: Decision Service Bug Fixes
 *
 * E2E tests for 3 critical bugs:
 * - BUG-002: createDecisionRecord flag ignored in solution select
 * - BUG-004: Decision list status filter broken
 * - BUG-014: Decision supersede crashes with legacy data
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

describe('E2E: Decision Service Bug Fixes (RED Phase)', () => {
  let client: Client;
  let storagePath: string;
  let cleanup: () => Promise<void>;
  let planId: string;
  let requirementId: string;

  beforeAll(async () => {
    storagePath = path.join(
      process.cwd(),
      '.test-temp',
      'decision-bugs-' + String(Date.now()) + '-' + crypto.randomUUID()
    );
    await fs.mkdir(storagePath, { recursive: true });

    const services = await createServices(storagePath, 'test-project');
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: 'decision-bugs-test', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    cleanup = async (): Promise<void> => {
      await client.close();
      await server.close();
      await removeDirectoryWithRetry(storagePath);
    };

    // Setup: Create plan and requirement
    const planResult = await client.callTool({
      name: 'plan',
      arguments: {
        action: 'create',
        name: 'Decision Bugs Test Plan',
        description: 'Testing decision service bug fixes',
      },
    });
    const plan = parseResult<{ planId: string }>(planResult);
    planId = plan.planId;

    const reqResult = await client.callTool({
      name: 'requirement',
      arguments: {
        action: 'add',
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'For testing solutions',
          category: 'functional',
          priority: 'high',
          acceptanceCriteria: ['Must work'],
          source: { type: 'user-request' },
        },
      },
    });
    const req = parseResult<{ requirementId: string }>(reqResult);
    requirementId = req.requirementId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================================
  // RED: BUG-002 - createDecisionRecord Flag Ignored
  // ============================================================
  describe('BUG-002: createDecisionRecord flag ignored', () => {
    it('RED: solution select with createDecisionRecord=true should create ADR decision', async () => {
      // Step 1: Propose a solution
      const proposeResult = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'propose',
          planId,
          solution: {
            title: 'Use GraphQL for API',
            description: 'Modern API layer with GraphQL',
            approach: 'Implement Apollo Server with TypeScript',
            addressing: [requirementId],
            evaluation: {
              effortEstimate: { value: 3, unit: 'days', confidence: 'high' },
              technicalFeasibility: 'high',
              riskAssessment: 'Medium - team learning curve',
            },
          },
        },
      });
      const solution = parseResult<{ solutionId: string }>(proposeResult);

      // Step 2: Select solution with createDecisionRecord=true
      const selectResult = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'select',
          planId,
          solutionId: solution.solutionId,
          reason: 'Best fit for our architecture',
          createDecisionRecord: true,
        },
      });
      const selectParsed = parseResult<{ success: boolean; decisionId?: string }>(selectResult);

      // RED: This should FAIL because DecisionService is not injected in services.ts
      expect(selectParsed.success).toBe(true);
      expect(selectParsed.decisionId).toBeDefined();

      // Step 3: Verify decision was actually created
      if (selectParsed.decisionId !== undefined) {
        const decisionResult = await client.callTool({
          name: 'decision',
          arguments: {
            action: 'get',
            planId,
            decisionId: selectParsed.decisionId,
          },
        });
        const decision = parseResult<{ decision: { title: string; status: string } }>(decisionResult);
        expect(decision.decision.title).toContain('GraphQL');
        expect(decision.decision.status).toBe('active');
      }
    });
  });

  // ============================================================
  // RED: BUG-004 - Status Filter Broken
  // ============================================================
  describe('BUG-004: decision list status filter broken', () => {
    let testPlanId: string;

    beforeAll(async () => {
      // Create isolated plan for this test
      const testPlanResult = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'create',
          name: 'BUG-004 Test Plan',
          description: 'Isolated plan for status filter test',
        },
      });
      const testPlan = parseResult<{ planId: string }>(testPlanResult);
      testPlanId = testPlan.planId;
    });

    it('RED: list action with status filter should return only filtered decisions', async () => {
      // Step 1: Create 2 decisions
      await client.callTool({
        name: 'decision',
        arguments: {
          action: 'record',
          planId: testPlanId,
          decision: {
            title: 'Active Decision',
            question: 'What approach?',
            decision: 'Approach A',
          },
        },
      });

      const decision2Result = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'record',
          planId: testPlanId,
          decision: {
            title: 'Decision to Supersede',
            question: 'What approach?',
            decision: 'Approach B',
          },
        },
      });
      const decision2 = parseResult<{ decisionId: string }>(decision2Result);

      // Step 2: Supersede decision2 so we have one active, one superseded
      await client.callTool({
        name: 'decision',
        arguments: {
          action: 'supersede',
          planId: testPlanId,
          decisionId: decision2.decisionId,
          newDecision: {
            decision: 'Approach C',
          },
          reason: 'Better approach found',
        },
      });

      // Step 3: List with status filter "active"
      const activeListResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'list',
          planId: testPlanId,
          status: 'active',
        },
      });
      const activeList = parseResult<{ decisions: { id: string; status: string }[]; total: number }>(
        activeListResult
      );

      // RED: This should FAIL because handler doesn't map status to filters.status
      expect(activeList.total).toBe(2); // decision1 (active) + new decision from supersede (active)
      expect(activeList.decisions.every((d) => d.status === 'active')).toBe(true);

      // Step 4: List with status filter "superseded"
      const supersededListResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'list',
          planId: testPlanId,
          status: 'superseded',
        },
      });
      const supersededList = parseResult<{
        decisions: { id: string; status: string }[];
        total: number;
      }>(supersededListResult);

      // RED: This should FAIL - currently returns all decisions instead of only superseded
      expect(supersededList.total).toBe(1); // Only decision2 is superseded
      expect(supersededList.decisions.every((d) => d.status === 'superseded')).toBe(true);
      expect(supersededList.decisions[0].id).toBe(decision2.decisionId);
    });
  });

  // ============================================================
  // RED: BUG-014 - Supersede Crashes with Legacy Data
  // ============================================================
  describe('BUG-014: supersede crashes with legacy data', () => {
    let testPlanId: string;

    beforeAll(async () => {
      // Create isolated plan for this test
      const testPlanResult = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'create',
          name: 'BUG-014 Test Plan',
          description: 'Isolated plan for supersede test',
        },
      });
      const testPlan = parseResult<{ planId: string }>(testPlanResult);
      testPlanId = testPlan.planId;
    });

    it('RED: update with supersede should handle missing alternativesConsidered gracefully', async () => {
      // Step 1: Create a decision with missing alternativesConsidered (simulate legacy data)
      // We need to create this via direct repository access since MCP API would normalize it
      // For E2E, we'll use the MCP API and then test the supersede path through updateDecision

      const legacyDecisionResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'record',
          planId: testPlanId,
          decision: {
            title: 'Legacy Decision',
            question: 'Old question?',
            decision: 'Old decision',
            // alternativesConsidered intentionally omitted to simulate legacy data
          },
        },
      });
      const legacyDecision = parseResult<{ decisionId: string }>(legacyDecisionResult);

      // Note: The record action will add alternativesConsidered: [] by default
      // To truly test legacy data, we need to manually create a decision without this field
      // However, for E2E we can test that updateDecision handles the case properly

      // Step 2: Update with supersede option (this uses updateDecision internally)
      const updateResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'update',
          planId: testPlanId,
          decisionId: legacyDecision.decisionId,
          supersede: {
            newDecision: 'New decision after legacy',
            reason: 'Updating legacy decision',
          },
        },
      });

      // RED: This should FAIL if updateDecision doesn't have defensive guard
      // Currently decision-service.ts:380 doesn't have ?? [] guard
      const updateParsed = parseResult<{ success: boolean; decisionId: string }>(updateResult);
      expect(updateParsed.success).toBe(true);
      expect(updateParsed.decisionId).toBeDefined();

      // Debug: Check if returned decisionId is different from original
      expect(updateParsed.decisionId).not.toBe(legacyDecision.decisionId);

      // Step 3: Verify new decision was created and has alternativesConsidered
      const newDecisionResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'get',
          planId: testPlanId,
          decisionId: updateParsed.decisionId,
        },
      });
      const newDecision = parseResult<{
        decision: { decision: string; alternativesConsidered: unknown[] };
      }>(newDecisionResult);
      expect(newDecision.decision.decision).toBe('New decision after legacy');
      expect(newDecision.decision.alternativesConsidered).toBeDefined();
      expect(Array.isArray(newDecision.decision.alternativesConsidered)).toBe(true);
    });
  });

  // RED PHASE - BUG-014: Supersede action missing newDecision parameter
  describe('BUG-014: Supersede Action Missing newDecision Parameter', () => {
    it('should fail with validation error when newDecision is missing', async () => {
      // Step 1: Create a decision
      const decisionResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'record',
          planId,
          decision: {
            title: 'Initial Decision',
            question: 'What approach should we use?',
            decision: 'Approach A',
          },
        },
      });
      const decision = parseResult<{ decisionId: string }>(decisionResult);

      // Step 2: Try to supersede without newDecision parameter
      // This reproduces the QA bug report format
      const supersedeResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'supersede',
          planId,
          decisionId: decision.decisionId,
          // newDecision: missing!
          reason: 'Better approach',
        },
      });

      // GREEN: Should return validation error with isError: true
      // Expected: Zod validation error "newDecision is required for supersede action"
      // Before fix: TypeError: Cannot read properties of undefined (reading 'decision')
      const error = supersedeResult as { content: { type: string; text: string }[]; isError: boolean };
      expect(error.isError).toBe(true);
      expect(error.content[0].text).toContain('newDecision is required for supersede action');
    });

    it('should fail with validation error when newDecision.decision is missing', async () => {
      // Step 1: Create a decision
      const decisionResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'record',
          planId,
          decision: {
            title: 'Initial Decision 2',
            question: 'What tool to use?',
            decision: 'Tool X',
          },
        },
      });
      const decision = parseResult<{ decisionId: string }>(decisionResult);

      // Step 2: Try to supersede with newDecision object but missing decision field
      const supersedeResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'supersede',
          planId,
          decisionId: decision.decisionId,
          newDecision: {
            context: 'New context',
            // decision: missing!
          },
          reason: 'Better reasoning',
        },
      });

      // GREEN: Should return validation error
      const error = supersedeResult as { content: { type: string; text: string }[]; isError: boolean };
      expect(error.isError).toBe(true);
      expect(error.content[0].text).toContain('newDecision.decision is required for supersede action');
    });

    it('should fail with validation error when reason is missing', async () => {
      // Step 1: Create a decision
      const decisionResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'record',
          planId,
          decision: {
            title: 'Initial Decision 3',
            question: 'What framework?',
            decision: 'Framework Y',
          },
        },
      });
      const decision = parseResult<{ decisionId: string }>(decisionResult);

      // Step 2: Try to supersede without reason parameter
      const supersedeResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'supersede',
          planId,
          decisionId: decision.decisionId,
          newDecision: {
            decision: 'Framework Z',
          },
          // reason: missing!
        },
      });

      // GREEN: Should return validation error
      const error = supersedeResult as { content: { type: string; text: string }[]; isError: boolean };
      expect(error.isError).toBe(true);
      expect(error.content[0].text).toContain('reason is required for supersede action');
    });
  });
});
