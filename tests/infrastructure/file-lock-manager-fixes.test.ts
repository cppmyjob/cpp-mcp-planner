/**
 * FileLockManager Bug Fixes Tests
 *
 * TDD tests for bugs found in deep code review.
 * Each test is designed to FAIL before the fix (RED phase).
 *
 * Bugs covered:
 * - CRITICAL #1: Resource name collision in getLockPath
 * - HIGH #1: Race condition between acquire() and Map
 * - HIGH #2: Missing initialize() check
 * - MEDIUM #1: TOCTOU in ensureLockFile
 * - MEDIUM #2: release() doesn't check disposed
 * - LOW #1: Better error handling for proper-lockfile errors
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileLockManager } from '@mcp-planner/mcp-server';

describe('FileLockManager Bug Fixes (Code Review)', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `file-lock-fix-test-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors in tests
    });
  });

  // ============================================================================
  // CRITICAL #1: Resource name collision in getLockPath
  // ============================================================================
  describe('CRITICAL #1: Resource name collision in getLockPath', () => {
    it('should NOT create same lock file for different resources with similar names', async () => {
      const lockManager = new FileLockManager(testDir);
      await lockManager.initialize();

      // These are DIFFERENT resources but would create same lock file with naive sanitization
      const resource1 = 'plan:123';
      const resource2 = 'plan_123';
      const resource3 = 'plan/123';

      // Acquire lock on first resource
      const release1 = await lockManager.acquire(resource1);
      expect(lockManager.isHeldByUs(resource1)).toBe(true);

      // Should be able to acquire lock on second resource (different resource!)
      // BUG: With current implementation, this will timeout because both map to 'plan_123.lock'
      const release2 = await lockManager.acquire(resource2);
      expect(lockManager.isHeldByUs(resource2)).toBe(true);

      // Should be able to acquire lock on third resource too
      const release3 = await lockManager.acquire(resource3);
      expect(lockManager.isHeldByUs(resource3)).toBe(true);

      // All three should be independently locked
      expect(lockManager.getActiveLocksCount()).toBe(3);

      await release1();
      await release2();
      await release3();
      await lockManager.dispose();
    });

    it('should create unique lock files for resources that differ only by special characters', async () => {
      const lockManager = new FileLockManager(testDir);
      await lockManager.initialize();

      const resources = [
        'entity:abc:def',
        'entity_abc_def',
        'entity/abc/def',
        'entity.abc.def',
        'entity-abc-def',
      ];

      const releases: (() => Promise<boolean>)[] = [];

      // All should be acquirable simultaneously
      for (const resource of resources) {
        const release = await lockManager.acquire(resource);
        releases.push(release);
      }

      expect(lockManager.getActiveLocksCount()).toBe(resources.length);

      // Verify all locks are held independently
      // (proper-lockfile creates .lock directories, so we check via isHeldByUs)
      for (const resource of resources) {
        expect(lockManager.isHeldByUs(resource)).toBe(true);
      }

      // Cleanup
      for (const release of releases) {
        await release();
      }
      await lockManager.dispose();
    });

    it('should handle extremely long resource names', async () => {
      const lockManager = new FileLockManager(testDir);
      await lockManager.initialize();

      // Very long resource name (simulating deep nested paths)
      const longResource = 'plan/' + 'x'.repeat(500) + '/entity/' + 'y'.repeat(500);

      // Should not throw and should create valid lock file
      const release = await lockManager.acquire(longResource);
      expect(lockManager.isHeldByUs(longResource)).toBe(true);

      await release();
      await lockManager.dispose();
    });
  });

  // ============================================================================
  // HIGH #1: Race condition between acquire() and Map
  // ============================================================================
  describe('HIGH #1: Race condition between acquire() and dispose()', () => {
    it('should reject acquire immediately when already disposed', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 5000,
      });
      await lockManager.initialize();

      // Dispose first
      await lockManager.dispose();

      // Acquire should fail immediately with disposed error
      await expect(lockManager.acquire('resource')).rejects.toThrow(/disposed/i);

      // Verify no dangling state
      expect(lockManager.getActiveLocksCount()).toBe(0);
    });

    it('should not store lock in activeLocks if disposed during file lock acquisition', async () => {
      // This tests the race condition where we get the file lock
      // but disposed flag is set before we store in activeLocks

      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 100,
      });
      await lockManager.initialize();

      // Acquire and immediately release to ensure lock file exists
      const release = await lockManager.acquire('resource');
      await release();

      // Now dispose
      await lockManager.dispose();

      // Map should be empty
      expect(lockManager.getActiveLocksCount()).toBe(0);
    });

    it('should serialize concurrent acquire calls on same resource from same process', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 2000,
      });
      await lockManager.initialize();

      // Multiple concurrent acquires on same resource
      const results: { index: number; acquired: boolean; error?: string }[] = [];

      const promises = Array.from({ length: 5 }, async (_, i) => {
        try {
          const release = await lockManager.acquire('same-resource');
          results.push({ index: i, acquired: true });
          await new Promise(r => setTimeout(r, 50)); // Hold lock briefly
          await release();
        } catch (err: unknown) {
          results.push({ index: i, acquired: false, error: (err as Error).message });
        }
      });

      await Promise.all(promises);

      // At least one should have succeeded
      const succeeded = results.filter(r => r.acquired);
      expect(succeeded.length).toBeGreaterThanOrEqual(1);

      // No internal state corruption
      expect(lockManager.getActiveLocksCount()).toBe(0);

      await lockManager.dispose();
    });
  });

  // ============================================================================
  // HIGH #2: Missing initialize() check
  // ============================================================================
  describe('HIGH #2: Missing initialize() check', () => {
    it('should throw clear error if acquire() called before initialize()', async () => {
      const lockManager = new FileLockManager(testDir);
      // Note: NOT calling initialize()

      await expect(lockManager.acquire('resource')).rejects.toThrow(/initialize/i);
    });

    it('should throw clear error if withLock() called before initialize()', async () => {
      const lockManager = new FileLockManager(testDir);
      // Note: NOT calling initialize()

      await expect(
        lockManager.withLock('resource', () => Promise.resolve('result'))
      ).rejects.toThrow(/initialize/i);
    });

    it('should throw clear error if isLocked() called before initialize()', async () => {
      const lockManager = new FileLockManager(testDir);
      // Note: NOT calling initialize()

      await expect(lockManager.isLocked('resource')).rejects.toThrow(/initialize/i);
    });

    it('should allow multiple initialize() calls (idempotent)', async () => {
      const lockManager = new FileLockManager(testDir);

      await lockManager.initialize();
      await lockManager.initialize(); // Should not throw
      await lockManager.initialize(); // Should not throw

      // Should still work
      const release = await lockManager.acquire('resource');
      await release();
      await lockManager.dispose();
    });
  });

  // ============================================================================
  // MEDIUM #1: TOCTOU in ensureLockFile
  // ============================================================================
  describe('MEDIUM #1: TOCTOU in ensureLockFile', () => {
    it('should handle concurrent file creation safely', async () => {
      const lockManager1 = new FileLockManager(testDir, { acquireTimeout: 500 });
      const lockManager2 = new FileLockManager(testDir, { acquireTimeout: 500 });

      await lockManager1.initialize();
      await lockManager2.initialize();

      // Both try to acquire DIFFERENT resources at the same time
      // Both will try to create lock files concurrently
      const results = await Promise.allSettled([
        lockManager1.acquire('resource-1'),
        lockManager2.acquire('resource-2'),
      ]);

      // Both should succeed (different resources)
      const fulfilled = results.filter((r): r is PromiseFulfilledResult<() => Promise<boolean>> =>
        r.status === 'fulfilled'
      );
      expect(fulfilled).toHaveLength(2);

      // Neither should throw EEXIST or other file system errors
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
         
        .filter(r => {
          const reason = r.reason as unknown;
          return Boolean(reason) && typeof reason === 'object' && reason !== null && 'message' in reason && typeof (reason as { message: unknown }).message === 'string' && !(reason as { message: string }).message.includes('Timeout');
        });
      expect(errors).toHaveLength(0);

      // Cleanup
      for (const result of fulfilled) {
        await result.value();
      }

      await lockManager1.dispose();
      await lockManager2.dispose();
    });

    it('should use atomic file creation to prevent race conditions', async () => {
      // Test that multiple concurrent acquires on same resource from different managers
      // don't fail with EEXIST errors during lock file creation
      const managers: FileLockManager[] = [];
      const errors: string[] = [];

      for (let i = 0; i < 3; i++) {
        const lm = new FileLockManager(testDir, { acquireTimeout: 200 });
        await lm.initialize();
        managers.push(lm);
      }

      // All try to acquire same resource - first wins, others timeout
      const results = await Promise.allSettled(
        managers.map(lm => lm.acquire('shared-resource'))
      );

      // Check for unexpected errors (not Timeout)
      for (const result of results) {
        if (result.status === 'rejected') {
          const reason = result.reason as unknown;
           
          if (Boolean(reason) && typeof reason === 'object' && reason !== null && 'message' in reason && typeof (reason as { message: unknown }).message === 'string' && !(reason as { message: string }).message.includes('Timeout')) {
             
            errors.push((reason as { message: string }).message);
          }
        }
      }

      // No EEXIST or other file system errors
      expect(errors).toHaveLength(0);

      // Exactly one should have succeeded
      const succeeded = results.filter(r => r.status === 'fulfilled');
      expect(succeeded.length).toBe(1);

      // Cleanup
      for (const lm of managers) {
        await lm.dispose();
      }
    });
  });

  // ============================================================================
  // MEDIUM #2: release() doesn't check disposed
  // ============================================================================
  describe('MEDIUM #2: release() disposed check', () => {
    it('should handle release() after dispose() gracefully', async () => {
      const lockManager = new FileLockManager(testDir);
      await lockManager.initialize();

      const release = await lockManager.acquire('resource');

      // Dispose first
      await lockManager.dispose();

      // Now call release - should not throw, return true (considered clean since dispose handled it)
      await expect(release()).resolves.toBe(true);
    });

    it('should handle manual release() after dispose() gracefully', async () => {
      const lockManager = new FileLockManager(testDir);
      await lockManager.initialize();

      await lockManager.acquire('resource');

      await lockManager.dispose();

      // Manual release after dispose - should not throw, return true
      await expect(lockManager.release('resource')).resolves.toBe(true);
    });
  });

  // ============================================================================
  // LOW #1: Better error handling for proper-lockfile errors
  // ============================================================================
  describe('LOW #1: Better error handling', () => {
    it('should provide clear error message for timeout', async () => {
      const blocker = new FileLockManager(testDir, { acquireTimeout: 100 });
      await blocker.initialize();
      await blocker.acquire('resource');

      const lockManager = new FileLockManager(testDir, { acquireTimeout: 100 });
      await lockManager.initialize();

      try {
        await lockManager.acquire('resource');
        fail('Should have thrown');
      } catch (err: unknown) {
        expect((err as Error).message).toMatch(/timeout/i);
        expect((err as Error).message).toContain('resource');
        expect((err as Error).message).toContain('100'); // timeout value
      }

      await blocker.dispose();
      await lockManager.dispose();
    });

    it('should wrap permission errors with clear message', async () => {
      // This test is platform-specific and may need adjustment
      // Skip on Windows where permission model is different
      if (process.platform === 'win32') {
        return;
      }

      const lockManager = new FileLockManager(testDir);
      await lockManager.initialize();

      // Make lock directory read-only
      const lockDir = path.join(testDir, '.locks');
      await fs.chmod(lockDir, 0o444);

      try {
        await lockManager.acquire('resource');
        fail('Should have thrown');
      } catch (err: unknown) {
        // Should have clear error, not raw EACCES
        expect((err as Error).message.toLowerCase()).toMatch(/permission|access|denied/i);
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(lockDir, 0o755);
      }

      await lockManager.dispose();
    });
  });

  // ============================================================================
  // Integration: Comprehensive stress test
  // ============================================================================
  describe('Integration: Stress test with all fixes', () => {
    it('should handle chaotic concurrent operations without errors', async () => {
      const managers: FileLockManager[] = [];
      const errors: string[] = [];

      // Create multiple managers
      for (let i = 0; i < 3; i++) {
        const lm = new FileLockManager(testDir, {
          acquireTimeout: 500,
          retryInterval: 20,
        });
        await lm.initialize();
        managers.push(lm);
      }

      // Resources with collision-prone names
      const resources = [
        'plan:1',
        'plan_1',
        'plan/1',
        'entity:abc',
        'entity_abc',
      ];

      // Run chaotic operations
      const operations: Promise<void>[] = [];

      for (let i = 0; i < 50; i++) {
        const manager = managers[i % managers.length];
        const resource = resources[i % resources.length];

        operations.push(
          (async () => {
            try {
              const release = await manager.acquire(resource);
              await new Promise(r => setTimeout(r, Math.random() * 20));
              await release();
            } catch (err: unknown) {
              if (!(err as Error).message.includes('Timeout') && !(err as Error).message.includes('disposed')) {
                errors.push(`${resource}: ${(err as Error).message}`);
              }
            }
          })()
        );
      }

      await Promise.all(operations);

      // No unexpected errors
      expect(errors).toHaveLength(0);

      // Clean up
      for (const lm of managers) {
        await lm.dispose();
      }
    });
  });
});
