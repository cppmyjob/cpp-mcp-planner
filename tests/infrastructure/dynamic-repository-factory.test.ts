/**
 * RED: Phase 2.3.2 - Tests for DynamicRepositoryFactory
 *
 * These tests verify DynamicRepositoryFactory implementation:
 * - Lazy initialization with async lock (async-mutex)
 * - Factory caching per projectId
 * - planRepo.initialize() called on first access
 * - Concurrent requests wait for initialization (no race conditions)
 * - Failed initialization removes factory from cache
 * - Error propagation from initialize()
 * - close() cleanup
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'path';
import { promises as fs } from 'fs';
import { DynamicRepositoryFactory } from '../../packages/web-server/src/infrastructure/dynamic-repository-factory.js';
import { FileLockManager } from '../../packages/core/src/infrastructure/repositories/file/file-lock-manager.js';
import * as projectContext from '../../packages/core/src/context/project-context.js';

describe('DynamicRepositoryFactory', () => {
  let testDir: string;
  let lockManager: FileLockManager | undefined;
  let factory: DynamicRepositoryFactory | undefined;

  beforeEach(async () => {
    // Create temp directory
    testDir = path.join(process.cwd(), 'temp', `test-dynamic-factory-${String(Date.now())}`);
    await fs.mkdir(testDir, { recursive: true });

    // Create lock manager
    lockManager = new FileLockManager(testDir);
    await lockManager.initialize();

    // Clean up projectContext
    projectContext.disable();
  });

  afterEach(async () => {
    // Cleanup
    if (factory) {
      await factory.close();
    }
    if (lockManager) {
      await lockManager.dispose();
    }
    // Remove temp directory
    await fs.rm(testDir, { recursive: true, force: true });

    projectContext.disable();
  });

  describe('Lazy initialization', () => {
    it('should create FileRepositoryFactory on first access', async () => {
      factory = new DynamicRepositoryFactory(testDir, lockManager);

      await projectContext.runWithProjectContext('project-A', () => {
        const planRepo = factory?.createPlanRepository();

        // PlanRepository should be created but not initialized yet
        expect(planRepo).toBeDefined();
      });
    });

    it('should call planRepo.initialize() on first access per projectId', async () => {
      factory = new DynamicRepositoryFactory(testDir, lockManager);

      await projectContext.runWithProjectContext('project-B', async () => {
        const planRepo = factory.createPlanRepository();
        await planRepo.initialize();

        // Should initialize successfully
        const plans = await planRepo.listPlans();
        expect(Array.isArray(plans)).toBe(true);
      });
    });
  });

  describe('Factory caching per projectId', () => {
    it('should return cached factory for same projectId', async () => {
      factory = new DynamicRepositoryFactory(testDir, lockManager);

      const repo1 = await projectContext.runWithProjectContext('project-C', async () => {
        const repo = factory.createPlanRepository();
        await repo.initialize();
        return repo;
      });

      const repo2 = await projectContext.runWithProjectContext('project-C', async () => {
        const repo = factory.createPlanRepository();
        // Note: initialize() is idempotent - calling again does nothing
        await repo.initialize();
        return repo;
      });

      // Should be same instance (from cached factory)
      expect(repo1).toBe(repo2);
    });

    it('should create different factory for different projectId', async () => {
      factory = new DynamicRepositoryFactory(testDir, lockManager);

      const repo1 = await projectContext.runWithProjectContext('project-D', async () => {
        const repo = factory.createPlanRepository();
        await repo.initialize();
        return repo;
      });

      const repo2 = await projectContext.runWithProjectContext('project-E', async () => {
        const repo = factory.createPlanRepository();
        await repo.initialize();
        return repo;
      });

      // Should be different instances (different factories)
      expect(repo1).not.toBe(repo2);
    });
  });

  describe('Concurrent requests and race conditions', () => {
    it('should handle concurrent initialization for same projectId without race', async () => {
      factory = new DynamicRepositoryFactory(testDir, lockManager);

      // Simulate 5 concurrent requests for same projectId
      const promises: Promise<unknown>[] = Array.from({ length: 5 }, () =>
        projectContext.runWithProjectContext('project-F', async () => {
          const repo = factory?.createPlanRepository();
          if (repo != null) {
            await repo.initialize();
          }
          return repo;
        })
      );

      const repos = await Promise.all(promises);

      // All should be same instance (cached factory)
      const first = repos[0];
      repos.forEach(repo => {
        expect(repo).toBe(first);
      });
    });

    it('should handle concurrent requests for different projectIds', async () => {
      factory = new DynamicRepositoryFactory(testDir, lockManager);

      const projectIds = ['proj-1', 'proj-2', 'proj-3'];
      const promises: Promise<unknown>[] = projectIds.map(projectId =>
        projectContext.runWithProjectContext(projectId, async () => {
          const repo = factory?.createPlanRepository();
          if (repo != null) {
            await repo.initialize();
          }
          return { projectId, repo };
        })
      );

      const results = await Promise.all(promises);

      // Each projectId should have different repository instance
      expect(results[0]?.repo).not.toBe(results[1]?.repo);
      expect(results[1]?.repo).not.toBe(results[2]?.repo);
      expect(results[0]?.repo).not.toBe(results[2]?.repo);
    });
  });

  describe('Error handling', () => {
    it('should propagate error from planRepo.initialize()', async () => {
      factory = new DynamicRepositoryFactory(testDir, lockManager);

      // Create invalid baseDir to force initialization error
      const invalidDir = path.join(testDir, 'nonexistent-\0-invalid');
      const factoryBad = new DynamicRepositoryFactory(invalidDir, lockManager);

      await expect(
        projectContext.runWithProjectContext('project-error', async () => {
          const repo = factoryBad.createPlanRepository();
          await repo.initialize();
        })
      ).rejects.toThrow();

      await factoryBad.close();
    });

    it('should remove factory from cache if initialization fails', async () => {
      factory = new DynamicRepositoryFactory(testDir, lockManager);

      // Mock initialize to fail first time, succeed second time
      let callCount = 0;
      const originalCreate = factory.createPlanRepository.bind(factory);

      factory.createPlanRepository = function(this: DynamicRepositoryFactory) {
        const repo = originalCreate();
        const originalInit = repo.initialize.bind(repo);

        repo.initialize = async function() {
          callCount++;
          if (callCount === 1) {
            throw new Error('First init fails');
          }
          return originalInit();
        };

        return repo;
      };

      // First call should fail
      await expect(
        projectContext.runWithProjectContext('project-retry', async () => {
          const repo = factory.createPlanRepository();
          await repo.initialize();
        })
      ).rejects.toThrow('First init fails');

      // Second call should succeed (factory was removed from cache, re-created)
      await projectContext.runWithProjectContext('project-retry', async () => {
        const repo = factory.createPlanRepository();
        await repo.initialize();
        const plans = await repo.listPlans();
        expect(Array.isArray(plans)).toBe(true);
      });
    });
  });

  describe('close() cleanup', () => {
    it('should dispose all cached factories', async () => {
      factory = new DynamicRepositoryFactory(testDir, lockManager);

      // Create factories for multiple projectIds
      await projectContext.runWithProjectContext('project-G', async () => {
        const repo = factory?.createPlanRepository();
        if (repo != null) {
          await repo.initialize();
        }
      });

      await projectContext.runWithProjectContext('project-H', async () => {
        const repo = factory?.createPlanRepository();
        if (repo != null) {
          await repo.initialize();
        }
      });

      // Close factory
      await factory.close();

      // After close, factory should be unusable
      await expect(
        projectContext.runWithProjectContext('project-G', async () => {
          await Promise.resolve(); // Satisfy require-await
          factory?.createPlanRepository();
        })
      ).rejects.toThrow();
    });
  });

  describe('Missing projectId context', () => {
    it('should create lazy wrapper without throwing, but error on method call', async () => {
      factory = new DynamicRepositoryFactory(testDir, lockManager);

      // Creating wrapper should NOT throw (lazy initialization)
      const repo = factory.createPlanRepository();
      expect(repo).toBeDefined();

      // But calling a method should throw when projectId context is missing
      await expect(repo.listPlans()).rejects.toThrow('projectId context is missing');
    });
  });
});
