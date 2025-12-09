/**
 * FileLockManager Tests
 *
 * Tests for cross-process file-based locking:
 * - Basic lock/unlock operations
 * - Lock timeout handling
 * - Stale lock detection
 * - withLock helper
 * - Multi-process simulation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileLockManager } from '../../src/infrastructure/repositories/file/file-lock-manager.js';

describe('FileLockManager', () => {
  let testDir: string;
  let lockManager: FileLockManager;

  beforeEach(async () => {
    // Create unique temp directory for each test
    testDir = path.join(os.tmpdir(), `file-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });

    lockManager = new FileLockManager(testDir, {
      acquireTimeout: 1000,
      retryInterval: 50,
      staleThreshold: 500,
    });

    await lockManager.initialize();
  });

  afterEach(async () => {
    // Dispose lock manager
    if (lockManager && !lockManager.isDisposed()) {
      await lockManager.dispose();
    }

    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  // ============================================================================
  // Basic Operations
  // ============================================================================
  describe('Basic Operations', () => {
    it('should create lock directory on initialize', async () => {
      const lockDir = path.join(testDir, '.locks');
      const stat = await fs.stat(lockDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should acquire and release lock', async () => {
      const release = await lockManager.acquire('test-resource');

      expect(lockManager.isHeldByUs('test-resource')).toBe(true);
      expect(await lockManager.isLocked('test-resource')).toBe(true);

      await release();

      expect(lockManager.isHeldByUs('test-resource')).toBe(false);
      // Note: isLocked may still return true briefly due to file system timing
    });

    it('should allow acquiring different resources simultaneously', async () => {
      const release1 = await lockManager.acquire('resource-1');
      const release2 = await lockManager.acquire('resource-2');

      expect(lockManager.isHeldByUs('resource-1')).toBe(true);
      expect(lockManager.isHeldByUs('resource-2')).toBe(true);
      expect(lockManager.getActiveLocksCount()).toBe(2);

      await release1();
      await release2();

      expect(lockManager.getActiveLocksCount()).toBe(0);
    });

    it('should create lock files', async () => {
      await lockManager.acquire('my-resource');

      const lockFile = path.join(testDir, '.locks', 'my-resource.lock');
      const stat = await fs.stat(lockFile);
      expect(stat.isFile()).toBe(true);
    });

    it('should sanitize resource names for file paths', async () => {
      // Resource with special characters
      const release = await lockManager.acquire('plan:123/entity:456');

      expect(lockManager.isHeldByUs('plan:123/entity:456')).toBe(true);

      // Should create sanitized lock file
      const lockFile = path.join(testDir, '.locks', 'plan_123_entity_456.lock');
      const stat = await fs.stat(lockFile);
      expect(stat.isFile()).toBe(true);

      await release();
    });
  });

  // ============================================================================
  // Lock Contention
  // ============================================================================
  describe('Lock Contention', () => {
    it('should block second acquire until first is released', async () => {
      const events: string[] = [];

      const release1 = await lockManager.acquire('resource');
      events.push('acquired-1');

      // Start second acquire (will wait)
      const acquire2Promise = (async () => {
        const release = await lockManager.acquire('resource');
        events.push('acquired-2');
        return release;
      })();

      // Release first lock after delay
      await new Promise((resolve) => setTimeout(resolve, 100));
      events.push('releasing-1');
      await release1();

      // Second should now acquire
      const release2 = await acquire2Promise;
      await release2();

      expect(events).toEqual(['acquired-1', 'releasing-1', 'acquired-2']);
    });

    it('should timeout if lock not released', async () => {
      const lm = new FileLockManager(testDir, {
        acquireTimeout: 200,
        retryInterval: 50,
      });
      await lm.initialize();

      // First lock
      await lockManager.acquire('resource');

      // Second should timeout
      await expect(lm.acquire('resource')).rejects.toThrow(/timeout/i);

      await lm.dispose();
    });
  });

  // ============================================================================
  // withLock Helper
  // ============================================================================
  describe('withLock Helper', () => {
    it('should execute callback with lock held', async () => {
      let wasLocked = false;

      const result = await lockManager.withLock('resource', async () => {
        wasLocked = lockManager.isHeldByUs('resource');
        return 'success';
      });

      expect(wasLocked).toBe(true);
      expect(result).toBe('success');
      expect(lockManager.isHeldByUs('resource')).toBe(false);
    });

    it('should release lock even if callback throws', async () => {
      await expect(
        lockManager.withLock('resource', async () => {
          throw new Error('Callback error');
        })
      ).rejects.toThrow('Callback error');

      expect(lockManager.isHeldByUs('resource')).toBe(false);
    });

    it('should serialize concurrent withLock calls', async () => {
      const events: string[] = [];

      await Promise.all([
        lockManager.withLock('resource', async () => {
          events.push('start-1');
          await new Promise((resolve) => setTimeout(resolve, 50));
          events.push('end-1');
        }),
        lockManager.withLock('resource', async () => {
          events.push('start-2');
          await new Promise((resolve) => setTimeout(resolve, 50));
          events.push('end-2');
        }),
      ]);

      // Operations should not interleave (order may vary, but pairs must be together)
      // Either [start-1, end-1, start-2, end-2] or [start-2, end-2, start-1, end-1]
      const str = events.join(',');
      const valid =
        str === 'start-1,end-1,start-2,end-2' ||
        str === 'start-2,end-2,start-1,end-1';
      expect(valid).toBe(true);
    });
  });

  // ============================================================================
  // Stale Lock Detection
  // ============================================================================
  describe('Stale Lock Detection', () => {
    it('should recover from stale lock', async () => {
      // Create a stale lock file manually (simulates crashed process)
      const lockDir = path.join(testDir, '.locks');
      const lockFile = path.join(lockDir, 'stale-resource.lock');
      await fs.writeFile(lockFile, '', 'utf-8');

      // Create a .lock directory that proper-lockfile would create
      // This simulates a crashed process that left a lock
      const staleLockDir = `${lockFile}.lock`;
      await fs.mkdir(staleLockDir, { recursive: true }).catch(() => {});

      // Set mtime to old time (proper-lockfile uses mtime for stale detection)
      const oldTime = new Date(Date.now() - 10000); // 10 seconds ago
      await fs.utimes(staleLockDir, oldTime, oldTime);

      // Should be able to acquire (stale detection will trigger)
      const lm = new FileLockManager(testDir, {
        staleThreshold: 500,
        acquireTimeout: 2000,
      });
      await lm.initialize();

      const release = await lm.acquire('stale-resource');
      expect(lm.isHeldByUs('stale-resource')).toBe(true);

      await release();
      await lm.dispose();
    });
  });

  // ============================================================================
  // Dispose
  // ============================================================================
  describe('Dispose', () => {
    it('should release all locks on dispose', async () => {
      await lockManager.acquire('resource-1');
      await lockManager.acquire('resource-2');
      await lockManager.acquire('resource-3');

      expect(lockManager.getActiveLocksCount()).toBe(3);

      await lockManager.dispose();

      expect(lockManager.getActiveLocksCount()).toBe(0);
      expect(lockManager.isDisposed()).toBe(true);
    });

    it('should reject new acquires after dispose', async () => {
      await lockManager.dispose();

      await expect(lockManager.acquire('resource')).rejects.toThrow(/disposed/i);
    });

    it('should be idempotent', async () => {
      await lockManager.dispose();
      await lockManager.dispose(); // Should not throw
      await lockManager.dispose();

      expect(lockManager.isDisposed()).toBe(true);
    });
  });

  // ============================================================================
  // Logging
  // ============================================================================
  describe('Logging', () => {
    it('should log operations when logger provided', async () => {
      const logs: Array<{ level: string; message: string }> = [];

      const lm = new FileLockManager(testDir, {
        logger: {
          debug: (msg) => logs.push({ level: 'debug', message: msg }),
          info: (msg) => logs.push({ level: 'info', message: msg }),
          warn: (msg) => logs.push({ level: 'warn', message: msg }),
          error: (msg) => logs.push({ level: 'error', message: msg }),
        },
        logLevel: 'debug',
      });

      await lm.initialize();
      const release = await lm.acquire('resource');
      await release();
      await lm.dispose();

      expect(logs.some((l) => l.message.includes('initialized'))).toBe(true);
      expect(logs.some((l) => l.message.includes('acquired'))).toBe(true);
      expect(logs.some((l) => l.message.includes('released'))).toBe(true);
    });
  });

  // ============================================================================
  // Multi-Process Simulation
  // ============================================================================
  describe('Multi-Process Simulation', () => {
    it('should serialize operations from multiple FileLockManager instances', async () => {
      // Simulate multiple processes by creating multiple instances
      const lm1 = new FileLockManager(testDir, { acquireTimeout: 2000 });
      const lm2 = new FileLockManager(testDir, { acquireTimeout: 2000 });

      await lm1.initialize();
      await lm2.initialize();

      const events: string[] = [];

      // Both try to lock same resource
      const p1 = lm1.withLock('shared-resource', async () => {
        events.push('lm1-start');
        await new Promise((resolve) => setTimeout(resolve, 100));
        events.push('lm1-end');
      });

      const p2 = lm2.withLock('shared-resource', async () => {
        events.push('lm2-start');
        await new Promise((resolve) => setTimeout(resolve, 100));
        events.push('lm2-end');
      });

      await Promise.all([p1, p2]);

      // Operations should be serialized (not interleaved)
      // Either lm1-start, lm1-end, lm2-start, lm2-end
      // Or lm2-start, lm2-end, lm1-start, lm1-end
      const str = events.join(',');
      const valid =
        str === 'lm1-start,lm1-end,lm2-start,lm2-end' ||
        str === 'lm2-start,lm2-end,lm1-start,lm1-end';

      expect(valid).toBe(true);

      await lm1.dispose();
      await lm2.dispose();
    });

    it('should handle contention from many instances', async () => {
      const instances = await Promise.all(
        Array.from({ length: 5 }, async () => {
          const lm = new FileLockManager(testDir, {
            acquireTimeout: 5000,
            retryInterval: 20,
          });
          await lm.initialize();
          return lm;
        })
      );

      let counter = 0;
      const results: number[] = [];

      // All instances try to increment counter
      await Promise.all(
        instances.map((lm, i) =>
          lm.withLock('counter', async () => {
            const current = counter;
            await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate work
            counter = current + 1;
            results.push(i);
          })
        )
      );

      // Counter should be exactly 5 (no lost updates)
      expect(counter).toBe(5);
      expect(results.length).toBe(5);

      // Dispose all
      await Promise.all(instances.map((lm) => lm.dispose()));
    });
  });
});
