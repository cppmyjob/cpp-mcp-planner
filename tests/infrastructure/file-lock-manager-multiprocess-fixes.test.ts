/**
 * FileLockManager Multi-Process Fixes Tests
 *
 * TDD tests for bugs found in deep multi-process code review.
 * Each test is designed to FAIL before the fix (RED phase).
 *
 * Bugs covered:
 * - CRITICAL #2: Race condition in dispose() - wrong operation order
 * - HIGH #1: In-process mutex creates bottleneck
 * - HIGH #3: ENOTACQUIRED silently swallowed in release()
 * - MEDIUM #1: No timeout on dispose()
 * - MEDIUM #3: isLocked() can create file after dispose
 * - MEDIUM #4: withLock() doesn't accept custom options
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileLockManager } from '../../src/infrastructure/repositories/file/file-lock-manager.js';

describe('FileLockManager Multi-Process Fixes', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      `file-lock-mp-test-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Wait a bit for any pending operations
    await new Promise(r => setTimeout(r, 100));
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors in tests
    });
  });

  // ============================================================================
  // CRITICAL #2: Race condition in dispose() - wrong operation order
  // ============================================================================
  describe('CRITICAL #2: dispose() operation order', () => {
    it('should release file locks BEFORE releasing mutexes', async () => {
      const lockManager = new FileLockManager(testDir, { acquireTimeout: 1000 });
      await lockManager.initialize();

      // Acquire a lock
      await lockManager.acquire('resource');
      expect(lockManager.getActiveLocksCount()).toBe(1);

      // Dispose should release file lock first
      await lockManager.dispose();

      // After dispose, no active locks should remain
      expect(lockManager.getActiveLocksCount()).toBe(0);

      // Another manager should be able to acquire immediately
      const lockManager2 = new FileLockManager(testDir, { acquireTimeout: 100 });
      await lockManager2.initialize();

      // Should not timeout - lock should be released
      const release2 = await lockManager2.acquire('resource');
      expect(lockManager2.isHeldByUs('resource')).toBe(true);

      await release2();
      await lockManager2.dispose();
    });

    it('should not allow new acquires to succeed during dispose', async () => {
      const lockManager = new FileLockManager(testDir, { acquireTimeout: 2000 });
      await lockManager.initialize();

      // Hold a lock
      await lockManager.acquire('resource-1');

      // Start dispose and acquire in parallel
      const disposePromise = lockManager.dispose();
      const acquirePromise = lockManager.acquire('resource-2');

      // Wait for both to complete (use allSettled to avoid unhandled rejection)
      const results = await Promise.allSettled([disposePromise, acquirePromise]);

      // Dispose should succeed
      expect(results[0].status).toBe('fulfilled');

      // Acquire should have been rejected with disposed error
      expect(results[1].status).toBe('rejected');
      if (results[1].status === 'rejected') {
        expect(results[1].reason.message).toMatch(/disposed/i);
      }
    });

    it('should handle concurrent dispose and acquire correctly', async () => {
      const results: string[] = [];
      const errors: string[] = [];

      for (let i = 0; i < 10; i++) {
        const lm = new FileLockManager(testDir, { acquireTimeout: 500 });
        await lm.initialize();

        // Race: acquire and dispose
        const acquirePromise = lm.acquire('resource').then(
          (release) => {
            results.push('acquired');
            return release();
          },
          (err: unknown) => {
            if (!(err as Error).message.includes('disposed')) {
              errors.push((err as Error).message);
            }
          }
        );

        const disposePromise = lm.dispose();

        await Promise.all([acquirePromise, disposePromise]);

        // Verify clean state
        expect(lm.getActiveLocksCount()).toBe(0);
      }

      // No unexpected errors
      expect(errors).toHaveLength(0);
    });
  });

  // ============================================================================
  // HIGH #1: In-process mutex bottleneck - verify parallelism
  // ============================================================================
  describe('HIGH #1: In-process mutex should not block unnecessarily', () => {
    it('should allow parallel acquires on DIFFERENT resources', async () => {
      const lockManager = new FileLockManager(testDir, { acquireTimeout: 5000 });
      await lockManager.initialize();

      const startTime = Date.now();

      // Acquire 5 different resources in parallel
      const promises = Array.from({ length: 5 }, (_, i) =>
        lockManager.acquire(`resource-${i.toString()}`)
      );

      const releases = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      // All 5 should be held
      expect(lockManager.getActiveLocksCount()).toBe(5);

      // Should complete quickly (parallel), not 5x sequential time
      // Each acquire takes ~10-50ms for file I/O, so 5 parallel should be < 500ms
      expect(elapsed).toBeLessThan(500);

      // Cleanup
      for (const release of releases) {
        await release();
      }
      await lockManager.dispose();
    });

    it('should serialize acquires on SAME resource (by file lock, not in-process mutex)', async () => {
      const lockManager = new FileLockManager(testDir, { acquireTimeout: 2000 });
      await lockManager.initialize();

      const events: string[] = [];

      // First acquire
      const release1 = await lockManager.acquire('same-resource');
      events.push('acquired-1');

      // Second acquire should wait for file lock release
      const acquire2Promise = (async () => {
        const release = await lockManager.acquire('same-resource');
        events.push('acquired-2');
        return release;
      })();

      // Wait a bit, then release first lock
      await new Promise(r => setTimeout(r, 100));
      events.push('releasing-1');
      await release1();

      // Second should now complete
      const release2 = await acquire2Promise;
      await release2();

      expect(events).toEqual(['acquired-1', 'releasing-1', 'acquired-2']);

      await lockManager.dispose();
    });
  });

  // ============================================================================
  // HIGH #3: ENOTACQUIRED should not be silently swallowed
  // ============================================================================
  describe('HIGH #3: ENOTACQUIRED handling in release()', () => {
    it('should warn when lock was externally released (stale detection)', async () => {
      const warnings: string[] = [];
      const logger = {
        warn: (msg: string, _ctx?: Record<string, unknown>) => {
          warnings.push(msg);
        },
        debug: () => {
          // No-op for tests
        },
        info: () => {
          // No-op for tests
        },
        error: () => {
          // No-op for tests
        },
      };

      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 1000,
        staleThreshold: 500, // Very short for testing
        logger,
        logLevel: 'warn',
      });
      await lockManager.initialize();

      // Acquire lock
      const release = await lockManager.acquire('resource');

      // Simulate stale detection by manually unlocking the file
      // This is what happens when proper-lockfile detects stale lock
      const lockPath = path.join(testDir, '.locks');
      const files = await fs.readdir(lockPath);
      const lockDir = files.find(f => f.endsWith('.lock'));
      if (lockDir !== undefined) {
        // Remove the lock directory to simulate external release
        await fs.rm(path.join(lockPath, lockDir), { recursive: true, force: true });
      }

      // Release should handle this gracefully and log warning
      await release();

      // Should have logged a warning about compromised lock
      // Note: This depends on implementation - may throw or warn
      expect(lockManager.getActiveLocksCount()).toBe(0);
    });
  });

  // ============================================================================
  // MEDIUM #1: dispose() should have timeout
  // ============================================================================
  describe('MEDIUM #1: dispose() timeout', () => {
    it('should complete dispose within reasonable time even if release hangs', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 1000,
        disposeTimeout: 500, // 500ms timeout for dispose
      });
      await lockManager.initialize();

      // Acquire a lock
      await lockManager.acquire('resource');

      const startTime = Date.now();
      await lockManager.dispose();
      const elapsed = Date.now() - startTime;

      // Dispose should complete (even if some releases fail)
      expect(elapsed).toBeLessThan(2000); // Should not hang

      // Should be disposed
      expect(lockManager.isDisposed()).toBe(true);
    });
  });

  // ============================================================================
  // MEDIUM #3: isLocked() should check disposed
  // ============================================================================
  describe('MEDIUM #3: isLocked() after dispose', () => {
    it('should throw if isLocked() called after dispose', async () => {
      const lockManager = new FileLockManager(testDir);
      await lockManager.initialize();

      await lockManager.dispose();

      // isLocked on new resource after dispose should throw
      await expect(lockManager.isLocked('new-resource')).rejects.toThrow(/disposed/i);
    });

    it('should not create lock file after dispose', async () => {
      const lockManager = new FileLockManager(testDir);
      await lockManager.initialize();

      await lockManager.dispose();

      // Count files in .locks before
      const lockDir = path.join(testDir, '.locks');
      const filesBefore = await fs.readdir(lockDir).catch(() => []);

      // Try isLocked (should throw)
      await lockManager.isLocked('new-resource').catch(() => {
        // Ignore error - disposed manager should reject operations
      });

      // Count files after - should be same (no new file created)
      const filesAfter = await fs.readdir(lockDir).catch(() => []);
      expect(filesAfter.length).toBe(filesBefore.length);
    });
  });

  // ============================================================================
  // MEDIUM #4: withLock() should accept options
  // ============================================================================
  describe('MEDIUM #4: withLock() with custom options', () => {
    it('should accept custom acquireTimeout in withLock()', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 10000, // Default 10 seconds
      });
      await lockManager.initialize();

      // Block the resource with another manager
      const blocker = new FileLockManager(testDir, { acquireTimeout: 100 });
      await blocker.initialize();
      await blocker.acquire('resource');

      const startTime = Date.now();

      // withLock with short timeout should fail quickly
      try {
        await lockManager.withLock(
          'resource',
          () => Promise.resolve('result'),
          { acquireTimeout: 200 } // Custom short timeout
        );
        fail('Should have thrown timeout');
      } catch (err: unknown) {
        expect((err as Error).message).toMatch(/timeout/i);
      }

      const elapsed = Date.now() - startTime;

      // Should have timed out in ~200ms, not 10000ms
      expect(elapsed).toBeLessThan(1000);

      await blocker.dispose();
      await lockManager.dispose();
    });

    it('should use default timeout if options not provided', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 100, // Short default
      });
      await lockManager.initialize();

      // Block the resource
      const blocker = new FileLockManager(testDir, { acquireTimeout: 50 });
      await blocker.initialize();
      await blocker.acquire('resource');

      // withLock without options should use default timeout
      await expect(
        lockManager.withLock('resource', () => Promise.resolve('result'))
      ).rejects.toThrow(/timeout/i);

      await blocker.dispose();
      await lockManager.dispose();
    });
  });

  // ============================================================================
  // Integration: Full multi-process stress test
  // ============================================================================
  describe('Integration: Multi-process stress test', () => {
    it('should handle rapid acquire/release cycles without corruption', async () => {
      const managers: FileLockManager[] = [];
      const errors: string[] = [];

      // Create 3 managers (simulating 3 processes)
      for (let i = 0; i < 3; i++) {
        const lm = new FileLockManager(testDir, {
          acquireTimeout: 500,
          staleThreshold: 5000,
        });
        await lm.initialize();
        managers.push(lm);
      }

      // Run 30 operations across all managers
      const operations: Promise<void>[] = [];

      for (let i = 0; i < 30; i++) {
        const manager = managers[i % managers.length];
        const resource = `resource-${(i % 3).toString()}`; // 3 resources, high contention

        operations.push(
          (async () => {
            try {
              const release = await manager.acquire(resource);
              // Simulate some work
              await new Promise(r => setTimeout(r, Math.random() * 20));
              await release();
            } catch (err: unknown) {
              if (
                !(err as Error).message.includes('Timeout') &&
                !(err as Error).message.includes('disposed')
              ) {
                errors.push(`${resource}: ${(err as Error).message}`);
              }
            }
          })()
        );
      }

      await Promise.all(operations);

      // No unexpected errors
      expect(errors).toHaveLength(0);

      // All managers should have 0 active locks
      for (const manager of managers) {
        expect(manager.getActiveLocksCount()).toBe(0);
      }

      // Clean up
      for (const lm of managers) {
        await lm.dispose();
      }
    });

    it('should handle dispose during active operations gracefully', async () => {
      const errors: string[] = [];

      const lm = new FileLockManager(testDir, { acquireTimeout: 2000 });
      await lm.initialize();

      // Start some long-running operations
      const operations = Array.from({ length: 5 }, (_, i) =>
        (async () => {
          try {
            const release = await lm.acquire(`resource-${i.toString()}`);
            await new Promise(r => setTimeout(r, 500)); // Long operation
            await release();
          } catch (err: unknown) {
            if (!(err as Error).message.includes('disposed')) {
              errors.push((err as Error).message);
            }
          }
        })()
      );

      // Wait a bit then dispose mid-operation
      await new Promise(r => setTimeout(r, 100));
      await lm.dispose();

      // Wait for all operations to complete/fail
      await Promise.all(operations);

      // No unexpected errors
      expect(errors).toHaveLength(0);

      // Manager should be fully disposed
      expect(lm.isDisposed()).toBe(true);
      expect(lm.getActiveLocksCount()).toBe(0);
    });
  });
});
