import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { createServices, type Services } from '../../src/server/services.js';

export interface TestContext {
  services: Services;
  testDir: string;
  planId: string;
}

export async function createTestContext(prefix = 'mcp-test'): Promise<TestContext> {
  const testDir = path.join(os.tmpdir(), `${prefix}-${Date.now()}`);
  const services = await createServices(testDir);

  const plan = await services.planService.createPlan({
    name: 'Test Plan',
    description: 'For testing',
  });

  return {
    services,
    testDir,
    planId: plan.planId,
  };
}

export async function cleanupTestContext(ctx: TestContext): Promise<void> {
  await fs.rm(ctx.testDir, { recursive: true, force: true });
}

export async function createTestRequirement(
  ctx: TestContext,
  overrides: Partial<{
    title: string;
    description: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
  }> = {}
) {
  return ctx.services.requirementService.addRequirement({
    planId: ctx.planId,
    requirement: {
      title: overrides.title || 'Test Requirement',
      description: overrides.description || 'Test description',
      source: { type: 'user-request' },
      acceptanceCriteria: ['Criterion 1'],
      priority: overrides.priority || 'high',
      category: 'functional',
    },
  });
}

export async function createTestSolution(
  ctx: TestContext,
  addressing: string[] = [],
  overrides: Partial<{ title: string; description: string }> = {}
) {
  return ctx.services.solutionService.proposeSolution({
    planId: ctx.planId,
    solution: {
      title: overrides.title || 'Test Solution',
      description: overrides.description || 'Test solution description',
      approach: 'Test approach',
      addressing,
      tradeoffs: [],
      evaluation: {
        effortEstimate: { value: 1, unit: 'days', confidence: 'medium' },
        technicalFeasibility: 'high',
        riskAssessment: 'Low risk',
      },
    },
  });
}

export async function createTestPhase(
  ctx: TestContext,
  overrides: Partial<{ title: string; parentId: string }> = {}
) {
  return ctx.services.phaseService.addPhase({
    planId: ctx.planId,
    phase: {
      title: overrides.title || 'Test Phase',
      description: 'Test phase description',
      objectives: ['Objective 1'],
      deliverables: ['Deliverable 1'],
      successCriteria: ['Criterion 1'],
      parentId: overrides.parentId,
    },
  });
}

export async function createTestDecision(
  ctx: TestContext,
  overrides: Partial<{ title: string; question: string }> = {}
) {
  return ctx.services.decisionService.recordDecision({
    planId: ctx.planId,
    decision: {
      title: overrides.title || 'Test Decision',
      question: overrides.question || 'What approach to use?',
      context: 'Test context',
      decision: 'Use approach A',
      alternativesConsidered: [],
    },
  });
}
