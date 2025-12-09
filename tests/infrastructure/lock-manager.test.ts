import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LockManager } from '../../src/infrastructure/repositories/file/lock-manager.js';
import type { LockResult } from '../../src/infrastructure/repositories/file/types.js';

describe('LockManager', () => {
  let lockManager: LockManager;

  beforeEach(() => {
    lockManager = new LockManager();
  });

  afterEach(async () => {
    await lockManager.releaseAll();
  });

  describe('RED: Basic Lock Operations', () => {
    it('should create LockManager instance', () => {
      expect(lockManager).toBeDefined();
    });

    it('should acquire lock on resource', async () => {
      const result = await lockManager.acquire('resource-1');

      expect(result.acquired).toBe(true);
      expect(result.lockId).toBeDefined();
    });

    it('should fail to acquire lock if already locked', async () => {
      await lockManager.acquire('resource-1');
      const result = await lockManager.acquire('resource-1', { timeout: 100 });

      expect(result.acquired).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should release lock', async () => {
      const { lockId } = await lockManager.acquire('resource-1');
      expect(lockId).toBeDefined();

      await lockManager.release(lockId!);

      // Should be able to acquire again
      const result = await lockManager.acquire('resource-1');
      expect(result.acquired).toBe(true);
    });

    it('should check if resource is locked', async () => {
      expect(await lockManager.isLocked('resource-1')).toBe(false);

      await lockManager.acquire('resource-1');
      expect(await lockManager.isLocked('resource-1')).toBe(true);
    });

    it('should get lock holder info', async () => {
      const { lockId } = await lockManager.acquire('resource-1');
      const holder = await lockManager.getLockHolder('resource-1');

      expect(holder).toBeDefined();
      expect(holder?.lockId).toBe(lockId);
      expect(holder?.resource).toBe('resource-1');
      expect(holder?.refCount).toBe(1);
    });
  });

  describe('RED: Reentrant Locks', () => {
    it('should allow reentrant lock acquisition', async () => {
      const holder1 = 'holder-1';

      const result1 = await lockManager.acquire('resource-1', { reentrant: true, holderId: holder1 });
      expect(result1.acquired).toBe(true);

      const result2 = await lockManager.acquire('resource-1', { reentrant: true, holderId: holder1 });
      expect(result2.acquired).toBe(true);
      expect(result2.lockId).toBe(result1.lockId); // Same lock ID
    });

    it('should track refCount for reentrant locks', async () => {
      const holderId = 'holder-1';

      await lockManager.acquire('resource-1', { reentrant: true, holderId });
      await lockManager.acquire('resource-1', { reentrant: true, holderId });
      await lockManager.acquire('resource-1', { reentrant: true, holderId });

      const holder = await lockManager.getLockHolder('resource-1');
      expect(holder?.refCount).toBe(3);
    });

    it('should require all releases for reentrant lock', async () => {
      const holderId = 'holder-1';

      const { lockId } = await lockManager.acquire('resource-1', { reentrant: true, holderId });
      await lockManager.acquire('resource-1', { reentrant: true, holderId });

      // First release - should still be locked
      await lockManager.release(lockId!);
      expect(await lockManager.isLocked('resource-1')).toBe(true);

      // Second release - should be unlocked
      await lockManager.release(lockId!);
      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });

    it('should not allow different holder to acquire reentrant lock', async () => {
      await lockManager.acquire('resource-1', { reentrant: true, holderId: 'holder-1' });
      const result = await lockManager.acquire('resource-1', { reentrant: true, holderId: 'holder-2', timeout: 100 });

      expect(result.acquired).toBe(false);
    });

    it('should NOT auto-release reentrant locks with refCount > 1', async () => {
      const holderId = 'holder-1';

      // Acquire reentrant lock 3 times with 150ms timeout
      const { lockId } = await lockManager.acquire('resource-1', { reentrant: true, holderId, timeout: 150 });
      await lockManager.acquire('resource-1', { reentrant: true, holderId, timeout: 150 });
      await lockManager.acquire('resource-1', { reentrant: true, holderId, timeout: 150 });

      // Verify refCount is 3
      const holderBefore = await lockManager.getLockHolder('resource-1');
      expect(holderBefore?.refCount).toBe(3);

      // Wait for auto-release timeout
      await new Promise(resolve => setTimeout(resolve, 200));

      // CORRECTED BEHAVIOR: Lock should NOT be auto-released because refCount=3
      // Reentrant locks require manual release for each acquire
      expect(await lockManager.isLocked('resource-1')).toBe(true);

      const holderAfter = await lockManager.getLockHolder('resource-1');
      expect(holderAfter).toBeDefined();
      expect(holderAfter?.refCount).toBe(3);

      // Manually release all 3 times
      await lockManager.release(lockId!);
      expect((await lockManager.getLockHolder('resource-1'))?.refCount).toBe(2);

      await lockManager.release(lockId!);
      expect((await lockManager.getLockHolder('resource-1'))?.refCount).toBe(1);

      await lockManager.release(lockId!);
      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });

    it('should NOT auto-release after partial release if refCount > 1', async () => {
      const holderId = 'holder-1';

      // Acquire reentrant lock 3 times with short timeout (100ms)
      const { lockId } = await lockManager.acquire('resource-1', { reentrant: true, holderId, timeout: 100 });
      await lockManager.acquire('resource-1', { reentrant: true, holderId, timeout: 100 });
      await lockManager.acquire('resource-1', { reentrant: true, holderId, timeout: 100 });

      expect((await lockManager.getLockHolder('resource-1'))?.refCount).toBe(3);

      // Partially release (refCount should become 2)
      await lockManager.release(lockId!);
      expect((await lockManager.getLockHolder('resource-1'))?.refCount).toBe(2);
      expect(await lockManager.isLocked('resource-1')).toBe(true);

      // Wait for auto-release timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // CORRECTED BEHAVIOR: Lock should NOT be auto-released because refCount=2
      // autoRelease should respect outstanding references
      expect(await lockManager.isLocked('resource-1')).toBe(true);

      const holder = await lockManager.getLockHolder('resource-1');
      expect(holder).toBeDefined();
      expect(holder?.refCount).toBe(2);

      // Finish releasing remaining references
      await lockManager.release(lockId!);
      expect((await lockManager.getLockHolder('resource-1'))?.refCount).toBe(1);

      await lockManager.release(lockId!);
      expect(await lockManager.isLocked('resource-1')).toBe(false);

      // Verify we can acquire fresh lock without issues
      const newResult = await lockManager.acquire('resource-1');
      expect(newResult.acquired).toBe(true);
    });

    it('should not auto-release reentrant lock with outstanding refCount', async () => {
      const holderId = 'holder-1';

      // SCENARIO: Reentrant acquire doesn't extend timeout
      // 1. First acquire with 100ms timeout - starts timer
      // 2. Wait 60ms
      // 3. Second reentrant acquire - refCount=2, but timer still at original 100ms
      // 4. After 40ms more (100ms total), autoRelease fires
      // 5. BUG: autoRelease deletes lock despite refCount=2

      const { lockId } = await lockManager.acquire('resource-1', {
        reentrant: true,
        holderId,
        timeout: 100,
      });
      expect((await lockManager.getLockHolder('resource-1'))?.refCount).toBe(1);

      // Wait 60ms (40ms before timeout)
      await new Promise(resolve => setTimeout(resolve, 60));

      // Second acquire should succeed and increment refCount
      const result2 = await lockManager.acquire('resource-1', {
        reentrant: true,
        holderId,
        timeout: 100,
      });
      expect(result2.acquired).toBe(true);
      expect(result2.lockId).toBe(lockId);
      expect((await lockManager.getLockHolder('resource-1'))?.refCount).toBe(2);

      // Wait 50ms more (total 110ms from first acquire, 50ms from second)
      await new Promise(resolve => setTimeout(resolve, 50));

      // BUG: Lock has been auto-released despite refCount=2
      // The first acquire's timer fired at 100ms and deleted everything
      // EXPECTED: Lock should still be held because:
      //   - Either: timeout should be extended on reentrant acquire
      //   - Or: autoRelease should respect refCount > 0

      // CORRECT BEHAVIOR: Lock should still be held
      const isStillLocked = await lockManager.isLocked('resource-1');
      expect(isStillLocked).toBe(true);

      const holder = await lockManager.getLockHolder('resource-1');
      expect(holder).toBeDefined();
      expect(holder?.refCount).toBe(2);
    });
  });

  describe('RED: Lock Timeout', () => {
    it('should timeout if lock not acquired', async () => {
      await lockManager.acquire('resource-1');

      const start = Date.now();
      const result = await lockManager.acquire('resource-1', { timeout: 200 });
      const duration = Date.now() - start;

      expect(result.acquired).toBe(false);
      expect(result.reason).toContain('timeout');
      expect(duration).toBeGreaterThanOrEqual(200);
    });

    it('should acquire lock if released before timeout', async () => {
      const { lockId } = await lockManager.acquire('resource-1');

      // Release after 100ms
      setTimeout(async () => {
        await lockManager.release(lockId!);
      }, 100);

      // Try to acquire with 500ms timeout
      const result = await lockManager.acquire('resource-1', { timeout: 500 });
      expect(result.acquired).toBe(true);
    });

    it('should auto-release lock after expiration', async () => {
      await lockManager.acquire('resource-1', { timeout: 100 });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be able to acquire
      const result = await lockManager.acquire('resource-1');
      expect(result.acquired).toBe(true);
    });
  });

  describe('RED: Multiple Resources', () => {
    it('should handle locks on different resources', async () => {
      const result1 = await lockManager.acquire('resource-1');
      const result2 = await lockManager.acquire('resource-2');
      const result3 = await lockManager.acquire('resource-3');

      expect(result1.acquired).toBe(true);
      expect(result2.acquired).toBe(true);
      expect(result3.acquired).toBe(true);
    });

    it('should release only specified lock', async () => {
      const { lockId: lock1 } = await lockManager.acquire('resource-1');
      const { lockId: lock2 } = await lockManager.acquire('resource-2');

      await lockManager.release(lock1!);

      expect(await lockManager.isLocked('resource-1')).toBe(false);
      expect(await lockManager.isLocked('resource-2')).toBe(true);
    });

    it('should release all locks', async () => {
      await lockManager.acquire('resource-1');
      await lockManager.acquire('resource-2');
      await lockManager.acquire('resource-3');

      await lockManager.releaseAll();

      expect(await lockManager.isLocked('resource-1')).toBe(false);
      expect(await lockManager.isLocked('resource-2')).toBe(false);
      expect(await lockManager.isLocked('resource-3')).toBe(false);
    });
  });

  describe('RED: Lock Statistics', () => {
    it('should get active locks count', async () => {
      expect(await lockManager.getActiveLocksCount()).toBe(0);

      await lockManager.acquire('resource-1');
      await lockManager.acquire('resource-2');

      expect(await lockManager.getActiveLocksCount()).toBe(2);
    });

    it('should list all active locks', async () => {
      await lockManager.acquire('resource-1');
      await lockManager.acquire('resource-2');

      const locks = await lockManager.getActiveLocks();

      expect(locks).toHaveLength(2);
      expect(locks.map(l => l.resource)).toContain('resource-1');
      expect(locks.map(l => l.resource)).toContain('resource-2');
    });
  });

  describe('RED: Error Handling', () => {
    it('should throw error when releasing non-existent lock', async () => {
      await expect(lockManager.release('non-existent-lock')).rejects.toThrow();
    });

    it('should handle double release gracefully', async () => {
      const { lockId } = await lockManager.acquire('resource-1');

      await lockManager.release(lockId!);
      await expect(lockManager.release(lockId!)).rejects.toThrow();
    });

    it('should validate lock options', async () => {
      await expect(
        lockManager.acquire('resource-1', { timeout: -100 })
      ).rejects.toThrow(/timeout must be non-negative/);
    });

    it('should handle resource name validation', async () => {
      await expect(lockManager.acquire('')).rejects.toThrow(/resource name cannot be empty/);
    });
  });

  describe('RED: Deadlock Prevention', () => {
    it('should detect potential deadlock', async () => {
      // This test will be implemented when deadlock detection is added
      expect(true).toBe(true);
    });
  });

  describe('RED: Lock with Callback', () => {
    it('should execute callback with lock held', async () => {
      let executed = false;

      await lockManager.withLock('resource-1', async () => {
        executed = true;
        expect(await lockManager.isLocked('resource-1')).toBe(true);
      });

      expect(executed).toBe(true);
      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });

    it('should release lock even if callback throws', async () => {
      await expect(
        lockManager.withLock('resource-1', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });

    it('should return callback result', async () => {
      const result = await lockManager.withLock('resource-1', async () => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it('should support reentrant withLock calls', async () => {
      const holderId = 'holder-1';

      const result = await lockManager.withLock(
        'resource-1',
        async () => {
          // Nested withLock - should NOT deadlock with reentrant
          const inner = await lockManager.withLock(
            'resource-1',
            async () => {
              return 42;
            },
            { reentrant: true, holderId, timeout: 100 }
          );
          return inner;
        },
        { reentrant: true, holderId, timeout: 100 }
      );

      expect(result).toBe(42);
      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });
  });

  describe('RED: Race Condition Prevention (Issues #1, #2)', () => {
    it('should prevent race condition when multiple acquire attempts on same resource', async () => {
      // First, acquire a lock that won't expire (timeout: 0 = no expiration)
      const firstResult = await lockManager.acquire('resource-1', {
        holderId: 'holder-first',
        timeout: 0, // No expiration
      });
      expect(firstResult.acquired).toBe(true);

      // Now start 10 concurrent acquire attempts - all should timeout
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          lockManager.acquire('resource-1', {
            holderId: `holder-${i}`,
            timeout: 50, // Short timeout to fail quickly
          })
        )
      );

      // None should succeed (lock is held and won't release)
      const succeeded = results.filter(r => r.acquired);
      expect(succeeded).toHaveLength(0);

      // All should have failed with timeout
      const failed = results.filter(r => !r.acquired);
      expect(failed).toHaveLength(10);

      // Cleanup
      await lockManager.release(firstResult.lockId!);
    });

    it('should serialize concurrent acquires - only one succeeds after release', async () => {
      // First holder acquires lock
      const firstResult = await lockManager.acquire('resource-1', {
        holderId: 'holder-first',
        timeout: 0, // No auto-expiration
      });
      expect(firstResult.acquired).toBe(true);

      // Start concurrent acquire attempts that will wait for release
      const acquirePromises = Array.from({ length: 5 }, (_, i) =>
        lockManager.acquire('resource-1', {
          holderId: `holder-${i}`,
          timeout: 500, // Long enough to wait for release
        })
      );

      // Give time for all acquires to start waiting
      await new Promise(resolve => setTimeout(resolve, 20));

      // Release the first lock - ONE of the waiters should acquire
      await lockManager.release(firstResult.lockId!);

      // Wait for all acquire attempts to complete
      const results = await Promise.all(acquirePromises);

      // Exactly ONE should succeed (the first one to get the mutex after release)
      const succeeded = results.filter(r => r.acquired);
      expect(succeeded).toHaveLength(1);

      // Clean up
      if (succeeded[0]?.lockId) {
        await lockManager.release(succeeded[0].lockId);
      }
    });

    it('should handle concurrent reentrant acquire correctly', async () => {
      const holderId = 'holder-1';

      // 10 concurrent reentrant acquires
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          lockManager.acquire('resource-1', {
            reentrant: true,
            holderId,
          })
        )
      );

      // All should succeed with same lockId
      expect(results.every(r => r.acquired)).toBe(true);
      const lockIds = results.map(r => r.lockId);
      expect(new Set(lockIds).size).toBe(1); // All same lockId

      // refCount should be 10
      const holder = await lockManager.getLockHolder('resource-1');
      expect(holder?.refCount).toBe(10);
    });

    it('should not allow two different holders to acquire same lock simultaneously', async () => {
      // First holder gets the lock with long timeout
      const result1 = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 10000 // Long timeout to prevent auto-release during test
      });
      expect(result1.acquired).toBe(true);

      // Other holders try to acquire with short timeout (should fail)
      const [result2, result3] = await Promise.all([
        lockManager.acquire('resource-1', { holderId: 'holder-2', timeout: 100 }),
        lockManager.acquire('resource-1', { holderId: 'holder-3', timeout: 100 }),
      ]);

      // Both should fail
      expect(result2.acquired).toBe(false);
      expect(result3.acquired).toBe(false);

      // Verify that lock is still held by holder-1
      const holder = await lockManager.getLockHolder('resource-1');
      expect(holder).toBeDefined();
      expect(holder?.holderId).toBe('holder-1');

      // Clean up
      await lockManager.release(result1.lockId!);
    });
  });

  describe('RED: Memory Leak Prevention (Issue #3)', () => {
    it('should clear auto-release timer on manual release', async () => {
      const { lockId } = await lockManager.acquire('resource-1', { timeout: 5000 });

      // Get lock holder - should have timer
      const holder = await lockManager.getLockHolder('resource-1');
      expect(holder?.timer).toBeDefined();

      // Release manually
      await lockManager.release(lockId!);

      // Timer should be cleared (lock should be fully released)
      expect(await lockManager.isLocked('resource-1')).toBe(false);

      // Wait past the original timeout
      await new Promise(r => setTimeout(r, 100));

      // Should still be able to acquire without issues
      const result = await lockManager.acquire('resource-1');
      expect(result.acquired).toBe(true);
    });

    it('should clear timer when releasing reentrant lock fully', async () => {
      const holderId = 'holder-1';
      const { lockId } = await lockManager.acquire('resource-1', {
        reentrant: true,
        holderId,
        timeout: 5000,
      });

      // Acquire 2 more times
      await lockManager.acquire('resource-1', { reentrant: true, holderId });
      await lockManager.acquire('resource-1', { reentrant: true, holderId });

      // Release all 3 times
      await lockManager.release(lockId!);
      await lockManager.release(lockId!);
      await lockManager.release(lockId!);

      // Should be fully released
      expect(await lockManager.isLocked('resource-1')).toBe(false);

      // Should be able to acquire fresh lock
      const result = await lockManager.acquire('resource-1');
      expect(result.acquired).toBe(true);
    });

    it('should handle releaseAll clearing all timers', async () => {
      // Create multiple locks with timeouts
      await lockManager.acquire('resource-1', { timeout: 10000 });
      await lockManager.acquire('resource-2', { timeout: 10000 });
      await lockManager.acquire('resource-3', { timeout: 10000 });

      // Release all
      await lockManager.releaseAll();

      // All should be released
      expect(await lockManager.getActiveLocksCount()).toBe(0);

      // Should be able to acquire all again
      const r1 = await lockManager.acquire('resource-1');
      const r2 = await lockManager.acquire('resource-2');
      const r3 = await lockManager.acquire('resource-3');

      expect(r1.acquired && r2.acquired && r3.acquired).toBe(true);
    });
  });

  describe('RED: Reentrant Timer Extension (Issue #5)', () => {
    it('should extend expiration on reentrant acquire', async () => {
      const holderId = 'holder-1';

      // First acquire with 200ms timeout
      const { lockId } = await lockManager.acquire('resource-1', {
        reentrant: true,
        holderId,
        timeout: 200,
      });

      // Wait 150ms (close to expiration)
      await new Promise(r => setTimeout(r, 150));

      // Second reentrant acquire - should extend timeout
      await lockManager.acquire('resource-1', {
        reentrant: true,
        holderId,
        timeout: 200,
      });

      // Wait 100ms more (total 250ms from first acquire, 100ms from second)
      await new Promise(r => setTimeout(r, 100));

      // Lock should still be held because second acquire extended timeout
      expect(await lockManager.isLocked('resource-1')).toBe(true);

      const holder = await lockManager.getLockHolder('resource-1');
      expect(holder?.refCount).toBe(2);

      // Clean up
      await lockManager.release(lockId!);
      await lockManager.release(lockId!);
    });
  });

  describe('RED: Concurrent Release Safety (Issue #6)', () => {
    it('should prevent negative refCount', async () => {
      const holderId = 'holder-1';
      const { lockId } = await lockManager.acquire('resource-1', {
        reentrant: true,
        holderId,
      });

      // Acquire 2 more times
      await lockManager.acquire('resource-1', { reentrant: true, holderId });
      await lockManager.acquire('resource-1', { reentrant: true, holderId });

      expect((await lockManager.getLockHolder('resource-1'))?.refCount).toBe(3);

      // Release 3 times (OK)
      await lockManager.release(lockId!);
      await lockManager.release(lockId!);
      await lockManager.release(lockId!);

      expect(await lockManager.isLocked('resource-1')).toBe(false);

      // Try to release again (should throw, not cause negative refCount)
      await expect(lockManager.release(lockId!)).rejects.toThrow();
    });

    it('should handle concurrent releases safely', async () => {
      const holderId = 'holder-1';
      const { lockId } = await lockManager.acquire('resource-1', {
        reentrant: true,
        holderId,
      });

      // Acquire 9 more times
      for (let i = 0; i < 9; i++) {
        await lockManager.acquire('resource-1', { reentrant: true, holderId });
      }

      expect((await lockManager.getLockHolder('resource-1'))?.refCount).toBe(10);

      // Concurrent releases
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => lockManager.release(lockId!))
      );

      // All should succeed (refCount goes from 10 to 0)
      const succeeded = results.filter(r => r.status === 'fulfilled');
      expect(succeeded).toHaveLength(10);

      // Lock should be fully released
      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });
  });

  // ============================================================================
  // NEW TESTS FOR CODE REVIEW ISSUES
  // ============================================================================

  describe('CRITICAL #1: acquireMutex race condition', () => {
    it('should fail instantly with timeout=0 without waiting for mutex', async () => {
      // First holder acquires lock
      const first = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 0,
      });
      expect(first.acquired).toBe(true);

      // Second holder with timeout=0 should fail INSTANTLY
      const start = Date.now();
      const second = await lockManager.acquire('resource-1', {
        holderId: 'holder-2',
        timeout: 0,
      });
      const duration = Date.now() - start;

      expect(second.acquired).toBe(false);
      expect(second.reason).toContain('timeout');

      // Should be instant (< 10ms tolerance for JS event loop)
      expect(duration).toBeLessThan(10);

      await lockManager.release(first.lockId!);
    });

    it('should serialize rapid concurrent acquires correctly', async () => {
      // Stress test: many rapid concurrent acquires should serialize properly
      const results: LockResult[] = [];
      const promises: Promise<void>[] = [];

      // Start 20 concurrent acquire attempts with NO timeout (instant fail if locked)
      for (let i = 0; i < 20; i++) {
        promises.push(
          lockManager.acquire('resource-1', {
            holderId: `holder-${i}`,
            timeout: 0, // No waiting - instant fail if locked
          }).then(r => { results.push(r); })
        );
      }

      await Promise.all(promises);

      // Exactly ONE should succeed (first to acquire mutex)
      const succeeded = results.filter(r => r.acquired);
      expect(succeeded).toHaveLength(1);

      // All others should fail (lock already held)
      const failed = results.filter(r => !r.acquired);
      expect(failed).toHaveLength(19);
    });

    it('should handle mutex correctly when holder releases and new acquires come', async () => {
      // First acquire
      const first = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 0,
      });
      expect(first.acquired).toBe(true);

      // Start waiting acquires
      const waitingPromises = Array.from({ length: 5 }, (_, i) =>
        lockManager.acquire('resource-1', {
          holderId: `waiter-${i}`,
          timeout: 1000,
        })
      );

      // Small delay to let waiters start
      await new Promise(r => setTimeout(r, 10));

      // Release first lock
      await lockManager.release(first.lockId!);

      // Wait for all
      const results = await Promise.all(waitingPromises);

      // Exactly ONE waiter should succeed
      const succeeded = results.filter(r => r.acquired);
      expect(succeeded).toHaveLength(1);

      // Clean up
      if (succeeded[0]?.lockId) {
        await lockManager.release(succeeded[0].lockId);
      }
    });
  });

  describe('CRITICAL #2: EventEmitter memory leak in waitForRelease', () => {
    it('should not leak listeners on timeout', async () => {
      // Acquire lock that won't release
      const first = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 0,
      });
      expect(first.acquired).toBe(true);

      // Get initial listener count
      const initialListeners = (lockManager as any).lockEvents.listenerCount('release:resource-1');

      // Start many acquire attempts that will timeout
      const promises = Array.from({ length: 10 }, () =>
        lockManager.acquire('resource-1', {
          holderId: 'other-holder',
          timeout: 50,
        })
      );

      await Promise.all(promises);

      // All listeners should be cleaned up
      const finalListeners = (lockManager as any).lockEvents.listenerCount('release:resource-1');
      expect(finalListeners).toBe(initialListeners);

      // Clean up
      await lockManager.release(first.lockId!);
    });

    it('should not leak listeners on successful acquire after release', async () => {
      const first = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 0,
      });

      // Start waiters
      const waitingPromise = lockManager.acquire('resource-1', {
        holderId: 'waiter',
        timeout: 1000,
      });

      await new Promise(r => setTimeout(r, 10));

      // Release - waiter should acquire
      await lockManager.release(first.lockId!);

      const result = await waitingPromise;
      expect(result.acquired).toBe(true);

      // No dangling listeners
      const listeners = (lockManager as any).lockEvents.listenerCount('release:resource-1');
      expect(listeners).toBe(0);

      // Clean up
      await lockManager.release(result.lockId!);
    });
  });

  describe('CRITICAL #3: Deadlock - releaseMutex for non-acquired mutex', () => {
    it('should handle timeout during mutex acquisition gracefully', async () => {
      // Acquire lock with no expiration
      const first = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 0,
      });

      // Try to acquire with very short timeout - should timeout during mutex wait
      const result = await lockManager.acquire('resource-1', {
        holderId: 'holder-2',
        timeout: 10, // Very short
      });

      expect(result.acquired).toBe(false);
      expect(result.reason).toContain('timeout');

      // First lock should still be valid
      expect(await lockManager.isLocked('resource-1')).toBe(true);
      const holder = await lockManager.getLockHolder('resource-1');
      expect(holder?.holderId).toBe('holder-1');

      // Should be able to acquire after release
      await lockManager.release(first.lockId!);
      const third = await lockManager.acquire('resource-1', {
        holderId: 'holder-3',
        timeout: 100,
      });
      expect(third.acquired).toBe(true);

      await lockManager.release(third.lockId!);
    });
  });

  describe('HIGH #5: Timer leak - wrong order of clear/set', () => {
    it('should properly replace timer on reentrant acquire', async () => {
      const holderId = 'holder-1';

      // First acquire with timeout
      const { lockId } = await lockManager.acquire('resource-1', {
        holderId,
        reentrant: true,
        timeout: 100,
      });

      // Get first timer
      const holder1 = await lockManager.getLockHolder('resource-1');
      const timer1 = holder1?.timer;
      expect(timer1).toBeDefined();

      // Reentrant acquire - should replace timer
      await lockManager.acquire('resource-1', {
        holderId,
        reentrant: true,
        timeout: 200,
      });

      const holder2 = await lockManager.getLockHolder('resource-1');
      const timer2 = holder2?.timer;
      expect(timer2).toBeDefined();

      // Timer should be different (old was cleared, new created)
      expect(timer2).not.toBe(timer1);

      // Clean up
      await lockManager.release(lockId!);
      await lockManager.release(lockId!);
    });
  });

  describe('HIGH #6: Race condition in autoRelease', () => {
    it('should handle manual release racing with auto-release', async () => {
      // Acquire with very short timeout
      const { lockId } = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 50,
      });

      // Wait until just before auto-release
      await new Promise(r => setTimeout(r, 40));

      // Manual release - might race with auto-release timer
      await lockManager.release(lockId!);

      // Wait for auto-release timer to fire (it should be a no-op)
      await new Promise(r => setTimeout(r, 50));

      // Should be able to acquire fresh
      const result = await lockManager.acquire('resource-1', {
        holderId: 'holder-2',
      });
      expect(result.acquired).toBe(true);

      await lockManager.release(result.lockId!);
    });
  });

  describe('HIGH #7: refCount validation in release', () => {
    it('should not allow refCount to go negative', async () => {
      const { lockId } = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        reentrant: true,
      });

      // Release once (refCount: 1 -> 0, lock deleted)
      await lockManager.release(lockId!);

      // Second release should throw (lock not found, not negative refCount)
      await expect(lockManager.release(lockId!)).rejects.toThrow('not found');
    });

    it('should maintain correct refCount under concurrent operations', async () => {
      const holderId = 'holder-1';

      // Multiple acquires
      const results = await Promise.all([
        lockManager.acquire('resource-1', { holderId, reentrant: true }),
        lockManager.acquire('resource-1', { holderId, reentrant: true }),
        lockManager.acquire('resource-1', { holderId, reentrant: true }),
      ]);

      const lockId = results[0].lockId!;

      // Check refCount is exactly 3
      const holder = await lockManager.getLockHolder('resource-1');
      expect(holder?.refCount).toBe(3);

      // Release exactly 3 times
      await lockManager.release(lockId);
      await lockManager.release(lockId);
      await lockManager.release(lockId);

      // Should be fully released
      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });
  });

  describe('HIGH #18: releaseAll should clear acquireMutexes', () => {
    it('should clear mutexes on releaseAll', async () => {
      // Acquire some locks
      await lockManager.acquire('resource-1', { timeout: 0 });
      await lockManager.acquire('resource-2', { timeout: 0 });

      // Start a waiter (creates mutex entry)
      const waiterPromise = lockManager.acquire('resource-1', {
        holderId: 'waiter',
        timeout: 500,
      });

      await new Promise(r => setTimeout(r, 10));

      // Release all
      await lockManager.releaseAll();

      // Waiter should complete (either succeed or fail, but not hang)
      const waiterResult = await waiterPromise;

      // If waiter succeeded (grabbed lock after release), clean it up
      if (waiterResult.acquired && waiterResult.lockId) {
        await lockManager.release(waiterResult.lockId);
      }

      // After releaseAll and cleanup, should be able to acquire without issues
      const fresh = await lockManager.acquire('resource-1', {
        holderId: 'new-holder',
        timeout: 100,
      });
      expect(fresh.acquired).toBe(true);

      await lockManager.releaseAll();
    });

    it('should not leave dangling mutexes after releaseAll', async () => {
      // Create multiple locks
      await lockManager.acquire('resource-1', { timeout: 0 });
      await lockManager.acquire('resource-2', { timeout: 0 });
      await lockManager.acquire('resource-3', { timeout: 0 });

      // Release all
      await lockManager.releaseAll();

      // acquireMutexes should be empty
      const mutexes = (lockManager as any).acquireMutexes;
      expect(mutexes.size).toBe(0);
    });
  });

  describe('MEDIUM #8: Retry loop after waitForRelease', () => {
    it('should retry acquiring after another holder grabs lock', async () => {
      // This tests that when lock is released and multiple waiters compete,
      // the losers should keep trying (or fail gracefully)

      const first = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 0,
      });

      // Start multiple waiters
      const waiterPromises = Array.from({ length: 3 }, (_, i) =>
        lockManager.acquire('resource-1', {
          holderId: `waiter-${i}`,
          timeout: 200,
        })
      );

      await new Promise(r => setTimeout(r, 10));

      // Release
      await lockManager.release(first.lockId!);

      const results = await Promise.all(waiterPromises);

      // At least one should succeed
      const succeeded = results.filter(r => r.acquired);
      expect(succeeded.length).toBeGreaterThanOrEqual(1);

      // Clean up
      for (const r of results) {
        if (r.acquired && r.lockId) {
          await lockManager.release(r.lockId);
        }
      }
    });
  });

  describe('MEDIUM #11: dispose() method', () => {
    it('should have dispose method that cleans up all resources', async () => {
      // Create locks with timers
      await lockManager.acquire('resource-1', { timeout: 10000 });
      await lockManager.acquire('resource-2', { timeout: 10000 });

      // Dispose should exist and clean up
      expect(typeof (lockManager as any).dispose).toBe('function');

      await (lockManager as any).dispose();

      // All locks should be released
      expect(await lockManager.getActiveLocksCount()).toBe(0);

      // After dispose, acquire should return false with disposed message
      const result = await lockManager.acquire('resource-1');
      expect(result.acquired).toBe(false);
      expect(result.reason).toContain('disposed');

      // isDisposed should return true
      expect((lockManager as any).isDisposed()).toBe(true);
    });
  });

  // ============================================================================
  // TESTS FOR LATEST FIXES (Fourth Code Review)
  // ============================================================================

  describe('FIX #1: dispose() ordering - releaseAll before removeAllListeners', () => {
    it('should wake up waiters before removing listeners', async () => {
      // Acquire lock
      const first = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 0,
      });
      expect(first.acquired).toBe(true);

      // Start a waiter that will wait for release
      let waiterResolved = false;
      const waiterPromise = lockManager.acquire('resource-1', {
        holderId: 'waiter',
        timeout: 5000, // Long timeout - should be woken up by dispose
      }).then(result => {
        waiterResolved = true;
        return result;
      });

      // Give waiter time to start waiting
      await new Promise(r => setTimeout(r, 20));
      expect(waiterResolved).toBe(false); // Still waiting

      // Dispose - should wake up waiter via releaseAll BEFORE removeAllListeners
      await lockManager.dispose();

      // Waiter should have been woken up
      const waiterResult = await waiterPromise;
      expect(waiterResolved).toBe(true);

      // Waiter should have failed (disposed) or succeeded (grabbed lock before dispose completed)
      // Either way, it should NOT hang forever
      expect(waiterResult.acquired === true || waiterResult.acquired === false).toBe(true);
    });

    it('should handle multiple waiters on dispose', async () => {
      // Acquire lock
      const first = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 0,
      });

      // Start multiple waiters
      const waiterPromises = Array.from({ length: 5 }, (_, i) =>
        lockManager.acquire('resource-1', {
          holderId: `waiter-${i}`,
          timeout: 5000,
        })
      );

      await new Promise(r => setTimeout(r, 20));

      // Dispose
      await lockManager.dispose();

      // All waiters should complete (not hang)
      const results = await Promise.all(waiterPromises);

      // At most one could have succeeded (grabbed lock during releaseAll)
      const succeeded = results.filter(r => r.acquired);
      expect(succeeded.length).toBeLessThanOrEqual(1);
    });

    it('should be idempotent - multiple dispose calls are safe', async () => {
      await lockManager.acquire('resource-1', { timeout: 1000 });

      // First dispose
      await lockManager.dispose();
      expect(lockManager.isDisposed()).toBe(true);

      // Second dispose - should be no-op
      await lockManager.dispose();
      expect(lockManager.isDisposed()).toBe(true);

      // Third dispose - should be no-op
      await lockManager.dispose();
      expect(lockManager.isDisposed()).toBe(true);
    });
  });

  describe('FIX #4: isLocked() - consistent map-based behavior', () => {
    it('should return true if lock exists in map regardless of expiration', async () => {
      // Acquire with short timeout
      const { lockId } = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 50,
      });
      expect(lockId).toBeDefined();

      // Immediately after acquire, isLocked should be true
      expect(await lockManager.isLocked('resource-1')).toBe(true);

      // Lock is in map = locked. Timer will auto-release it.
      // We're not testing expiration logic here - that's the timer's job.
    });

    it('should return false for non-existent resource', async () => {
      expect(await lockManager.isLocked('non-existent-resource')).toBe(false);
    });

    it('should return false after lock is released', async () => {
      const { lockId } = await lockManager.acquire('resource-1');
      expect(await lockManager.isLocked('resource-1')).toBe(true);

      await lockManager.release(lockId!);
      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });

    it('should return false after auto-release by timer', async () => {
      // Acquire with short timeout
      await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 50,
      });

      expect(await lockManager.isLocked('resource-1')).toBe(true);

      // Wait for auto-release
      await new Promise(r => setTimeout(r, 100));

      // Timer should have removed lock from map
      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });

    it('should return false when manager is disposed', async () => {
      await lockManager.acquire('resource-1', { timeout: 10000 });
      expect(await lockManager.isLocked('resource-1')).toBe(true);

      await lockManager.dispose();

      // Disposed manager should report all resources as unlocked
      expect(await lockManager.isLocked('resource-1')).toBe(false);
    });
  });

  describe('FIX #5: acquireMutex - disposed check after await', () => {
    it('should return false if disposed during mutex wait', async () => {
      // Acquire lock to make next acquire wait on mutex/release
      const first = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 0,
      });

      // Start second acquire that will wait
      const secondPromise = lockManager.acquire('resource-1', {
        holderId: 'holder-2',
        timeout: 5000,
      });

      // Give second acquire time to start waiting
      await new Promise(r => setTimeout(r, 20));

      // Dispose while second is waiting
      await lockManager.dispose();

      // Second should return false (not hang, not throw)
      const result = await secondPromise;
      expect(result.acquired).toBe(false);
      expect(result.reason).toContain('disposed');
    });

    it('should check disposed immediately after await returns', async () => {
      // This tests the fix: disposed check right after "await existingMutex.promise"
      const first = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 0,
      });

      // Start multiple waiters
      const waiterPromises = Array.from({ length: 3 }, (_, i) =>
        lockManager.acquire('resource-1', {
          holderId: `waiter-${i}`,
          timeout: 5000,
        })
      );

      await new Promise(r => setTimeout(r, 20));

      // Dispose - triggers releaseAll which resolves mutex promises
      await lockManager.dispose();

      // All waiters should complete with disposed message
      const results = await Promise.all(waiterPromises);

      // All should have failed (disposed)
      for (const result of results) {
        if (!result.acquired) {
          expect(result.reason).toContain('disposed');
        }
      }
    });
  });

  describe('FIX: Graceful shutdown - wait for in-flight operations', () => {
    it('should wait for in-flight acquire to complete before removing listeners', async () => {
      // Start a lock acquire
      const acquirePromise = lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 50, // Short timeout
      });

      // Immediately start dispose (acquire is in-flight)
      const disposePromise = lockManager.dispose();

      // Both should complete without errors
      const [acquireResult] = await Promise.all([acquirePromise, disposePromise]);

      // Acquire may have succeeded or failed (disposed), but should not hang
      expect(acquireResult.acquired === true || acquireResult.acquired === false).toBe(true);
    });

    it('should track in-flight operations correctly', async () => {
      // Access private counter for testing
      const getInFlightOps = () => (lockManager as any).inFlightOps;

      expect(getInFlightOps()).toBe(0);

      // Start acquire (increments counter)
      const acquirePromise = lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 100,
      });

      // Small delay to let acquire start
      await new Promise(r => setTimeout(r, 5));

      // Acquire completes
      await acquirePromise;

      // Counter should be back to 0
      expect(getInFlightOps()).toBe(0);
    });

    it('should decrement in-flight counter even on failure', async () => {
      const getInFlightOps = () => (lockManager as any).inFlightOps;

      // First acquire succeeds
      const first = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 0,
      });

      // Second acquire fails (timeout)
      const second = await lockManager.acquire('resource-1', {
        holderId: 'holder-2',
        timeout: 50,
      });
      expect(second.acquired).toBe(false);

      // Counter should still be 0 (properly decremented in finally block)
      expect(getInFlightOps()).toBe(0);

      await lockManager.release(first.lockId!);
    });

    it('should handle dispose during slow operation', async () => {
      // Acquire first lock
      const first = await lockManager.acquire('resource-1', {
        holderId: 'holder-1',
        timeout: 0,
      });

      // Start slow waiter
      const slowWaiterPromise = lockManager.acquire('resource-1', {
        holderId: 'slow-waiter',
        timeout: 200, // Will wait up to 200ms
      });

      // Wait a bit then dispose
      await new Promise(r => setTimeout(r, 30));
      await lockManager.dispose();

      // Slow waiter should complete (disposed wakes it up)
      const result = await slowWaiterPromise;
      expect(result.acquired === true || result.acquired === false).toBe(true);
    });
  });

  describe('Other dispose() related methods', () => {
    it('release() should throw when disposed', async () => {
      const { lockId } = await lockManager.acquire('resource-1');
      await lockManager.dispose();

      await expect(lockManager.release(lockId!)).rejects.toThrow('disposed');
    });

    it('getLockHolder() should return undefined when disposed', async () => {
      await lockManager.acquire('resource-1');
      await lockManager.dispose();

      const holder = await lockManager.getLockHolder('resource-1');
      expect(holder).toBeUndefined();
    });

    it('getActiveLocksCount() should return 0 when disposed', async () => {
      await lockManager.acquire('resource-1');
      await lockManager.acquire('resource-2');
      await lockManager.dispose();

      expect(await lockManager.getActiveLocksCount()).toBe(0);
    });

    it('getActiveLocks() should return empty array when disposed', async () => {
      await lockManager.acquire('resource-1');
      await lockManager.acquire('resource-2');
      await lockManager.dispose();

      const locks = await lockManager.getActiveLocks();
      expect(locks).toEqual([]);
    });
  });
});
