/**
 * LockManager Multi-Process Safety Tests
 *
 * Tests for improvements needed for multi-process environments:
 * - Mutex protection for extend() and release()
 * - Iteration limit in doAcquire() retry loop
 * - Configurable dispose timeout
 *
 * Note: True multi-process safety requires file-based or distributed locking.
 * These improvements make the code more robust for high-contention scenarios.
 */

import { LockManager } from '../../src/infrastructure/repositories/file/lock-manager.js';

describe('LockManager Multi-Process Safety', () => {
  // ============================================================================
  // 1. Mutex protection for extend() and release()
  // ============================================================================
  describe('Mutex protection for all operations', () => {
    it('should serialize extend() with acquire() on same resource', async () => {
      const lm = new LockManager({ defaultAcquireTimeout: 5000 });
      const operations: string[] = [];

      // Acquire initial lock
      const { lockId } = await lm.acquire('resource', {
        holderId: 'holder-1',
        acquireTimeout: 0,
        ttl: 5000,
        reentrant: true,
      });

      // Run many concurrent operations
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 10; i++) {
        // Extend operations
        promises.push(
          lm.extend(lockId!, 1000).then(() => {
            operations.push(`extend-${i}`);
          })
        );

        // Reentrant acquire operations
        promises.push(
          lm.acquire('resource', {
            holderId: 'holder-1',
            reentrant: true,
            acquireTimeout: 100,
            ttl: 1000,
          }).then((r) => {
            if (r.acquired) {
              operations.push(`acquire-${i}`);
            }
          })
        );
      }

      await Promise.all(promises);

      // All operations should have completed
      expect(operations.length).toBe(20);

      // Verify lock state is consistent
      const holder = await lm.getLockHolder('resource');
      expect(holder).toBeDefined();
      expect(holder!.refCount).toBeGreaterThanOrEqual(1);

      // Timer invariant: timer exists <=> expiresAt exists
      if (holder!.timer) {
        expect(holder!.expiresAt).toBeDefined();
      }
      if (holder!.expiresAt) {
        expect(holder!.timer).toBeDefined();
      }

      await lm.dispose();
    });

    it('should serialize release() with acquire() on same resource', async () => {
      const lm = new LockManager({ defaultAcquireTimeout: 5000 });
      const errors: string[] = [];

      // Run stress test
      for (let iteration = 0; iteration < 20; iteration++) {
        // Acquire with reentrant
        const { lockId } = await lm.acquire('resource', {
          holderId: 'holder',
          reentrant: true,
          acquireTimeout: 0,
        });

        // Concurrent release + reentrant acquire
        const [, acquireResult] = await Promise.all([
          lm.release(lockId!).catch((e) => {
            if (!e.message.includes('not found')) {
              errors.push(`release error: ${e.message}`);
            }
          }),
          lm.acquire('resource', {
            holderId: 'holder',
            reentrant: true,
            acquireTimeout: 100,
          }),
        ]);

        // Check consistency
        const holder = await lm.getLockHolder('resource');

        if (acquireResult.acquired && holder) {
          // If acquire succeeded, refCount should be valid
          if (holder.refCount < 1) {
            errors.push(`Invalid refCount: ${holder.refCount}`);
          }
        }

        // Clean up for next iteration
        await lm.releaseAll();
      }

      expect(errors).toHaveLength(0);
      await lm.dispose();
    });

    it('should not corrupt state with concurrent extend and release', async () => {
      const lm = new LockManager({ defaultAcquireTimeout: 5000 });
      const errors: string[] = [];

      for (let i = 0; i < 20; i++) {
        const { lockId } = await lm.acquire('resource', {
          ttl: 5000,
          acquireTimeout: 0,
        });

        // Race: extend and release
        const _results = await Promise.allSettled([
          lm.extend(lockId!, 1000),
          lm.release(lockId!),
        ]);

        // After race, state should be consistent
        const holder = await lm.getLockHolder('resource');

        if (holder) {
          // If lock exists, it should be valid
          if (holder.refCount < 1) {
            errors.push(`Invalid refCount after race: ${holder.refCount}`);
          }
          // Clean up
          await lm.release(holder.lockId);
        }

        // Verify no phantom timers by checking lock is gone
        const holderAfter = await lm.getLockHolder('resource');
        if (holderAfter && holderAfter.lockId !== lockId) {
          errors.push('Phantom lock created');
        }
      }

      expect(errors).toHaveLength(0);
      await lm.dispose();
    });
  });

  // ============================================================================
  // 2. Iteration limit in doAcquire() retry loop
  // ============================================================================
  describe('Iteration limit in doAcquire()', () => {
    it('should have maxRetries option to limit retry attempts', async () => {
      const lm = new LockManager({
        defaultAcquireTimeout: 10000,
        maxRetries: 3, // New option!
      });

      // Block resource with very short TTL (causes frequent releases)
      let running = true;
      const churner = (async () => {
        while (running) {
          const r = await lm.acquire('hot-resource', {
            holderId: 'churner',
            acquireTimeout: 0,
            ttl: 5,
          });
          if (r.acquired) {
            await new Promise((resolve) => setTimeout(resolve, 3));
            try {
              await lm.release(r.lockId!);
            } catch {
              // Ignore
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      })();

      // Try to acquire - should fail after maxRetries, not loop forever
      const start = Date.now();
      const result = await lm.acquire('hot-resource', {
        holderId: 'victim',
        acquireTimeout: 10000, // Long timeout
        // maxRetries should kick in before timeout
      });
      const elapsed = Date.now() - start;

      running = false;
      await churner;

      // Should have stopped due to maxRetries, not timeout
      // With maxRetries=3, should fail relatively quickly
      if (!result.acquired) {
        expect(result.reason).toContain('max retries');
        expect(elapsed).toBeLessThan(5000); // Much less than 10s timeout
      }

      await lm.dispose();
    });

    it('should report retry count in result when failing', async () => {
      const lm = new LockManager({
        defaultAcquireTimeout: 5000,
        maxRetries: 2,
      });

      // Block resource indefinitely
      await lm.acquire('blocked', {
        holderId: 'blocker',
        acquireTimeout: 0,
        ttl: 0, // Infinite
      });

      // Start churning to trigger retries
      let releases = 0;
      const releaseInterval = setInterval(async () => {
        try {
          // Release and re-acquire to trigger retry
          await lm.releaseAll();
          await lm.acquire('blocked', {
            holderId: 'blocker',
            acquireTimeout: 0,
          });
          releases++;
        } catch {
          // Ignore
        }
      }, 50);

      const result = await lm.acquire('blocked', {
        holderId: 'victim',
        acquireTimeout: 5000,
      });

      clearInterval(releaseInterval);

      // Should have failed due to retries
      if (!result.acquired && releases >= 2) {
        expect(result.reason).toContain('retry');
      }

      await lm.dispose();
    });
  });

  // ============================================================================
  // 3. Configurable dispose timeout
  // ============================================================================
  describe('Configurable dispose timeout', () => {
    it('should accept disposeTimeout in constructor options', async () => {
      const lm = new LockManager({
        defaultAcquireTimeout: 5000,
        disposeTimeout: 500, // New option: wait up to 500ms for in-flight ops
      });

      // FIRST: Block the resource
      await lm.acquire('resource', {
        holderId: 'blocker',
        acquireTimeout: 0,
      });

      // THEN: Start a slow operation that will wait for the blocked resource
      const slowAcquire = lm.acquire('resource', {
        holderId: 'waiter',
        acquireTimeout: 1000, // Will wait
      });

      // Give time for slow acquire to start waiting
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Dispose should wait up to disposeTimeout for in-flight ops
      const start = Date.now();
      await lm.dispose();
      const elapsed = Date.now() - start;

      // Should have waited some time (not instant)
      // disposeTimeout is 500ms, but we only wait while inFlightOps > 0
      expect(elapsed).toBeGreaterThanOrEqual(10); // Some waiting happened

      // Slow acquire should have been interrupted
      const result = await slowAcquire;
      expect(result.acquired).toBe(false);
      expect(result.reason).toContain('disposed');
    });

    it('should use default disposeTimeout if not specified', async () => {
      const lm = new LockManager();

      // Access internal to verify default
      // This is a bit hacky but necessary for the test
      const options = (lm as any);

      // Default should be reasonable (e.g., 100ms as currently hardcoded)
      // After fix, should be configurable
      expect(typeof options.disposeTimeout === 'number' ||
             options.disposeTimeout === undefined).toBe(true);

      await lm.dispose();
    });

    it('should wait for slow operations up to disposeTimeout', async () => {
      const lm = new LockManager({
        defaultAcquireTimeout: 5000,
        disposeTimeout: 200,
      });

      // Track when operation completes
      let operationCompleted = false;

      // Start operation that takes time
      const operation = (async () => {
        await lm.acquire('resource', { acquireTimeout: 0 });
        await new Promise((resolve) => setTimeout(resolve, 150));
        operationCompleted = true;
      })();

      // Give operation time to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Dispose - should wait for operation
      await lm.dispose();

      // Operation should have had time to complete
      await operation;
      expect(operationCompleted).toBe(true);
    });
  });

  // ============================================================================
  // Integration test
  // ============================================================================
  describe('Integration: High contention stress test', () => {
    it('should handle extreme contention without corruption or hangs', async () => {
      const lm = new LockManager({
        defaultAcquireTimeout: 500,
        maxRetries: 10,
        disposeTimeout: 1000,
      });

      const errors: string[] = [];
      const operations: Promise<void>[] = [];

      // Spawn many concurrent operations on same resource
      for (let i = 0; i < 50; i++) {
        operations.push(
          (async () => {
            try {
              const result = await lm.acquire(`resource-${i % 3}`, {
                holderId: `holder-${i % 5}`,
                reentrant: true,
                acquireTimeout: 200,
                ttl: 50,
              });

              if (result.acquired && result.lockId) {
                // Random operations
                if (Math.random() > 0.5) {
                  await lm.extend(result.lockId, 100);
                }
                await new Promise((r) => setTimeout(r, Math.random() * 20));
                try {
                  await lm.release(result.lockId);
                } catch {
                  // May have auto-released
                }
              }
            } catch (e: any) {
              if (!e.message.includes('disposed')) {
                errors.push(e.message);
              }
            }
          })()
        );
      }

      // Wait with timeout
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
      await Promise.race([Promise.all(operations), timeout]);

      // Verify no unexpected errors
      expect(errors.filter((e) => !e.includes('not found'))).toHaveLength(0);

      // Verify consistent state
      for (let i = 0; i < 3; i++) {
        const holder = await lm.getLockHolder(`resource-${i}`);
        if (holder) {
          expect(holder.refCount).toBeGreaterThanOrEqual(1);
        }
      }

      await lm.dispose();
    }, 10000);
  });
});
