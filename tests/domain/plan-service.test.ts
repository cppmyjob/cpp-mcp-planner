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

      // Verify via getPlan
      const { plan } = await service.getPlan({ planId: result.planId });
      expect(plan.manifest.name).toBe('Test Plan');
      expect(plan.manifest.status).toBe('active');
    });

    it('should set author', async () => {
      const result = await service.createPlan({
        name: 'Test Plan',
        description: 'A test plan',
        author: 'test-user',
      });

      // Verify via getPlan
      const { plan } = await service.getPlan({ planId: result.planId });
      expect(plan.manifest.author).toBe('test-user');
    });

    it('should initialize statistics to zero', async () => {
      const result = await service.createPlan({
        name: 'Test Plan',
        description: 'A test plan',
      });

      // Verify via getPlan
      const { plan } = await service.getPlan({ planId: result.planId });
      expect(plan.manifest.statistics.totalRequirements).toBe(0);
      expect(plan.manifest.statistics.totalSolutions).toBe(0);
      expect(plan.manifest.statistics.completionPercentage).toBe(0);
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

      // Verify via getPlan
      const { plan } = await service.getPlan({ planId: created.planId });
      expect(plan.manifest.name).toBe('New Name');
    });

    it('should update plan status', async () => {
      const created = await service.createPlan({ name: 'Test', description: 'Test' });

      const result = await service.updatePlan({
        planId: created.planId,
        updates: { status: 'completed' },
      });

      // Verify via getPlan
      const { plan } = await service.getPlan({ planId: created.planId });
      expect(plan.manifest.status).toBe('completed');
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

  describe('getActivePlan with usageGuide (Sprint 9)', () => {
    it('should return usageGuide by default', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace',
      });

      const result = await service.getActivePlan({ workspacePath: '/test/workspace' });

      expect(result.activePlan).toBeDefined();
      expect(result.activePlan!.usageGuide).toBeDefined();
      expect(result.activePlan!.usageGuide!.quickStart).toContain('phase get_tree');
      expect(result.activePlan!.usageGuide!.commands.overview).toHaveLength(4);
      expect(result.activePlan!.usageGuide!.warnings[0]).toContain("NEVER use fields: ['*']");
    });

    it('should exclude usageGuide when includeGuide=false', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace',
      });

      const result = await service.getActivePlan({
        workspacePath: '/test/workspace',
        includeGuide: false,
      });

      expect(result.activePlan).toBeDefined();
      expect(result.activePlan!.usageGuide).toBeUndefined();
    });

    it('should have valid usageGuide structure', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace',
      });

      const result = await service.getActivePlan({ workspacePath: '/test/workspace' });
      const guide = result.activePlan!.usageGuide!;

      expect(guide.quickStart).toBeTruthy();
      expect(guide.commands.overview).toBeInstanceOf(Array);
      expect(guide.commands.detailed).toBeInstanceOf(Array);
      expect(guide.formattingGuide).toContain('Tree View');
      expect(guide.warnings).toBeInstanceOf(Array);

      // Check command structure
      const cmd = guide.commands.overview[0];
      expect(cmd.cmd).toBeTruthy();
      expect(cmd.desc).toBeTruthy();
    });
  });

  describe('minimal return values (Sprint 6)', () => {
    describe('createPlan should return only planId', () => {
      it('should not include manifest in result', async () => {
        const result = await service.createPlan({
          name: 'Test Plan',
          description: 'Test',
        });

        expect(result.planId).toBeDefined();
        expect(result).not.toHaveProperty('manifest');
      });

      it('should not include createdAt in result', async () => {
        const result = await service.createPlan({
          name: 'Test Plan',
          description: 'Test',
        });

        expect(result.planId).toBeDefined();
        expect(result).not.toHaveProperty('createdAt');
      });
    });

    describe('updatePlan should return only success and planId', () => {
      it('should not include full plan object in result', async () => {
        const created = await service.createPlan({
          name: 'Test Plan',
          description: 'Test',
        });

        const result = await service.updatePlan({
          planId: created.planId,
          updates: { name: 'Updated Plan' },
        });

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('plan');
      });

      it('should not include updatedAt in result', async () => {
        const created = await service.createPlan({
          name: 'Test Plan',
          description: 'Test',
        });

        const result = await service.updatePlan({
          planId: created.planId,
          updates: { name: 'Updated Plan' },
        });

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('updatedAt');
      });
    });
  });
});
