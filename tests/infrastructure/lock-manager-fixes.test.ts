/**
 * LockManager Bug Fixes Tests
 *
 * TDD tests for bugs found in deep code review.
 * Each test is designed to FAIL before the fix (RED phase).
 *
 * Bugs covered:
 * - CRITICAL #1: extend() race condition with release()
 * - CRITICAL #2: doAcquire() infinite loop under high contention
 * - HIGH #1: autoRelease() doesn't check disposed flag
 * - HIGH #3: release() not protected by mutex (race with acquire on refCount)
 * - HIGH #5: createNewLock() doesn't check disposed flag
 */

import { LockManager } from '../../src/infrastructure/repositories/file/lock-manager.js';

describe('LockManager Bug Fixes (Code Review)', () => {
  let lockManager: LockManager;

  beforeEach(() => {
    lockManager = new LockManager({ defaultAcquireTimeout: 5000 });
  });

  afterEach(async () => {
    if (!lockManager.isDisposed()) {
      await lockManager.dispose();
    }
  });

  // ============================================================================
  // CRITICAL #1: extend() race condition with release()
  // ============================================================================
  describe('CRITICAL #1: extend() race condition with release()', () => {
    it('should not create timer for released lock when extend races with release', async () => {
      // Acquire lock with TTL
      const { lockId } = await lockManager.acquire('resource-1', {
        ttl: 10000,
        acquireTimeout: 0,
      });

      // Race: extend and release simultaneously
      const _results = await Promise.all([
        lockManager.extend(lockId!, 5000),
        lockManager.release(lockId!),
      ]);

      // After race, lock should be fully released (no dangling state)
      const isLocked = await lockManager.isLocked('resource-1');
      const holder = await lockManager.getLockHolder('resource-1');

      // One of these should have "won":
      // - If release won first: extend should fail, lock released
      // - If extend won first: release should succeed after, lock released
      expect(isLocked).toBe(false);
      expect(holder).toBeUndefined();

      // Wait to ensure no timer fires and causes issues
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still be released (no phantom timer recreated the lock)
      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });

    it('should serialize extend() operations on same lock', async () => {
      const { lockId } = await lockManager.acquire('resource-1', {
        ttl: 1000,
        acquireTimeout: 0,
      });

      // Multiple concurrent extends should not corrupt state
      const extends_ = await Promise.all([
        lockManager.extend(lockId!, 2000),
        lockManager.extend(lockId!, 3000),
        lockManager.extend(lockId!, 1500),
      ]);

      // All should succeed (serialized)
      const successCount = extends_.filter(r => r.extended).length;
      expect(successCount).toBe(3);

      // Lock should have exactly one timer (no leaks)
      const holder = await lockManager.getLockHolder('resource-1');
      expect(holder).toBeDefined();
      expect(holder!.timer).toBeDefined();

      // Verify only one timer by checking expiresAt is set correctly
      expect(holder!.expiresAt).toBeDefined();
    });

    it('should handle extend racing with reentrant acquire', async () => {
      const { lockId } = await lockManager.acquire('resource-1', {
        ttl: 1000,
        acquireTimeout: 0,
        reentrant: true,
        holderId: 'holder-1',
      });

      // Race: extend and reentrant acquire
      await Promise.all([
        lockManager.extend(lockId!, 5000),
        lockManager.acquire('resource-1', {
          ttl: 3000,
          acquireTimeout: 0,
          reentrant: true,
          holderId: 'holder-1',
        }),
      ]);

      const holder = await lockManager.getLockHolder('resource-1');
      expect(holder).toBeDefined();
      expect(holder!.refCount).toBe(2); // Both operations should complete

      // Only one timer should exist
      expect(holder!.timer).toBeDefined();
    });
  });

  // ============================================================================
  // CRITICAL #2: doAcquire() infinite loop under high contention
  // ============================================================================
  describe('CRITICAL #2: doAcquire() infinite loop protection', () => {
    it('should timeout even with constantly contested resource', async () => {
      // Create a "hot" resource that keeps getting grabbed
      const { lockId: _initialLock } = await lockManager.acquire('hot-resource', {
        acquireTimeout: 0,
        ttl: 50, // Short TTL - will auto-release often
      });

      // Start multiple competing acquires
      const competitors: Promise<any>[] = [];
      for (let i = 0; i < 5; i++) {
        competitors.push(
          lockManager.acquire('hot-resource', {
            holderId: `competitor-${i}`,
            acquireTimeout: 200, // Should timeout within 200ms
            ttl: 30, // Short TTL if they get it
          })
        );
      }

      const start = Date.now();
      const results = await Promise.all(competitors);
      const duration = Date.now() - start;

      // All should complete (either acquired or timed out) within reasonable time
      // NOT hang forever
      expect(duration).toBeLessThan(1000); // Should be ~200ms, definitely not infinite

      // At least some should have timed out (high contention)
      const _timeouts = results.filter(r => !r.acquired);
      // We don't assert exact count because it's timing-dependent
    });

    it('should have bounded retry attempts in doAcquire', async () => {
      // This test verifies that doAcquire doesn't retry infinitely
      // by checking that timeout is respected even with continuous lock churn

      const lm = new LockManager({ defaultAcquireTimeout: 100 });

      // Start a background loop that constantly grabs and releases the lock
      let running = true;
      const churnPromise = (async () => {
        while (running) {
          try {
            const r = await lm.acquire('churning-resource', {
              holderId: 'churner',
              acquireTimeout: 0,
              ttl: 5, // Very short TTL
            });
            if (r.acquired) {
              await new Promise(resolve => setTimeout(resolve, 3));
              await lm.release(r.lockId!);
            }
          } catch {
            // Ignore errors during churn
          }
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      })();

      // Try to acquire while churning
      const start = Date.now();
      const _result = await lm.acquire('churning-resource', {
        holderId: 'victim',
        acquireTimeout: 100,
      });
      const elapsed = Date.now() - start;

      running = false;
      await churnPromise;

      // Should complete within timeout + buffer, not hang
      expect(elapsed).toBeLessThan(300); // 100ms timeout + overhead
      // Result can be acquired or timed out - both are valid
      // The key is it didn't hang

      await lm.dispose();
    });
  });

  // ============================================================================
  // HIGH #1: autoRelease() doesn't check disposed flag
  // ============================================================================
  describe('HIGH #1: autoRelease() disposed check', () => {
    it('should not emit events after dispose when timer fires', async () => {
      const lm = new LockManager();

      // Acquire with short TTL
      await lm.acquire('resource-1', {
        ttl: 50,
        acquireTimeout: 0,
      });

      // Access internal lockEvents for verification
      const events = (lm as any).lockEvents;

      // Wait almost to expiration, then dispose
      await new Promise(resolve => setTimeout(resolve, 40));
      await lm.dispose();

      // NOW install the mock - AFTER dispose completes
      // This tracks only emits that happen AFTER dispose finished
      let emitCalledAfterDisposeComplete = false;
      const originalEmit = events.emit.bind(events);
      events.emit = (...args: any[]) => {
        emitCalledAfterDisposeComplete = true;
        return originalEmit(...args);
      };

      // Wait for timer to fire (if it wasn't cleared properly by dispose)
      await new Promise(resolve => setTimeout(resolve, 50));

      // autoRelease should have checked disposed and NOT emitted
      expect(emitCalledAfterDisposeComplete).toBe(false);
    });

    it('should handle timer firing during dispose gracefully', async () => {
      const lm = new LockManager();

      // Acquire with TTL that expires during dispose
      await lm.acquire('resource-1', {
        ttl: 10,
        acquireTimeout: 0,
      });

      // Start dispose (which takes ~100ms to wait for in-flight ops)
      const disposePromise = lm.dispose();

      // Timer fires during dispose
      await new Promise(resolve => setTimeout(resolve, 20));

      // Dispose should complete without errors
      await expect(disposePromise).resolves.toBeUndefined();
    });
  });

  // ============================================================================
  // HIGH #3: release() not protected by mutex
  // ============================================================================
  describe('HIGH #3: release() mutex protection', () => {
    it('should serialize release with concurrent reentrant acquire', async () => {
      // This test checks that refCount is not corrupted when
      // release() and acquire() race on same lock

      const iterations = 50;
      let corruptions = 0;

      for (let i = 0; i < iterations; i++) {
        const lm = new LockManager({ defaultAcquireTimeout: 1000 });

        // Initial acquire
        const { lockId } = await lm.acquire('resource', {
          reentrant: true,
          holderId: 'holder',
          acquireTimeout: 0,
        });

        // Race: release and reentrant acquire
        const [, acquireResult] = await Promise.all([
          lm.release(lockId!),
          lm.acquire('resource', {
            reentrant: true,
            holderId: 'holder',
            acquireTimeout: 100,
          }),
        ]);

        // Check state consistency
        const holder = await lm.getLockHolder('resource');

        if (acquireResult.acquired) {
          // If acquire succeeded, lock should exist with valid refCount
          if (!holder || holder.refCount < 1) {
            corruptions++;
          }
        } else {
          // If acquire failed, lock should be released
          if (holder) {
            corruptions++;
          }
        }

        await lm.dispose();
      }

      // No corruptions should occur with proper mutex protection
      expect(corruptions).toBe(0);
    });

    it('should not corrupt refCount with concurrent release and acquire', async () => {
      const lm = new LockManager({ defaultAcquireTimeout: 1000 });

      // Acquire twice (refCount = 2)
      const { lockId } = await lm.acquire('resource', {
        reentrant: true,
        holderId: 'holder',
        acquireTimeout: 0,
      });
      await lm.acquire('resource', {
        reentrant: true,
        holderId: 'holder',
        acquireTimeout: 0,
      });

      // Verify refCount is 2
      let holder = await lm.getLockHolder('resource');
      expect(holder?.refCount).toBe(2);

      // Race: two releases and one acquire
      await Promise.all([
        lm.release(lockId!),
        lm.release(lockId!),
        lm.acquire('resource', {
          reentrant: true,
          holderId: 'holder',
          acquireTimeout: 100,
        }),
      ]);

      // Final state should be consistent
      holder = await lm.getLockHolder('resource');

      // refCount should be valid (>= 0 if lock exists, undefined if released)
      if (holder) {
        expect(holder.refCount).toBeGreaterThanOrEqual(1);
      }

      await lm.dispose();
    });
  });

  // ============================================================================
  // HIGH #5: createNewLock() doesn't check disposed flag
  // ============================================================================
  describe('HIGH #5: createNewLock() disposed check', () => {
    it('should not create lock if disposed between waitForRelease and createNewLock', async () => {
      const lm = new LockManager({ defaultAcquireTimeout: 5000 });

      // Block the resource
      const { lockId: _lockId } = await lm.acquire('resource-1', {
        holderId: 'blocker',
        acquireTimeout: 0,
      });

      // Start a waiting acquire
      const acquirePromise = lm.acquire('resource-1', {
        holderId: 'waiter',
        acquireTimeout: 5000,
      });

      // Small delay to ensure waiter is waiting
      await new Promise(resolve => setTimeout(resolve, 10));

      // Release AND dispose in sequence
      // Dispose will set flag, release will emit event, waiter will wake and see disposed
      await lm.dispose(); // This also releases all locks

      const result = await acquirePromise;

      // Waiter should fail with disposed reason
      // The key invariant: we should NOT have created a lock on a disposed manager
      expect(result.acquired).toBe(false);
      expect(result.reason).toContain('disposed');

      // Verify no lock was created
      expect(await lm.getLockHolder('resource-1')).toBeUndefined();
    });

    it('should check disposed after each await in doAcquire', async () => {
      const lm = new LockManager({ defaultAcquireTimeout: 5000 });

      // Create contention scenario
      const { lockId: _lock1 } = await lm.acquire('resource', {
        holderId: 'holder-1',
        acquireTimeout: 0,
        ttl: 100,
      });

      // Multiple waiters
      const waiters = [
        lm.acquire('resource', { holderId: 'waiter-1', acquireTimeout: 5000 }),
        lm.acquire('resource', { holderId: 'waiter-2', acquireTimeout: 5000 }),
        lm.acquire('resource', { holderId: 'waiter-3', acquireTimeout: 5000 }),
      ];

      // Wait for them to start waiting
      await new Promise(resolve => setTimeout(resolve, 20));

      // Dispose while they're waiting
      await lm.dispose();

      // All waiters should fail with disposed reason
      const results = await Promise.all(waiters);

      for (const result of results) {
        expect(result.acquired).toBe(false);
        expect(result.reason).toContain('disposed');
      }
    });
  });

  // ============================================================================
  // Integration: All mutex-protected operations should serialize correctly
  // ============================================================================
  describe('Integration: Full operation serialization', () => {
    it('should handle chaotic concurrent operations without corruption', async () => {
      const lm = new LockManager({ defaultAcquireTimeout: 500 });
      const errors: string[] = [];

      // Run many concurrent operations of all types
      const operations: Promise<void>[] = [];

      for (let i = 0; i < 20; i++) {
        // Acquire operations
        operations.push(
          lm.acquire('shared-resource', {
            holderId: `holder-${i % 3}`,
            reentrant: true,
            acquireTimeout: 100,
            ttl: 50,
          }).then(async (result) => {
            if (result.acquired && result.lockId) {
              // Random delay then release
              await new Promise(r => setTimeout(r, Math.random() * 30));
              try {
                await lm.release(result.lockId);
              } catch (e: any) {
                if (!e.message.includes('disposed') && !e.message.includes('not found')) {
                  errors.push(`Release error: ${e.message}`);
                }
              }
            }
          }).catch(e => {
            if (!e.message.includes('disposed')) {
              errors.push(`Acquire error: ${e.message}`);
            }
          })
        );

        // Extend operations (on potentially non-existent locks)
        operations.push(
          lm.acquire('shared-resource', {
            holderId: `extender-${i}`,
            acquireTimeout: 50,
            ttl: 100,
          }).then(async (result) => {
            if (result.acquired && result.lockId) {
              await lm.extend(result.lockId, 200);
              await new Promise(r => setTimeout(r, 20));
              try {
                await lm.release(result.lockId);
              } catch {
                // Ignore - may have auto-released
              }
            }
          }).catch(() => {
            // Ignore acquire failures
          })
        );
      }

      // Wait for all operations
      await Promise.all(operations);

      // Verify no errors (other than expected ones)
      expect(errors).toHaveLength(0);

      // Verify consistent state
      const holder = await lm.getLockHolder('shared-resource');
      if (holder) {
        expect(holder.refCount).toBeGreaterThanOrEqual(1);
        // Timer/expiresAt invariant
        if (holder.timer) {
          expect(holder.expiresAt).toBeDefined();
        }
        if (holder.expiresAt) {
          expect(holder.timer).toBeDefined();
        }
      }

      await lm.dispose();
    });
  });
});
