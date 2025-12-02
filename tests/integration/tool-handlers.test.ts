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

/**
 * Integration tests for tool handlers.
 *
 * NOTE: These tests call handleToolCall() directly, bypassing MCP transport.
 * For E2E tests through the MCP protocol, see tests/e2e/mcp-all-tools.test.ts
 */
describe('Tool Handlers Integration', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext('tool-handler-test');
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  describe('Plan Management Tools', () => {
    it('plan create should create a new plan', async () => {
      const result = await handleToolCall(
        'plan',
        { action: 'create', name: 'New Plan', description: 'Test' },
        ctx.services
      );

      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.planId).toBeDefined();
      expect(parsed.manifest.name).toBe('New Plan');
    });

    it('plan list should return plans', async () => {
      const result = await handleToolCall('plan', { action: 'list' }, ctx.services);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.plans.length).toBeGreaterThan(0);
    });

    it('plan get should return plan details', async () => {
      const result = await handleToolCall(
        'plan',
        { action: 'get', planId: ctx.planId, includeEntities: true },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.plan.manifest.id).toBe(ctx.planId);
      expect(parsed.plan.entities).toBeDefined();
    });

    it('plan update should update plan', async () => {
      const result = await handleToolCall(
        'plan',
        { action: 'update', planId: ctx.planId, updates: { name: 'Updated Name' } },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.plan.name).toBe('Updated Name');
    });

    it('plan set_active and get_active should work', async () => {
      const workspacePath = '/test-workspace-' + Date.now();

      await handleToolCall(
        'plan',
        { action: 'set_active', planId: ctx.planId, workspacePath },
        ctx.services
      );

      const result = await handleToolCall(
        'plan',
        { action: 'get_active', workspacePath },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.activePlan).toBeDefined();
      expect(parsed.activePlan.planId).toBe(ctx.planId);
    });

    it('plan archive should archive plan', async () => {
      const result = await handleToolCall(
        'plan',
        { action: 'archive', planId: ctx.planId, reason: 'Test' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Requirement Tools', () => {
    it('requirement add should add requirement', async () => {
      const result = await handleToolCall(
        'requirement',
        {
          action: 'add',
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

    it('requirement get should return requirement', async () => {
      const req = await createTestRequirement(ctx);

      const result = await handleToolCall(
        'requirement',
        { action: 'get', planId: ctx.planId, requirementId: req.requirementId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.requirement.id).toBe(req.requirementId);
    });

    it('requirement list should return requirements', async () => {
      await createTestRequirement(ctx);

      const result = await handleToolCall(
        'requirement',
        { action: 'list', planId: ctx.planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.requirements.length).toBeGreaterThan(0);
    });

    it('requirement update should update', async () => {
      const req = await createTestRequirement(ctx);

      const result = await handleToolCall(
        'requirement',
        {
          action: 'update',
          planId: ctx.planId,
          requirementId: req.requirementId,
          updates: { title: 'Updated' },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.requirement.title).toBe('Updated');
    });

    it('requirement delete should delete', async () => {
      const req = await createTestRequirement(ctx);

      const result = await handleToolCall(
        'requirement',
        { action: 'delete', planId: ctx.planId, requirementId: req.requirementId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('requirement add should accept valid tags format', async () => {
      const result = await handleToolCall(
        'requirement',
        {
          action: 'add',
          planId: ctx.planId,
          requirement: {
            title: 'Req with tags',
            description: 'Testing tags',
            source: { type: 'user-request' },
            acceptanceCriteria: ['AC1'],
            priority: 'high',
            category: 'functional',
            tags: [
              { key: 'priority', value: 'p1' },
              { key: 'team', value: 'backend' },
            ],
          },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.requirementId).toBeDefined();
    });

    it('requirement add should reject invalid tags format', async () => {
      await expect(
        handleToolCall(
          'requirement',
          {
            action: 'add',
            planId: ctx.planId,
            requirement: {
              title: 'Req with invalid tags',
              description: 'Should fail',
              source: { type: 'user-request' },
              acceptanceCriteria: ['AC1'],
              priority: 'high',
              category: 'functional',
              tags: [
                { name: 'tag1', label: 'Label' }, // Invalid format!
              ],
            },
          },
          ctx.services
        )
      ).rejects.toThrow(/tag|key|value/i);
    });
  });

  describe('Solution Tools', () => {
    it('solution propose should create solution', async () => {
      const result = await handleToolCall(
        'solution',
        {
          action: 'propose',
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

    it('solution get should return solution', async () => {
      const sol = await createTestSolution(ctx);

      const result = await handleToolCall(
        'solution',
        { action: 'get', planId: ctx.planId, solutionId: sol.solutionId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.solution.id).toBe(sol.solutionId);
    });

    it('solution compare should compare', async () => {
      const sol1 = await createTestSolution(ctx, [], { title: 'Solution 1' });
      const sol2 = await createTestSolution(ctx, [], { title: 'Solution 2' });

      const result = await handleToolCall(
        'solution',
        { action: 'compare', planId: ctx.planId, solutionIds: [sol1.solutionId, sol2.solutionId] },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.comparison.solutions).toHaveLength(2);
    });

    it('solution select should select', async () => {
      const sol = await createTestSolution(ctx);

      const result = await handleToolCall(
        'solution',
        { action: 'select', planId: ctx.planId, solutionId: sol.solutionId, reason: 'Best fit' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.solution.status).toBe('selected');
    });

    it('solution delete should delete', async () => {
      const sol = await createTestSolution(ctx);

      const result = await handleToolCall(
        'solution',
        { action: 'delete', planId: ctx.planId, solutionId: sol.solutionId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('solution propose should accept valid tradeoffs format', async () => {
      const result = await handleToolCall(
        'solution',
        {
          action: 'propose',
          planId: ctx.planId,
          solution: {
            title: 'Solution with tradeoffs',
            description: 'Testing tradeoffs validation',
            approach: 'Standard approach',
            addressing: [],
            tradeoffs: [
              { aspect: 'Performance', pros: ['Fast', 'Efficient'], cons: ['Memory usage'], score: 8 },
              { aspect: 'Maintainability', pros: ['Clean code'], cons: ['Learning curve'], score: 7 },
            ],
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
      expect(parsed.solution.tradeoffs).toHaveLength(2);
      expect(parsed.solution.tradeoffs[0].aspect).toBe('Performance');
      expect(parsed.solution.tradeoffs[0].pros).toEqual(['Fast', 'Efficient']);
      expect(parsed.solution.tradeoffs[0].cons).toEqual(['Memory usage']);
    });

    it('solution propose should reject invalid tradeoffs format { pro, con }', async () => {
      await expect(
        handleToolCall(
          'solution',
          {
            action: 'propose',
            planId: ctx.planId,
            solution: {
              title: 'Solution with invalid tradeoffs',
              description: 'Should fail',
              approach: 'Approach',
              addressing: [],
              tradeoffs: [
                { pro: 'Some benefit', con: 'Some drawback' }, // Invalid format!
              ],
              evaluation: {
                effortEstimate: { value: 1, unit: 'days', confidence: 'medium' },
                technicalFeasibility: 'high',
                riskAssessment: 'Low',
              },
            },
          },
          ctx.services
        )
      ).rejects.toThrow(/tradeoff|aspect|pros|cons/i);
    });

    it('solution propose should accept valid effortEstimate format', async () => {
      const result = await handleToolCall(
        'solution',
        {
          action: 'propose',
          planId: ctx.planId,
          solution: {
            title: 'Solution with valid effortEstimate',
            description: 'Testing effortEstimate validation',
            approach: 'Standard approach',
            addressing: [],
            tradeoffs: [],
            evaluation: {
              effortEstimate: { value: 8, unit: 'hours', confidence: 'high' },
              technicalFeasibility: 'high',
              riskAssessment: 'Low',
            },
          },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.solutionId).toBeDefined();
      expect(parsed.solution.evaluation.effortEstimate.value).toBe(8);
      expect(parsed.solution.evaluation.effortEstimate.unit).toBe('hours');
      expect(parsed.solution.evaluation.effortEstimate.confidence).toBe('high');
    });

    it('solution propose should reject invalid effortEstimate format', async () => {
      await expect(
        handleToolCall(
          'solution',
          {
            action: 'propose',
            planId: ctx.planId,
            solution: {
              title: 'Solution with invalid effortEstimate',
              description: 'Should fail',
              approach: 'Approach',
              addressing: [],
              tradeoffs: [],
              evaluation: {
                effortEstimate: { hours: 8, complexity: 'medium' }, // Invalid format!
                technicalFeasibility: 'high',
                riskAssessment: 'Low',
              },
            },
          },
          ctx.services
        )
      ).rejects.toThrow(/effortEstimate|value|unit|confidence/i);
    });

    it('solution update should reject invalid effortEstimate format', async () => {
      // First create a valid solution
      const createResult = await handleToolCall(
        'solution',
        {
          action: 'propose',
          planId: ctx.planId,
          solution: {
            title: 'Solution for update test',
            description: 'Valid solution',
            approach: 'Approach',
            addressing: [],
            tradeoffs: [],
            evaluation: {
              effortEstimate: { value: 8, unit: 'hours', confidence: 'high' },
              technicalFeasibility: 'high',
              riskAssessment: 'Low',
            },
          },
        },
        ctx.services
      );
      const { solutionId } = JSON.parse(createResult.content[0].text);

      // Then try to update with invalid effortEstimate
      await expect(
        handleToolCall(
          'solution',
          {
            action: 'update',
            planId: ctx.planId,
            solutionId,
            updates: {
              evaluation: {
                effortEstimate: { hours: 16, complexity: 'low' }, // Invalid format!
                technicalFeasibility: 'medium',
                riskAssessment: 'Medium',
              },
            },
          },
          ctx.services
        )
      ).rejects.toThrow(/effortEstimate|value|unit|confidence/i);
    });

    it('solution update should reject invalid tags format', async () => {
      // First create a valid solution
      const createResult = await handleToolCall(
        'solution',
        {
          action: 'propose',
          planId: ctx.planId,
          solution: {
            title: 'Solution for tags update test',
            description: 'Valid solution',
            approach: 'Approach',
            addressing: [],
            tradeoffs: [],
            evaluation: {
              effortEstimate: { value: 4, unit: 'hours', confidence: 'medium' },
              technicalFeasibility: 'high',
              riskAssessment: 'Low',
            },
          },
        },
        ctx.services
      );
      const { solutionId } = JSON.parse(createResult.content[0].text);

      // Then try to update with invalid tags
      await expect(
        handleToolCall(
          'solution',
          {
            action: 'update',
            planId: ctx.planId,
            solutionId,
            updates: {
              tags: [{ name: 'tag1', label: 'Label' }], // Invalid format!
            },
          },
          ctx.services
        )
      ).rejects.toThrow(/tag|key|value/i);
    });

    it('solution update should reject invalid tradeoffs format', async () => {
      // First create a valid solution
      const createResult = await handleToolCall(
        'solution',
        {
          action: 'propose',
          planId: ctx.planId,
          solution: {
            title: 'Solution for tradeoffs update test',
            description: 'Valid solution',
            approach: 'Approach',
            addressing: [],
            tradeoffs: [],
            evaluation: {
              effortEstimate: { value: 2, unit: 'days', confidence: 'low' },
              technicalFeasibility: 'high',
              riskAssessment: 'Low',
            },
          },
        },
        ctx.services
      );
      const { solutionId } = JSON.parse(createResult.content[0].text);

      // Then try to update with invalid tradeoffs
      await expect(
        handleToolCall(
          'solution',
          {
            action: 'update',
            planId: ctx.planId,
            solutionId,
            updates: {
              tradeoffs: [{ pro: 'Good', con: 'Bad' }], // Invalid format!
            },
          },
          ctx.services
        )
      ).rejects.toThrow(/tradeoff|aspect|pros|cons/i);
    });
  });

  describe('Decision Tools', () => {
    it('decision record should create decision', async () => {
      const result = await handleToolCall(
        'decision',
        {
          action: 'record',
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

    it('decision record should accept valid alternativesConsidered format', async () => {
      const result = await handleToolCall(
        'decision',
        {
          action: 'record',
          planId: ctx.planId,
          decision: {
            title: 'Decision with alternatives',
            question: 'Which approach?',
            context: 'Context',
            decision: 'Option A',
            alternativesConsidered: [
              { option: 'Option B', reasoning: 'Simpler', whyNotChosen: 'Less flexible' },
              { option: 'Option C', reasoning: 'Faster' },
            ],
          },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.decisionId).toBeDefined();
      expect(parsed.decision.alternativesConsidered).toHaveLength(2);
      expect(parsed.decision.alternativesConsidered[0].option).toBe('Option B');
    });

    it('decision record should reject invalid alternativesConsidered format', async () => {
      await expect(
        handleToolCall(
          'decision',
          {
            action: 'record',
            planId: ctx.planId,
            decision: {
              title: 'Decision with invalid alternatives',
              question: 'What?',
              context: 'Context',
              decision: 'Answer',
              alternativesConsidered: [
                { name: 'Option A', desc: 'Description' }, // Invalid format!
              ],
            },
          },
          ctx.services
        )
      ).rejects.toThrow(/alternativesConsidered|option|reasoning/i);
    });

    it('decision get should return decision', async () => {
      const dec = await createTestDecision(ctx);

      const result = await handleToolCall(
        'decision',
        { action: 'get', planId: ctx.planId, decisionId: dec.decisionId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.decision.id).toBe(dec.decisionId);
    });

    it('decision list should return decisions', async () => {
      await createTestDecision(ctx);

      const result = await handleToolCall(
        'decision',
        { action: 'list', planId: ctx.planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.decisions.length).toBeGreaterThan(0);
    });

    it('decision supersede should create new decision', async () => {
      const dec = await createTestDecision(ctx);

      const result = await handleToolCall(
        'decision',
        {
          action: 'supersede',
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
    it('phase add should create phase', async () => {
      const result = await handleToolCall(
        'phase',
        {
          action: 'add',
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

    it('phase add should accept valid estimatedEffort format', async () => {
      const result = await handleToolCall(
        'phase',
        {
          action: 'add',
          planId: ctx.planId,
          phase: {
            title: 'Phase with effort',
            description: 'Testing estimatedEffort',
            objectives: ['Obj1'],
            deliverables: ['Del1'],
            successCriteria: ['Crit1'],
            estimatedEffort: { value: 4, unit: 'days', confidence: 'medium' },
          },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.phaseId).toBeDefined();
      expect(parsed.phase.schedule.estimatedEffort.value).toBe(4);
      expect(parsed.phase.schedule.estimatedEffort.unit).toBe('days');
    });

    it('phase add should reject invalid estimatedEffort format', async () => {
      await expect(
        handleToolCall(
          'phase',
          {
            action: 'add',
            planId: ctx.planId,
            phase: {
              title: 'Phase with invalid effort',
              description: 'Should fail',
              objectives: ['Obj1'],
              deliverables: ['Del1'],
              successCriteria: ['Crit1'],
              estimatedEffort: { hours: 8 }, // Invalid format!
            },
          },
          ctx.services
        )
      ).rejects.toThrow(/effortEstimate|estimatedEffort|value|unit|confidence/i);
    });

    it('phase get_tree should return tree', async () => {
      await createTestPhase(ctx);

      const result = await handleToolCall(
        'phase',
        { action: 'get_tree', planId: ctx.planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tree.length).toBeGreaterThan(0);
    });

    it('phase update_status should update status', async () => {
      const phase = await createTestPhase(ctx);

      const result = await handleToolCall(
        'phase',
        { action: 'update_status', planId: ctx.planId, phaseId: phase.phaseId, status: 'in_progress' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.phase.status).toBe('in_progress');
    });

    it('phase move should move phase', async () => {
      const parent = await createTestPhase(ctx, { title: 'Parent' });
      const child = await createTestPhase(ctx, { title: 'Child' });

      const result = await handleToolCall(
        'phase',
        { action: 'move', planId: ctx.planId, phaseId: child.phaseId, newParentId: parent.phaseId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.phase.parentId).toBe(parent.phaseId);
    });

    it('phase delete should delete phase', async () => {
      const phase = await createTestPhase(ctx);

      const result = await handleToolCall(
        'phase',
        { action: 'delete', planId: ctx.planId, phaseId: phase.phaseId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('phase get_next_actions should return actions', async () => {
      await createTestPhase(ctx);

      const result = await handleToolCall(
        'phase',
        { action: 'get_next_actions', planId: ctx.planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.actions).toBeDefined();
    });
  });

  describe('Linking Tools', () => {
    it('link create should create link', async () => {
      const result = await handleToolCall(
        'link',
        {
          action: 'create',
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

    it('link get should return links', async () => {
      await handleToolCall(
        'link',
        {
          action: 'create',
          planId: ctx.planId,
          sourceId: 'entity-1',
          targetId: 'entity-2',
          relationType: 'implements',
        },
        ctx.services
      );

      const result = await handleToolCall(
        'link',
        { action: 'get', planId: ctx.planId, entityId: 'entity-1' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.links.length).toBeGreaterThan(0);
    });

    it('link delete should remove link', async () => {
      const link = await handleToolCall(
        'link',
        {
          action: 'create',
          planId: ctx.planId,
          sourceId: 'entity-1',
          targetId: 'entity-2',
          relationType: 'implements',
        },
        ctx.services
      );

      const linkId = JSON.parse(link.content[0].text).linkId;

      const result = await handleToolCall(
        'link',
        { action: 'delete', planId: ctx.planId, linkId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Query Tools', () => {
    it('query search should search', async () => {
      await createTestRequirement(ctx, { title: 'Authentication' });

      const result = await handleToolCall(
        'query',
        { action: 'search', planId: ctx.planId, query: 'auth' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.length).toBeGreaterThan(0);
    });

    it('query trace should trace', async () => {
      const req = await createTestRequirement(ctx);

      const result = await handleToolCall(
        'query',
        { action: 'trace', planId: ctx.planId, requirementId: req.requirementId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.requirement.id).toBe(req.requirementId);
    });

    it('query validate should validate', async () => {
      const result = await handleToolCall(
        'query',
        { action: 'validate', planId: ctx.planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.checksPerformed).toBeDefined();
    });

    it('query export should export to markdown', async () => {
      const result = await handleToolCall(
        'query',
        { action: 'export', planId: ctx.planId, format: 'markdown' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.format).toBe('markdown');
      expect(parsed.content).toContain('# Test Plan');
    });

    it('query export should export to json', async () => {
      const result = await handleToolCall(
        'query',
        { action: 'export', planId: ctx.planId, format: 'json' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.format).toBe('json');
    });

    it('query export markdown should include tradeoffs correctly', async () => {
      // Create solution with tradeoffs
      await handleToolCall(
        'solution',
        {
          action: 'propose',
          planId: ctx.planId,
          solution: {
            title: 'Solution for export test',
            description: 'Testing markdown export',
            approach: 'Standard approach',
            addressing: [],
            tradeoffs: [
              { aspect: 'Performance', pros: ['Fast', 'Scalable'], cons: ['Memory heavy'], score: 8 },
            ],
            evaluation: {
              effortEstimate: { value: 1, unit: 'days', confidence: 'medium' },
              technicalFeasibility: 'high',
              riskAssessment: 'Low',
            },
          },
        },
        ctx.services
      );

      const result = await handleToolCall(
        'query',
        { action: 'export', planId: ctx.planId, format: 'markdown' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.format).toBe('markdown');
      expect(parsed.content).toContain('Trade-offs');
      expect(parsed.content).toContain('Performance');
      expect(parsed.content).toContain('Fast');
      expect(parsed.content).toContain('Scalable');
      expect(parsed.content).toContain('Memory heavy');
    });

    it('query health should return status', async () => {
      const result = await handleToolCall('query', { action: 'health' }, ctx.services);

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

    it('should throw McpError for unknown action', async () => {
      await expect(
        handleToolCall('plan', { action: 'unknown_action' }, ctx.services)
      ).rejects.toThrow('Unknown action');
    });

    it('should throw McpError for missing requirement', async () => {
      await expect(
        handleToolCall(
          'requirement',
          { action: 'get', planId: ctx.planId, requirementId: 'non-existent' },
          ctx.services
        )
      ).rejects.toThrow();
    });
  });
});
