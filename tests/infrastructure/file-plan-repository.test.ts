/**
 * FilePlanRepository Tests
 *
 * RED Phase Tests for Step 2.4:
 * - Constructor accepts basePath and projectId
 * - New path structure: basePath/{projectId}/plans/{planId}/
 * - Old path structure: basePath/plans/{planId}/ (read-only)
 * - Manifest saves projectId
 * - List operations include projectId
 * - New plans only created in new structure
 * - NO migration of old plans required
 */

import { promises as fs } from 'fs';
import { join as pathJoin } from 'path';
import { tmpdir } from 'os';
import { FilePlanRepository } from '@mcp-planner/core';
import type { PlanManifest } from '@mcp-planner/core';

const path = { join: pathJoin };
const os = { tmpdir };

describe('FilePlanRepository - ProjectId Support', () => {
  let repo: FilePlanRepository;
  let tempDir: string;
  const projectId = 'test-project';
  const planId = 'plan-123';

  beforeEach(async () => {
    // Create temp directory
    const timestamp = String(Date.now());
    tempDir = path.join(os.tmpdir(), `plan-repo-test-${timestamp}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('RED: should accept basePath and projectId parameters', () => {
      // This will fail because current constructor only accepts baseDir
      expect(() => {
        repo = new FilePlanRepository(tempDir, projectId);
      }).not.toThrow();
    });

    it('RED: should throw if projectId is invalid', () => {
      expect(() => {
        repo = new FilePlanRepository(tempDir, '../evil');
      }).toThrow(/invalid.*projectId/i);
    });

    it('RED: should throw if projectId is empty', () => {
      expect(() => {
        repo = new FilePlanRepository(tempDir, '');
      }).toThrow(/invalid.*projectId/i);
    });
  });

  // ==========================================================================
  // Path Structure Tests - New Format
  // ==========================================================================

  describe('new path structure - basePath/{projectId}/plans/{planId}/', () => {
    beforeEach(async () => {
      repo = new FilePlanRepository(tempDir, projectId);
      await repo.initialize();
    });

    it('RED: should create plan directory at basePath/{projectId}/plans/{planId}/', async () => {
      await repo.createPlan(planId);

      const expectedPath = path.join(tempDir, projectId, 'plans', planId);
      const exists = await fs.access(expectedPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('RED: should create entities subdirectory in new structure', async () => {
      await repo.createPlan(planId);

      const entitiesPath = path.join(tempDir, projectId, 'plans', planId, 'entities');
      const exists = await fs.access(entitiesPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('RED: should create history subdirectory in new structure', async () => {
      await repo.createPlan(planId);

      const historyPath = path.join(tempDir, projectId, 'plans', planId, 'history');
      const exists = await fs.access(historyPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('RED: should save manifest at basePath/{projectId}/plans/{planId}/manifest.json', async () => {
      await repo.createPlan(planId);

      const manifest: PlanManifest = {
        id: planId,
        projectId,
        name: 'Test Plan',
        status: 'active',
        enableHistory: false,
        maxHistoryDepth: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
      };

      await repo.saveManifest(planId, manifest);

      const manifestPath = path.join(tempDir, projectId, 'plans', planId, 'manifest.json');
      const exists = await fs.access(manifestPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  // ==========================================================================
  // Manifest with projectId Tests
  // ==========================================================================

  describe('manifest saves projectId', () => {
    beforeEach(async () => {
      repo = new FilePlanRepository(tempDir, projectId);
      await repo.initialize();
      await repo.createPlan(planId);
    });

    it('RED: should save projectId in manifest', async () => {
      const manifest: PlanManifest = {
        id: planId,
        projectId,
        name: 'Test Plan',
        status: 'active',
        enableHistory: false,
        maxHistoryDepth: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
      };

      await repo.saveManifest(planId, manifest);

      const loaded = await repo.loadManifest(planId);
      expect(loaded.projectId).toBe(projectId);
    });

    it('RED: should load manifest with projectId', async () => {
      const manifest: PlanManifest = {
        id: planId,
        projectId,
        status: 'active',
        enableHistory: false,
        maxHistoryDepth: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
      };

      await repo.saveManifest(planId, manifest);

      const loaded = await repo.loadManifest(planId);
      expect(loaded).toEqual(manifest);
    });
  });

  // ==========================================================================
  // List Operations Tests
  // ==========================================================================

  describe('list operations', () => {
    beforeEach(async () => {
      repo = new FilePlanRepository(tempDir, projectId);
      await repo.initialize();
    });

    it('RED: should list plans in projectId scope', async () => {
      await repo.createPlan('plan-1');
      await repo.createPlan('plan-2');

      const plans = await repo.listPlans();
      expect(plans).toEqual(expect.arrayContaining(['plan-1', 'plan-2']));
      expect(plans.length).toBe(2);
    });

    it('RED: should return empty array if no plans exist', async () => {
      const plans = await repo.listPlans();
      expect(plans).toEqual([]);
    });

    it('RED: should isolate plans by projectId', async () => {
      // Create plans in project-1
      const repo1 = new FilePlanRepository(tempDir, 'project-1');
      await repo1.initialize();
      await repo1.createPlan('plan-1');
      await repo1.createPlan('plan-2');

      // Create plans in project-2
      const repo2 = new FilePlanRepository(tempDir, 'project-2');
      await repo2.initialize();
      await repo2.createPlan('plan-3');

      // Verify isolation
      const plans1 = await repo1.listPlans();
      const plans2 = await repo2.listPlans();

      expect(plans1).toEqual(expect.arrayContaining(['plan-1', 'plan-2']));
      expect(plans1.length).toBe(2);
      expect(plans2).toEqual(['plan-3']);
      expect(plans2.length).toBe(1);
    });
  });

  // ==========================================================================
  // Old Structure Support (Read-Only)
  // ==========================================================================

  describe('old path structure - basePath/plans/{planId}/ (read-only)', () => {
    beforeEach(async () => {
      // Create old-style plan manually (simulating legacy data)
      const oldPlanDir = path.join(tempDir, 'plans', planId);
      await fs.mkdir(oldPlanDir, { recursive: true });

      const oldManifest: PlanManifest = {
        id: planId,
        projectId: 'legacy-project', // Old plans may have projectId or not
        name: 'Legacy Plan',
        status: 'active',
        enableHistory: false,
        maxHistoryDepth: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
      };

      await fs.writeFile(
        path.join(oldPlanDir, 'manifest.json'),
        JSON.stringify(oldManifest, null, 2),
        'utf-8'
      );
    });

    it('RED: should read old-style plan manifest (read-only)', async () => {
      // Use special projectId or method to access old plans
      const legacyRepo = new FilePlanRepository(tempDir, '__legacy__');
      await legacyRepo.initialize();

      const manifest = await legacyRepo.loadManifest(planId);
      expect(manifest.id).toBe(planId);
      expect(manifest.name).toBe('Legacy Plan');
    });

    it('RED: should list old-style plans (read-only)', async () => {
      const legacyRepo = new FilePlanRepository(tempDir, '__legacy__');
      await legacyRepo.initialize();

      const plans = await legacyRepo.listPlans();
      expect(plans).toContain(planId);
    });

    it('RED: should NOT allow creating new plans in old structure', async () => {
      const legacyRepo = new FilePlanRepository(tempDir, '__legacy__');
      await legacyRepo.initialize();

      // Attempting to create plan with __legacy__ projectId should fail or
      // should create in new structure anyway
      await expect(legacyRepo.createPlan('new-plan')).rejects.toThrow();
    });
  });

  // ==========================================================================
  // No Migration Required Tests
  // ==========================================================================

  describe('no migration required', () => {
    it('RED: should access old plans without migration', async () => {
      // Create old-style plan
      const oldPlanDir = path.join(tempDir, 'plans', planId);
      await fs.mkdir(oldPlanDir, { recursive: true });

      const oldManifest: PlanManifest = {
        id: planId,
        projectId: 'old-project',
        status: 'active',
        enableHistory: false,
        maxHistoryDepth: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
      };

      await fs.writeFile(
        path.join(oldPlanDir, 'manifest.json'),
        JSON.stringify(oldManifest, null, 2),
        'utf-8'
      );

      // Access via legacy mode
      const legacyRepo = new FilePlanRepository(tempDir, '__legacy__');
      await legacyRepo.initialize();

      const manifest = await legacyRepo.loadManifest(planId);
      expect(manifest.id).toBe(planId);

      // Verify old directory still exists (no migration happened)
      const oldExists = await fs.access(oldPlanDir).then(() => true).catch(() => false);
      expect(oldExists).toBe(true);

      // Verify no new directory was created
      const newDir = path.join(tempDir, 'old-project', 'plans', planId);
      const newExists = await fs.access(newDir).then(() => true).catch(() => false);
      expect(newExists).toBe(false);
    });

    it('RED: should keep old and new plans separate', async () => {
      // Create old-style plan
      const oldPlanDir = path.join(tempDir, 'plans', 'old-plan');
      await fs.mkdir(oldPlanDir, { recursive: true });
      await fs.writeFile(
        path.join(oldPlanDir, 'manifest.json'),
        JSON.stringify({
          id: 'old-plan',
          projectId: 'legacy',
          status: 'active',
          enableHistory: false,
          maxHistoryDepth: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
        } as PlanManifest, null, 2),
        'utf-8'
      );

      // Create new-style plan
      const newRepo = new FilePlanRepository(tempDir, 'new-project');
      await newRepo.initialize();
      await newRepo.createPlan('new-plan');

      // Verify both exist independently
      const oldExists = await fs.access(oldPlanDir).then(() => true).catch(() => false);
      const newExists = await fs.access(
        path.join(tempDir, 'new-project', 'plans', 'new-plan')
      ).then(() => true).catch(() => false);

      expect(oldExists).toBe(true);
      expect(newExists).toBe(true);
    });
  });

  // ==========================================================================
  // Delete Plan Tests
  // ==========================================================================

  describe('deletePlan', () => {
    beforeEach(async () => {
      repo = new FilePlanRepository(tempDir, projectId);
      await repo.initialize();
    });

    it('RED: should delete plan from new structure', async () => {
      await repo.createPlan(planId);

      const planPath = path.join(tempDir, projectId, 'plans', planId);
      const existsBefore = await fs.access(planPath).then(() => true).catch(() => false);
      expect(existsBefore).toBe(true);

      await repo.deletePlan(planId);

      const existsAfter = await fs.access(planPath).then(() => true).catch(() => false);
      expect(existsAfter).toBe(false);
    });
  });

  // ==========================================================================
  // planExists Tests
  // ==========================================================================

  describe('planExists', () => {
    beforeEach(async () => {
      repo = new FilePlanRepository(tempDir, projectId);
      await repo.initialize();
    });

    it('RED: should return true for existing plan in new structure', async () => {
      await repo.createPlan(planId);

      const exists = await repo.planExists(planId);
      expect(exists).toBe(true);
    });

    it('RED: should return false for non-existing plan', async () => {
      const exists = await repo.planExists('non-existent');
      expect(exists).toBe(false);
    });
  });
});
