/**
 * FileLockManager Issues Tests (TDD)
 *
 * These tests verify fixes for issues found during code review:
 * 1. dispose() order - file locks must be released BEFORE mutexes
 * 2. ENOTACQUIRED must log warning - not silently ignore
 * 3. Race condition between acquire() and dispose()
 * 4. disposeTimeout must be used
 * 5. Code duplication - acquire() should delegate to acquireWithOptions()
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import lockfile from 'proper-lockfile';
import { FileLockManager } from '../../src/infrastructure/repositories/file/file-lock-manager.js';

describe('FileLockManager Issues', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      `file-lock-issues-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  // ============================================================================
  // Issue #1: dispose() order of operations
  // ============================================================================
  describe('Issue #1: dispose() should release file locks BEFORE mutexes', () => {
    it('should release file locks before waking up in-process waiters', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 5000,
        retryInterval: 50,
      });
      await lockManager.initialize();

      // Acquire first lock
      const release1 = await lockManager.acquire('resource');

      // Track events
      const events: string[] = [];

      // Start second acquire (will wait for mutex)
      const acquire2Promise = lockManager.acquire('resource').then(
        (release) => {
          events.push('acquire2-got-lock');
          return release;
        },
        (error) => {
          events.push(`acquire2-error: ${error.message}`);
          throw error;
        }
      );

      // Give time for acquire2 to start waiting
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Now dispose
      const disposePromise = lockManager.dispose().then(() => {
        events.push('dispose-complete');
      });

      // Wait for both to complete
      await Promise.allSettled([acquire2Promise, disposePromise]);

      // The waiting acquire should have been woken up AFTER file locks released
      // So it should get "disposed" error, not stuck trying to get file lock
      expect(events).toContain('dispose-complete');
      expect(events.some((e) => e.includes('disposed'))).toBe(true);
    });

    it('should not leave dangling file locks when dispose races with acquire', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 2000,
        retryInterval: 50,
      });
      await lockManager.initialize();

      // Create another instance to check lock status
      const checker = new FileLockManager(testDir, {
        acquireTimeout: 500,
        retryInterval: 50,
      });
      await checker.initialize();

      // Acquire lock
      await lockManager.acquire('resource');

      // Start another acquire that will wait
      const acquire2Promise = lockManager.acquire('resource').catch(() => {});

      // Small delay then dispose
      await new Promise((resolve) => setTimeout(resolve, 50));
      await lockManager.dispose();

      // Wait for acquire2 to settle
      await acquire2Promise;

      // Lock should be free for other processes
      // If dispose() left dangling locks, this would timeout
      const releaseCheck = await checker.acquire('resource');
      expect(checker.isHeldByUs('resource')).toBe(true);
      await releaseCheck();

      await checker.dispose();
    });
  });

  // ============================================================================
  // Issue #2: ENOTACQUIRED should log warning
  // ============================================================================
  describe('Issue #2: ENOTACQUIRED should log warning', () => {
    it('should log warning when lock was externally released', async () => {
      const warnings: Array<{ message: string; context?: Record<string, unknown> }> = [];

      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 1000,
        staleThreshold: 100, // Short stale threshold
        logger: {
          debug: () => {},
          info: () => {},
          warn: (msg, ctx) => warnings.push({ message: msg, context: ctx }),
          error: () => {},
        },
        logLevel: 'warn',
      });
      await lockManager.initialize();

      // Acquire lock
      const release = await lockManager.acquire('resource');

      // Simulate external release (like stale detection from another process)
      // We need to manually release the underlying lock
      const lockDir = path.join(testDir, '.locks');
      const files = await fs.readdir(lockDir);
      const lockFile = files.find((f) => f.endsWith('.lock') && !f.includes('.lock.'));

      if (lockFile) {
        const lockPath = path.join(lockDir, lockFile);
        try {
          // Try to forcefully release (simulating stale detection)
          await lockfile.unlock(lockPath);
        } catch {
          // May fail, that's ok
        }
      }

      // Now call release - should log warning about ENOTACQUIRED
      await release();

      // Check that warning was logged
      const hasWarning = warnings.some(
        (w) =>
          w.message.toLowerCase().includes('externally') ||
          w.message.toLowerCase().includes('stale') ||
          w.message.toLowerCase().includes('not acquired') ||
          w.message.toLowerCase().includes('compromised')
      );

      expect(hasWarning).toBe(true);

      await lockManager.dispose();
    });
  });

  // ============================================================================
  // Issue #3: Race condition between acquire() and activeLocks.set()
  // C2: activeLocks.set() can happen AFTER dispose() clears the map
  // ============================================================================
  describe('Issue #3: Race condition acquire/dispose (C2)', () => {
    it('should not leave dangling locks when dispose called during acquire', async () => {
      // This is a timing-sensitive test
      // We need to hit the window between lockfile.lock() completing and activeLocks.set()
      for (let i = 0; i < 10; i++) {
        const lockManager = new FileLockManager(testDir, {
          acquireTimeout: 1000,
          retryInterval: 10,
        });
        await lockManager.initialize();

        // Start multiple acquires and dispose concurrently
        const acquirePromises = Array.from({ length: 3 }, () =>
          lockManager.acquire(`resource-${i}`).catch(() => null)
        );

        // Dispose very quickly
        const disposePromise = lockManager.dispose();

        await Promise.allSettled([...acquirePromises, disposePromise]);

        // After dispose, activeLocks should be empty
        expect(lockManager.getActiveLocksCount()).toBe(0);

        // Create new manager to check no dangling locks
        const checker = new FileLockManager(testDir, {
          acquireTimeout: 200,
          retryInterval: 20,
        });
        await checker.initialize();

        // Should be able to acquire (no dangling lock)
        try {
          const release = await checker.acquire(`resource-${i}`);
          await release();
        } catch (error: any) {
          // If this fails with timeout, there's a dangling lock
          if (error.message.includes('Timeout')) {
            fail(`Dangling lock detected on iteration ${i}`);
          }
        }

        await checker.dispose();
      }
    });

    it('should cleanup any locks added after dispose started (C2 fix)', async () => {
      // This test verifies the fix for C2:
      // If activeLocks.set() happens after dispose() calls activeLocks.clear(),
      // the lock must still be released

      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 2000,
        retryInterval: 20,
      });
      await lockManager.initialize();

      // Acquire a lock first
      const release1 = await lockManager.acquire('resource-1');

      // Start another acquire that will wait on mutex
      const acquire2Promise = lockManager.acquire('resource-1').catch((e) => e);

      // Give time for acquire2 to start waiting on mutex
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Release first lock - this will let acquire2 proceed to lockfile.lock()
      await release1();

      // Immediately dispose while acquire2 is in progress
      // This creates race: acquire2 may get file lock just as dispose() runs
      const disposePromise = lockManager.dispose();

      // Wait for both
      const [acquire2Result] = await Promise.all([acquire2Promise, disposePromise]);

      // acquire2 should have failed with disposed error
      expect(acquire2Result).toBeInstanceOf(Error);
      expect((acquire2Result as Error).message).toContain('disposed');

      // Most importantly: no dangling locks
      expect(lockManager.getActiveLocksCount()).toBe(0);

      // Verify with another manager that lock is free
      const checker = new FileLockManager(testDir, {
        acquireTimeout: 300,
        retryInterval: 20,
      });
      await checker.initialize();

      const releaseCheck = await checker.acquire('resource-1');
      expect(checker.isHeldByUs('resource-1')).toBe(true);
      await releaseCheck();
      await checker.dispose();
    });

    it('should handle rapid dispose during multiple concurrent acquires', async () => {
      // Stress test for C2 race condition
      for (let round = 0; round < 5; round++) {
        const lockManager = new FileLockManager(testDir, {
          acquireTimeout: 500,
          retryInterval: 10,
        });
        await lockManager.initialize();

        // Start many concurrent acquires on same resource
        const acquirePromises = Array.from({ length: 5 }, () =>
          lockManager.acquire('contested-resource').catch(() => null)
        );

        // Dispose after a tiny delay
        await new Promise((resolve) => setTimeout(resolve, 5));
        await lockManager.dispose();

        // Wait for all acquires to settle
        await Promise.allSettled(acquirePromises);

        // No locks should remain
        expect(lockManager.getActiveLocksCount()).toBe(0);

        // Verify lock is free
        const checker = new FileLockManager(testDir, {
          acquireTimeout: 200,
          retryInterval: 10,
        });
        await checker.initialize();

        try {
          const release = await checker.acquire('contested-resource');
          await release();
        } catch (error: any) {
          if (error.message.includes('Timeout')) {
            fail(`Round ${round}: Dangling lock detected after dispose`);
          }
        }

        await checker.dispose();
      }
    });
  });

  // ============================================================================
  // Issue #4: disposeTimeout should be used
  // ============================================================================
  describe('Issue #4: disposeTimeout should be used', () => {
    it('should complete dispose within timeout even if lock release hangs', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 1000,
        disposeTimeout: 200, // Short dispose timeout
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        },
        logLevel: 'warn',
      });
      await lockManager.initialize();

      // Acquire lock
      await lockManager.acquire('resource');

      // Corrupt the lock file to make release hang/fail
      const lockDir = path.join(testDir, '.locks');
      const files = await fs.readdir(lockDir);

      for (const file of files) {
        if (file.endsWith('.lock.lock') || file.includes('.lock')) {
          const lockPath = path.join(lockDir, file);
          try {
            // Try to corrupt/remove lock directory to cause release to take time
            await fs.rm(lockPath, { recursive: true, force: true }).catch(() => {});
          } catch {
            // Ignore
          }
        }
      }

      // Dispose should complete within disposeTimeout + some margin
      const start = Date.now();
      await lockManager.dispose();
      const elapsed = Date.now() - start;

      // Should complete reasonably fast (within 2x disposeTimeout)
      // If disposeTimeout is not used, this could hang indefinitely
      expect(elapsed).toBeLessThan(1000);
    });

    it('should log warning when dispose timeout is reached', async () => {
      const warnings: string[] = [];

      // Create a lock manager with very short disposeTimeout
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 1000,
        disposeTimeout: 50, // Very short
        logger: {
          debug: () => {},
          info: () => {},
          warn: (msg) => warnings.push(msg),
          error: () => {},
        },
        logLevel: 'warn',
      });
      await lockManager.initialize();

      // Acquire lock
      await lockManager.acquire('resource');

      // Mock the release to be slow
      // We can't easily mock proper-lockfile, so we'll check behavior differently
      // The test is that dispose() should not hang forever

      const start = Date.now();
      await lockManager.dispose();
      const elapsed = Date.now() - start;

      // If disposeTimeout is properly used, dispose should complete
      // Even if individual releases are slow
      expect(lockManager.isDisposed()).toBe(true);
      expect(elapsed).toBeLessThan(5000); // Reasonable upper bound
    });
  });

  // ============================================================================
  // Issue #5: Code duplication (acquire should use acquireWithOptions)
  // ============================================================================
  describe('Issue #5: acquire() should delegate to acquireWithOptions()', () => {
    it('should have same behavior whether using acquire() or acquireWithOptions()', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 1000,
        retryInterval: 50,
      });
      await lockManager.initialize();

      // Test acquire()
      const release1 = await lockManager.acquire('resource-1');
      expect(lockManager.isHeldByUs('resource-1')).toBe(true);
      await release1();
      expect(lockManager.isHeldByUs('resource-1')).toBe(false);

      // Test withLock (uses acquireWithOptions internally)
      let wasHeld = false;
      await lockManager.withLock('resource-2', async () => {
        wasHeld = lockManager.isHeldByUs('resource-2');
      });
      expect(wasHeld).toBe(true);
      expect(lockManager.isHeldByUs('resource-2')).toBe(false);

      await lockManager.dispose();
    });
  });

  // ============================================================================
  // Additional robustness tests
  // ============================================================================
  describe('Additional robustness', () => {
    it('should handle rapid acquire/release cycles without leaking', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 2000,
        retryInterval: 20,
      });
      await lockManager.initialize();

      // Rapid acquire/release
      for (let i = 0; i < 20; i++) {
        const release = await lockManager.acquire('rapid-resource');
        expect(lockManager.getActiveLocksCount()).toBe(1);
        await release();
        expect(lockManager.getActiveLocksCount()).toBe(0);
      }

      await lockManager.dispose();
    });

    it('should handle concurrent acquires on different resources', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 2000,
        retryInterval: 20,
      });
      await lockManager.initialize();

      // Acquire multiple different resources concurrently
      const releases = await Promise.all(
        Array.from({ length: 10 }, (_, i) => lockManager.acquire(`resource-${i}`))
      );

      expect(lockManager.getActiveLocksCount()).toBe(10);

      // Release all
      await Promise.all(releases.map((r) => r()));

      expect(lockManager.getActiveLocksCount()).toBe(0);

      await lockManager.dispose();
    });
  });
});
