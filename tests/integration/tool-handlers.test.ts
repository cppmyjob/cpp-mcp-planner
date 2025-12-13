import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { handleToolCall } from '../../src/server/tool-handlers.js';
import {
  createTestContext,
  cleanupTestContext,
  createTestRequirement,
  createTestSolution,
  createTestPhase,
  createTestDecision,
  createTestArtifact,
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

      // Verify via get
      const getResult = await handleToolCall(
        'plan',
        { action: 'get', planId: parsed.planId },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.plan.manifest.name).toBe('New Plan');
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
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await handleToolCall(
        'plan',
        { action: 'get', planId: ctx.planId },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.plan.manifest.name).toBe('Updated Name');
    });

    it('plan set_active and get_active should work', async () => {
      const workspacePath = '/test-workspace-' + String(Date.now());

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
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await handleToolCall(
        'requirement',
        { action: 'get', planId: ctx.planId, requirementId: req.requirementId },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.requirement.title).toBe('Updated');
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
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await handleToolCall(
        'solution',
        { action: 'get', planId: ctx.planId, solutionId: sol.solutionId },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.solution.status).toBe('selected');
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

      // Verify via get
      const getResult = await handleToolCall(
        'solution',
        { action: 'get', planId: ctx.planId, solutionId: parsed.solutionId },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.solution.tradeoffs).toHaveLength(2);
      expect(getParsed.solution.tradeoffs[0].aspect).toBe('Performance');
      expect(getParsed.solution.tradeoffs[0].pros).toEqual(['Fast', 'Efficient']);
      expect(getParsed.solution.tradeoffs[0].cons).toEqual(['Memory usage']);
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

      // Verify via get
      const getResult = await handleToolCall(
        'solution',
        { action: 'get', planId: ctx.planId, solutionId: parsed.solutionId },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.solution.evaluation.effortEstimate.value).toBe(8);
      expect(getParsed.solution.evaluation.effortEstimate.unit).toBe('hours');
      expect(getParsed.solution.evaluation.effortEstimate.confidence).toBe('high');
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

      // Verify via get
      const getResult = await handleToolCall(
        'decision',
        { action: 'get', planId: ctx.planId, decisionId: parsed.decisionId },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.decision.alternativesConsidered).toHaveLength(2);
      expect(getParsed.decision.alternativesConsidered[0].option).toBe('Option B');
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
      expect(parsed.success).toBe(true);
      expect(parsed.newDecisionId).toBeDefined();
      expect(parsed.supersededDecisionId).toBe(dec.decisionId);

      // Verify old decision is superseded
      const getOld = await handleToolCall(
        'decision',
        { action: 'get', planId: ctx.planId, decisionId: dec.decisionId },
        ctx.services
      );
      const oldParsed = JSON.parse(getOld.content[0].text);
      expect(oldParsed.decision.status).toBe('superseded');

      // Verify new decision exists
      const getNew = await handleToolCall(
        'decision',
        { action: 'get', planId: ctx.planId, decisionId: parsed.newDecisionId },
        ctx.services
      );
      const newParsed = JSON.parse(getNew.content[0].text);
      expect(newParsed.decision.decision).toBe('New answer');
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

      // Verify via get (use fields=['*'] to get schedule)
      const getResult = await handleToolCall(
        'phase',
        { action: 'get', planId: ctx.planId, phaseId: parsed.phaseId, fields: ['*'] },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.phase.schedule.estimatedEffort.value).toBe(4);
      expect(getParsed.phase.schedule.estimatedEffort.unit).toBe('days');
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
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await handleToolCall(
        'phase',
        { action: 'get', planId: ctx.planId, phaseId: phase.phaseId },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.phase.status).toBe('in_progress');
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
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await handleToolCall(
        'phase',
        { action: 'get', planId: ctx.planId, phaseId: child.phaseId },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.phase.parentId).toBe(parent.phaseId);
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

    // Sprint 5 - Order/Path Bug Fix Integration Tests
    describe('order/path persistence (Sprint 5 - Bug Fix)', () => {
      it('should generate correct order after adding multiple phases', async () => {
        // Add 3 phases sequentially
        const phase1 = await handleToolCall(
          'phase',
          { action: 'add', planId: ctx.planId, phase: { title: 'Phase 1', description: 'First' } },
          ctx.services
        );
        const phase2 = await handleToolCall(
          'phase',
          { action: 'add', planId: ctx.planId, phase: { title: 'Phase 2', description: 'Second' } },
          ctx.services
        );
        const phase3 = await handleToolCall(
          'phase',
          { action: 'add', planId: ctx.planId, phase: { title: 'Phase 3', description: 'Third' } },
          ctx.services
        );

        const p1 = JSON.parse(phase1.content[0].text);
        const p2 = JSON.parse(phase2.content[0].text);
        const p3 = JSON.parse(phase3.content[0].text);

        // Verify via get
        const get1 = await handleToolCall('phase', { action: 'get', planId: ctx.planId, phaseId: p1.phaseId }, ctx.services);
        const get2 = await handleToolCall('phase', { action: 'get', planId: ctx.planId, phaseId: p2.phaseId }, ctx.services);
        const get3 = await handleToolCall('phase', { action: 'get', planId: ctx.planId, phaseId: p3.phaseId }, ctx.services);

        const getParsed1 = JSON.parse(get1.content[0].text);
        const getParsed2 = JSON.parse(get2.content[0].text);
        const getParsed3 = JSON.parse(get3.content[0].text);

        expect(getParsed1.phase.order).toBe(1);
        expect(getParsed2.phase.order).toBe(2);
        expect(getParsed3.phase.order).toBe(3);
        expect(getParsed1.phase.path).toBe('1');
        expect(getParsed2.phase.path).toBe('2');
        expect(getParsed3.phase.path).toBe('3');
      });

      it('should calculate order based on max existing order after delete', async () => {
        // Add 3 phases
        await handleToolCall(
          'phase',
          { action: 'add', planId: ctx.planId, phase: { title: 'Phase 1', description: 'First' } },
          ctx.services
        );
        const phase2 = await handleToolCall(
          'phase',
          { action: 'add', planId: ctx.planId, phase: { title: 'Phase 2', description: 'Second' } },
          ctx.services
        );
        const phase3 = await handleToolCall(
          'phase',
          { action: 'add', planId: ctx.planId, phase: { title: 'Phase 3', description: 'Third' } },
          ctx.services
        );

        const p2 = JSON.parse(phase2.content[0].text);
        JSON.parse(phase3.content[0].text);

        // Delete phase 2
        await handleToolCall(
          'phase',
          { action: 'delete', planId: ctx.planId, phaseId: p2.phaseId },
          ctx.services
        );

        // Add new phase - should get order 4 (max=3, +1), not 3 (count=2, +1)
        const phase4 = await handleToolCall(
          'phase',
          { action: 'add', planId: ctx.planId, phase: { title: 'Phase 4', description: 'Fourth' } },
          ctx.services
        );

        const p4 = JSON.parse(phase4.content[0].text);

        // Verify via get
        const get4 = await handleToolCall('phase', { action: 'get', planId: ctx.planId, phaseId: p4.phaseId }, ctx.services);
        const getParsed4 = JSON.parse(get4.content[0].text);

        expect(getParsed4.phase.order).toBe(4);
        expect(getParsed4.phase.path).toBe('4');
      });

      it('should maintain unique paths for all phases in tree', async () => {
        // Add parent phases
        const parent1 = await handleToolCall(
          'phase',
          { action: 'add', planId: ctx.planId, phase: { title: 'Parent 1', description: 'P1' } },
          ctx.services
        );
        const parent2 = await handleToolCall(
          'phase',
          { action: 'add', planId: ctx.planId, phase: { title: 'Parent 2', description: 'P2' } },
          ctx.services
        );

        const p1 = JSON.parse(parent1.content[0].text);
        const p2 = JSON.parse(parent2.content[0].text);

        // Add children to parent1
        const child1 = await handleToolCall(
          'phase',
          {
            action: 'add',
            planId: ctx.planId,
            phase: { title: 'Child 1.1', description: 'C1', parentId: p1.phaseId },
          },
          ctx.services
        );
        const child2 = await handleToolCall(
          'phase',
          {
            action: 'add',
            planId: ctx.planId,
            phase: { title: 'Child 1.2', description: 'C2', parentId: p1.phaseId },
          },
          ctx.services
        );

        const c1 = JSON.parse(child1.content[0].text);
        const c2 = JSON.parse(child2.content[0].text);

        // Verify paths via get
        const get1 = await handleToolCall('phase', { action: 'get', planId: ctx.planId, phaseId: p1.phaseId }, ctx.services);
        const get2 = await handleToolCall('phase', { action: 'get', planId: ctx.planId, phaseId: p2.phaseId }, ctx.services);
        const getC1 = await handleToolCall('phase', { action: 'get', planId: ctx.planId, phaseId: c1.phaseId }, ctx.services);
        const getC2 = await handleToolCall('phase', { action: 'get', planId: ctx.planId, phaseId: c2.phaseId }, ctx.services);

        const getParsed1 = JSON.parse(get1.content[0].text);
        const getParsed2 = JSON.parse(get2.content[0].text);
        const getParsedC1 = JSON.parse(getC1.content[0].text);
        const getParsedC2 = JSON.parse(getC2.content[0].text);

        expect(getParsed1.phase.path).toBe('1');
        expect(getParsed2.phase.path).toBe('2');
        expect(getParsedC1.phase.path).toBe('1.1');
        expect(getParsedC2.phase.path).toBe('1.2');

        // Get tree and verify all paths
        const tree = await handleToolCall(
          'phase',
          { action: 'get_tree', planId: ctx.planId },
          ctx.services
        );
        const treeData = JSON.parse(tree.content[0].text);

        const allPaths = new Set<string>();
        const collectPaths = (
          nodes: { phase: { path: string }; children?: { phase: { path: string } }[] }[]
        ): void => {
          for (const node of nodes) {
            expect(allPaths.has(node.phase.path)).toBe(false); // Should not have duplicates
            allPaths.add(node.phase.path);
            if (node.children !== undefined && node.children.length > 0) {
              collectPaths(
                node.children as {
                  phase: { path: string };
                  children?: { phase: { path: string } }[];
                }[]
              );
            }
          }
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        collectPaths(treeData.tree);

        expect(allPaths.size).toBe(4); // 2 parents + 2 children
      });

      it('should handle order gaps when adding child phases after delete', async () => {
        // Add parent
        const parent = await handleToolCall(
          'phase',
          { action: 'add', planId: ctx.planId, phase: { title: 'Parent', description: 'P' } },
          ctx.services
        );
        const p = JSON.parse(parent.content[0].text);

        // Add 3 children
        const child1 = await handleToolCall(
          'phase',
          {
            action: 'add',
            planId: ctx.planId,
            phase: { title: 'Child 1', description: 'C1', parentId: p.phaseId },
          },
          ctx.services
        );
        const child2 = await handleToolCall(
          'phase',
          {
            action: 'add',
            planId: ctx.planId,
            phase: { title: 'Child 2', description: 'C2', parentId: p.phaseId },
          },
          ctx.services
        );
        const child3 = await handleToolCall(
          'phase',
          {
            action: 'add',
            planId: ctx.planId,
            phase: { title: 'Child 3', description: 'C3', parentId: p.phaseId },
          },
          ctx.services
        );

        JSON.parse(child1.content[0].text);
        const c2 = JSON.parse(child2.content[0].text);
        JSON.parse(child3.content[0].text);

        // Delete child 2 (creates gap: 1, _, 3)
        await handleToolCall(
          'phase',
          { action: 'delete', planId: ctx.planId, phaseId: c2.phaseId },
          ctx.services
        );

        // Add new child - should get order 4 (max=3, +1), not 3 (count=2, +1)
        const child4 = await handleToolCall(
          'phase',
          {
            action: 'add',
            planId: ctx.planId,
            phase: { title: 'Child 4', description: 'C4', parentId: p.phaseId },
          },
          ctx.services
        );

        const c4 = JSON.parse(child4.content[0].text);

        // Verify via get
        const get4 = await handleToolCall('phase', { action: 'get', planId: ctx.planId, phaseId: c4.phaseId }, ctx.services);
        const getParsed4 = JSON.parse(get4.content[0].text);

        expect(getParsed4.phase.order).toBe(4);
        expect(getParsed4.phase.path).toBe('1.4');
      });

      it('should persist order correctly when using explicit order', async () => {
        // Add phase with explicit order=10
        const phase1 = await handleToolCall(
          'phase',
          {
            action: 'add',
            planId: ctx.planId,
            phase: { title: 'Phase 10', description: 'Explicit order', order: 10 },
          },
          ctx.services
        );

        const p1 = JSON.parse(phase1.content[0].text);

        // Verify via get
        const get1 = await handleToolCall('phase', { action: 'get', planId: ctx.planId, phaseId: p1.phaseId }, ctx.services);
        const getParsed1 = JSON.parse(get1.content[0].text);

        expect(getParsed1.phase.order).toBe(10);
        expect(getParsed1.phase.path).toBe('10');

        // Add auto-ordered phase - should get order 11 (max=10, +1)
        const phase2 = await handleToolCall(
          'phase',
          { action: 'add', planId: ctx.planId, phase: { title: 'Phase Auto', description: 'Auto order' } },
          ctx.services
        );

        const p2 = JSON.parse(phase2.content[0].text);

        // Verify via get
        const get2 = await handleToolCall('phase', { action: 'get', planId: ctx.planId, phaseId: p2.phaseId }, ctx.services);
        const getParsed2 = JSON.parse(get2.content[0].text);

        expect(getParsed2.phase.order).toBe(11);
        expect(getParsed2.phase.path).toBe('11');
      });
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

  describe('Artifact Tools', () => {
    it('artifact add should create artifact', async () => {
      const result = await handleToolCall(
        'artifact',
        {
          action: 'add',
          planId: ctx.planId,
          artifact: {
            title: 'User Service',
            description: 'Service for user management',
            artifactType: 'code',
            content: {
              language: 'typescript',
              sourceCode: 'export class UserService { }',
              filename: 'user-service.ts',
            },
          },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.artifactId).toBeDefined();

      // Verify via get
      const getResult = await handleToolCall(
        'artifact',
        { action: 'get', planId: ctx.planId, artifactId: parsed.artifactId },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.artifact.title).toBe('User Service');
      expect(getParsed.artifact.artifactType).toBe('code');
      expect(getParsed.artifact.status).toBe('draft');
    });

    it('artifact add should accept valid targets', async () => {
      const result = await handleToolCall(
        'artifact',
        {
          action: 'add',
          planId: ctx.planId,
          artifact: {
            title: 'Database Migration',
            description: 'Add users table',
            artifactType: 'migration',
            content: {
              language: 'sql',
              sourceCode: 'CREATE TABLE users (id INT PRIMARY KEY);',
            },
            targets: [
              { path: 'migrations/001_users.sql', action: 'create', description: 'User table migration' },
              { path: 'src/models/user.ts', action: 'create' },
            ],
          },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.artifactId).toBeDefined();

      // Verify via get
      const getResult = await handleToolCall(
        'artifact',
        { action: 'get', planId: ctx.planId, artifactId: parsed.artifactId },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.artifact.targets).toHaveLength(2);
      expect(getParsed.artifact.targets[0].action).toBe('create');
    });

    it('artifact add should reject invalid artifactType', async () => {
      await expect(
        handleToolCall(
          'artifact',
          {
            action: 'add',
            planId: ctx.planId,
            artifact: {
              title: 'Invalid Artifact',
              description: 'Should fail',
              artifactType: 'invalid-type',
              content: { language: 'ts', sourceCode: '' },
            },
          },
          ctx.services
        )
      ).rejects.toThrow(/artifactType/i);
    });

    it('artifact add should reject invalid targets action', async () => {
      await expect(
        handleToolCall(
          'artifact',
          {
            action: 'add',
            planId: ctx.planId,
            artifact: {
              title: 'Test Artifact',
              description: 'Test',
              artifactType: 'code',
              content: { language: 'ts', sourceCode: '' },
              targets: [{ path: 'file.ts', action: 'invalid-action' }],
            },
          },
          ctx.services
        )
      ).rejects.toThrow(/action/i);
    });

    it('artifact get should return artifact', async () => {
      const artifact = await createTestArtifact(ctx);

      const result = await handleToolCall(
        'artifact',
        { action: 'get', planId: ctx.planId, artifactId: artifact.artifactId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.artifact.id).toBe(artifact.artifactId);
    });

    it('artifact update should update artifact', async () => {
      const artifact = await createTestArtifact(ctx);

      const result = await handleToolCall(
        'artifact',
        {
          action: 'update',
          planId: ctx.planId,
          artifactId: artifact.artifactId,
          updates: {
            title: 'Updated Title',
            status: 'reviewed',
          },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await handleToolCall(
        'artifact',
        { action: 'get', planId: ctx.planId, artifactId: artifact.artifactId },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.artifact.title).toBe('Updated Title');
      expect(getParsed.artifact.status).toBe('reviewed');
      expect(getParsed.artifact.version).toBe(2);
    });

    it('artifact update should reject invalid targets', async () => {
      const artifact = await createTestArtifact(ctx);

      await expect(
        handleToolCall(
          'artifact',
          {
            action: 'update',
            planId: ctx.planId,
            artifactId: artifact.artifactId,
            updates: {
              targets: [{ path: '', action: 'create' }], // Empty path
            },
          },
          ctx.services
        )
      ).rejects.toThrow(/path/i);
    });

    it('artifact list should return artifacts', async () => {
      await createTestArtifact(ctx, { title: 'Artifact 1', artifactType: 'code' });
      await createTestArtifact(ctx, { title: 'Artifact 2', artifactType: 'config' });

      const result = await handleToolCall(
        'artifact',
        { action: 'list', planId: ctx.planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.artifacts).toHaveLength(2);
    });

    it('artifact list should filter by artifactType', async () => {
      await createTestArtifact(ctx, { title: 'Code Artifact', artifactType: 'code' });
      await createTestArtifact(ctx, { title: 'Config Artifact', artifactType: 'config' });

      const result = await handleToolCall(
        'artifact',
        { action: 'list', planId: ctx.planId, filters: { artifactType: 'code' } },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.artifacts).toHaveLength(1);
      expect(parsed.artifacts[0].title).toBe('Code Artifact');
    });

    it('artifact delete should delete artifact', async () => {
      const artifact = await createTestArtifact(ctx);

      const result = await handleToolCall(
        'artifact',
        { action: 'delete', planId: ctx.planId, artifactId: artifact.artifactId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);

      // Verify deletion
      const list = await handleToolCall(
        'artifact',
        { action: 'list', planId: ctx.planId },
        ctx.services
      );
      const listParsed = JSON.parse(list.content[0].text);
      expect(listParsed.artifacts).toHaveLength(0);
    });

    it('artifact get should throw for non-existent plan', async () => {
      await expect(
        handleToolCall(
          'artifact',
          { action: 'get', planId: 'non-existent-plan', artifactId: 'any' },
          ctx.services
        )
      ).rejects.toThrow(/Plan not found/i);
    });

    it('artifact get should throw for non-existent artifact', async () => {
      await expect(
        handleToolCall(
          'artifact',
          { action: 'get', planId: ctx.planId, artifactId: 'non-existent-artifact' },
          ctx.services
        )
      ).rejects.toThrow(/artifact.*not found/i);
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

  /**
   * Sprint 6 - Minimal Return Values Integration Tests
   *
   * These tests verify that CREATE/UPDATE operations return only
   * minimal data (IDs and success flags) instead of full objects
   * to reduce context pollution.
   */
  describe('Minimal Return Values (Sprint 6)', () => {
    describe('CREATE operations should return only ID', () => {
      it('plan create should not return manifest or full plan object', async () => {
        const result = await handleToolCall(
          'plan',
          { action: 'create', name: 'Minimal Test', description: 'Test' },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.planId).toBeDefined();
        expect(parsed).not.toHaveProperty('manifest');
        expect(parsed).not.toHaveProperty('plan');
        expect(parsed).not.toHaveProperty('createdAt');
      });

      it('requirement add should not return full requirement object', async () => {
        const result = await handleToolCall(
          'requirement',
          {
            action: 'add',
            planId: ctx.planId,
            requirement: {
              title: 'Minimal Req',
              description: 'Test',
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
        expect(parsed).not.toHaveProperty('requirement');
      });

      it('solution propose should not return full solution object', async () => {
        const result = await handleToolCall(
          'solution',
          {
            action: 'propose',
            planId: ctx.planId,
            solution: {
              title: 'Minimal Solution',
              description: 'Test',
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
        expect(parsed).not.toHaveProperty('solution');
      });

      it('decision record should not return full decision object', async () => {
        const result = await handleToolCall(
          'decision',
          {
            action: 'record',
            planId: ctx.planId,
            decision: {
              title: 'Minimal Decision',
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
        expect(parsed).not.toHaveProperty('decision');
      });

      it('phase add should not return full phase object', async () => {
        const result = await handleToolCall(
          'phase',
          {
            action: 'add',
            planId: ctx.planId,
            phase: {
              title: 'Minimal Phase',
              description: 'Test',
              objectives: ['Obj1'],
              deliverables: ['Del1'],
              successCriteria: ['Crit1'],
            },
          },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.phaseId).toBeDefined();
        expect(parsed).not.toHaveProperty('phase');
      });

      it('artifact add should not return full artifact object', async () => {
        const result = await handleToolCall(
          'artifact',
          {
            action: 'add',
            planId: ctx.planId,
            artifact: {
              title: 'Minimal Artifact',
              description: 'Test',
              artifactType: 'code',
              content: {
                language: 'typescript',
                sourceCode: 'const x = 1;',
              },
            },
          },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.artifactId).toBeDefined();
        expect(parsed).not.toHaveProperty('artifact');
      });

      it('link create should not return full link object', async () => {
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
        expect(parsed).not.toHaveProperty('link');
      });
    });

    describe('UPDATE operations should return only success and ID', () => {
      it('plan update should not return full plan object', async () => {
        const result = await handleToolCall(
          'plan',
          { action: 'update', planId: ctx.planId, updates: { name: 'Updated' } },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.success).toBe(true);
        expect(parsed).not.toHaveProperty('plan');
        expect(parsed).not.toHaveProperty('updatedAt');
      });

      it('requirement update should not return full requirement object', async () => {
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
        expect(parsed.success).toBe(true);
        expect(parsed).not.toHaveProperty('requirement');
      });

      it('solution update should not return full solution object', async () => {
        const sol = await createTestSolution(ctx);

        const result = await handleToolCall(
          'solution',
          {
            action: 'update',
            planId: ctx.planId,
            solutionId: sol.solutionId,
            updates: { title: 'Updated' },
          },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.success).toBe(true);
        expect(parsed).not.toHaveProperty('solution');
      });

      it('solution select should not return full solution objects', async () => {
        const sol = await createTestSolution(ctx);

        const result = await handleToolCall(
          'solution',
          { action: 'select', planId: ctx.planId, solutionId: sol.solutionId, reason: 'Best' },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.success).toBe(true);
        expect(parsed).not.toHaveProperty('solution');
        expect(parsed).not.toHaveProperty('deselected');
      });

      it('phase update should not return full phase object', async () => {
        const phase = await createTestPhase(ctx);

        const result = await handleToolCall(
          'phase',
          {
            action: 'update',
            planId: ctx.planId,
            phaseId: phase.phaseId,
            updates: { title: 'Updated' },
          },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.success).toBe(true);
        expect(parsed).not.toHaveProperty('phase');
      });

      it('phase update_status should not return full phase object', async () => {
        const phase = await createTestPhase(ctx);

        const result = await handleToolCall(
          'phase',
          { action: 'update_status', planId: ctx.planId, phaseId: phase.phaseId, status: 'in_progress' },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.success).toBe(true);
        expect(parsed).not.toHaveProperty('phase');
      });

      it('artifact update should not return full artifact object', async () => {
        const artifact = await createTestArtifact(ctx);

        const result = await handleToolCall(
          'artifact',
          {
            action: 'update',
            planId: ctx.planId,
            artifactId: artifact.artifactId,
            updates: { title: 'Updated' },
          },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.success).toBe(true);
        expect(parsed).not.toHaveProperty('artifact');
      });
    });

    describe('SPECIAL operations should return only success and IDs', () => {
      it('decision supersede should not return full decision objects', async () => {
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
        expect(parsed.success).toBe(true);
        expect(parsed).not.toHaveProperty('newDecision');
        expect(parsed).not.toHaveProperty('supersededDecision');
      });

      it('phase move should not return full phase object', async () => {
        const parent = await createTestPhase(ctx, { title: 'Parent' });
        const child = await createTestPhase(ctx, { title: 'Child' });

        const result = await handleToolCall(
          'phase',
          { action: 'move', planId: ctx.planId, phaseId: child.phaseId, newParentId: parent.phaseId },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.success).toBe(true);
        expect(parsed).not.toHaveProperty('phase');
      });

    });
  });
});
