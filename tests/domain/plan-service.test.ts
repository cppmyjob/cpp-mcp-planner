import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { FileStorage } from '../../src/infrastructure/file-storage.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('PlanService', () => {
  let service: PlanService;
  let storage: FileStorage;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-plan-test-${Date.now()}`);
    storage = new FileStorage(testDir);
    await storage.initialize();
    service = new PlanService(storage);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('create_plan', () => {
    it('should create a new plan', async () => {
      const result = await service.createPlan({
        name: 'Test Plan',
        description: 'A test plan',
      });

      expect(result.planId).toBeDefined();
      expect(result.manifest.name).toBe('Test Plan');
      expect(result.manifest.status).toBe('active');
    });

    it('should set author', async () => {
      const result = await service.createPlan({
        name: 'Test Plan',
        description: 'A test plan',
        author: 'test-user',
      });

      expect(result.manifest.author).toBe('test-user');
    });

    it('should initialize statistics to zero', async () => {
      const result = await service.createPlan({
        name: 'Test Plan',
        description: 'A test plan',
      });

      expect(result.manifest.statistics.totalRequirements).toBe(0);
      expect(result.manifest.statistics.totalSolutions).toBe(0);
      expect(result.manifest.statistics.completionPercentage).toBe(0);
    });
  });

  describe('list_plans', () => {
    it('should return empty list when no plans', async () => {
      const result = await service.listPlans({});
      expect(result.plans).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should list all plans', async () => {
      await service.createPlan({ name: 'Plan 1', description: 'First' });
      await service.createPlan({ name: 'Plan 2', description: 'Second' });

      const result = await service.listPlans({});
      expect(result.plans).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by status', async () => {
      await service.createPlan({ name: 'Active Plan', description: 'Active' });
      const archived = await service.createPlan({ name: 'Archived Plan', description: 'Archived' });
      await service.archivePlan({ planId: archived.planId });

      const result = await service.listPlans({ status: 'active' });
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0].name).toBe('Active Plan');
    });

    it('should support pagination', async () => {
      await service.createPlan({ name: 'Plan 1', description: 'First' });
      await service.createPlan({ name: 'Plan 2', description: 'Second' });
      await service.createPlan({ name: 'Plan 3', description: 'Third' });

      const result = await service.listPlans({ limit: 2, offset: 0 });
      expect(result.plans).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('get_plan', () => {
    it('should get plan by id', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });

      const result = await service.getPlan({ planId: created.planId });
      expect(result.plan.manifest.id).toBe(created.planId);
      expect(result.plan.manifest.name).toBe('Test Plan');
    });

    it('should throw if plan not found', async () => {
      await expect(service.getPlan({ planId: 'non-existent' }))
        .rejects.toThrow('Plan not found');
    });

    it('should include entities if requested', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });

      const result = await service.getPlan({
        planId: created.planId,
        includeEntities: true,
      });

      expect(result.plan.entities).toBeDefined();
      expect(result.plan.entities?.requirements).toEqual([]);
    });
  });

  describe('update_plan', () => {
    it('should update plan name', async () => {
      const created = await service.createPlan({ name: 'Old Name', description: 'Test' });

      const result = await service.updatePlan({
        planId: created.planId,
        updates: { name: 'New Name' },
      });

      expect(result.plan.name).toBe('New Name');
    });

    it('should update plan status', async () => {
      const created = await service.createPlan({ name: 'Test', description: 'Test' });

      const result = await service.updatePlan({
        planId: created.planId,
        updates: { status: 'completed' },
      });

      expect(result.plan.status).toBe('completed');
    });

    it('should increment version on update', async () => {
      const created = await service.createPlan({ name: 'Test', description: 'Test' });

      await service.updatePlan({
        planId: created.planId,
        updates: { name: 'Updated' },
      });

      const updated = await service.getPlan({ planId: created.planId });
      expect(updated.plan.manifest.version).toBe(2);
    });
  });

  describe('archive_plan', () => {
    it('should archive plan (soft delete)', async () => {
      const created = await service.createPlan({ name: 'Test', description: 'Test' });

      const result = await service.archivePlan({ planId: created.planId });
      expect(result.success).toBe(true);

      const plan = await service.getPlan({ planId: created.planId });
      expect(plan.plan.manifest.status).toBe('archived');
    });

    it('should permanently delete plan if requested', async () => {
      const created = await service.createPlan({ name: 'Test', description: 'Test' });

      await service.archivePlan({ planId: created.planId, permanent: true });

      await expect(service.getPlan({ planId: created.planId }))
        .rejects.toThrow('Plan not found');
    });
  });

  describe('set_active_plan / get_active_plan', () => {
    it('should set active plan for workspace', async () => {
      const created = await service.createPlan({ name: 'Test', description: 'Test' });

      const result = await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace',
      });

      expect(result.success).toBe(true);
      expect(result.activePlan.planId).toBe(created.planId);
    });

    it('should get active plan for workspace', async () => {
      const created = await service.createPlan({ name: 'Test', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace',
      });

      const result = await service.getActivePlan({ workspacePath: '/test/workspace' });
      expect(result.activePlan?.planId).toBe(created.planId);
    });

    it('should return null if no active plan', async () => {
      const result = await service.getActivePlan({ workspacePath: '/no/plan/here' });
      expect(result.activePlan).toBeNull();
    });

    it('should update active plan for same workspace', async () => {
      const plan1 = await service.createPlan({ name: 'Plan 1', description: 'First' });
      const plan2 = await service.createPlan({ name: 'Plan 2', description: 'Second' });

      await service.setActivePlan({ planId: plan1.planId, workspacePath: '/test' });
      await service.setActivePlan({ planId: plan2.planId, workspacePath: '/test' });

      const result = await service.getActivePlan({ workspacePath: '/test' });
      expect(result.activePlan?.planId).toBe(plan2.planId);
    });
  });
});
