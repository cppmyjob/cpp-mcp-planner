/**
 * FileLockManager Directory Issues Tests (TDD)
 *
 * RED Phase: Tests for issues discovered during investigation:
 * 1. .locks directory missing should auto-recover (not throw misleading error)
 * 2. Orphaned lock files should be cleaned up on startup
 * 3. Orphaned lock files should be cleaned up on shutdown
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileLockManager } from '@mcp-planner/mcp-server';

describe('FileLockManager Directory Issues', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      `file-lock-dir-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors in tests
    });
  });

  // ============================================================================
  // Issue #1: .locks directory deleted after initialization
  // Current behavior: throws "Lock file was deleted during operation"
  // Expected: auto-recover by recreating .locks directory
  // ============================================================================
  describe('Issue #1: .locks directory missing should auto-recover', () => {
    it('RED: should recover when .locks directory is deleted after initialization', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 5000,
        retryInterval: 50,
      });
      await lockManager.initialize();

      // Verify .locks exists
      const lockDir = path.join(testDir, '.locks');
      const statBefore = await fs.stat(lockDir);
      expect(statBefore.isDirectory()).toBe(true);

      // DELETE .locks directory (simulates external deletion or race condition)
      await fs.rm(lockDir, { recursive: true, force: true });

      // Verify it's gone
      await expect(fs.stat(lockDir)).rejects.toThrow();

      // Try to acquire lock - should auto-recover, NOT throw misleading error
      const release = await lockManager.acquire('test-resource');
      expect(lockManager.isHeldByUs('test-resource')).toBe(true);

      // .locks should be recreated
      const statAfter = await fs.stat(lockDir);
      expect(statAfter.isDirectory()).toBe(true);

      await release();
      await lockManager.dispose();
    });

    it('RED: should provide clear error message when directory creation fails', async () => {
      // This tests the error message improvement
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 1000,
        retryInterval: 50,
      });
      await lockManager.initialize();

      const lockDir = path.join(testDir, '.locks');
      await fs.rm(lockDir, { recursive: true, force: true });

      // If auto-recovery fails (e.g., permission denied), error should be clear
      // For this test, we just verify successful recovery
      const release = await lockManager.acquire('test-resource');
      await release();
      await lockManager.dispose();
    });

    it('RED: should handle concurrent requests when .locks is missing', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 5000,
        retryInterval: 50,
      });
      await lockManager.initialize();

      const lockDir = path.join(testDir, '.locks');
      await fs.rm(lockDir, { recursive: true, force: true });

      // Multiple concurrent acquire requests on different resources
      const acquirePromises = [
        lockManager.acquire('resource-1'),
        lockManager.acquire('resource-2'),
        lockManager.acquire('resource-3'),
      ];

      // All should succeed (auto-recovery should be safe for concurrent access)
      const releases = await Promise.all(acquirePromises);

      expect(lockManager.isHeldByUs('resource-1')).toBe(true);
      expect(lockManager.isHeldByUs('resource-2')).toBe(true);
      expect(lockManager.isHeldByUs('resource-3')).toBe(true);

      await Promise.all(releases.map((r) => r()));
      await lockManager.dispose();
    });
  });

  // ============================================================================
  // Issue #2: Orphaned lock files should be cleaned up on startup
  // ============================================================================
  describe('Issue #2: Orphaned lock cleanup on startup', () => {
    it('RED: should clean up stale lock files during initialize()', async () => {
      // Step 1: Create orphaned lock files manually
      const lockDir = path.join(testDir, '.locks');
      await fs.mkdir(lockDir, { recursive: true });

      // Create fake orphaned .lock files (not actively locked)
      const orphanedFiles = [
        'abc123def456abc123def456abc12345.lock',
        'def456abc123def456abc123def45678.lock',
        'orphaned1234567890abcdef12345678.lock',
      ];

      for (const file of orphanedFiles) {
        await fs.writeFile(path.join(lockDir, file), '');
      }

      // Verify files exist
      let files = await fs.readdir(lockDir);
      expect(files.length).toBe(3);

      // Step 2: Initialize lock manager - should clean up orphaned files
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 1000,
        staleThreshold: 100, // Short stale threshold for testing
      });
      await lockManager.initialize();

      // Step 3: Verify orphaned files are cleaned up
      files = await fs.readdir(lockDir);
      expect(files.length).toBe(0);

      await lockManager.dispose();
    });

    it('RED: should NOT clean up actively locked files during initialize()', async () => {
      // Step 1: Create a real lock using first manager
      const manager1 = new FileLockManager(testDir, {
        acquireTimeout: 5000,
      });
      await manager1.initialize();

      const release = await manager1.acquire('active-resource');

      // Step 2: Create second manager and initialize
      // It should NOT delete the active lock from manager1
      const manager2 = new FileLockManager(testDir, {
        acquireTimeout: 1000,
        staleThreshold: 100,
      });
      await manager2.initialize();

      // Step 3: Verify manager1's lock is still held
      expect(manager1.isHeldByUs('active-resource')).toBe(true);

      // Step 4: manager2 should not be able to immediately acquire the same resource
      const acquirePromise = manager2.withLock(
        'active-resource',
        () => Promise.resolve('acquired'),
        { timeout: 200 }
      );

      await expect(acquirePromise).rejects.toThrow(/[Tt]imeout/);

      await release();
      await manager1.dispose();
      await manager2.dispose();
    });

    it('RED: should handle mixed orphaned and active locks', async () => {
      // Step 1: Create real lock
      const manager1 = new FileLockManager(testDir, {
        acquireTimeout: 5000,
      });
      await manager1.initialize();
      const release = await manager1.acquire('active-resource');

      // Step 2: Create orphaned lock files manually
      const lockDir = path.join(testDir, '.locks');
      const orphanedFile = 'orphaned1234567890abcdef12345678.lock';
      await fs.writeFile(path.join(lockDir, orphanedFile), '');

      // Step 3: Initialize second manager
      const manager2 = new FileLockManager(testDir, {
        acquireTimeout: 1000,
        staleThreshold: 100,
      });
      await manager2.initialize();

      // Step 4: Orphaned file should be cleaned, active lock should remain
      const files = await fs.readdir(lockDir);

      // Should have some files (from active lock) but orphaned should be gone
      const hasOrphaned = files.includes(orphanedFile);
      expect(hasOrphaned).toBe(false);

      // Active lock should still work
      expect(manager1.isHeldByUs('active-resource')).toBe(true);

      await release();
      await manager1.dispose();
      await manager2.dispose();
    });
  });

  // ============================================================================
  // Issue #3: Orphaned lock files should be cleaned up on shutdown
  // ============================================================================
  describe('Issue #3: Orphaned lock cleanup on shutdown', () => {
    it('RED: should clean up lock files during dispose()', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 5000,
      });
      await lockManager.initialize();

      // Acquire and release some locks (leaves .lock files on disk)
      const release1 = await lockManager.acquire('resource-1');
      const release2 = await lockManager.acquire('resource-2');
      await release1();
      await release2();

      // Check .lock files exist
      const lockDir = path.join(testDir, '.locks');
      let files = await fs.readdir(lockDir);
      const lockFiles = files.filter((f) => f.endsWith('.lock'));
      expect(lockFiles.length).toBeGreaterThan(0);

      // Dispose should clean up
      await lockManager.dispose();

      // Check .lock files are cleaned up
      files = await fs.readdir(lockDir);
      const remainingLockFiles = files.filter((f) => f.endsWith('.lock'));
      expect(remainingLockFiles.length).toBe(0);
    });

    it('RED: should handle cleanup errors gracefully during dispose()', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 5000,
      });
      await lockManager.initialize();

      // Acquire and release a lock
      const release = await lockManager.acquire('resource');
      await release();

      // Delete .locks directory before dispose (simulates external deletion)
      const lockDir = path.join(testDir, '.locks');
      await fs.rm(lockDir, { recursive: true, force: true });

      // Dispose should NOT throw, even if cleanup fails
      await expect(lockManager.dispose()).resolves.toBeUndefined();
    });
  });

  // ============================================================================
  // Additional robustness tests
  // ============================================================================
  describe('Robustness', () => {
    it('RED: should work correctly when .locks never existed', async () => {
      // Don't call initialize() first - directly try operations
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 1000,
      });

      // Should throw clear error about not being initialized
      await expect(lockManager.acquire('resource')).rejects.toThrow(/[Ii]nitialize/);
    });

    it('RED: multiple initializations should be idempotent', async () => {
      const lockManager = new FileLockManager(testDir, {
        acquireTimeout: 5000,
      });

      // Multiple initialize calls should all succeed
      await lockManager.initialize();
      await lockManager.initialize();
      await lockManager.initialize();

      // Should work normally
      const release = await lockManager.acquire('resource');
      expect(lockManager.isHeldByUs('resource')).toBe(true);
      await release();

      await lockManager.dispose();
    });
  });
});
