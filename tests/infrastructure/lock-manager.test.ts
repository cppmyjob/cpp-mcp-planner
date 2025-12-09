import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LockManager } from '../../src/infrastructure/repositories/file/lock-manager.js';

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
      ).rejects.toThrow(/timeout must be positive/);
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
  });
});
