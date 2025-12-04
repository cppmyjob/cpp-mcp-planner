import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '../../src/server/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Comprehensive test of ALL MCP tools and ALL their actions.
 * This validates that tool-definitions.ts matches the actual service implementations.
 */

// Helper to parse MCP tool result
function parseResult<T>(result: unknown): T {
  const r = result as { content: Array<{ type: string; text: string }> };
  return JSON.parse(r.content[0].text) as T;
}

describe('E2E: All MCP Tools Validation', () => {
  let client: Client;
  let storagePath: string;
  let cleanup: () => Promise<void>;

  // IDs created during tests for cross-referencing
  let planId: string;
  let requirementId: string;
  let solutionId: string;
  let solutionId2: string;
  let decisionId: string;
  let phaseId: string;
  let childPhaseId: string;
  let linkId: string;

  beforeAll(async () => {
    storagePath = path.join(process.cwd(), '.test-all-tools-' + Date.now());
    await fs.mkdir(storagePath, { recursive: true });

    const services = await createServices(storagePath);
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
      await fs.rm(storagePath, { recursive: true, force: true });
    };
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================================
  // TOOL: plan (7 actions)
  // ============================================================
  describe('Tool: plan', () => {
    it('action: create', async () => {
      const result = await client.callTool({
        name: 'plan',
        arguments: {
          action: 'create',
          name: 'All Tools Test Plan',
          description: 'Testing all MCP tools',
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

      const parsed = parseResult<{ plans: Array<{ id: string }> }>(result);
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

      const parsed = parseResult<{ plans: Array<{ id: string; status: string }> }>(result);
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
          includeLinks: true,
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
  // TOOL: requirement (5 actions)
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
      // Test filtering by status (active, completed, etc.)
      const result = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'list',
          planId,
          filters: {
            status: 'active',
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
  });

  // ============================================================
  // TOOL: solution (6 actions)
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
  });

  // ============================================================
  // TOOL: decision (4 actions)
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
      const result = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'supersede',
          planId,
          decisionId,
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
        arguments: { action: 'get', planId, decisionId },
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
  });

  // ============================================================
  // TOOL: phase (6 actions)
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

      const parsed = parseResult<{ tree: Array<{ phase: Record<string, unknown> }> }>(result);
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
      expect(phase.metadata).toBeUndefined();
    });

    it('action: get_tree with fields parameter adds requested fields', async () => {
      const result = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'get_tree',
          planId,
          fields: ['objectives', 'deliverables'],
        },
      });

      const parsed = parseResult<{ tree: Array<{ phase: Record<string, unknown> }> }>(result);
      const phase = parsed.tree[0].phase;

      // Summary fields
      expect(phase.id).toBeDefined();
      expect(phase.title).toBeDefined();
      expect(phase.childCount).toBeDefined();

      // Requested fields should be present
      expect(phase.objectives).toBeDefined();
      expect(phase.deliverables).toBeDefined();

      // Non-requested fields should NOT be present
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

      const parsed = parseResult<{ tree: Array<{ phase: Record<string, unknown> }> }>(result);
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
        tree: Array<{ phase: Record<string, unknown>; children: unknown[]; hasChildren: boolean }>;
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
      const statusConfigs: Array<{ status: string; notes?: string }> = [
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
            ...(notes && { notes }),
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
    });

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
          newOrder: 0,
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

        const c1 = parseResult<{ phaseId: string }>(child1Result);
        const c2 = parseResult<{ phaseId: string }>(child2Result);
        const c3 = parseResult<{ phaseId: string }>(child3Result);

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
          tree: Array<{ phase: { path: string }; children: Array<{ phase: { path: string } }> }>;
        }>(treeResult);

        // Collect all paths and verify uniqueness
        const allPaths = new Set<string>();
        const collectPaths = (
          nodes: Array<{ phase: { path: string }; children?: Array<{ phase: { path: string } }> }>
        ) => {
          for (const node of nodes) {
            expect(allPaths.has(node.phase.path)).toBe(false);
            allPaths.add(node.phase.path);
            if (node.children && node.children.length > 0) {
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

      // Test other relation types
      const relationTypes = [
        'addresses',
        'depends_on',
        'blocks',
        'alternative_to',
        'supersedes',
        'references',
        'derived_from',
      ];

      for (const relationType of relationTypes) {
        const r = await client.callTool({
          name: 'link',
          arguments: {
            action: 'create',
            planId,
            sourceId: `test-source-${relationType}`,
            targetId: `test-target-${relationType}`,
            relationType,
          },
        });
        expect(parseResult<{ linkId: string }>(r).linkId).toBeDefined();
      }
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

      const parsed = parseResult<{ links: Array<{ relationType: string }> }>(result);
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
});
