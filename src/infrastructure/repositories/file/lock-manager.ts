/**
 * LockManager - Resource locking with reentrant support
 *
 * Provides thread-safe resource locking:
 * - Reentrant locks (same holder can acquire multiple times)
 * - Lock timeout and expiration
 * - Deadlock prevention
 * - Lock statistics and monitoring
 */

import { v4 as uuidv4 } from 'uuid';
import type { LockHolder, LockOptions, LockResult } from './types.js';

/**
 * LockManager
 *
 * Manages locks for resources with support for reentrant locks
 */
export class LockManager {
  private locks: Map<string, LockHolder> = new Map();
  private locksByResource: Map<string, string> = new Map(); // resource -> lockId
  private defaultTimeout: number = 10000; // 10 seconds

  constructor(defaultTimeout?: number) {
    if (defaultTimeout !== undefined) {
      this.defaultTimeout = defaultTimeout;
    }
  }

  /**
   * Acquire lock on resource
   */
  async acquire(resource: string, options?: LockOptions): Promise<LockResult> {
    // Validate resource name
    if (!resource || resource.trim() === '') {
      throw new Error('resource name cannot be empty');
    }

    // Validate timeout
    const timeout = options?.timeout ?? this.defaultTimeout;
    if (timeout < 0) {
      throw new Error('timeout must be positive');
    }

    const holderId = options?.holderId ?? `pid-${process.pid}`;
    const reentrant = options?.reentrant ?? false;

    // Check if resource is already locked
    const existingLockId = this.locksByResource.get(resource);

    if (existingLockId) {
      const existingLock = this.locks.get(existingLockId);

      // If reentrant and same holder, increment refCount
      if (reentrant && existingLock && existingLock.holderId === holderId) {
        existingLock.refCount++;
        return {
          acquired: true,
          lockId: existingLockId,
        };
      }

      // Wait for lock to be released or timeout
      const acquired = await this.waitForLock(resource, timeout);
      if (!acquired) {
        return {
          acquired: false,
          reason: `timeout waiting for lock on '${resource}' after ${timeout}ms`,
        };
      }
    }

    // Acquire new lock
    const lockId = uuidv4();
    const now = Date.now();

    const lock: LockHolder = {
      lockId,
      resource,
      acquiredAt: now,
      expiresAt: timeout > 0 ? now + timeout : undefined,
      holderId,
      refCount: 1,
    };

    this.locks.set(lockId, lock);
    this.locksByResource.set(resource, lockId);

    // Schedule auto-release if expiration is set
    if (lock.expiresAt) {
      setTimeout(() => {
        this.autoRelease(lockId);
      }, timeout);
    }

    return {
      acquired: true,
      lockId,
    };
  }

  /**
   * Release lock
   */
  async release(lockId: string): Promise<void> {
    const lock = this.locks.get(lockId);

    if (!lock) {
      throw new Error(`Lock with ID '${lockId}' not found`);
    }

    // Decrement refCount for reentrant locks
    lock.refCount--;

    if (lock.refCount <= 0) {
      // Fully release lock
      this.locks.delete(lockId);
      this.locksByResource.delete(lock.resource);
    }
  }

  /**
   * Check if resource is locked
   */
  async isLocked(resource: string): Promise<boolean> {
    const lockId = this.locksByResource.get(resource);
    if (!lockId) {
      return false;
    }

    const lock = this.locks.get(lockId);
    if (!lock) {
      // Inconsistent state, cleanup
      this.locksByResource.delete(resource);
      return false;
    }

    // Check expiration
    if (lock.expiresAt && Date.now() > lock.expiresAt) {
      await this.release(lockId);
      return false;
    }

    return true;
  }

  /**
   * Get lock holder information
   */
  async getLockHolder(resource: string): Promise<LockHolder | undefined> {
    const lockId = this.locksByResource.get(resource);
    if (!lockId) {
      return undefined;
    }

    return this.locks.get(lockId);
  }

  /**
   * Release all locks
   */
  async releaseAll(): Promise<void> {
    this.locks.clear();
    this.locksByResource.clear();
  }

  /**
   * Get active locks count
   */
  async getActiveLocksCount(): Promise<number> {
    return this.locks.size;
  }

  /**
   * Get all active locks
   */
  async getActiveLocks(): Promise<LockHolder[]> {
    return Array.from(this.locks.values());
  }

  /**
   * Execute callback with lock held
   */
  async withLock<T>(
    resource: string,
    callback: () => Promise<T>,
    options?: LockOptions
  ): Promise<T> {
    const result = await this.acquire(resource, options);

    if (!result.acquired) {
      throw new Error(result.reason || 'Failed to acquire lock');
    }

    try {
      return await callback();
    } finally {
      if (result.lockId) {
        await this.release(result.lockId);
      }
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Wait for lock to be released
   */
  private async waitForLock(resource: string, timeout: number): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 50; // 50ms

    while (Date.now() - startTime < timeout) {
      const isLocked = await this.isLocked(resource);
      if (!isLocked) {
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return false;
  }

  /**
   * Auto-release lock on expiration
   */
  private autoRelease(lockId: string): void {
    const lock = this.locks.get(lockId);
    if (!lock) {
      return;
    }

    // Check if lock has expired
    if (lock.expiresAt && Date.now() >= lock.expiresAt) {
      this.locks.delete(lockId);
      this.locksByResource.delete(lock.resource);
    }
  }
}
