/**
 * LockManager - Resource locking with reentrant support
 *
 * Provides thread-safe resource locking:
 * - Reentrant locks (same holder can acquire multiple times)
 * - Lock timeout and expiration
 * - Atomic acquire operations (race condition prevention)
 * - Timer cleanup (memory leak prevention)
 * - Event-driven waiting (no polling)
 * - Graceful shutdown with dispose()
 *
 * Timeout semantics:
 * - timeout > 0: wait up to N milliseconds for lock
 * - timeout === 0: try once without waiting (instant fail if locked)
 * - timeout < 0: invalid (throws error)
 * - timeout === undefined: use defaultTimeout (10 seconds)
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import type { LockHolder, LockOptions, LockResult } from './types.js';

/**
 * Mutex entry for serializing acquire operations per resource
 */
interface MutexEntry {
  promise: Promise<void>;
  release: () => void;
}

/**
 * LockManager
 *
 * Manages locks for resources with support for reentrant locks
 */
export class LockManager {
  private locks: Map<string, LockHolder> = new Map();
  private locksByResource: Map<string, string> = new Map(); // resource -> lockId
  private defaultTimeout: number = 10000; // 10 seconds

  /**
   * Per-resource mutex for serializing acquire operations
   * Ensures only one acquire() runs at a time per resource
   */
  private acquireMutexes: Map<string, MutexEntry> = new Map();

  /**
   * Event emitter for lock release notifications (no polling)
   */
  private lockEvents: EventEmitter = new EventEmitter();

  /**
   * Flag indicating if LockManager has been disposed
   */
  private disposed: boolean = false;

  /**
   * Counter for in-flight operations (for graceful shutdown)
   */
  private inFlightOps: number = 0;

  constructor(defaultTimeout?: number) {
    if (defaultTimeout !== undefined) {
      this.defaultTimeout = defaultTimeout;
    }
    // Prevent memory leak warning for many listeners
    this.lockEvents.setMaxListeners(1000);
  }

  /**
   * Acquire lock on resource (atomic operation)
   * Uses per-resource mutex to serialize concurrent acquire attempts
   */
  async acquire(resource: string, options?: LockOptions): Promise<LockResult> {
    // Check if disposed
    if (this.disposed) {
      return {
        acquired: false,
        reason: 'LockManager has been disposed',
      };
    }

    // Validate resource name
    if (!resource || resource.trim() === '') {
      throw new Error('resource name cannot be empty');
    }

    // Validate timeout (0 = no wait/instant, >0 = wait up to N ms)
    const timeout = options?.timeout ?? this.defaultTimeout;
    if (timeout < 0) {
      throw new Error('timeout must be non-negative (0 for no wait, >0 for wait duration)');
    }

    const holderId = options?.holderId ?? `pid-${process.pid}`;
    const reentrant = options?.reentrant ?? false;
    const startTime = Date.now();

    // Track in-flight operation
    this.inFlightOps++;

    try {
      // Acquire per-resource mutex (serializes all acquire attempts for this resource)
      // Returns true if mutex was acquired, false if timed out or disposed
      const mutexAcquired = await this.acquireMutex(resource, timeout, startTime);

      // If mutex wasn't acquired (timeout or disposed), return immediately
      if (!mutexAcquired) {
        // Check if disposed to return appropriate message
        if (this.disposed) {
          return {
            acquired: false,
            reason: 'LockManager has been disposed',
          };
        }
        return {
          acquired: false,
          reason: `timeout waiting for lock on '${resource}' after ${timeout}ms`,
        };
      }

      // Check timeout after acquiring mutex (time may have passed)
      if (timeout > 0 && Date.now() - startTime >= timeout) {
        this.releaseMutex(resource);
        return {
          acquired: false,
          reason: `timeout waiting for lock on '${resource}' after ${timeout}ms`,
        };
      }

      try {
        return await this.doAcquire(resource, holderId, reentrant, timeout, startTime);
      } finally {
        this.releaseMutex(resource);
      }
    } finally {
      // Decrement in-flight counter
      this.inFlightOps--;
    }
  }

  /**
   * Acquire mutex for resource (serializes concurrent acquire operations)
   * Returns true if mutex was acquired, false if timed out or disposed
   * Uses atomic check-and-set pattern for race condition prevention
   */
  private async acquireMutex(resource: string, timeout: number, startTime: number): Promise<boolean> {
    // Prepare mutex entry upfront
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ourMutex: MutexEntry = { promise, release };

    // Atomic check-and-set loop
    while (true) {
      // ATOMIC SECTION: Check disposed AND mutex in same sync block
      // This prevents race where dispose() happens between checks
      if (!this.acquireMutexes.has(resource)) {
        // Check disposed INSIDE atomic section - after confirming no mutex exists
        if (this.disposed) {
          return false; // Don't set mutex on disposed manager
        }
        this.acquireMutexes.set(resource, ourMutex);
        return true; // Successfully acquired mutex
      }

      // Check disposed before waiting (early exit)
      if (this.disposed) {
        return false;
      }

      // For timeout=0, fail immediately without waiting for mutex
      // timeout=0 means "instant fail if locked", not "wait forever"
      if (timeout === 0) {
        return false;
      }

      // Wait for existing mutex holder to finish
      const existingMutex = this.acquireMutexes.get(resource);
      if (existingMutex) {
        await existingMutex.promise;
      }

      // Check disposed IMMEDIATELY after await (dispose may have been called during wait)
      if (this.disposed) {
        return false;
      }

      // Check timeout after waiting (only if timeout > 0, meaning not infinite)
      if (timeout > 0 && Date.now() - startTime >= timeout) {
        return false; // Timeout - mutex NOT acquired
      }

      // Loop back to re-check (another waiter may have grabbed it)
    }
  }

  /**
   * Release mutex for resource
   */
  private releaseMutex(resource: string): void {
    const mutex = this.acquireMutexes.get(resource);
    if (mutex) {
      this.acquireMutexes.delete(resource);
      mutex.release(); // Wake up waiters AFTER deleting (they'll see mutex is gone and create their own)
    }
  }

  /**
   * Internal acquire implementation (called atomically)
   * Handles both new lock creation and reentrant acquire
   * Uses retry loop to handle race conditions after lock release
   */
  private async doAcquire(
    resource: string,
    holderId: string,
    reentrant: boolean,
    timeout: number,
    startTime: number
  ): Promise<LockResult> {
    // Retry loop - handles case where lock is grabbed by another holder after release
    while (true) {
      // Check if resource is already locked
      const existingLockId = this.locksByResource.get(resource);

      if (existingLockId) {
        const existingLock = this.locks.get(existingLockId);

        // Handle reentrant case (same holder)
        if (reentrant && existingLock && existingLock.holderId === holderId) {
          return this.handleReentrantAcquire(existingLock, existingLockId, timeout);
        }

        // Different holder - wait for lock to be released
        const remainingTimeout = timeout > 0 ? timeout - (Date.now() - startTime) : 0;
        if (remainingTimeout <= 0 && timeout > 0) {
          return {
            acquired: false,
            reason: `timeout waiting for lock on '${resource}' after ${timeout}ms`,
          };
        }

        const released = await this.waitForRelease(resource, remainingTimeout);
        if (!released) {
          return {
            acquired: false,
            reason: `timeout waiting for lock on '${resource}' after ${timeout}ms`,
          };
        }

        // Check disposed IMMEDIATELY after await (dispose may have been called during wait)
        if (this.disposed) {
          return {
            acquired: false,
            reason: 'LockManager has been disposed',
          };
        }

        // After release, loop back to re-check (another holder may have grabbed it)
        // This replaces the single check with a retry loop
        continue;
      }

      // Resource is not locked - create new lock
      return this.createNewLock(resource, holderId, timeout);
    }
  }

  /**
   * Handle reentrant acquire (same holder acquiring same lock)
   * Uses max expiration to prevent timer drift (lock living forever with frequent reacquires)
   */
  private handleReentrantAcquire(
    existingLock: LockHolder,
    existingLockId: string,
    timeout: number
  ): LockResult {
    existingLock.refCount++;

    // Extend expiration on reentrant acquire (only if new expiration is later)
    if (timeout > 0) {
      const now = Date.now();
      const newExpiration = now + timeout;

      // Only extend if new expiration is later than current (prevents timer drift)
      if (!existingLock.expiresAt || newExpiration > existingLock.expiresAt) {
        const timeUntilExpiration = newExpiration - now;
        existingLock.expiresAt = newExpiration;

        // Clear old timer FIRST, then create new one (prevents timer leak)
        if (existingLock.timer) {
          clearTimeout(existingLock.timer);
        }
        existingLock.timer = setTimeout(() => {
          this.autoRelease(existingLockId);
        }, timeUntilExpiration);
      }
    }

    return {
      acquired: true,
      lockId: existingLockId,
    };
  }

  /**
   * Create a new lock
   */
  private createNewLock(resource: string, holderId: string, timeout: number): LockResult {
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

    // Store timer reference for cleanup
    if (lock.expiresAt) {
      lock.timer = setTimeout(() => {
        this.autoRelease(lockId);
      }, timeout);
    }

    this.setLock(lockId, lock);

    return {
      acquired: true,
      lockId,
    };
  }

  /**
   * Set lock in both maps atomically
   */
  private setLock(lockId: string, lock: LockHolder): void {
    this.locks.set(lockId, lock);
    this.locksByResource.set(lock.resource, lockId);
  }

  /**
   * Delete lock from both maps atomically
   */
  private deleteLock(lockId: string, resource: string): void {
    this.locks.delete(lockId);
    this.locksByResource.delete(resource);
  }

  /**
   * Release lock
   * Validates refCount to prevent double-release corruption
   *
   * If disposed, returns silently (lock already released by releaseAll).
   * This enables safe usage in finally blocks during graceful shutdown.
   */
  async release(lockId: string): Promise<void> {
    // If disposed, return silently - releaseAll() already cleaned up all locks
    // This enables safe usage in finally blocks (e.g., withLock)
    if (this.disposed) {
      return;
    }

    const lock = this.locks.get(lockId);

    if (!lock) {
      throw new Error(`Lock with ID '${lockId}' not found`);
    }

    // Validate refCount before decrement (prevents double-release corruption)
    if (lock.refCount <= 0) {
      throw new Error(`Lock with ID '${lockId}' has invalid refCount: ${lock.refCount}`);
    }

    // Decrement refCount for reentrant locks
    lock.refCount--;

    if (lock.refCount <= 0) {
      // Clear timer before deleting lock
      if (lock.timer) {
        clearTimeout(lock.timer);
        lock.timer = undefined;
      }

      const resource = lock.resource;

      // Delete lock from both maps
      this.deleteLock(lockId, resource);

      // Emit release event (for waiters)
      this.lockEvents.emit(`lock:release:${resource}`);
    }
  }

  /**
   * Wait for lock to be released (event-driven, no polling)
   * Uses resolved flag to prevent double-resolution and ensure proper cleanup
   *
   * Timeout semantics:
   * - timeout <= 0: no wait, check current state and return immediately
   * - timeout > 0: wait up to timeout ms for release
   */
  private async waitForRelease(resource: string, timeout: number): Promise<boolean> {
    // If timeout <= 0, return immediately based on current state (no waiting)
    if (timeout <= 0) {
      return !this.locksByResource.has(resource);
    }

    return new Promise<boolean>((resolve) => {
      // Check if already released
      if (!this.locksByResource.has(resource)) {
        resolve(true);
        return;
      }

      const eventName = `lock:release:${resource}`; // Namespaced event
      let resolved = false; // Prevents double-resolution
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        this.lockEvents.removeListener(eventName, onRelease);
      };

      const onRelease = () => {
        if (resolved) return; // Already resolved, ignore
        resolved = true;
        cleanup();
        resolve(true);
      };

      // Set timeout for waiting
      timeoutId = setTimeout(() => {
        if (resolved) return; // Already resolved, ignore
        resolved = true;
        cleanup();
        resolve(false);
      }, timeout);

      // Listen for release event (use .on instead of .once for manual control)
      this.lockEvents.on(eventName, onRelease);
    });
  }

  /**
   * Check if resource is locked (read-only operation)
   *
   * Returns true if lock exists in the map, regardless of expiration.
   * Expiration is handled by auto-release timers, not by isLocked().
   * This ensures consistent behavior: if lock is in the map, it's locked.
   */
  async isLocked(resource: string): Promise<boolean> {
    // Check if disposed
    if (this.disposed) {
      return false; // Disposed manager has no locks
    }

    const lockId = this.locksByResource.get(resource);
    if (!lockId) {
      return false;
    }

    // Lock exists in map = resource is locked
    // Don't check expiration here - that's the timer's job
    return this.locks.has(lockId);
  }

  /**
   * Get lock holder information (read-only)
   */
  async getLockHolder(resource: string): Promise<LockHolder | undefined> {
    // Check if disposed
    if (this.disposed) {
      return undefined; // Disposed manager has no locks
    }

    const lockId = this.locksByResource.get(resource);
    if (!lockId) {
      return undefined;
    }

    return this.locks.get(lockId);
  }

  /**
   * Release all locks and clear all pending mutexes
   */
  async releaseAll(): Promise<void> {
    // Clear all timers first
    for (const lock of this.locks.values()) {
      if (lock.timer) {
        clearTimeout(lock.timer);
      }
    }

    // Get all resources before clearing (for events)
    const resources = Array.from(this.locksByResource.keys());

    this.locks.clear();
    this.locksByResource.clear();

    // Release all pending mutexes (unblock waiters)
    for (const [_resource, mutex] of this.acquireMutexes) {
      mutex.release();
    }
    this.acquireMutexes.clear();

    // Emit release events for all resources
    for (const resource of resources) {
      this.lockEvents.emit(`lock:release:${resource}`);
    }
  }

  /**
   * Dispose of the LockManager and clean up all resources
   *
   * Graceful shutdown sequence:
   * 1. Set disposed flag to reject new operations
   * 2. Release all locks (emits events to wake waiters)
   * 3. Wait briefly for in-flight operations to complete
   * 4. Remove all listeners
   */
  async dispose(): Promise<void> {
    // Already disposed - idempotent
    if (this.disposed) {
      return;
    }

    // 1. Set disposed flag FIRST to reject new operations
    this.disposed = true;

    // 2. Release all locks - this emits events to wake up waiters
    // Waiters will check disposed flag and exit gracefully
    await this.releaseAll();

    // 3. Give in-flight operations a chance to complete (max 100ms)
    const maxWait = 100;
    const startWait = Date.now();
    while (this.inFlightOps > 0 && Date.now() - startWait < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // 4. Remove all listeners LAST (after events have been processed)
    this.lockEvents.removeAllListeners();
  }

  /**
   * Check if LockManager has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get active locks count (read-only)
   */
  async getActiveLocksCount(): Promise<number> {
    // Check if disposed
    if (this.disposed) {
      return 0; // Disposed manager has no locks
    }
    return this.locks.size;
  }

  /**
   * Get all active locks (read-only)
   */
  async getActiveLocks(): Promise<LockHolder[]> {
    // Check if disposed
    if (this.disposed) {
      return []; // Disposed manager has no locks
    }
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
   * Auto-release lock on expiration
   * Uses double-check pattern for race condition safety
   */
  private autoRelease(lockId: string): void {
    // First check: lock exists?
    const lock = this.locks.get(lockId);
    if (!lock) {
      return;
    }

    // Check if lock has expired
    if (lock.expiresAt && Date.now() >= lock.expiresAt) {
      // For reentrant locks, only auto-release if refCount is 1
      if (lock.refCount > 1) {
        return;
      }

      // DOUBLE-CHECK: Verify lock still exists and is the same (wasn't released/reacquired)
      const currentLock = this.locks.get(lockId);
      if (!currentLock || currentLock !== lock) {
        return; // Lock was modified/released by another path
      }

      // Clear timer reference
      if (lock.timer) {
        clearTimeout(lock.timer);
        lock.timer = undefined;
      }

      const resource = lock.resource;

      // Delete lock
      this.deleteLock(lockId, resource);

      // Emit release event
      this.lockEvents.emit(`lock:release:${resource}`);
    }
  }
}
