import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { handleToolCall } from '../../src/server/tool-handlers.js';
import {
  createTestContext,
  cleanupTestContext,
  createTestRequirement,
  createTestSolution,
  createTestPhase,
  createTestDecision,
  type TestContext,
} from '../helpers/test-utils.js';

describe('Tool Handlers Integration', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext('tool-handler-test');
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  describe('Plan Management Tools', () => {
    it('create_plan should create a new plan', async () => {
      const result = await handleToolCall(
        'create_plan',
        { name: 'New Plan', description: 'Test' },
        ctx.services
      );

      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.planId).toBeDefined();
      expect(parsed.manifest.name).toBe('New Plan');
    });

    it('list_plans should return plans', async () => {
      const result = await handleToolCall('list_plans', {}, ctx.services);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.plans.length).toBeGreaterThan(0);
    });

    it('get_plan should return plan details', async () => {
      const result = await handleToolCall(
        'get_plan',
        { planId: ctx.planId, includeEntities: true },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.plan.manifest.id).toBe(ctx.planId);
      expect(parsed.plan.entities).toBeDefined();
    });

    it('update_plan should update plan', async () => {
      const result = await handleToolCall(
        'update_plan',
        { planId: ctx.planId, updates: { name: 'Updated Name' } },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.plan.name).toBe('Updated Name');
    });

    it('set_active_plan and get_active_plan should work', async () => {
      const workspacePath = '/test-workspace-' + Date.now();

      await handleToolCall(
        'set_active_plan',
        { planId: ctx.planId, workspacePath },
        ctx.services
      );

      const result = await handleToolCall(
        'get_active_plan',
        { workspacePath },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.activePlan).toBeDefined();
      expect(parsed.activePlan.planId).toBe(ctx.planId);
    });

    it('archive_plan should archive plan', async () => {
      const result = await handleToolCall(
        'archive_plan',
        { planId: ctx.planId, reason: 'Test' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Requirement Tools', () => {
    it('add_requirement should add requirement', async () => {
      const result = await handleToolCall(
        'add_requirement',
        {
          planId: ctx.planId,
          requirement: {
            title: 'Test Req',
            description: 'Desc',
            source: { type: 'user-request' },
            acceptanceCriteria: ['AC1'],
            priority: 'high',
            category: 'functional',
          },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.requirementId).toBeDefined();
    });

    it('get_requirement should return requirement', async () => {
      const req = await createTestRequirement(ctx);

      const result = await handleToolCall(
        'get_requirement',
        { planId: ctx.planId, requirementId: req.requirementId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.requirement.id).toBe(req.requirementId);
    });

    it('list_requirements should return requirements', async () => {
      await createTestRequirement(ctx);

      const result = await handleToolCall(
        'list_requirements',
        { planId: ctx.planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.requirements.length).toBeGreaterThan(0);
    });

    it('update_requirement should update', async () => {
      const req = await createTestRequirement(ctx);

      const result = await handleToolCall(
        'update_requirement',
        {
          planId: ctx.planId,
          requirementId: req.requirementId,
          updates: { title: 'Updated' },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.requirement.title).toBe('Updated');
    });

    it('delete_requirement should delete', async () => {
      const req = await createTestRequirement(ctx);

      const result = await handleToolCall(
        'delete_requirement',
        { planId: ctx.planId, requirementId: req.requirementId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Solution Tools', () => {
    it('propose_solution should create solution', async () => {
      const result = await handleToolCall(
        'propose_solution',
        {
          planId: ctx.planId,
          solution: {
            title: 'Solution',
            description: 'Desc',
            approach: 'Approach',
            addressing: [],
            tradeoffs: [],
            evaluation: {
              effortEstimate: { value: 1, unit: 'days', confidence: 'medium' },
              technicalFeasibility: 'high',
              riskAssessment: 'Low',
            },
          },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.solutionId).toBeDefined();
    });

    it('get_solution should return solution', async () => {
      const sol = await createTestSolution(ctx);

      const result = await handleToolCall(
        'get_solution',
        { planId: ctx.planId, solutionId: sol.solutionId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.solution.id).toBe(sol.solutionId);
    });

    it('compare_solutions should compare', async () => {
      const sol1 = await createTestSolution(ctx, [], { title: 'Solution 1' });
      const sol2 = await createTestSolution(ctx, [], { title: 'Solution 2' });

      const result = await handleToolCall(
        'compare_solutions',
        { planId: ctx.planId, solutionIds: [sol1.solutionId, sol2.solutionId] },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.comparison.solutions).toHaveLength(2);
    });

    it('select_solution should select', async () => {
      const sol = await createTestSolution(ctx);

      const result = await handleToolCall(
        'select_solution',
        { planId: ctx.planId, solutionId: sol.solutionId, rationale: 'Best fit' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.solution.status).toBe('selected');
    });

    it('delete_solution should delete', async () => {
      const sol = await createTestSolution(ctx);

      const result = await handleToolCall(
        'delete_solution',
        { planId: ctx.planId, solutionId: sol.solutionId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Decision Tools', () => {
    it('record_decision should create decision', async () => {
      const result = await handleToolCall(
        'record_decision',
        {
          planId: ctx.planId,
          decision: {
            title: 'Decision',
            question: 'What?',
            context: 'Context',
            decision: 'Answer',
            alternativesConsidered: [],
          },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.decisionId).toBeDefined();
    });

    it('get_decision should return decision', async () => {
      const dec = await createTestDecision(ctx);

      const result = await handleToolCall(
        'get_decision',
        { planId: ctx.planId, decisionId: dec.decisionId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.decision.id).toBe(dec.decisionId);
    });

    it('list_decisions should return decisions', async () => {
      await createTestDecision(ctx);

      const result = await handleToolCall(
        'list_decisions',
        { planId: ctx.planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.decisions.length).toBeGreaterThan(0);
    });

    it('supersede_decision should create new decision', async () => {
      const dec = await createTestDecision(ctx);

      const result = await handleToolCall(
        'supersede_decision',
        {
          planId: ctx.planId,
          decisionId: dec.decisionId,
          newDecision: { decision: 'New answer' },
          reason: 'Changed requirements',
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.newDecision).toBeDefined();
      expect(parsed.supersededDecision.status).toBe('superseded');
    });
  });

  describe('Phase Tools', () => {
    it('add_phase should create phase', async () => {
      const result = await handleToolCall(
        'add_phase',
        {
          planId: ctx.planId,
          phase: {
            title: 'Phase 1',
            description: 'Desc',
            objectives: ['Obj1'],
            deliverables: ['Del1'],
            successCriteria: ['Crit1'],
          },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.phaseId).toBeDefined();
    });

    it('get_phase_tree should return tree', async () => {
      await createTestPhase(ctx);

      const result = await handleToolCall(
        'get_phase_tree',
        { planId: ctx.planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tree.length).toBeGreaterThan(0);
    });

    it('update_phase_status should update status', async () => {
      const phase = await createTestPhase(ctx);

      const result = await handleToolCall(
        'update_phase_status',
        { planId: ctx.planId, phaseId: phase.phaseId, status: 'in_progress' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.phase.status).toBe('in_progress');
    });

    it('move_phase should move phase', async () => {
      const parent = await createTestPhase(ctx, { title: 'Parent' });
      const child = await createTestPhase(ctx, { title: 'Child' });

      const result = await handleToolCall(
        'move_phase',
        { planId: ctx.planId, phaseId: child.phaseId, newParentId: parent.phaseId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.phase.parentId).toBe(parent.phaseId);
    });

    it('delete_phase should delete phase', async () => {
      const phase = await createTestPhase(ctx);

      const result = await handleToolCall(
        'delete_phase',
        { planId: ctx.planId, phaseId: phase.phaseId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('get_next_actions should return actions', async () => {
      await createTestPhase(ctx);

      const result = await handleToolCall(
        'get_next_actions',
        { planId: ctx.planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.actions).toBeDefined();
    });
  });

  describe('Linking Tools', () => {
    it('link_entities should create link', async () => {
      const result = await handleToolCall(
        'link_entities',
        {
          planId: ctx.planId,
          sourceId: 'entity-1',
          targetId: 'entity-2',
          relationType: 'implements',
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.linkId).toBeDefined();
    });

    it('get_entity_links should return links', async () => {
      await handleToolCall(
        'link_entities',
        {
          planId: ctx.planId,
          sourceId: 'entity-1',
          targetId: 'entity-2',
          relationType: 'implements',
        },
        ctx.services
      );

      const result = await handleToolCall(
        'get_entity_links',
        { planId: ctx.planId, entityId: 'entity-1' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.links.length).toBeGreaterThan(0);
    });

    it('unlink_entities should remove link', async () => {
      const link = await handleToolCall(
        'link_entities',
        {
          planId: ctx.planId,
          sourceId: 'entity-1',
          targetId: 'entity-2',
          relationType: 'implements',
        },
        ctx.services
      );

      const linkId = JSON.parse(link.content[0].text).linkId;

      const result = await handleToolCall(
        'unlink_entities',
        { planId: ctx.planId, linkId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Query Tools', () => {
    it('search_entities should search', async () => {
      await createTestRequirement(ctx, { title: 'Authentication' });

      const result = await handleToolCall(
        'search_entities',
        { planId: ctx.planId, query: 'auth' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.length).toBeGreaterThan(0);
    });

    it('trace_requirement should trace', async () => {
      const req = await createTestRequirement(ctx);

      const result = await handleToolCall(
        'trace_requirement',
        { planId: ctx.planId, requirementId: req.requirementId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.requirement.id).toBe(req.requirementId);
    });

    it('validate_plan should validate', async () => {
      const result = await handleToolCall(
        'validate_plan',
        { planId: ctx.planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.checksPerformed).toBeDefined();
    });

    it('export_plan should export to markdown', async () => {
      const result = await handleToolCall(
        'export_plan',
        { planId: ctx.planId, format: 'markdown' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.format).toBe('markdown');
      expect(parsed.content).toContain('# Test Plan');
    });

    it('export_plan should export to json', async () => {
      const result = await handleToolCall(
        'export_plan',
        { planId: ctx.planId, format: 'json' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.format).toBe('json');
    });
  });

  describe('System Tools', () => {
    it('planning_health_check should return status', async () => {
      const result = await handleToolCall('planning_health_check', {}, ctx.services);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('healthy');
      expect(parsed.version).toBe('1.0.0');
    });
  });

  describe('Error Handling', () => {
    it('should throw McpError for unknown tool', async () => {
      await expect(
        handleToolCall('unknown_tool', {}, ctx.services)
      ).rejects.toThrow('Unknown tool');
    });

    it('should throw McpError for missing requirement', async () => {
      await expect(
        handleToolCall(
          'get_requirement',
          { planId: ctx.planId, requirementId: 'non-existent' },
          ctx.services
        )
      ).rejects.toThrow();
    });
  });
});
