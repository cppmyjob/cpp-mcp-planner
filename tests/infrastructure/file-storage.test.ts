import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { FileStorage } from '../../src/infrastructure/file-storage.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('FileStorage', () => {
  let storage: FileStorage;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-test-${Date.now()}`);
    storage = new FileStorage(testDir);
    await storage.initialize();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('should create base directories', async () => {
      const plansDir = path.join(testDir, 'plans');
      const stats = await fs.stat(plansDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('Plan operations', () => {
    const planId = 'test-plan-001';
    const manifest = {
      id: planId,
      name: 'Test Plan',
      description: 'A test plan',
      status: 'active' as const,
      author: 'test',
      createdAt: '2024-12-01T10:00:00Z',
      updatedAt: '2024-12-01T10:00:00Z',
      version: 1,
      lockVersion: 1,
      statistics: {
        totalRequirements: 0,
        totalSolutions: 0,
        totalDecisions: 0,
        totalPhases: 0,
        completionPercentage: 0,
      },
    };

    it('should create plan directory', async () => {
      await storage.createPlanDirectory(planId);
      const planDir = path.join(testDir, 'plans', planId);
      const stats = await fs.stat(planDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should save and load manifest', async () => {
      await storage.createPlanDirectory(planId);
      await storage.saveManifest(planId, manifest);

      const loaded = await storage.loadManifest(planId);
      expect(loaded.id).toBe(planId);
      expect(loaded.name).toBe('Test Plan');
    });

    it('should save and load entities', async () => {
      await storage.createPlanDirectory(planId);

      const requirements = [
        {
          id: 'req-001',
          type: 'requirement' as const,
          title: 'Test Requirement',
          description: 'Test',
          createdAt: '2024-12-01T10:00:00Z',
          updatedAt: '2024-12-01T10:00:00Z',
          version: 1,
          metadata: { createdBy: 'test', tags: [], annotations: [] },
          source: { type: 'user-request' as const },
          acceptanceCriteria: [],
          priority: 'high' as const,
          category: 'functional' as const,
          status: 'draft' as const,
        },
      ];

      await storage.saveEntities(planId, 'requirements', requirements);
      const loaded = await storage.loadEntities(planId, 'requirements');

      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('req-001');
    });

    it('should save and load links', async () => {
      await storage.createPlanDirectory(planId);

      const links = [
        {
          id: 'link-001',
          sourceId: 'sol-001',
          targetId: 'req-001',
          relationType: 'implements' as const,
          createdAt: '2024-12-01T10:00:00Z',
          createdBy: 'test',
        },
      ];

      await storage.saveLinks(planId, links);
      const loaded = await storage.loadLinks(planId);

      expect(loaded).toHaveLength(1);
      expect(loaded[0].relationType).toBe('implements');
    });

    it('should list all plans', async () => {
      await storage.createPlanDirectory('plan-1');
      await storage.saveManifest('plan-1', { ...manifest, id: 'plan-1', name: 'Plan 1' });

      await storage.createPlanDirectory('plan-2');
      await storage.saveManifest('plan-2', { ...manifest, id: 'plan-2', name: 'Plan 2' });

      const plans = await storage.listPlans();
      expect(plans).toHaveLength(2);
    });

    it('should delete plan', async () => {
      await storage.createPlanDirectory(planId);
      await storage.saveManifest(planId, manifest);

      await storage.deletePlan(planId);

      const plans = await storage.listPlans();
      expect(plans).toHaveLength(0);
    });
  });

  describe('Active plans', () => {
    it('should save and load active plans index', async () => {
      const index = {
        '/project/a': { planId: 'plan-001', lastUpdated: '2024-12-01T10:00:00Z' },
        '/project/b': { planId: 'plan-002', lastUpdated: '2024-12-01T11:00:00Z' },
      };

      await storage.saveActivePlans(index);
      const loaded = await storage.loadActivePlans();

      expect(loaded['/project/a'].planId).toBe('plan-001');
    });

    it('should return empty object if no active plans', async () => {
      const loaded = await storage.loadActivePlans();
      expect(loaded).toEqual({});
    });
  });

  describe('Atomic writes', () => {
    it('should write atomically (temp file then rename)', async () => {
      await storage.createPlanDirectory('atomic-test');

      const data = { test: 'data', timestamp: Date.now() };
      await storage.atomicWrite(
        path.join(testDir, 'plans', 'atomic-test', 'test.json'),
        data
      );

      const content = await fs.readFile(
        path.join(testDir, 'plans', 'atomic-test', 'test.json'),
        'utf-8'
      );
      expect(JSON.parse(content)).toEqual(data);
    });
  });
});
