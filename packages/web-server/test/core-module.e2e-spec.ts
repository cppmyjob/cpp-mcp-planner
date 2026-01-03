/**
 * GREEN: Phase 2.4.3 - CoreModule Integration Tests
 *
 * These tests verify CoreModule integration with DynamicRepositoryFactory:
 * - DynamicRepositoryFactory is used instead of FileRepositoryFactory
 * - Uses fallback projectId 'default' for single-project mode
 * - Explicit project context overrides fallback
 * - Multi-project isolation works correctly
 * - Service providers work with project context
 */

import { type INestApplication } from '@nestjs/common';
import { createTestApp, cleanupTestApp, type TestContext } from './setup.js';
import { REPOSITORY_FACTORY, PLAN_SERVICE } from '../src/modules/core/core.module.js';
import { DynamicRepositoryFactory } from '../src/infrastructure/dynamic-repository-factory.js';
import { type PlanService, runWithProjectContext, getProjectId } from '@mcp-planner/core';

describe('CoreModule with DynamicRepositoryFactory (e2e)', () => {
  let context: TestContext;
  let app: INestApplication;

  beforeAll(async () => {
    context = await createTestApp();
    app = context.app;
  });

  afterAll(async () => {
    await cleanupTestApp(context);
  });

  describe('REPOSITORY_FACTORY provider', () => {
    it('should provide DynamicRepositoryFactory instance', () => {
      const repositoryFactory = app.get(REPOSITORY_FACTORY);

      expect(repositoryFactory).toBeInstanceOf(DynamicRepositoryFactory);
    });

    it('should use fallback projectId when no explicit context', async () => {
      const repositoryFactory = app.get<DynamicRepositoryFactory>(REPOSITORY_FACTORY);

      // DynamicRepositoryFactory creates wrapper immediately (no error)
      const planRepo = repositoryFactory.createPlanRepository();

      // Should use fallback projectId 'default' (set in setup.ts)
      await planRepo.initialize();
      const plans = await planRepo.listPlans();
      expect(Array.isArray(plans)).toBe(true);

      // Verify fallback projectId is 'default'
      expect(getProjectId()).toBe('default');
    });

    it('should work with project context', async () => {
      const repositoryFactory = app.get<DynamicRepositoryFactory>(REPOSITORY_FACTORY);

      await runWithProjectContext('test-project-ctx', async () => {
        const planRepo = repositoryFactory.createPlanRepository();
        await planRepo.initialize();

        // Should create plan in project context
        const plans = await planRepo.listPlans();
        expect(Array.isArray(plans)).toBe(true);
      });
    });
  });

  describe('Service providers', () => {
    it('should provide PlanService', () => {
      const planService = app.get<PlanService>(PLAN_SERVICE);

      expect(planService).toBeDefined();
      expect(typeof planService.createPlan).toBe('function');
    });

    it('should work with project context', async () => {
      const planService = app.get<PlanService>(PLAN_SERVICE);

      await runWithProjectContext('service-test-project', async () => {
        const result = await planService.createPlan({
          name: 'Test Plan Service',
          description: 'Test plan for service integration',
        });
        expect(result.planId).toBeDefined();
        expect(typeof result.planId).toBe('string');

        // Verify explicit context overrides fallback
        expect(getProjectId()).toBe('service-test-project');
      });
    });

    it('should use fallback projectId when no explicit context', async () => {
      const planService = app.get<PlanService>(PLAN_SERVICE);

      // Without runWithProjectContext, should use fallback projectId 'default'
      const result = await planService.createPlan({
        name: 'Fallback Plan',
        description: 'Plan created with fallback projectId',
      });
      expect(result.planId).toBeDefined();
      expect(typeof result.planId).toBe('string');

      // Verify fallback projectId is used
      expect(getProjectId()).toBe('default');
    });
  });

  describe('Multi-project isolation', () => {
    it('should isolate data per projectId', async () => {
      const planService = app.get<PlanService>(PLAN_SERVICE);

      // Create plan in project-A
      let planIdA: string;
      await runWithProjectContext('integration-project-A', async () => {
        const createResult = await planService.createPlan({
          name: 'Plan A',
          description: 'Plan for project A',
        });
        planIdA = createResult.planId;

        const result = await planService.listPlans({});
        expect(result.plans).toHaveLength(1);
        expect(result.plans[0]?.id).toBe(planIdA);
      });

      // Create plan in project-B
      let planIdB: string;
      await runWithProjectContext('integration-project-B', async () => {
        const createResult = await planService.createPlan({
          name: 'Plan B',
          description: 'Plan for project B',
        });
        planIdB = createResult.planId;

        const result = await planService.listPlans({});
        expect(result.plans).toHaveLength(1);
        expect(result.plans[0]?.id).toBe(planIdB);
      });

      // Verify isolation - project-A still has only plan-A
      await runWithProjectContext('integration-project-A', async () => {
        const result = await planService.listPlans({});
        expect(result.plans).toHaveLength(1);
        expect(result.plans[0]?.id).toBe(planIdA);
      });
    });
  });
});
