import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { RepositoryFactory } from '../../src/infrastructure/factory/repository-factory.js';
import { FileLockManager } from '../../src/infrastructure/repositories/file/file-lock-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('PlanService', () => {
  let service: PlanService;
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-plan-test-${Date.now().toString()}`);

    lockManager = new FileLockManager(testDir);
    await lockManager.initialize();

    repositoryFactory = new RepositoryFactory({
      type: 'file',
      baseDir: testDir,
      lockManager,
      cacheOptions: { enabled: true, ttl: 5000, maxSize: 1000 }
    });

    const planRepo = repositoryFactory.createPlanRepository();
    await planRepo.initialize();

    service = new PlanService(repositoryFactory);
  });

  afterEach(async () => {
    await repositoryFactory.dispose();
    await lockManager.dispose();
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

      await service.updatePlan({
        planId: created.planId,
        updates: { name: 'New Name' },
      });

      // Verify via getPlan
      const { plan } = await service.getPlan({ planId: created.planId });
      expect(plan.manifest.name).toBe('New Name');
    });

    it('should update plan status', async () => {
      const created = await service.createPlan({ name: 'Test', description: 'Test' });

      await service.updatePlan({
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
    it('should return usageGuide when explicitly requested with includeGuide=true', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace',
      });

      // Sprint 6: Default changed to false, must explicitly request guide
      const result = await service.getActivePlan({
        workspacePath: '/test/workspace',
        includeGuide: true
      });

      expect(result.activePlan).toBeDefined();
      if (result.activePlan === null) throw new Error('ActivePlan should be defined');
      expect(result.activePlan.usageGuide).toBeDefined();
      if (result.activePlan.usageGuide === undefined) throw new Error('UsageGuide should be defined');
      expect(result.activePlan.usageGuide.quickStart).toContain('phase get_tree');
      expect(result.activePlan.usageGuide.commands.overview).toHaveLength(4);
      expect(result.activePlan.usageGuide.warnings[0]).toContain("NEVER use fields: ['*']");
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
      expect(result.activePlan?.usageGuide).toBeUndefined();
    });

    it('should have valid usageGuide structure', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace',
      });

      // Sprint 6: Must explicitly request guide with includeGuide=true
      const result = await service.getActivePlan({
        workspacePath: '/test/workspace',
        includeGuide: true
      });
      if (result.activePlan === null) throw new Error('ActivePlan should be defined');
      if (result.activePlan.usageGuide === undefined) throw new Error('UsageGuide should be defined');
      const guide = result.activePlan.usageGuide;

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

  // Sprint 6: Change includeGuide default from true to false
  describe('Sprint 6: includeGuide default=false (RED phase - these tests will fail initially)', () => {
    // Test 1: Default behavior (no includeGuide parameter) should NOT include guide
    it('should NOT include usageGuide by default when includeGuide parameter is omitted (new behavior)', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace-sprint6-1',
      });

      const result = await service.getActivePlan({ workspacePath: '/test/workspace-sprint6-1' });

      expect(result.activePlan).toBeDefined();
      expect(result.activePlan?.usageGuide).toBeUndefined(); // Will FAIL with current default=true
      expect(result.activePlan?.planId).toBe(created.planId);
      expect(result.activePlan?.plan).toBeDefined();
    });

    // Test 2: Explicit includeGuide=false should NOT include guide
    it('should NOT include usageGuide when includeGuide=false (existing behavior)', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace-sprint6-2',
      });

      const result = await service.getActivePlan({
        workspacePath: '/test/workspace-sprint6-2',
        includeGuide: false,
      });

      expect(result.activePlan).toBeDefined();
      expect(result.activePlan?.usageGuide).toBeUndefined(); // Should PASS already
    });

    // Test 3: Explicit includeGuide=true should include guide (backward compatibility)
    it('should include usageGuide when includeGuide=true (backward compatibility)', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace-sprint6-3',
      });

      const result = await service.getActivePlan({
        workspacePath: '/test/workspace-sprint6-3',
        includeGuide: true,
      });

      expect(result.activePlan).toBeDefined();
      if (result.activePlan === null) throw new Error('ActivePlan should be defined');
      expect(result.activePlan.usageGuide).toBeDefined(); // Should PASS with any default
      if (result.activePlan.usageGuide === undefined) throw new Error('UsageGuide should be defined');
      expect(result.activePlan.usageGuide.quickStart).toContain('phase get_tree');
    });

    // Test 4: Measure payload size difference
    it('should have significant payload reduction without guide (~500 bytes vs ~3000 bytes)', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace-sprint6-4',
      });

      // Get result WITHOUT guide (new default)
      const resultWithoutGuide = await service.getActivePlan({
        workspacePath: '/test/workspace-sprint6-4',
        includeGuide: false,
      });
      const sizeWithoutGuide = JSON.stringify(resultWithoutGuide).length;

      // Get result WITH guide
      const resultWithGuide = await service.getActivePlan({
        workspacePath: '/test/workspace-sprint6-4',
        includeGuide: true,
      });
      const sizeWithGuide = JSON.stringify(resultWithGuide).length;

      // Verify size difference is significant (guide adds ~2.5KB)
      expect(sizeWithoutGuide).toBeLessThan(1000); // ~500 bytes
      expect(sizeWithGuide).toBeGreaterThan(2500); // ~3000 bytes
      expect(sizeWithGuide - sizeWithoutGuide).toBeGreaterThan(2000); // Difference > 2KB (5x reduction)
    });

    // Test 5: All other fields should be present without guide
    it('should include all other fields (planId, plan, lastUpdated) when guide is excluded', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace-sprint6-5',
      });

      const result = await service.getActivePlan({
        workspacePath: '/test/workspace-sprint6-5',
        includeGuide: false,
      });

      expect(result.activePlan).toBeDefined();
      expect(result.activePlan?.planId).toBe(created.planId);
      expect(result.activePlan?.plan).toBeDefined();
      expect(result.activePlan?.plan.name).toBe('Test Plan');
      expect(result.activePlan?.lastUpdated).toBeDefined();
      expect(result.activePlan?.usageGuide).toBeUndefined();
    });

    // Test 6: includeGuide=null should use default (false)
    it('should NOT include guide when includeGuide=null (uses default=false)', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace-sprint6-6',
      });

      const result = await service.getActivePlan({
        workspacePath: '/test/workspace-sprint6-6',
        includeGuide: null as unknown as boolean, // Explicitly pass null
      });

      expect(result.activePlan).toBeDefined();
      expect(result.activePlan?.usageGuide).toBeUndefined(); // Will FAIL with current default=true
    });

    // Test 7: includeGuide=undefined should use default (false)
    it('should NOT include guide when includeGuide=undefined (uses default=false)', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace-sprint6-7',
      });

      const result = await service.getActivePlan({
        workspacePath: '/test/workspace-sprint6-7',
        includeGuide: undefined,
      });

      expect(result.activePlan).toBeDefined();
      expect(result.activePlan?.usageGuide).toBeUndefined(); // Will FAIL with current default=true
    });

    // Test 8: includeGuide as string should be handled with strict type checking
    it('should use strict type checking for includeGuide (only boolean true includes guide)', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace-sprint6-8',
      });

      // TypeScript compilation prevents this, but test runtime behavior
      // String 'true' is NOT strictly equal to boolean true, so guide should NOT be included
      const result = await service.getActivePlan({
        workspacePath: '/test/workspace-sprint6-8',
        includeGuide: 'true' as unknown as boolean,
      });

      // Sprint 6: Strict checking (=== true) means string 'true' does NOT include guide
      expect(result.activePlan).toBeDefined();
      expect(result.activePlan?.usageGuide).toBeUndefined();
    });

    // Test 9: Backward compatibility - existing code with includeGuide=true
    it('should support existing clients that explicitly pass includeGuide=true', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace-sprint6-9',
      });

      // Simulate existing client code that explicitly requests guide
      const result = await service.getActivePlan({
        workspacePath: '/test/workspace-sprint6-9',
        includeGuide: true,
      });

      expect(result.activePlan).toBeDefined();
      if (result.activePlan === null) throw new Error('ActivePlan should be defined');
      expect(result.activePlan.usageGuide).toBeDefined(); // Should ALWAYS work
      if (result.activePlan.usageGuide === undefined) throw new Error('UsageGuide should be defined');
      expect(result.activePlan.usageGuide.commands).toBeDefined();
    });

    // Test 10: Verify default behavior matches new expectation
    it('should confirm new default behavior: omitted parameter = no guide', async () => {
      const created = await service.createPlan({ name: 'Test Plan', description: 'Test' });
      await service.setActivePlan({
        planId: created.planId,
        workspacePath: '/test/workspace-sprint6-10',
      });

      // Call without includeGuide parameter at all
      const result = await service.getActivePlan({
        workspacePath: '/test/workspace-sprint6-10',
      });

      // After implementation, omitting includeGuide should mean NO guide (default=false)
      expect(result.activePlan).toBeDefined();
      expect(result.activePlan?.usageGuide).toBeUndefined(); // Will FAIL until default changes

      // But all other data should be present
      expect(result.activePlan?.planId).toBe(created.planId);
      expect(result.activePlan?.plan.name).toBe('Test Plan');
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

  describe('getSummary', () => {
    it('should return plan manifest info', async () => {
      const created = await service.createPlan({
        name: 'Test Plan',
        description: 'Test Description',
      });

      const result = await service.getSummary({ planId: created.planId });

      expect(result.plan.id).toBe(created.planId);
      expect(result.plan.name).toBe('Test Plan');
      expect(result.plan.description).toBe('Test Description');
      expect(result.plan.status).toBe('active');
    });

    it('should return statistics from manifest', async () => {
      const created = await service.createPlan({
        name: 'Test Plan',
        description: 'Test',
      });

      const result = await service.getSummary({ planId: created.planId });

      expect(result.statistics).toBeDefined();
      expect(result.statistics.totalPhases).toBe(0);
      expect(result.statistics.totalRequirements).toBe(0);
      expect(result.statistics.totalSolutions).toBe(0);
      expect(result.statistics.totalDecisions).toBe(0);
      expect(result.statistics.totalArtifacts).toBe(0);
      expect(result.statistics.completionPercentage).toBe(0);
    });

    it('should return phase summaries array', async () => {
      const created = await service.createPlan({
        name: 'Test Plan',
        description: 'Test',
      });

      // Add phases via repository
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const phaseRepo = repositoryFactory.createRepository<any>('phase', created.planId);
      const phase1 = {
        id: 'phase-1',
        type: 'phase' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        metadata: { createdBy: 'test', tags: [], annotations: [] },
        title: 'Phase 1',
        description: 'First phase',
        status: 'in_progress' as const,
        progress: 50,
        order: 1,
        path: '1',
        depth: 0,
      };
      const phase2 = {
        id: 'phase-2',
        type: 'phase' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        metadata: { createdBy: 'test', tags: [], annotations: [] },
        title: 'Phase 2',
        description: 'Second phase',
        status: 'planned' as const,
        progress: 0,
        order: 2,
        path: '2',
        depth: 0,
        parentId: 'phase-1',
      };
      await phaseRepo.create(phase1);
      await phaseRepo.create(phase2);

      const result = await service.getSummary({ planId: created.planId });

      expect(result.phases).toHaveLength(2);
      expect(result.phases[0]).toEqual({
        id: 'phase-1',
        title: 'Phase 1',
        status: 'in_progress',
        progress: 50,
        path: '1',
        childCount: 1,
      });
      expect(result.phases[1]).toEqual({
        id: 'phase-2',
        title: 'Phase 2',
        status: 'planned',
        progress: 0,
        path: '2',
        childCount: 0,
      });
    });

    it('should throw error for non-existent plan', async () => {
      await expect(service.getSummary({ planId: 'non-existent' }))
        .rejects.toThrow('Plan not found');
    });
  });
});
