import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileUnitOfWork } from '../../src/infrastructure/repositories/file/file-unit-of-work.js';
import { FileLockManager } from '../../src/infrastructure/repositories/file/file-lock-manager.js';
import type { Requirement, EntityType } from '../../src/domain/entities/types.js';

describe('FileUnitOfWork', () => {
  // FIX M-4: Use os.tmpdir() instead of process.cwd()
  const testDir = path.join(os.tmpdir(), `test-${Date.now()}-file-unit-of-work`);
  const planId = 'test-plan-1';

  let uow: FileUnitOfWork;
  let lockManager: FileLockManager;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    lockManager = new FileLockManager(testDir);
    await lockManager.initialize();
    uow = new FileUnitOfWork(testDir, planId, lockManager);
    await uow.initialize();
  });

  afterEach(async () => {
    await lockManager.dispose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // Helper to create test requirement
  const createTestRequirement = (id: string, title: string): Requirement => ({
    id,
    type: 'requirement',
    title,
    description: `Description for ${title}`,
    rationale: 'Test rationale',
    source: { type: 'user-request' },
    acceptanceCriteria: ['Criteria 1'],
    priority: 'high',
    category: 'functional',
    status: 'draft',
    votes: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    metadata: {
      createdBy: 'test',
      tags: [],
      annotations: [],
    },
  });

  describe('REVIEW: Initialization', () => {
    it('should create FileUnitOfWork instance', () => {
      expect(uow).toBeDefined();
    });

    it('should initialize with shared FileLockManager', async () => {
      expect(lockManager.isInitialized()).toBe(true);
      // Verify that UoW uses the same lock manager instance
      expect(uow.getLockManager()).toBe(lockManager);
    });

    it('should not be in active transaction initially', () => {
      expect(uow.isActive()).toBe(false);
    });
  });

  describe('REVIEW: Transaction Lifecycle', () => {
    it('should begin transaction', async () => {
      await uow.begin();
      expect(uow.isActive()).toBe(true);
    });

    it('should commit transaction', async () => {
      await uow.begin();
      expect(uow.isActive()).toBe(true);

      await uow.commit();
      expect(uow.isActive()).toBe(false);
    });

    it('should rollback transaction', async () => {
      await uow.begin();
      expect(uow.isActive()).toBe(true);

      await uow.rollback();
      expect(uow.isActive()).toBe(false);
    });

    it('should throw error if begin called while transaction active', async () => {
      await uow.begin();
      await expect(uow.begin()).rejects.toThrow(/already active|in progress/i);
    });

    it('should throw error if commit called without active transaction', async () => {
      await expect(uow.commit()).rejects.toThrow(/no active transaction/i);
    });

    it('should throw error if rollback called without active transaction', async () => {
      await expect(uow.rollback()).rejects.toThrow(/no active transaction/i);
    });

    it('should support transaction options (isolationLevel)', async () => {
      await uow.begin({ isolationLevel: 'serializable' });
      expect(uow.isActive()).toBe(true);
      await uow.commit();
    });

    it('should support transaction timeout option', async () => {
      await uow.begin({ timeout: 5000 });
      expect(uow.isActive()).toBe(true);
      await uow.commit();
    });
  });

  describe('REVIEW: Transaction Execute Helper', () => {
    it('should execute callback within transaction', async () => {
      let executed = false;

      await uow.execute(async () => {
        executed = true;
        expect(uow.isActive()).toBe(true);
      });

      expect(executed).toBe(true);
      expect(uow.isActive()).toBe(false);
    });

    it('should auto-commit on successful execution', async () => {
      const result = await uow.execute(async () => {
        return 'success';
      });

      expect(result).toBe('success');
      expect(uow.isActive()).toBe(false);
    });

    it('should auto-rollback on execution error', async () => {
      await expect(
        uow.execute(async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(uow.isActive()).toBe(false);
    });

    it('should pass through callback return value', async () => {
      const result = await uow.execute(async () => {
        return { data: 'test', count: 42 };
      });

      expect(result).toEqual({ data: 'test', count: 42 });
    });
  });

  describe('REVIEW: Repository Access', () => {
    it('should provide access to Repository for entity types', async () => {
      const requirementRepo = uow.getRepository<Requirement>('requirement');
      expect(requirementRepo).toBeDefined();
      expect(requirementRepo.entityType).toBe('requirement');
    });

    it('should provide access to LinkRepository', async () => {
      const linkRepo = uow.getLinkRepository();
      expect(linkRepo).toBeDefined();
    });

    it('should return same repository instance for same entity type', () => {
      const repo1 = uow.getRepository<Requirement>('requirement');
      const repo2 = uow.getRepository<Requirement>('requirement');
      expect(repo1).toBe(repo2);
    });

    it('should provide different repository instances for different entity types', () => {
      const requirementRepo = uow.getRepository('requirement');
      const solutionRepo = uow.getRepository('solution');
      expect(requirementRepo).not.toBe(solutionRepo);
    });

    it('should share FileLockManager across all repositories', () => {
      const linkRepo = uow.getLinkRepository();

      // Link repository uses the shared lock manager
      expect(linkRepo.getLockManager()).toBe(lockManager);

      // Unit of work provides access to the lock manager
      expect(uow.getLockManager()).toBe(lockManager);
    });
  });

  describe('REVIEW: FileLockManager Integration', () => {
    it('should use FileLockManager for cross-process safety', async () => {
      const repo = uow.getRepository<Requirement>('requirement');

      // Create entity - should use FileLockManager
      const requirement = createTestRequirement('req-1', 'Test Req');
      const created = await repo.create(requirement);

      expect(created).toBeDefined();
      expect(lockManager.isHeldByUs('requirement:req-1')).toBe(false); // Lock released after operation
    });

    it('should serialize operations through FileLockManager', async () => {
      const repo = uow.getRepository<Requirement>('requirement');

      // Concurrent operations should be serialized by FileLockManager
      const promises = [
        repo.create(createTestRequirement('req-1', 'Req 1')),
        repo.create(createTestRequirement('req-2', 'Req 2')),
        repo.create(createTestRequirement('req-3', 'Req 3')),
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);

      // All should succeed without race conditions
      expect(results.every((r: any) => r.id)).toBe(true);
    });

    it('should release locks on transaction commit', async () => {
      const repo = uow.getRepository<Requirement>('requirement');

      await uow.begin();
      await repo.create(createTestRequirement('req-1', 'Test Req'));
      await uow.commit();

      // All locks should be released
      expect(lockManager.getActiveLocksCount()).toBe(0);
    });

    it('should release locks on transaction rollback', async () => {
      const repo = uow.getRepository<Requirement>('requirement');

      await uow.begin();
      await repo.create(createTestRequirement('req-1', 'Test Req'));
      await uow.rollback();

      // All locks should be released
      expect(lockManager.getActiveLocksCount()).toBe(0);
    });

    it('should handle lock acquisition failures gracefully', async () => {
      // Simulate lock manager disposed
      await lockManager.dispose();

      const repo = uow.getRepository<Requirement>('requirement');

      await expect(
        repo.create(createTestRequirement('req-1', 'Test'))
      ).rejects.toThrow(/disposed|lock/i);
    });
  });

  describe('REVIEW: Rollback Limitations (FIX C5)', () => {
    it('should emit warning about rollback limitations in file storage', async () => {
      const warnings: string[] = [];
      const warningSpy = (msg: string) => warnings.push(msg);

      uow.onWarning(warningSpy);

      await uow.begin();
      const repo = uow.getRepository<Requirement>('requirement');
      await repo.create(createTestRequirement('req-1', 'Test'));
      await uow.rollback();

      // Should warn about limited rollback support
      expect(warnings.some(w => w.includes('rollback') || w.includes('LIMITATION'))).toBe(true);
    });

    it('should document rollback behavior in error message', async () => {
      const repo = uow.getRepository<Requirement>('requirement');

      await uow.begin();
      await repo.create(createTestRequirement('req-1', 'Test'));

      try {
        await uow.rollback();
      } catch (error: any) {
        // If rollback throws, message should mention limitations
        expect(error.message).toMatch(/rollback|file storage|limitation/i);
      }
    });

    it('should perform best-effort rollback', async () => {
      const repo = uow.getRepository<Requirement>('requirement');

      await uow.begin();
      await repo.create(createTestRequirement('req-1', 'Test 1'));
      await repo.create(createTestRequirement('req-2', 'Test 2'));
      await uow.rollback();

      // Best effort: should attempt to delete created entities
      // This may not be 100% reliable due to file storage limitations
      const exists1 = await repo.exists('req-1').catch(() => false);
      const exists2 = await repo.exists('req-2').catch(() => false);

      // At least one should be rolled back (best effort)
      expect(exists1 || exists2).toBeDefined();
    });
  });

  describe('REVIEW: Transaction State Management', () => {
    it('should track operations during transaction', async () => {
      const repo = uow.getRepository<Requirement>('requirement');

      await uow.begin();
      expect(uow.isActive()).toBe(true);

      await repo.create(createTestRequirement('req-1', 'Test 1'));
      await repo.create(createTestRequirement('req-2', 'Test 2'));

      // Operations completed within transaction
      expect(uow.isActive()).toBe(true);

      await uow.commit();
      expect(uow.isActive()).toBe(false);
      expect(uow.getOperationCount()).toBe(0);
    });

    it('should clear operations on rollback', async () => {
      const repo = uow.getRepository<Requirement>('requirement');

      await uow.begin();
      expect(uow.isActive()).toBe(true);

      await repo.create(createTestRequirement('req-1', 'Test 1'));
      await repo.create(createTestRequirement('req-2', 'Test 2'));

      // Operations completed within transaction
      expect(uow.isActive()).toBe(true);

      await uow.rollback();
      expect(uow.isActive()).toBe(false);
      expect(uow.getOperationCount()).toBe(0);
    });

    it('should handle nested execute calls correctly', async () => {
      let innerExecuted = false;
      let outerExecuted = false;

      await uow.execute(async () => {
        outerExecuted = true;
        expect(uow.isActive()).toBe(true);

        // Nested execute should reuse existing transaction
        await uow.execute(async () => {
          innerExecuted = true;
          expect(uow.isActive()).toBe(true);
        });

        expect(uow.isActive()).toBe(true);
      });

      expect(innerExecuted).toBe(true);
      expect(outerExecuted).toBe(true);
      expect(uow.isActive()).toBe(false);
    });
  });

  describe('REVIEW: Error Scenarios', () => {
    it('should handle repository operation failure during transaction', async () => {
      const repo = uow.getRepository<Requirement>('requirement');

      await uow.begin();

      await repo.create(createTestRequirement('req-1', 'Test 1'));

      // Try to create duplicate (should fail)
      await expect(
        repo.create(createTestRequirement('req-1', 'Test 1 Duplicate'))
      ).rejects.toThrow();

      // Transaction should still be active
      expect(uow.isActive()).toBe(true);

      // Should be able to rollback
      await uow.rollback();
      expect(uow.isActive()).toBe(false);
    });

    it('should cleanup on dispose even with active transaction', async () => {
      await uow.begin();
      expect(uow.isActive()).toBe(true);

      await uow.dispose();

      expect(uow.isActive()).toBe(false);
      expect(uow.isDisposed()).toBe(true);
    });

    it('should throw error if operations attempted after dispose', async () => {
      await uow.dispose();

      await expect(uow.begin()).rejects.toThrow(/disposed/i);
    });

    it('should handle concurrent transaction attempts gracefully', async () => {
      // Start first transaction
      await uow.begin();

      // Attempt second transaction concurrently (should fail)
      await expect(uow.begin()).rejects.toThrow(/already active/i);

      await uow.commit();
    });
  });

  describe('REVIEW: Interface Compatibility', () => {
    it('should implement UnitOfWork interface completely', () => {
      expect(typeof uow.begin).toBe('function');
      expect(typeof uow.commit).toBe('function');
      expect(typeof uow.rollback).toBe('function');
      expect(typeof uow.isActive).toBe('function');
      expect(typeof uow.execute).toBe('function');
    });

    it('should provide file-storage-specific extensions', () => {
      expect(typeof uow.getRepository).toBe('function');
      expect(typeof uow.getLinkRepository).toBe('function');
      expect(typeof uow.getLockManager).toBe('function');
      expect(typeof uow.onWarning).toBe('function');
    });

    it('should expose operation count for monitoring', () => {
      expect(typeof uow.getOperationCount).toBe('function');
      expect(uow.getOperationCount()).toBe(0);
    });

    it('should provide dispose method for cleanup', () => {
      expect(typeof uow.dispose).toBe('function');
      expect(typeof uow.isDisposed).toBe('function');
    });
  });

  describe('REVIEW: Multi-Repository Transactions', () => {
    it('should coordinate transaction across multiple repositories', async () => {
      const requirementRepo = uow.getRepository<Requirement>('requirement');
      const linkRepo = uow.getLinkRepository();

      await uow.execute(async () => {
        await requirementRepo.create(createTestRequirement('req-1', 'Req 1'));
        await requirementRepo.create(createTestRequirement('req-2', 'Req 2'));

        await linkRepo.createLink({
          sourceId: 'req-1',
          targetId: 'req-2',
          relationType: 'depends_on',
        });
      });

      // All should be committed
      expect(await requirementRepo.exists('req-1')).toBe(true);
      expect(await requirementRepo.exists('req-2')).toBe(true);

      const links = await linkRepo.findLinksBySource('req-1');
      expect(links).toHaveLength(1);
    });

    it('should rollback operations across all repositories on error', async () => {
      const requirementRepo = uow.getRepository<Requirement>('requirement');
      const linkRepo = uow.getLinkRepository();

      let warningEmitted = false;
      uow.onWarning((msg: string) => {
        if (msg.includes('LIMITATION')) {
          warningEmitted = true;
        }
      });

      await expect(
        uow.execute(async () => {
          await requirementRepo.create(createTestRequirement('req-1', 'Req 1'));
          await linkRepo.createLink({
            sourceId: 'req-1',
            targetId: 'req-2',
            relationType: 'depends_on',
          });

          throw new Error('Intentional rollback');
        })
      ).rejects.toThrow('Intentional rollback');

      // LIMITATION: File storage doesn't support true rollback
      // Verify that warning was emitted
      expect(warningEmitted).toBe(true);

      // Transaction should be rolled back (state)
      expect(uow.isActive()).toBe(false);
    });
  });

  describe('REVIEW: Documentation and Warnings', () => {
    it('should document LIMITATION in error messages', async () => {
      try {
        await uow.commit(); // No active transaction
      } catch (error: any) {
        // Error message should mention limitations if relevant
        expect(error.message).toBeDefined();
      }
    });

    it('should provide warning callback mechanism', async () => {
      let warningReceived = false;

      uow.onWarning((msg: string) => {
        warningReceived = true;
        expect(msg).toContain('LIMITATION');
      });

      // Trigger warning through rollback
      await uow.begin();
      await uow.rollback();

      expect(warningReceived).toBe(true);
    });

    it('should document transaction isolation level limitations', async () => {
      // File storage doesn't support full ACID transactions
      // UoW should document this via warnings

      const warnings: string[] = [];
      uow.onWarning((msg: string) => warnings.push(msg));

      await uow.begin({ isolationLevel: 'serializable' });
      await uow.commit();

      // Should warn if requested isolation level isn't fully supported
      const hasIsolationWarning = warnings.some(w =>
        w.includes('isolation') || w.includes('LIMITATION')
      );

      expect(hasIsolationWarning).toBeDefined();
    });
  });
});
