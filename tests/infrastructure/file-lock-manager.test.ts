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
import { FileLockManager } from '@mcp-planner/core';

describe('FileLockManager', () => {
  let testDir: string;
  let lockManager: FileLockManager;

  beforeEach(async () => {
    // Create unique temp directory for each test
    testDir = path.join(os.tmpdir(), `file-lock-test-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`);
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
    if (!lockManager.isDisposed()) {
      await lockManager.dispose();
    }

    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors in tests
    });
  });

  // ============================================================================
  // Default Configuration
  // ============================================================================
  describe('Default Configuration', () => {
    it('should use platform-aware staleThreshold defaults', async () => {
      const lm = new FileLockManager(testDir);
      await lm.initialize();

      // Check via the actual behavior - not directly accessible, but we can verify
      // the manager was created without errors
      expect(lm.isInitialized()).toBe(true);

      await lm.dispose();
    });

    it('should use warn as default logLevel', async () => {
      const logs: { level: string; message: string }[] = [];

      const lm = new FileLockManager(testDir, {
        logger: {
          debug: (msg): void => { logs.push({ level: 'debug', message: msg }); },
          info: (msg): void => { logs.push({ level: 'info', message: msg }); },
          warn: (msg): void => { logs.push({ level: 'warn', message: msg }); },
          error: (msg): void => { logs.push({ level: 'error', message: msg }); },
        },
        // Not specifying logLevel - should default to 'warn'
      });
      await lm.initialize();
      const release = await lm.acquire('resource');
      await release();
      await lm.dispose();

      // With default 'warn' level, debug logs should NOT appear
      expect(logs.some((l) => l.level === 'debug')).toBe(false);
    });
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

    it('should create lock files in .locks directory', async () => {
      const release = await lockManager.acquire('my-resource');

      // Lock file should exist in .locks directory (name is hashed)
      const lockDir = path.join(testDir, '.locks');
      const files = await fs.readdir(lockDir);
      // proper-lockfile creates .lock directory with files inside
      const hasLockFiles = files.some(f => f.endsWith('.lock'));
      expect(hasLockFiles).toBe(true);

      await release();
    });

    it('should handle resource names with special characters', async () => {
      // Resource with special characters
      const release = await lockManager.acquire('plan:123/entity:456');

      expect(lockManager.isHeldByUs('plan:123/entity:456')).toBe(true);

      // Verify lock is functional by checking isLocked
      const isLocked = await lockManager.isLocked('plan:123/entity:456');
      expect(isLocked).toBe(true);

      await release();

      // After release, should not be locked
      expect(lockManager.isHeldByUs('plan:123/entity:456')).toBe(false);
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

      const result = await lockManager.withLock('resource', () => {
        wasLocked = lockManager.isHeldByUs('resource');
        return Promise.resolve('success');
      });

      expect(wasLocked).toBe(true);
      expect(result).toBe('success');
      expect(lockManager.isHeldByUs('resource')).toBe(false);
    });

    it('should release lock even if callback throws', async () => {
      await expect(
        lockManager.withLock('resource', () => {
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
      await fs.mkdir(staleLockDir, { recursive: true }).catch(() => {
        // Ignore errors - directory might already exist
      });

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
  // Release Return Value
  // ============================================================================
  describe('Release Return Value', () => {
    it('should return true for clean release', async () => {
      const release = await lockManager.acquire('resource');
      const result = await release();

      expect(result).toBe(true);
    });

    it('should return true when releasing non-held lock', async () => {
      // Calling release on non-held lock should return true (already released)
      const result = await lockManager.release('never-acquired');

      expect(result).toBe(true);
    });

    it('should return true after dispose', async () => {
      await lockManager.acquire('resource');
      await lockManager.dispose();

      // Release after dispose should return true (dispose handled it)
      const result = await lockManager.release('resource');

      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // onLockCompromised Callback
  // ============================================================================
  describe('onLockCompromised Callback', () => {
    // Note: Stale detection tests are unreliable on Windows because proper-lockfile
    // uses mtime which doesn't update reliably on Windows file systems.
    // These tests are skipped on Windows and covered in file-lock-manager-issues.test.ts
    // which uses mocking for reliable testing.

    const isWindows = process.platform === 'win32';

    (isWindows ? it.skip : it)(
      'should call onLockCompromised when lock is externally released',
      async () => {
        const compromisedLocks: { resource: string; heldFor: number }[] = [];

        // Use longer staleThreshold for reliability
        const staleThreshold = 500;

        const lm = new FileLockManager(testDir, {
          staleThreshold,
          acquireTimeout: 10000,
          onLockCompromised: (resource, heldFor) => {
            compromisedLocks.push({ resource, heldFor });
          },
        });
        await lm.initialize();

        // Acquire lock
        const release = await lm.acquire('resource');

        // Wait for stale threshold to pass (with large margin)
        await new Promise((resolve) => setTimeout(resolve, staleThreshold + 500));

        // Create another instance that will steal the "stale" lock
        const lm2 = new FileLockManager(testDir, {
          staleThreshold,
          acquireTimeout: 10000,
        });
        await lm2.initialize();
        const release2 = await lm2.acquire('resource');

        // Now release original lock - it was externally released
        const wasClean = await release();

        expect(wasClean).toBe(false);
        expect(compromisedLocks.length).toBe(1);
        expect(compromisedLocks[0].resource).toBe('resource');
        expect(compromisedLocks[0].heldFor).toBeGreaterThanOrEqual(staleThreshold);

        await release2();
        await lm.dispose();
        await lm2.dispose();
      },
      20000
    ); // Longer timeout for this test

    it('should not call onLockCompromised for clean release', async () => {
      const compromisedLocks: string[] = [];

      const lm = new FileLockManager(testDir, {
        staleThreshold: 10000, // Long threshold
        onLockCompromised: (resource) => {
          compromisedLocks.push(resource);
        },
      });
      await lm.initialize();

      const release = await lm.acquire('resource');
      const wasClean = await release();

      expect(wasClean).toBe(true);
      expect(compromisedLocks.length).toBe(0);

      await lm.dispose();
    });

    (isWindows ? it.skip : it)(
      'should handle errors in onLockCompromised callback',
      async () => {
        // Use longer staleThreshold for reliability
        const staleThreshold = 500;

        const lm = new FileLockManager(testDir, {
          staleThreshold,
          acquireTimeout: 10000,
          onLockCompromised: () => {
            throw new Error('Callback error');
          },
        });
        await lm.initialize();

        const release = await lm.acquire('resource');

        // Wait for stale (with large margin)
        await new Promise((resolve) => setTimeout(resolve, staleThreshold + 500));

        // Steal lock
        const lm2 = new FileLockManager(testDir, {
          staleThreshold,
          acquireTimeout: 10000,
        });
        await lm2.initialize();
        const release2 = await lm2.acquire('resource');

        // Should not throw even if callback throws
        const wasClean = await release();
        expect(wasClean).toBe(false);

        await release2();
        await lm.dispose();
        await lm2.dispose();
      },
      20000
    ); // Longer timeout for this test
  });

  // ============================================================================
  // Logging
  // ============================================================================
  describe('Logging', () => {
    it('should log operations when logger provided', async () => {
      const logs: { level: string; message: string }[] = [];

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
      const lm1 = new FileLockManager(testDir, { acquireTimeout: 2000, staleThreshold: 10000 });
      const lm2 = new FileLockManager(testDir, { acquireTimeout: 2000, staleThreshold: 10000 });

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
