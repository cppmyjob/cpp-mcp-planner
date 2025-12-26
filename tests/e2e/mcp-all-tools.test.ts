import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '@mcp-planner/mcp-server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Comprehensive E2E test of ALL MCP tools and ALL their actions.
 * Coverage: 9/9 tools (100%)
 *
 * Tools tested:
 * 1. plan (8 actions)
 * 2. requirement (10 actions)
 * 3. solution (9 actions)
 * 4. decision (8 actions)
 * 5. phase (12 actions)
 * 6. link (3 actions)
 * 7. artifact (5 actions) - Sprint 12
 * 8. query (5 actions)
 * 9. batch (1 action: execute with temp ID resolution) - Sprint 12
 *
 * This validates that tool-definitions.ts matches the actual service implementations
 * and that all MCP tools work correctly through the full client-server stack.
 */

// Helper to retry directory removal on Windows (EBUSY/ENOTEMPTY errors)
async function removeDirectoryWithRetry(dir: string, maxRetries = 3): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      if (i === maxRetries - 1) throw error;
      // Wait before retry (exponential backoff)
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

describe('E2E: All MCP Tools Validation', () => {
  let client: Client;
  let storagePath: string;
  let cleanup: () => Promise<void>;

  // IDs created during tests for cross-referencing
  let planId: string | undefined;
  let requirementId: string;
  let solutionId: string;
  let solutionId2: string;
  let decisionId: string;
  let phaseId: string;
  let childPhaseId: string;
  let linkId: string;

  beforeAll(async () => {
    storagePath = path.join(process.cwd(), '.test-temp', 'all-tools-' + String(Date.now()) + '-' + crypto.randomUUID());
    await fs.mkdir(storagePath, { recursive: true });

    const services = await createServices(storagePath, 'test-project');
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: 'all-tools-test', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    cleanup = async () => {
      await client.close();
      await server.close();
      await removeDirectoryWithRetry(storagePath);
    };
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================================
  // TOOL: plan (8 actions)
  // ============================================================
  describe('Tool: plan', () => {
    it('action: create', async () => {
      const result = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'create',
          name: 'All Tools Test Plan',
          description: 'Testing all MCP tools',
          enableHistory: true, // Sprint 7: Enable version history
          maxHistoryDepth: 10, // Sprint 7: Keep last 10 versions
        },
      });

      const parsed = parseResult<{ planId: string }>(result);
      expect(parsed.planId).toBeDefined();
      planId = parsed.planId;

      // Verify via get
      const getResult = await client.callTool({
        name: 'plan',
        arguments: { action: 'get', planId },
      });
      const getParsed = parseResult<{ plan: { manifest: { name: string } } }>(getResult);
      expect(getParsed.plan.manifest.name).toBe('All Tools Test Plan');
    });

    it('action: list', async () => {
      const result = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'list',
          // Don't pass status to get all plans (status is for filtering)
          limit: 10,
          offset: 0,
        },
      });

      const parsed = parseResult<{ plans: { id: string }[] }>(result);
      expect(parsed.plans.length).toBeGreaterThan(0);
    });

    it('action: list with status filter', async () => {
      const result = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'list',
          status: 'active',
          limit: 10,
        },
      });

      const parsed = parseResult<{ plans: { id: string; status: string }[] }>(result);
      expect(parsed.plans).toBeDefined();
      // All returned plans should be active
      parsed.plans.forEach((plan) => {
        expect(plan.status).toBe('active');
      });
    });

    it('action: get', async () => {
      const result = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'get',
          planId,
          includeEntities: true,
        },
      });

      const parsed = parseResult<{ plan: { manifest: { id: string } } }>(result);
      expect(parsed.plan.manifest.id).toBe(planId);
    });

    it('action: update', async () => {
      const result = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'update',
          planId,
          updates: {
            name: 'Updated Plan Name',
            description: 'Updated description',
            status: 'active',
          },
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await client.callTool({
        name: 'plan',
        arguments: { action: 'get', planId },
      });
      const getParsed = parseResult<{ plan: { manifest: { name: string } } }>(getResult);
      expect(getParsed.plan.manifest.name).toBe('Updated Plan Name');
    });

    it('action: set_active', async () => {
      const result = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'set_active',
          planId,
          workspacePath: '/test-workspace',
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);
    });

    it('action: get_active', async () => {
      const result = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'get_active',
          workspacePath: '/test-workspace',
        },
      });

      const parsed = parseResult<{ activePlan: { planId: string } }>(result);
      expect(parsed.activePlan.planId).toBe(planId);
    });

    it('action: get_summary', async () => {
      const result = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'get_summary',
          planId,
        },
      });

      const parsed = parseResult<{
        plan: { id: string; name: string; status: string };
        phases: { id: string; title: string; status: string }[];
        statistics: { totalPhases: number };
      }>(result);

      expect(parsed.plan.id).toBe(planId);
      // Note: name was updated in 'action: update' test
      expect(parsed.plan.name).toBe('Updated Plan Name');
      expect(parsed.plan.status).toBe('active');
      expect(parsed.phases).toBeInstanceOf(Array);
      expect(parsed.statistics).toBeDefined();
      expect(parsed.statistics.totalPhases).toBeGreaterThanOrEqual(0);
    });

    it('action: archive (at end)', async () => {
      // Create a separate plan to archive
      const createResult = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'create',
          name: 'Plan to Archive',
          description: 'Will be archived',
        },
      });
      const created = parseResult<{ planId: string }>(createResult);

      const result = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'archive',
          planId: created.planId,
          reason: 'Testing archive',
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);
    });
  });

  // ============================================================
  // TOOL: requirement (10 actions: add, get, get_many, update, list, delete, vote, unvote, get_history, diff)
  // ============================================================
  describe('Tool: requirement', () => {
    it('action: add', async () => {
      const result = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Test Requirement',
            description: 'A test requirement',
            rationale: 'For testing purposes',
            source: {
              type: 'user-request',
              context: 'Testing',
            },
            acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
            priority: 'high',
            category: 'functional',
          },
        },
      });

      const parsed = parseResult<{ requirementId: string }>(result);
      expect(parsed.requirementId).toBeDefined();
      requirementId = parsed.requirementId;
    });

    it('action: add with all source types and categories', async () => {
      // Test 'discovered' source type with 'technical' category
      const result1 = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Discovered Requirement',
            description: 'Found during analysis',
            source: { type: 'discovered' },
            acceptanceCriteria: ['AC1'],
            priority: 'medium',
            category: 'technical',
          },
        },
      });
      expect(parseResult<{ requirementId: string }>(result1).requirementId).toBeDefined();

      // Test 'derived' source type with 'business' category
      const result2 = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Derived Requirement',
            description: 'Derived from another',
            source: { type: 'derived', parentId: requirementId },
            acceptanceCriteria: ['AC1'],
            priority: 'low',
            category: 'business',
          },
        },
      });
      expect(parseResult<{ requirementId: string }>(result2).requirementId).toBeDefined();

      // Test 'non-functional' category (performance, security, etc.)
      const result3 = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Performance Requirement',
            description: 'System must handle 1000 requests per second',
            source: { type: 'user-request' },
            acceptanceCriteria: ['Load tests pass at 1000 RPS'],
            priority: 'high',
            category: 'non-functional',
          },
        },
      });
      expect(parseResult<{ requirementId: string }>(result3).requirementId).toBeDefined();
    });

    it('action: get', async () => {
      const result = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'get',
          planId,
          requirementId,
          includeTraceability: true,
        },
      });

      const parsed = parseResult<{ requirement: { id: string } }>(result);
      expect(parsed.requirement.id).toBe(requirementId);
    });

    it('action: list', async () => {
      const result = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'list',
          planId,
          filters: {
            priority: 'high',
            category: 'functional',
          },
        },
      });

      const parsed = parseResult<{ requirements: unknown[] }>(result);
      expect(parsed.requirements.length).toBeGreaterThan(0);
    });

    it('action: list with status filter', async () => {
      // Test filtering by status (draft, approved, implemented, deferred, rejected)
      // BUG-022 FIX: Use valid requirement status, not plan status
      const result = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'list',
          planId,
          filters: {
            status: 'draft',
          },
        },
      });

      const parsed = parseResult<{ requirements: unknown[] }>(result);
      expect(parsed.requirements).toBeDefined();
    });

    it('action: update', async () => {
      const result = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'update',
          planId,
          requirementId,
          updates: {
            title: 'Updated Requirement',
            priority: 'critical',
          },
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await client.callTool({
        name: 'requirement',
        arguments: { action: 'get', planId, requirementId },
      });
      const getParsed = parseResult<{ requirement: { title: string; priority: string } }>(getResult);
      expect(getParsed.requirement.title).toBe('Updated Requirement');
      expect(getParsed.requirement.priority).toBe('critical');
    });

    it('action: delete', async () => {
      // Create a requirement to delete
      const createResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'To Delete',
            description: 'Will be deleted',
            source: { type: 'user-request' },
            acceptanceCriteria: ['AC1'],
            priority: 'low',
            category: 'functional',
          },
        },
      });
      const created = parseResult<{ requirementId: string }>(createResult);

      const result = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'delete',
          planId,
          requirementId: created.requirementId,
          force: true,
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);
    });

    it('action: get_history (Sprint 7)', async () => {
      // First, make some updates to create version history
      await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'update',
          planId,
          requirementId,
          updates: { title: 'Updated Title V2' },
        },
      });

      await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'update',
          planId,
          requirementId,
          updates: { priority: 'low' },
        },
      });

      // Get version history
      const result = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'get_history',
          planId,
          requirementId,
        },
      });

      const parsed = parseResult<{
        entityId: string;
        entityType: string;
        currentVersion: number;
        versions: { version: number; data: Record<string, unknown>; timestamp: string }[];
        total: number;
        hasMore?: boolean;
      }>(result);

      expect(parsed.entityId).toBe(requirementId);
      expect(parsed.entityType).toBe('requirement');
      expect(parsed.versions).toBeDefined();
      expect(parsed.versions.length).toBeGreaterThan(0);
      expect(parsed.total).toBeGreaterThan(0);
      expect(parsed.currentVersion).toBeGreaterThan(0);

      // Verify versions are in reverse chronological order (newest first)
      if (parsed.versions.length > 1) {
        expect(parsed.versions[0].version).toBeGreaterThan(parsed.versions[1].version);
      }
    });

    it('action: diff (Sprint 7)', async () => {
      // Create another update to ensure we have at least 2 versions
      await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'update',
          planId,
          requirementId,
          updates: { description: 'Updated description for diff test' },
        },
      });

      // Get version history to find version numbers
      const historyResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'get_history',
          planId,
          requirementId,
        },
      });

      const history = parseResult<{
        versions: { version: number }[];
      }>(historyResult);

      expect(history.versions.length).toBeGreaterThanOrEqual(2);

      // Compare two versions
      const version1 = history.versions[1].version; // Older version
      const version2 = history.versions[0].version; // Newer version

      const result = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'diff',
          planId,
          requirementId,
          version1,
          version2,
        },
      });

      const parsed = parseResult<{
        entityId: string;
        entityType: string;
        version1: { version: number; timestamp: string };
        version2: { version: number; timestamp: string };
        changes: Record<string, { from: unknown; to: unknown; changed: boolean }>;
      }>(result);

      expect(parsed.entityId).toBe(requirementId);
      expect(parsed.entityType).toBe('requirement');
      expect(parsed.version1.version).toBe(version1);
      expect(parsed.version2.version).toBe(version2);
      expect(parsed.changes).toBeDefined();

      // Verify changes only contains fields that actually changed
      const changedFields = Object.keys(parsed.changes);
      expect(changedFields.length).toBeGreaterThan(0);

      // Metadata fields should NOT appear in changes (Sprint 7 fix)
      expect(parsed.changes.updatedAt).toBeUndefined();
      expect(parsed.changes.version).toBeUndefined();
      expect(parsed.changes.createdAt).toBeUndefined();
    });
  });

  // ============================================================
  // TOOL: solution (9 actions: propose, get, get_many, update, list, compare, select, delete, get_history, diff)
  // ============================================================
  describe('Tool: solution', () => {
    it('action: propose', async () => {
      const result = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'propose',
          planId,
          solution: {
            title: 'Test Solution',
            description: 'A test solution',
            approach: 'Use testing approach',
            implementationNotes: 'Implementation details here',
            addressing: [requirementId],
            tradeoffs: [
              {
                aspect: 'Performance',
                pros: ['Fast', 'Efficient'],
                cons: ['Complex'],
              },
            ],
            evaluation: {
              effortEstimate: {
                value: 5,
                unit: 'days',
                confidence: 'medium',
              },
              technicalFeasibility: 'high',
              riskAssessment: 'Low risk',
            },
          },
        },
      });

      const parsed = parseResult<{ solutionId: string }>(result);
      expect(parsed.solutionId).toBeDefined();
      solutionId = parsed.solutionId;
    });

    it('action: propose second solution for compare', async () => {
      const result = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'propose',
          planId,
          solution: {
            title: 'Alternative Solution',
            description: 'Another approach',
            approach: 'Different approach',
            addressing: [requirementId],
            tradeoffs: [],
            evaluation: {
              effortEstimate: { value: 3, unit: 'days', confidence: 'high' },
              technicalFeasibility: 'medium',
              riskAssessment: 'Medium risk',
            },
          },
        },
      });

      const parsed = parseResult<{ solutionId: string }>(result);
      solutionId2 = parsed.solutionId;
    });

    it('action: propose with all technicalFeasibility values', async () => {
      // Test 'low' feasibility (high and medium already tested above)
      const result = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'propose',
          planId,
          solution: {
            title: 'Risky Experimental Solution',
            description: 'Unproven technology approach',
            approach: 'Use cutting-edge experimental framework',
            addressing: [requirementId],
            tradeoffs: [
              {
                aspect: 'Innovation',
                pros: ['Cutting edge'],
                cons: ['Unproven', 'High learning curve'],
              },
            ],
            evaluation: {
              effortEstimate: { value: 20, unit: 'days', confidence: 'low' },
              technicalFeasibility: 'low',
              riskAssessment: 'High risk - technology not mature',
            },
          },
        },
      });

      const parsed = parseResult<{ solutionId: string }>(result);
      expect(parsed.solutionId).toBeDefined();
    });

    it('action: get', async () => {
      const result = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'get',
          planId,
          solutionId,
        },
      });

      const parsed = parseResult<{ solution: { id: string } }>(result);
      expect(parsed.solution.id).toBe(solutionId);
    });

    it('action: update', async () => {
      const result = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'update',
          planId,
          solutionId,
          updates: {
            title: 'Updated Solution',
          },
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await client.callTool({
        name: 'solution',
        arguments: { action: 'get', planId, solutionId },
      });
      const getParsed = parseResult<{ solution: { title: string } }>(getResult);
      expect(getParsed.solution.title).toBe('Updated Solution');
    });

    it('action: list', async () => {
      const result = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'list',
          planId,
        },
      });

      const parsed = parseResult<{ solutions: { id: string }[]; total: number }>(result);
      expect(parsed.solutions.length).toBeGreaterThan(0);
      expect(parsed.total).toBeGreaterThan(0);
      expect(parsed.solutions.some((s) => s.id === solutionId)).toBe(true);
    });

    it('action: compare', async () => {
      const result = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'compare',
          planId,
          solutionIds: [solutionId, solutionId2],
          aspects: ['effort', 'risk'],
        },
      });

      const parsed = parseResult<{ comparison: { solutions: unknown[] } }>(result);
      expect(parsed.comparison.solutions).toHaveLength(2);
    });

    it('action: select', async () => {
      const result = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'select',
          planId,
          solutionId,
          reason: 'Best fit for requirements',
          createDecisionRecord: true,
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await client.callTool({
        name: 'solution',
        arguments: { action: 'get', planId, solutionId },
      });
      const getParsed = parseResult<{ solution: { status: string } }>(getResult);
      expect(getParsed.solution.status).toBe('selected');
    });

    it('action: delete', async () => {
      const result = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'delete',
          planId,
          solutionId: solutionId2,
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);
    });

    it('action: get_history (Sprint 7)', async () => {
      // Make updates to create version history
      await client.callTool({
        name: 'solution',
        arguments: {
          action: 'update',
          planId,
          solutionId,
          updates: { title: 'Updated Solution Title' },
        },
      });

      const result = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'get_history',
          planId,
          solutionId,
        },
      });

      const parsed = parseResult<{
        entityId: string;
        entityType: string;
        versions: { version: number }[];
        total: number;
      }>(result);

      expect(parsed.entityId).toBe(solutionId);
      expect(parsed.entityType).toBe('solution');
      expect(parsed.versions).toBeDefined();
      expect(parsed.total).toBeGreaterThan(0);
    });

    it('action: diff (Sprint 7)', async () => {
      // Create another version
      await client.callTool({
        name: 'solution',
        arguments: {
          action: 'update',
          planId,
          solutionId,
          updates: { description: 'Updated solution description' },
        },
      });

      const historyResult = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'get_history',
          planId,
          solutionId,
        },
      });

      const history = parseResult<{ versions: { version: number }[] }>(historyResult);
      expect(history.versions.length).toBeGreaterThanOrEqual(2);

      const result = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'diff',
          planId,
          solutionId,
          version1: history.versions[1].version,
          version2: history.versions[0].version,
        },
      });

      const parsed = parseResult<{ entityId: string; changes: Record<string, unknown> }>(result);
      expect(parsed.entityId).toBe(solutionId);
      expect(parsed.changes).toBeDefined();
    });
  });

  // ============================================================
  // TOOL: decision (8 actions: record, get, get_many, update, list, supersede, get_history, diff)
  // ============================================================
  describe('Tool: decision', () => {
    it('action: record', async () => {
      const result = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'record',
          planId,
          decision: {
            title: 'Test Decision',
            question: 'What approach should we use?',
            context: 'We need to decide on testing approach',
            decision: 'Use unit testing with Jest',
            consequences: 'Need to maintain test suite',
            alternativesConsidered: [
              {
                option: 'Integration tests only',
                reasoning: 'Faster but less coverage',
              },
            ],
          },
        },
      });

      const parsed = parseResult<{ decisionId: string }>(result);
      expect(parsed.decisionId).toBeDefined();
      decisionId = parsed.decisionId;
    });

    it('action: get', async () => {
      const result = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'get',
          planId,
          decisionId,
        },
      });

      const parsed = parseResult<{ decision: { id: string } }>(result);
      expect(parsed.decision.id).toBe(decisionId);
    });

    it('action: list with status active', async () => {
      const result = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'list',
          planId,
          status: 'active',
        },
      });

      const parsed = parseResult<{ decisions: unknown[] }>(result);
      expect(parsed.decisions.length).toBeGreaterThan(0);
    });

    it('action: update', async () => {
      const result = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'update',
          planId,
          decisionId,
          updates: {
            consequences: 'Updated consequences for testing',
          },
        },
      });

      const parsed = parseResult<{ success: boolean; decisionId: string }>(result);
      expect(parsed.success).toBe(true);
      expect(parsed.decisionId).toBe(decisionId);

      // Verify update was applied
      const getResult = await client.callTool({
        name: 'decision',
        arguments: { action: 'get', planId, decisionId },
      });
      const getParsed = parseResult<{ decision: { consequences: string } }>(getResult);
      expect(getParsed.decision.consequences).toBe('Updated consequences for testing');
    });

    it('action: list with all status values', async () => {
      // First supersede a decision so we have different statuses
      await client.callTool({
        name: 'decision',
        arguments: {
          action: 'supersede',
          planId,
          decisionId,
          newDecision: { decision: 'Temporary change' },
          reason: 'Testing statuses',
        },
      });

      // Test 'superseded' status filter
      const supersededResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'list',
          planId,
          status: 'superseded',
        },
      });
      const supersededParsed = parseResult<{ decisions: unknown[] }>(supersededResult);
      expect(supersededParsed.decisions).toBeDefined();

      // Test 'reversed' status filter (may be empty but should work)
      const reversedResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'list',
          planId,
          status: 'reversed',
        },
      });
      const reversedParsed = parseResult<{ decisions: unknown[] }>(reversedResult);
      expect(reversedParsed.decisions).toBeDefined();
    });

    it('action: supersede', async () => {
      // Sprint 3: Create a fresh decision for this test since previous test already superseded decisionId
      const freshDecisionResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'record',
          planId,
          decision: {
            title: 'Fresh Decision for Supersede Test',
            question: 'What approach?',
            context: 'Testing supersede action',
            decision: 'Original approach',
            alternativesConsidered: [],
          },
        },
      });
      const freshDecision = parseResult<{ decisionId: string }>(freshDecisionResult);
      const freshDecisionId = freshDecision.decisionId;

      const result = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'supersede',
          planId,
          decisionId: freshDecisionId, // Use fresh decision, not already-superseded one
          newDecision: {
            decision: 'Use integration tests with Playwright',
            consequences: 'Better E2E coverage',
          },
          reason: 'Requirements changed',
        },
      });

      const parsed = parseResult<{ newDecisionId: string }>(result);
      expect(parsed.newDecisionId).toBeDefined();

      // Verify old decision was superseded
      const oldDecisionResult = await client.callTool({
        name: 'decision',
        arguments: { action: 'get', planId, decisionId: freshDecisionId },
      });
      const oldDecision = parseResult<{ decision: { status: string } }>(oldDecisionResult);
      expect(oldDecision.decision.status).toBe('superseded');

      // Verify new decision exists
      const newDecisionResult = await client.callTool({
        name: 'decision',
        arguments: { action: 'get', planId, decisionId: parsed.newDecisionId },
      });
      const newDecision = parseResult<{ decision: { id: string } }>(newDecisionResult);
      expect(newDecision.decision.id).toBe(parsed.newDecisionId);
    });

    it('action: get_history (Sprint 7)', async () => {
      // Make updates to create version history
      await client.callTool({
        name: 'decision',
        arguments: {
          action: 'update',
          planId,
          decisionId,
          updates: { title: 'Updated Decision Title' },
        },
      });

      const result = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'get_history',
          planId,
          decisionId,
        },
      });

      const parsed = parseResult<{
        entityId: string;
        entityType: string;
        versions: { version: number }[];
        total: number;
      }>(result);

      expect(parsed.entityId).toBe(decisionId);
      expect(parsed.entityType).toBe('decision');
      expect(parsed.versions).toBeDefined();
      expect(parsed.total).toBeGreaterThan(0);
    });

    it('action: diff (Sprint 7)', async () => {
      // Create another version
      await client.callTool({
        name: 'decision',
        arguments: {
          action: 'update',
          planId,
          decisionId,
          updates: { context: 'Updated context for diff test' },
        },
      });

      const historyResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'get_history',
          planId,
          decisionId,
        },
      });

      const history = parseResult<{ versions: { version: number }[] }>(historyResult);
      expect(history.versions.length).toBeGreaterThanOrEqual(2);

      const result = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'diff',
          planId,
          decisionId,
          version1: history.versions[1].version,
          version2: history.versions[0].version,
        },
      });

      const parsed = parseResult<{ entityId: string; changes: Record<string, unknown> }>(result);
      expect(parsed.entityId).toBe(decisionId);
      expect(parsed.changes).toBeDefined();
    });
  });

  // ============================================================
  // TOOL: phase (12 actions: add, get, get_many, get_tree, update, update_status, move, delete, get_next_actions, complete_and_advance, get_history, diff)
  // ============================================================
  describe('Tool: phase', () => {
    it('action: add', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId,
          phase: {
            title: 'Phase 1: Setup',
            description: 'Initial setup phase',
            objectives: ['Setup environment', 'Configure tools'],
            deliverables: ['Configured project'],
            successCriteria: ['All tools working'],
            estimatedEffort: {
              value: 2,
              unit: 'days',
              confidence: 'high',
            },
          },
        },
      });

      const parsed = parseResult<{ phaseId: string }>(result);
      expect(parsed.phaseId).toBeDefined();
      phaseId = parsed.phaseId;
    });

    it('action: add child phase', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId,
          phase: {
            title: 'Task 1.1: Install Dependencies',
            description: 'Install all required packages',
            parentId: phaseId,
            objectives: ['npm install'],
            deliverables: ['node_modules'],
            successCriteria: ['No errors'],
          },
        },
      });

      const parsed = parseResult<{ phaseId: string }>(result);
      childPhaseId = parsed.phaseId;
    });

    it('action: get_tree', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get_tree',
          planId,
          includeCompleted: true,
          maxDepth: 10,
        },
      });

      const parsed = parseResult<{ tree: unknown[] }>(result);
      expect(parsed.tree.length).toBeGreaterThan(0);
    });

    it('action: get_tree returns summary mode by default', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get_tree',
          planId,
        },
      });

      const parsed = parseResult<{ tree: { phase: Record<string, unknown> }[] }>(result);
      expect(parsed.tree.length).toBeGreaterThan(0);

      const phase = parsed.tree[0].phase;
      // Summary fields should be present
      expect(phase.id).toBeDefined();
      expect(phase.title).toBeDefined();
      expect(phase.status).toBeDefined();
      expect(phase.progress).toBeDefined();
      expect(phase.path).toBeDefined();
      expect(phase.childCount).toBeDefined();

      // Full fields should NOT be present in summary mode
      expect(phase.description).toBeUndefined();
      expect(phase.schedule).toBeUndefined();

      // Metadata IS included in summary mode by default
      expect(phase.metadata).toBeDefined();
    });

    it('action: get_tree with fields parameter returns ONLY requested fields', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get_tree',
          planId,
          fields: ['objectives', 'deliverables'],
        },
      });

      const parsed = parseResult<{ tree: { phase: Record<string, unknown> }[] }>(result);
      const phase = parsed.tree[0].phase;

      // ONLY requested fields should be present
      expect(phase.objectives).toBeDefined();
      expect(phase.deliverables).toBeDefined();

      // Summary fields NOT included when custom fields specified
      expect(phase.id).toBeUndefined();
      expect(phase.title).toBeUndefined();
      expect(phase.childCount).toBeUndefined();

      // Other fields also NOT present
      expect(phase.description).toBeUndefined();
      expect(phase.schedule).toBeUndefined();
    });

    it('action: get_tree with fields=["*"] returns full phase', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get_tree',
          planId,
          fields: ['*'],
        },
      });

      const parsed = parseResult<{ tree: { phase: Record<string, unknown> }[] }>(result);
      const phase = parsed.tree[0].phase;

      // All fields should be present
      expect(phase.id).toBeDefined();
      expect(phase.title).toBeDefined();
      expect(phase.description).toBeDefined();
      expect(phase.objectives).toBeDefined();
      expect(phase.schedule).toBeDefined();
      expect(phase.metadata).toBeDefined();
      expect(phase.childCount).toBeDefined();
    });

    it('action: get_tree with maxDepth=0 returns only root phases', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get_tree',
          planId,
          maxDepth: 0,
        },
      });

      const parsed = parseResult<{
        tree: { phase: Record<string, unknown>; children: unknown[]; hasChildren: boolean }[];
      }>(result);

      expect(parsed.tree.length).toBeGreaterThan(0);

      // Root phase should have children truncated but hasChildren=true
      const rootNode = parsed.tree[0];
      expect(rootNode.children).toEqual([]);
      expect(rootNode.hasChildren).toBe(true);
      expect(rootNode.phase.childCount).toBe(1); // We added one child phase earlier
    });

    it('action: update_status', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'update_status',
          planId,
          phaseId: childPhaseId,
          status: 'in_progress',
          progress: 50,
          notes: 'Half done',
          actualEffort: 4,
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await client.callTool({
        name: 'phase',
        arguments: { action: 'get', planId, phaseId: childPhaseId },
      });
      const getParsed = parseResult<{ phase: { status: string; progress: number } }>(getResult);
      expect(getParsed.phase.status).toBe('in_progress');
      expect(getParsed.phase.progress).toBe(50);
    });

    it('action: update_status with all status values', async () => {
      // Create a test phase for status transitions
      const createResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId,
          phase: {
            title: 'Status Test Phase',
            description: 'For testing all statuses',
            objectives: ['Test'],
            deliverables: ['None'],
            successCriteria: ['Pass'],
          },
        },
      });
      const testPhaseId = parseResult<{ phaseId: string }>(createResult).phaseId;

      // Test all phase statuses (blocked requires notes)
      const statusConfigs: { status: string; notes?: string }[] = [
        { status: 'planned' },
        { status: 'in_progress' },
        { status: 'completed' },
        { status: 'blocked', notes: 'Blocked by dependency issue' },
        { status: 'skipped' },
      ];

      for (const { status, notes } of statusConfigs) {
        const result = await client.callTool({
          name: 'phase',
          arguments: {
            action: 'update_status',
            planId,
            phaseId: testPhaseId,
            status,
            ...(notes !== undefined && notes !== '' && { notes }),
          },
        });
        const parsed = parseResult<{ success: boolean }>(result);
        expect(parsed.success).toBe(true);

        // Verify via get
        const getResult = await client.callTool({
          name: 'phase',
          arguments: { action: 'get', planId, phaseId: testPhaseId },
        });
        const getParsed = parseResult<{ phase: { status: string } }>(getResult);
        expect(getParsed.phase.status).toBe(status);
      }
    }, 10000); // Increase timeout for multiple status transitions

    it('action: update_status with progress boundaries (0 and 100)', async () => {
      // Create a test phase for progress testing
      const createResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId,
          phase: {
            title: 'Progress Test Phase',
            description: 'For testing progress boundaries',
            objectives: ['Test progress'],
            deliverables: ['Progress verified'],
            successCriteria: ['0% and 100% work'],
          },
        },
      });
      const progressPhaseId = parseResult<{ phaseId: string }>(createResult).phaseId;

      // Test progress: 0% (start)
      const result0 = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'update_status',
          planId,
          phaseId: progressPhaseId,
          status: 'in_progress',
          progress: 0,
        },
      });
      const parsed0 = parseResult<{ success: boolean }>(result0);
      expect(parsed0.success).toBe(true);

      // Verify progress 0
      const getResult0 = await client.callTool({
        name: 'phase',
        arguments: { action: 'get', planId, phaseId: progressPhaseId },
      });
      const getParsed0 = parseResult<{ phase: { progress: number } }>(getResult0);
      expect(getParsed0.phase.progress).toBe(0);

      // Test progress: 100% (complete)
      const result100 = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'update_status',
          planId,
          phaseId: progressPhaseId,
          status: 'completed',
          progress: 100,
        },
      });
      const parsed100 = parseResult<{ success: boolean }>(result100);
      expect(parsed100.success).toBe(true);

      // Verify progress 100
      const getResult100 = await client.callTool({
        name: 'phase',
        arguments: { action: 'get', planId, phaseId: progressPhaseId },
      });
      const getParsed100 = parseResult<{ phase: { progress: number } }>(getResult100);
      expect(getParsed100.phase.progress).toBe(100);
    });

    it('action: move', async () => {
      // Create another parent phase
      const createResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId,
          phase: {
            title: 'Phase 2: Development',
            description: 'Development phase',
            objectives: ['Develop'],
            deliverables: ['Code'],
            successCriteria: ['Tests pass'],
          },
        },
      });
      const newParent = parseResult<{ phaseId: string }>(createResult);

      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'move',
          planId,
          phaseId: childPhaseId,
          newParentId: newParent.phaseId,
          newOrder: 1, // BUG-034 fix: order must be >= 1
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await client.callTool({
        name: 'phase',
        arguments: { action: 'get', planId, phaseId: childPhaseId },
      });
      const getParsed = parseResult<{ phase: { parentId: string } }>(getResult);
      expect(getParsed.phase.parentId).toBe(newParent.phaseId);
    });

    it('action: get_next_actions', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get_next_actions',
          planId,
          limit: 5,
        },
      });

      const parsed = parseResult<{ actions: unknown[] }>(result);
      expect(parsed.actions).toBeDefined();
    });

    it('action: complete_and_advance', async () => {
      // Create two phases to test completing current and starting next
      const phase1Result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId,
          phase: {
            title: 'Phase 1 for Complete',
            description: 'First phase',
            objectives: ['Complete me'],
            deliverables: ['Done'],
            successCriteria: ['Success'],
          },
        },
      });
      const phase1Id = parseResult<{ phaseId: string }>(phase1Result).phaseId;

      const phase2Result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId,
          phase: {
            title: 'Phase 2 for Complete',
            description: 'Second phase',
            objectives: ['Next task'],
            deliverables: ['Done'],
            successCriteria: ['Success'],
          },
        },
      });
      const phase2Id = parseResult<{ phaseId: string }>(phase2Result).phaseId;

      // Complete first phase and advance to second
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'complete_and_advance',
          planId,
          phaseId: phase1Id,
          actualEffort: 2.5,
          notes: 'Completed successfully',
        },
      });

      const parsed = parseResult<{
        completedPhaseId: string;
        nextPhaseId: string | null;
        success: true;
      }>(result);

      expect(parsed.success).toBe(true);
      expect(parsed.completedPhaseId).toBe(phase1Id);
      expect(parsed.nextPhaseId).toBe(phase2Id);

      // Verify phases via get
      const completed = await client.callTool({
        name: 'phase',
        arguments: { action: 'get', planId, phaseId: phase1Id },
      });
      const completedPhase = parseResult<{ phase: { status: string; progress: number } }>(completed);
      expect(completedPhase.phase.status).toBe('completed');
      expect(completedPhase.phase.progress).toBe(100);

      const next = await client.callTool({
        name: 'phase',
        arguments: { action: 'get', planId, phaseId: phase2Id },
      });
      const nextPhase = parseResult<{ phase: { status: string } }>(next);
      expect(nextPhase.phase.status).toBe('in_progress');
    });

    it('action: delete', async () => {
      // Create a phase to delete
      const createResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId,
          phase: {
            title: 'Phase to Delete',
            description: 'Will be deleted',
            objectives: ['None'],
            deliverables: ['None'],
            successCriteria: ['None'],
          },
        },
      });
      const created = parseResult<{ phaseId: string }>(createResult);

      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'delete',
          planId,
          phaseId: created.phaseId,
          deleteChildren: true,
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);
    });

    // Sprint 5 - Order/Path Bug Fix E2E Tests
    describe('order/path calculation (Sprint 5 - Bug Fix)', () => {
      let e2ePlanId: string;

      beforeAll(async () => {
        // Create a fresh plan for order/path testing
        const result = await client.callTool({
          name: 'plan',
          arguments: {
            action: 'create',
            name: 'Order Path E2E Test Plan',
            description: 'Testing order/path calculation',
          },
        });
        e2ePlanId = parseResult<{ planId: string }>(result).planId;
      });

      it('should calculate order based on max sibling order after delete', async () => {
        // Create 3 phases
        const phase1Result = await client.callTool({
          name: 'phase',
          arguments: {
            action: 'add',
            planId: e2ePlanId,
            phase: { title: 'E2E Phase 1', description: 'First', objectives: ['O1'] },
          },
        });
        const phase2Result = await client.callTool({
          name: 'phase',
          arguments: {
            action: 'add',
            planId: e2ePlanId,
            phase: { title: 'E2E Phase 2', description: 'Second', objectives: ['O2'] },
          },
        });
        const phase3Result = await client.callTool({
          name: 'phase',
          arguments: {
            action: 'add',
            planId: e2ePlanId,
            phase: { title: 'E2E Phase 3', description: 'Third', objectives: ['O3'] },
          },
        });

        const p1 = parseResult<{ phaseId: string }>(phase1Result);
        const p2 = parseResult<{ phaseId: string }>(phase2Result);
        const p3 = parseResult<{ phaseId: string }>(phase3Result);

        // Verify orders via get
        const get1 = await client.callTool({
          name: 'phase',
          arguments: { action: 'get', planId: e2ePlanId, phaseId: p1.phaseId },
        });
        const get2 = await client.callTool({
          name: 'phase',
          arguments: { action: 'get', planId: e2ePlanId, phaseId: p2.phaseId },
        });
        const get3 = await client.callTool({
          name: 'phase',
          arguments: { action: 'get', planId: e2ePlanId, phaseId: p3.phaseId },
        });

        expect(parseResult<{ phase: { order: number } }>(get1).phase.order).toBe(1);
        expect(parseResult<{ phase: { order: number } }>(get2).phase.order).toBe(2);
        expect(parseResult<{ phase: { order: number } }>(get3).phase.order).toBe(3);

        // Delete phase 2
        await client.callTool({
          name: 'phase',
          arguments: {
            action: 'delete',
            planId: e2ePlanId,
            phaseId: p2.phaseId,
          },
        });

        // Add new phase - should get order 4 (max=3 + 1), not 3 (count=2 + 1)
        const phase4Result = await client.callTool({
          name: 'phase',
          arguments: {
            action: 'add',
            planId: e2ePlanId,
            phase: { title: 'E2E Phase 4', description: 'Fourth', objectives: ['O4'] },
          },
        });

        const p4 = parseResult<{ phaseId: string }>(phase4Result);

        // Verify via get
        const get4 = await client.callTool({
          name: 'phase',
          arguments: { action: 'get', planId: e2ePlanId, phaseId: p4.phaseId },
        });
        const getParsed4 = parseResult<{ phase: { order: number; path: string } }>(get4);
        expect(getParsed4.phase.order).toBe(4);
        expect(getParsed4.phase.path).toBe('4');
      });

      it('should generate unique paths for nested phases through full MCP flow', async () => {
        // Create parent phase
        const parentResult = await client.callTool({
          name: 'phase',
          arguments: {
            action: 'add',
            planId: e2ePlanId,
            phase: { title: 'E2E Parent', description: 'Parent phase', objectives: ['P'] },
          },
        });
        const parent = parseResult<{ phaseId: string }>(parentResult);

        // Get parent path
        const getParent = await client.callTool({
          name: 'phase',
          arguments: { action: 'get', planId: e2ePlanId, phaseId: parent.phaseId },
        });
        const parentPath = parseResult<{ phase: { path: string } }>(getParent).phase.path;

        // Create 3 children
        const child1Result = await client.callTool({
          name: 'phase',
          arguments: {
            action: 'add',
            planId: e2ePlanId,
            phase: {
              title: 'E2E Child 1',
              description: 'C1',
              objectives: ['C'],
              parentId: parent.phaseId,
            },
          },
        });
        const child2Result = await client.callTool({
          name: 'phase',
          arguments: {
            action: 'add',
            planId: e2ePlanId,
            phase: {
              title: 'E2E Child 2',
              description: 'C2',
              objectives: ['C'],
              parentId: parent.phaseId,
            },
          },
        });
        const child3Result = await client.callTool({
          name: 'phase',
          arguments: {
            action: 'add',
            planId: e2ePlanId,
            phase: {
              title: 'E2E Child 3',
              description: 'C3',
              objectives: ['C'],
              parentId: parent.phaseId,
            },
          },
        });

        parseResult<{ phaseId: string }>(child1Result);
        const c2 = parseResult<{ phaseId: string }>(child2Result);
        parseResult<{ phaseId: string }>(child3Result);

        // Delete child 2
        await client.callTool({
          name: 'phase',
          arguments: {
            action: 'delete',
            planId: e2ePlanId,
            phaseId: c2.phaseId,
          },
        });

        // Add new child - should get order 4 and path X.4
        const child4Result = await client.callTool({
          name: 'phase',
          arguments: {
            action: 'add',
            planId: e2ePlanId,
            phase: {
              title: 'E2E Child 4',
              description: 'C4',
              objectives: ['C'],
              parentId: parent.phaseId,
            },
          },
        });

        const c4 = parseResult<{ phaseId: string }>(child4Result);

        // Verify via get
        const getC4 = await client.callTool({
          name: 'phase',
          arguments: { action: 'get', planId: e2ePlanId, phaseId: c4.phaseId },
        });
        const c4Data = parseResult<{ phase: { order: number; path: string } }>(getC4);
        expect(c4Data.phase.order).toBe(4);
        expect(c4Data.phase.path).toBe(`${parentPath}.4`);

        // Verify tree has no duplicate paths
        const treeResult = await client.callTool({
          name: 'phase',
          arguments: {
            action: 'get_tree',
            planId: e2ePlanId,
            fields: ['path'],
          },
        });

        const tree = parseResult<{
          tree: { phase: { path: string }; children: { phase: { path: string } }[] }[];
        }>(treeResult);

        // Collect all paths and verify uniqueness
        const allPaths = new Set<string>();
        const collectPaths = (
          nodes: { phase: { path: string }; children?: { phase: { path: string } }[] }[]
        ): void => {
          for (const node of nodes) {
            expect(allPaths.has(node.phase.path)).toBe(false);
            allPaths.add(node.phase.path);
            if (node.children !== undefined && node.children.length > 0) {
              collectPaths(node.children);
            }
          }
        };
        collectPaths(tree.tree);

        // Should have no duplicates
        expect(allPaths.size).toBeGreaterThan(0);
      });

      it('should handle explicit order correctly after gaps', async () => {
        // Create phase with explicit order=100
        const phase100Result = await client.callTool({
          name: 'phase',
          arguments: {
            action: 'add',
            planId: e2ePlanId,
            phase: {
              title: 'E2E Phase 100',
              description: 'Explicit order',
              objectives: ['O'],
              order: 100,
            },
          },
        });

        const p100 = parseResult<{ phaseId: string }>(phase100Result);

        // Verify via get
        const get100 = await client.callTool({
          name: 'phase',
          arguments: { action: 'get', planId: e2ePlanId, phaseId: p100.phaseId },
        });
        const p100Data = parseResult<{ phase: { order: number; path: string } }>(get100);
        expect(p100Data.phase.order).toBe(100);
        expect(p100Data.phase.path).toBe('100');

        // Add auto-ordered phase - should get order 101
        const autoResult = await client.callTool({
          name: 'phase',
          arguments: {
            action: 'add',
            planId: e2ePlanId,
            phase: { title: 'E2E Auto Phase', description: 'Auto order', objectives: ['O'] },
          },
        });

        const pAuto = parseResult<{ phaseId: string }>(autoResult);

        // Verify via get
        const getAuto = await client.callTool({
          name: 'phase',
          arguments: { action: 'get', planId: e2ePlanId, phaseId: pAuto.phaseId },
        });
        const pAutoData = parseResult<{ phase: { order: number; path: string } }>(getAuto);
        expect(pAutoData.phase.order).toBe(101);
        expect(pAutoData.phase.path).toBe('101');
      });
    });

    it('action: get_history (Sprint 7)', async () => {
      // Make updates to create version history
      await client.callTool({
        name: 'phase',
        arguments: {
          action: 'update',
          planId,
          phaseId,
          updates: { title: 'Updated Phase Title' },
        },
      });

      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get_history',
          planId,
          phaseId,
        },
      });

      const parsed = parseResult<{
        entityId: string;
        entityType: string;
        versions: { version: number }[];
        total: number;
      }>(result);

      expect(parsed.entityId).toBe(phaseId);
      expect(parsed.entityType).toBe('phase');
      expect(parsed.versions).toBeDefined();
      expect(parsed.total).toBeGreaterThan(0);
    });

    it('action: diff (Sprint 7)', async () => {
      // Create another version
      await client.callTool({
        name: 'phase',
        arguments: {
          action: 'update',
          planId,
          phaseId,
          updates: { description: 'Updated phase description' },
        },
      });

      const historyResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get_history',
          planId,
          phaseId,
        },
      });

      const history = parseResult<{ versions: { version: number }[] }>(historyResult);
      expect(history.versions.length).toBeGreaterThanOrEqual(2);

      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'diff',
          planId,
          phaseId,
          version1: history.versions[1].version,
          version2: history.versions[0].version,
        },
      });

      const parsed = parseResult<{ entityId: string; changes: Record<string, unknown> }>(result);
      expect(parsed.entityId).toBe(phaseId);
      expect(parsed.changes).toBeDefined();
    });
  });

  // ============================================================
  // TOOL: link (3 actions)
  // ============================================================
  describe('Tool: link', () => {
    it('action: create with all relation types', async () => {
      // Test 'implements' relation
      const result = await client.callTool({
        name: 'link',
        arguments: {
          action: 'create',
          planId,
          sourceId: solutionId,
          targetId: requirementId,
          relationType: 'implements',
          metadata: { coverage: 'full' },
        },
      });

      const parsed = parseResult<{ linkId: string }>(result);
      expect(parsed.linkId).toBeDefined();
      linkId = parsed.linkId;

      // Test a few more relation types with existing entities
      // addresses: phase -> requirement
      const addressesLink = await client.callTool({
        name: 'link',
        arguments: {
          action: 'create',
          planId,
          sourceId: phaseId,
          targetId: requirementId,
          relationType: 'addresses',
        },
      });
      expect(parseResult<{ linkId: string }>(addressesLink).linkId).toBeDefined();

      // references: solution -> phase
      const referencesLink = await client.callTool({
        name: 'link',
        arguments: {
          action: 'create',
          planId,
          sourceId: solutionId,
          targetId: phaseId,
          relationType: 'references',
        },
      });
      expect(parseResult<{ linkId: string }>(referencesLink).linkId).toBeDefined();

      // Note: Skipping alternative_to test because solutionId2 was deleted in the solution delete test
    });

    it('action: get with direction both', async () => {
      const result = await client.callTool({
        name: 'link',
        arguments: {
          action: 'get',
          planId,
          entityId: solutionId,
          direction: 'both',
        },
      });

      const parsed = parseResult<{ links: unknown[] }>(result);
      expect(parsed.links.length).toBeGreaterThan(0);
    });

    it('action: get with all direction values', async () => {
      // Test 'outgoing' direction - links where entity is source
      const outgoingResult = await client.callTool({
        name: 'link',
        arguments: {
          action: 'get',
          planId,
          entityId: solutionId,
          direction: 'outgoing',
        },
      });
      const outgoingParsed = parseResult<{ links: unknown[] }>(outgoingResult);
      expect(outgoingParsed.links).toBeDefined();

      // Test 'incoming' direction - links where entity is target
      const incomingResult = await client.callTool({
        name: 'link',
        arguments: {
          action: 'get',
          planId,
          entityId: requirementId,
          direction: 'incoming',
        },
      });
      const incomingParsed = parseResult<{ links: unknown[] }>(incomingResult);
      expect(incomingParsed.links).toBeDefined();
    });

    it('action: get with relationType filter', async () => {
      // Test filtering links by relation type
      const result = await client.callTool({
        name: 'link',
        arguments: {
          action: 'get',
          planId,
          entityId: solutionId,
          direction: 'both',
          relationType: 'implements',
        },
      });

      const parsed = parseResult<{ links: { relationType: string }[] }>(result);
      expect(parsed.links).toBeDefined();
      // All returned links should be of type 'implements'
      parsed.links.forEach((link) => {
        expect(link.relationType).toBe('implements');
      });
    });

    it('action: delete', async () => {
      const result = await client.callTool({
        name: 'link',
        arguments: {
          action: 'delete',
          planId,
          linkId,
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);
    });
  });

  // ============================================================
  // TOOL: artifact (5 actions: add, get, update, list, delete)
  // ============================================================
  describe('Tool: artifact', () => {
    let artifactId: string;

    it('action: add with code artifact', async () => {
      const result = await client.callTool({
        name: 'artifact',
        arguments: {
          action: 'add',
          planId,
          artifact: {
            title: 'User Authentication Module',
            description: 'JWT authentication implementation',
            artifactType: 'code',
            content: {
              language: 'typescript',
              sourceCode: `export class AuthService {
  async login(username: string, password: string): Promise<string> {
    // Validate credentials
    const user = await this.validateUser(username, password);
    // Generate JWT token
    return this.generateToken(user);
  }
}`,
              filename: 'auth-service.ts',
            },
            targets: [
              {
                path: 'src/services/auth-service.ts',
                action: 'create',
                description: 'Implement JWT authentication',
              },
            ],
            relatedPhaseId: phaseId,
            relatedRequirementIds: [requirementId],
            codeRefs: ['src/services/auth-service.ts:1'],
          },
        },
      });

      const parsed = parseResult<{ artifactId: string }>(result);
      expect(parsed.artifactId).toBeDefined();
      artifactId = parsed.artifactId;
    });

    it('action: add with all artifactTypes', async () => {
      const artifactTypes = ['config', 'migration', 'documentation', 'test', 'script', 'other'];

      for (const artifactType of artifactTypes) {
        const result = await client.callTool({
          name: 'artifact',
          arguments: {
            action: 'add',
            planId,
            artifact: {
              title: `${artifactType} artifact`,
              description: `Testing ${artifactType} type`,
              artifactType,
              content: {
                language: artifactType === 'documentation' ? 'markdown' : 'typescript',
                sourceCode: `// ${artifactType} example`,
                filename: `example.${artifactType}`,
              },
            },
          },
        });

        const parsed = parseResult<{ artifactId: string }>(result);
        expect(parsed.artifactId).toBeDefined();
      }
    });

    it('action: get', async () => {
      const result = await client.callTool({
        name: 'artifact',
        arguments: {
          action: 'get',
          planId,
          artifactId,
          fields: ['*'],
        },
      });

      const parsed = parseResult<{ artifact: { id: string; title: string } }>(result);
      expect(parsed.artifact.id).toBe(artifactId);
      expect(parsed.artifact.title).toBe('User Authentication Module');
    });

    it('action: get with fields parameter', async () => {
      const result = await client.callTool({
        name: 'artifact',
        arguments: {
          action: 'get',
          planId,
          artifactId,
          fields: ['id', 'title', 'artifactType'],
        },
      });

      const parsed = parseResult<{ artifact: Record<string, unknown> }>(result);
      expect(parsed.artifact.id).toBeDefined();
      expect(parsed.artifact.title).toBeDefined();
      expect(parsed.artifact.artifactType).toBeDefined();
      // Other fields should not be present
      expect(parsed.artifact.description).toBeUndefined();
      expect(parsed.artifact.content).toBeUndefined();
    });

    it('action: get with includeContent=true', async () => {
      const result = await client.callTool({
        name: 'artifact',
        arguments: {
          action: 'get',
          planId,
          artifactId,
          includeContent: true,
          fields: ['*'],
        },
      });

      const parsed = parseResult<{ artifact: { id: string; content: { sourceCode: string } } }>(result);
      expect(parsed.artifact.id).toBe(artifactId);
      expect(parsed.artifact.content).toBeDefined();
      expect(parsed.artifact.content.sourceCode).toContain('AuthService');
    });

    it('action: update', async () => {
      const result = await client.callTool({
        name: 'artifact',
        arguments: {
          action: 'update',
          planId,
          artifactId,
          updates: {
            title: 'Updated Authentication Module',
            description: 'Updated JWT implementation with refresh tokens',
            status: 'draft',
          },
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await client.callTool({
        name: 'artifact',
        arguments: {
          action: 'get',
          planId,
          artifactId,
          fields: ['*'],
        },
      });
      const getParsed = parseResult<{ artifact: { title: string; description: string } }>(getResult);
      expect(getParsed.artifact.title).toBe('Updated Authentication Module');
      expect(getParsed.artifact.description).toBe('Updated JWT implementation with refresh tokens');
    });

    it('action: list', async () => {
      const result = await client.callTool({
        name: 'artifact',
        arguments: {
          action: 'list',
          planId,
        },
      });

      const parsed = parseResult<{ artifacts: { id: string }[]; total: number }>(result);
      expect(parsed.artifacts.length).toBeGreaterThan(0);
      expect(parsed.total).toBeGreaterThan(0);
      expect(parsed.artifacts.some((a) => a.id === artifactId)).toBe(true);
    });

    it('action: list with filters', async () => {
      const result = await client.callTool({
        name: 'artifact',
        arguments: {
          action: 'list',
          planId,
          filters: {
            artifactType: 'code',
          },
        },
      });

      const parsed = parseResult<{ artifacts: { id: string }[]; total: number }>(result);
      expect(parsed.artifacts).toBeDefined();
      expect(parsed.total).toBeGreaterThanOrEqual(0);
    });

    it('action: list with relatedPhaseId filter', async () => {
      const result = await client.callTool({
        name: 'artifact',
        arguments: {
          action: 'list',
          planId,
          filters: {
            relatedPhaseId: phaseId,
          },
        },
      });

      const parsed = parseResult<{ artifacts: { id: string }[]; total: number }>(result);
      expect(parsed.artifacts).toBeDefined();
      // Should find at least our created artifact
      expect(parsed.artifacts.length).toBeGreaterThan(0);
    });

    it('action: delete', async () => {
      // Create an artifact to delete
      const createResult = await client.callTool({
        name: 'artifact',
        arguments: {
          action: 'add',
          planId,
          artifact: {
            title: 'Artifact to Delete',
            description: 'Will be deleted',
            artifactType: 'other',
            content: {
              language: 'text',
              sourceCode: 'delete me',
              filename: 'temp.txt',
            },
          },
        },
      });
      const created = parseResult<{ artifactId: string }>(createResult);

      const result = await client.callTool({
        name: 'artifact',
        arguments: {
          action: 'delete',
          planId,
          artifactId: created.artifactId,
        },
      });

      const parsed = parseResult<{ success: boolean }>(result);
      expect(parsed.success).toBe(true);
    });
  });

  // ============================================================
  // TOOL: query (5 actions)
  // ============================================================
  describe('Tool: query', () => {
    it('action: search', async () => {
      const result = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: 'Test',
          entityTypes: ['requirement', 'solution'],
          limit: 10,
          offset: 0,
        },
      });

      const parsed = parseResult<{ results: unknown[] }>(result);
      expect(parsed.results).toBeDefined();
    });

    it('action: trace', async () => {
      const result = await client.callTool({
        name: 'query',
        arguments: {
          action: 'trace',
          planId,
          requirementId,
        },
      });

      const parsed = parseResult<{ requirement: { id: string } }>(result);
      expect(parsed.requirement.id).toBe(requirementId);
    });

    it('action: validate', async () => {
      const result = await client.callTool({
        name: 'query',
        arguments: {
          action: 'validate',
          planId,
          checks: ['orphaned-requirements', 'missing-solutions'],
        },
      });

      const parsed = parseResult<{ checksPerformed: unknown[]; summary: unknown }>(result);
      expect(parsed.checksPerformed).toBeDefined();
      expect(parsed.summary).toBeDefined();
    });

    it('action: validate with empty checks (runs all)', async () => {
      // When checks array is empty or not provided, all checks should run
      const result = await client.callTool({
        name: 'query',
        arguments: {
          action: 'validate',
          planId,
          checks: [],
        },
      });

      const parsed = parseResult<{ checksPerformed: unknown[]; summary: unknown }>(result);
      expect(parsed.checksPerformed).toBeDefined();
      expect(parsed.summary).toBeDefined();
    });

    it('action: export markdown', async () => {
      const result = await client.callTool({
        name: 'query',
        arguments: {
          action: 'export',
          planId,
          format: 'markdown',
          sections: ['requirements', 'solutions', 'decisions'],
          includeVersionHistory: false,
        },
      });

      const parsed = parseResult<{ format: string; content: string }>(result);
      expect(parsed.format).toBe('markdown');
      expect(parsed.content).toContain('Updated Plan Name');
    });

    it('action: export json', async () => {
      const result = await client.callTool({
        name: 'query',
        arguments: {
          action: 'export',
          planId,
          format: 'json',
        },
      });

      const parsed = parseResult<{ format: string; content: unknown }>(result);
      expect(parsed.format).toBe('json');
      expect(parsed.content).toBeDefined();
    });

    it('action: health', async () => {
      const result = await client.callTool({
        name: 'query',
        arguments: {
          action: 'health',
        },
      });

      const parsed = parseResult<{ status: string; version: string; storagePath: string }>(result);
      expect(parsed.status).toBe('healthy');
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.storagePath).toBe(storagePath);
    });
  });

  // ============================================================
  // TOOL: batch (1 action: execute)
  // ============================================================
  describe('Tool: batch', () => {
    it('action: execute with single entity creation', async () => {
      const result = await client.callTool({
        name: 'batch',
        arguments: {
          planId,
          operations: [
            {
              entityType: 'requirement',
              payload: {
                title: 'Batch Test Requirement',
                description: 'Created via batch operation',
                source: { type: 'user-request' },
                acceptanceCriteria: ['AC1'],
                priority: 'medium',
                category: 'functional',
              },
            },
          ],
        },
      });

      const parsed = parseResult<{
        results: { success: boolean; id?: string }[];
        tempIdMapping: Record<string, string>;
      }>(result);

      expect(parsed.results).toHaveLength(1);
      expect(parsed.results[0].success).toBe(true);
      expect(parsed.results[0].id).toBeDefined();
    });

    it('action: execute with multiple entities and temp IDs', async () => {
      const result = await client.callTool({
        name: 'batch',
        arguments: {
          planId,
          operations: [
            {
              entityType: 'requirement',
              payload: {
                tempId: '$0',
                title: 'Batch Requirement 1',
                description: 'First requirement',
                source: { type: 'user-request' },
                acceptanceCriteria: ['AC1'],
                priority: 'high',
                category: 'functional',
              },
            },
            {
              entityType: 'requirement',
              payload: {
                tempId: '$1',
                title: 'Batch Requirement 2',
                description: 'Second requirement',
                source: { type: 'user-request' },
                acceptanceCriteria: ['AC1'],
                priority: 'medium',
                category: 'functional',
              },
            },
            {
              entityType: 'solution',
              payload: {
                tempId: '$2',
                title: 'Batch Solution',
                description: 'Solution addressing both requirements',
                approach: 'Unified approach',
                addressing: ['$0', '$1'], // Reference temp IDs
                tradeoffs: [],
                evaluation: {
                  effortEstimate: { value: 5, unit: 'days', confidence: 'medium' },
                  technicalFeasibility: 'high',
                  riskAssessment: 'Low',
                },
              },
            },
          ],
        },
      });

      const parsed = parseResult<{
        results: { success: boolean; id?: string }[];
        tempIdMapping: Record<string, string>;
      }>(result);

      expect(parsed.results).toHaveLength(3);
      expect(parsed.results[0].success).toBe(true);
      expect(parsed.results[1].success).toBe(true);
      expect(parsed.results[2].success).toBe(true);

      // Verify temp ID mapping
      expect(parsed.tempIdMapping.$0).toBeDefined();
      expect(parsed.tempIdMapping.$1).toBeDefined();
      expect(parsed.tempIdMapping.$2).toBeDefined();

      // Verify all operations returned IDs
      expect(parsed.results[0].id).toBeDefined();
      expect(parsed.results[1].id).toBeDefined();
      expect(parsed.results[2].id).toBeDefined();

      // Verify solution references were resolved - get solution and check addressing
      const solutionResult = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'get',
          planId,
          solutionId: parsed.tempIdMapping.$2,
          fields: ['*'],
        },
      });

      const solution = parseResult<{ solution: { addressing: string[] } }>(solutionResult);
      expect(solution.solution.addressing).toHaveLength(2);
      expect(solution.solution.addressing).toContain(parsed.tempIdMapping.$0);
      expect(solution.solution.addressing).toContain(parsed.tempIdMapping.$1);
    });

    it('action: execute with cross-entity references (requirement → phase → link)', async () => {
      const result = await client.callTool({
        name: 'batch',
        arguments: {
          planId,
          operations: [
            {
              entityType: 'requirement',
              payload: {
                tempId: '$0',
                title: 'Cross-ref Requirement',
                description: 'Testing cross-references',
                source: { type: 'user-request' },
                acceptanceCriteria: ['AC1'],
                priority: 'high',
                category: 'functional',
              },
            },
            {
              entityType: 'phase',
              payload: {
                tempId: '$1',
                title: 'Cross-ref Phase',
                description: 'Phase referencing requirement',
                objectives: ['Implement requirement'],
                deliverables: ['Code'],
                successCriteria: ['Tests pass'],
              },
            },
            {
              entityType: 'link',
              payload: {
                sourceId: '$1', // Phase
                targetId: '$0', // Requirement
                relationType: 'addresses',
                metadata: { batch_test: true },
              },
            },
          ],
        },
      });

      const parsed = parseResult<{
        results: { success: boolean; id?: string }[];
        tempIdMapping: Record<string, string>;
      }>(result);

      expect(parsed.results).toHaveLength(3);
      expect(parsed.results[0].success).toBe(true);
      expect(parsed.results[1].success).toBe(true);
      expect(parsed.results[2].success).toBe(true);

      // Verify link was created with resolved IDs
      const linkResult = await client.callTool({
        name: 'link',
        arguments: {
          action: 'get',
          planId,
          entityId: parsed.tempIdMapping.$1, // Phase ID
          direction: 'both',
        },
      });

      const links = parseResult<{ links: { sourceId: string; targetId: string }[] }>(linkResult);
      expect(links.links.length).toBeGreaterThan(0);
      const createdLink = links.links.find(
        (l) => l.sourceId === parsed.tempIdMapping.$1 && l.targetId === parsed.tempIdMapping.$0
      );
      expect(createdLink).toBeDefined();
    });

    it('action: execute with all entity types (requirement, solution, phase, link, decision, artifact)', async () => {
      // Ensure planId exists (for isolated test runs)
      if (planId === undefined || planId === '') {
        const planResult = await client.callTool({
          name: 'plan',
          arguments: {
            action: 'create',
            name: 'Batch All Types Test Plan',
            description: 'Plan for testing batch operations with all entity types',
          },
        });
        const parsed = parseResult<{ planId: string }>(planResult);
        planId = parsed.planId;
      }

      const result = await client.callTool({
        name: 'batch',
        arguments: {
          planId,
          operations: [
            {
              entityType: 'requirement',
              payload: {
                tempId: '$0',
                title: 'All Types Requirement',
                description: 'Testing all entity types',
                source: { type: 'user-request' },
                acceptanceCriteria: ['AC1'],
                priority: 'high',
                category: 'functional',
              },
            },
            {
              entityType: 'solution',
              payload: {
                tempId: '$1',
                title: 'All Types Solution',
                description: 'Solution for requirement',
                approach: 'Approach',
                addressing: ['$0'],
                tradeoffs: [],
                evaluation: {
                  effortEstimate: { value: 3, unit: 'days', confidence: 'high' },
                  technicalFeasibility: 'high',
                  riskAssessment: 'Low',
                },
              },
            },
            {
              entityType: 'decision',
              payload: {
                tempId: '$2',
                title: 'All Types Decision',
                question: 'Which approach?',
                context: 'Testing batch',
                decision: 'Use batch approach',
                alternativesConsidered: [],
                consequences: 'Faster setup',
              },
            },
            {
              entityType: 'phase',
              payload: {
                tempId: '$3',
                title: 'All Types Phase',
                description: 'Implementation phase',
                objectives: ['Implement'],
                deliverables: ['Code'],
                successCriteria: ['Tests pass'],
              },
            },
            {
              entityType: 'artifact',
              payload: {
                tempId: '$4',
                title: 'All Types Artifact',
                description: 'Generated code',
                artifactType: 'code',
                content: {
                  language: 'typescript',
                  sourceCode: '// batch test',
                  filename: 'batch.ts',
                },
                relatedPhaseId: '$3',
                relatedRequirementIds: ['$0'],
              },
            },
            {
              entityType: 'link',
              payload: {
                sourceId: '$1', // Solution
                targetId: '$0', // Requirement
                relationType: 'implements',
              },
            },
          ],
        },
      });

      const parsed = parseResult<{
        results: { success: boolean; id?: string }[];
        tempIdMapping: Record<string, string>;
      }>(result);

      expect(parsed.results).toHaveLength(6);

      // Verify all operations succeeded
      parsed.results.forEach((r) => {
        expect(r.success).toBe(true);
        expect(r.id).toBeDefined();
      });

      // Verify all temp IDs were mapped
      expect(parsed.tempIdMapping.$0).toBeDefined();
      expect(parsed.tempIdMapping.$1).toBeDefined();
      expect(parsed.tempIdMapping.$2).toBeDefined();
      expect(parsed.tempIdMapping.$3).toBeDefined();
      expect(parsed.tempIdMapping.$4).toBeDefined();

      // Verify artifact has resolved relatedPhaseId
      const artifactResult = await client.callTool({
        name: 'artifact',
        arguments: {
          action: 'get',
          planId,
          artifactId: parsed.tempIdMapping.$4,
          fields: ['*'],
        },
      });

      const artifact = parseResult<{
        artifact: { relatedPhaseId: string; relatedRequirementIds: string[] };
      }>(artifactResult);
      expect(artifact.artifact.relatedPhaseId).toBe(parsed.tempIdMapping.$3); // Resolved from $3
      expect(artifact.artifact.relatedRequirementIds).toContain(parsed.tempIdMapping.$0); // Resolved from $0
    });

    it('action: execute with rollback on error (atomic transaction)', async () => {
      // Get count of requirements before batch
      const beforeList = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'list',
          planId,
        },
      });
      const beforeCount = parseResult<{ total: number }>(beforeList).total;

      // Try to create batch with an invalid operation (should fail and rollback)
      try {
        await client.callTool({
          name: 'batch',
          arguments: {
            planId,
            operations: [
              {
                entityType: 'requirement',
                payload: {
                  title: 'Valid Requirement',
                  description: 'Should be rolled back',
                  source: { type: 'user-request' },
                  acceptanceCriteria: ['AC1'],
                  priority: 'high',
                  category: 'functional',
                },
              },
              {
                entityType: 'solution',
                payload: {
                  title: 'Invalid Solution',
                  description: 'Invalid evaluation format',
                  addressing: [],
                  tradeoffs: [],
                  evaluation: {
                    effortEstimate: {
                      value: -999, // Invalid negative value
                      unit: 'invalid_unit', // Invalid unit
                      confidence: 'invalid', // Invalid confidence
                    },
                  },
                },
              },
            ],
          },
        });

        // Should not reach here
        throw new Error('Expected batch to fail but it succeeded');
      } catch {
        // Expected error - verify rollback
        const afterList = await client.callTool({
          name: 'requirement',
          arguments: {
            action: 'list',
            planId,
          },
        });
        const afterCount = parseResult<{ total: number }>(afterList).total;

        // Count should be unchanged (rollback worked)
        expect(afterCount).toBe(beforeCount);
      }
    });
  });
});
