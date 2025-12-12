/**
 * LockManager - In-process resource locking with reentrant support
 *
 * ============================================================================
 * STATUS: NOT USED IN FileRepository
 * ============================================================================
 *
 * FileRepository now uses FileLockManager (file-based, cross-process locking).
 * This module is preserved for potential future use cases that require:
 * - Reentrant locks (same holder acquiring multiple times)
 * - TTL with auto-release
 * - Event-driven lock notifications
 * - Faster in-memory locking (~0.01ms vs ~10-50ms for file locks)
 *
 * ============================================================================
 * KNOWN ISSUES & LIMITATIONS
 * ============================================================================
 *
 * 1. IN-PROCESS ONLY: Does NOT work across multiple processes.
 *    For multi-process scenarios, use FileLockManager.
 *
 * 2. EXTEND() RACE CONDITION: extend() can race with release() in autoRelease.
 *    If TTL expires while extend() is executing, the lock may be released
 *    before extension completes. Mitigation: use mutex protection.
 *
 * 3. INFINITE LOOP POTENTIAL: doAcquire() loop has maxRetries option but
 *    defaults to 0 (unlimited). Under heavy contention, could loop excessively.
 *    Set maxRetries option for production use.
 *
 * 4. DISPOSE TIMING: dispose() waits for in-flight operations with configurable
 *    disposeTimeout. Operations started after dispose begins will fail.
 *
 * ============================================================================
 * FEATURES
 * ============================================================================
 *
 * Provides thread-safe resource locking:
 * - Reentrant locks (same holder can acquire multiple times)
 * - Separate acquireTimeout and TTL semantics
 * - Atomic acquire operations (race condition prevention via per-resource mutex)
 * - Timer cleanup (memory leak prevention)
 * - Event-driven waiting (no polling)
 * - Graceful shutdown with dispose()
 * - Optional logging for debugging
 * - Lock extension via extend()
 *
 * acquireTimeout semantics:
 * - acquireTimeout > 0: wait up to N milliseconds for lock
 * - acquireTimeout === 0: try once without waiting (instant fail if locked)
 * - acquireTimeout < 0: invalid (throws error)
 * - acquireTimeout === undefined: use defaultAcquireTimeout (10 seconds)
 *
 * TTL semantics:
 * - ttl > 0: auto-release lock after N milliseconds
 * - ttl === 0 or undefined: no auto-release (infinite)
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import type {
  LockHolder,
  LockOptions,
  LockResult,
  LockManagerOptions,
  LockLogger,
  LogLevel,
  ExtendResult,
} from './types.js';

import {
  DEFAULT_ACQUIRE_TIMEOUT,
  DEFAULT_LOCK_TTL,
} from './types.js';

/**
 * Mutex entry for serializing acquire operations per resource
 */
interface MutexEntry {
  promise: Promise<void>;
  release: () => void;
}

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 999,
};

/**
 * LockManager
 *
 * Manages locks for resources with support for reentrant locks
 */
export class LockManager {
  private readonly locks = new Map<string, LockHolder>();
  private readonly locksByResource = new Map<string, string>(); // resource -> lockId
  private readonly defaultAcquireTimeout: number;
  private readonly defaultTtl: number;

  /**
   * Per-resource mutex for serializing acquire operations
   * Ensures only one acquire() runs at a time per resource
   */
  private readonly acquireMutexes = new Map<string, MutexEntry>();

  /**
   * Event emitter for lock release notifications (no polling)
   */
  private readonly lockEvents: EventEmitter = new EventEmitter();

  /**
   * Flag indicating if LockManager has been disposed
   */
  private disposed = false;

  /**
   * Counter for in-flight operations (for graceful shutdown)
   */
  private inFlightOps = 0;

  /**
   * Optional logger for debugging
   */
  private readonly logger?: LockLogger;

  /**
   * Minimum log level
   */
  private readonly logLevel: LogLevel;

  /**
   * Maximum retry attempts in doAcquire() loop (0 = no limit)
   */
  private readonly maxRetries: number;

  /**
   * Timeout for dispose() to wait for in-flight operations (ms)
   */
  private readonly disposeTimeout: number;

  constructor(options?: LockManagerOptions | number) {
    // Backwards compatibility: accept number as defaultAcquireTimeout
    if (typeof options === 'number') {
      this.defaultAcquireTimeout = options;
      this.defaultTtl = options; // Old behavior: timeout used for both
      this.logLevel = 'none';
      this.maxRetries = 0;
      this.disposeTimeout = 100;
    } else {
      this.defaultAcquireTimeout = options?.defaultAcquireTimeout ?? DEFAULT_ACQUIRE_TIMEOUT;
      this.defaultTtl = options?.defaultTtl ?? DEFAULT_LOCK_TTL;
      this.logger = options?.logger;
      this.logLevel = options?.logLevel ?? 'none';
      this.maxRetries = options?.maxRetries ?? 0;
      this.disposeTimeout = options?.disposeTimeout ?? 100;
    }

    // Prevent memory leak warning for many listeners
    this.lockEvents.setMaxListeners(1000);
  }

  // ============================================================================
  // Logging Helpers
  // ============================================================================

  /**
   * Log a message if level meets threshold
   */
  private log(level: Exclude<LogLevel, 'none'>, message: string, context?: Record<string, unknown>): void {
    if (!this.logger || this.logLevel === 'none') {
      return;
    }

    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.logLevel]) {
      return;
    }

    const logFn = this.logger[level];
    if (logFn) {
      logFn(message, context);
    }
  }

  /**
   * Acquire lock on resource (atomic operation)
   * Uses per-resource mutex to serialize concurrent acquire attempts
   */
  public async acquire(resource: string, options?: LockOptions): Promise<LockResult> {
    // Check if disposed
    if (this.disposed) {
      this.log('debug', 'acquire rejected - disposed', { resource });
      return {
        acquired: false,
        reason: 'LockManager has been disposed',
      };
    }

    // Validate resource name
    if (resource === undefined || resource === null || resource === '' || resource.trim() === '') {
      throw new Error('resource name cannot be empty');
    }

    // Resolve acquireTimeout: new param > deprecated timeout > default
    const acquireTimeout = options?.acquireTimeout ?? options?.timeout ?? this.defaultAcquireTimeout;
    if (acquireTimeout < 0) {
      throw new Error('acquireTimeout must be non-negative (0 for no wait, >0 for wait duration)');
    }

    // Resolve TTL: new param > deprecated timeout > default
    // For backwards compatibility: if only timeout is specified, use it for TTL too
    const ttl = options?.ttl ?? (options?.timeout !== undefined && options?.acquireTimeout === undefined ? options.timeout : this.defaultTtl);

    const holderId = options?.holderId ?? `pid-${String(process.pid)}`;
    const reentrant = options?.reentrant ?? false;
    const startTime = Date.now();

    this.log('debug', 'acquire attempt', { resource, holderId, reentrant, acquireTimeout, ttl });

    // Track in-flight operation
    this.inFlightOps++;

    try {
      // Acquire per-resource mutex (serializes all acquire attempts for this resource)
      // Returns true if mutex was acquired, false if timed out or disposed
      const mutexAcquired = await this.acquireMutex(resource, acquireTimeout, startTime);

      // If mutex wasn't acquired (timeout or disposed), return immediately
      if (!mutexAcquired) {
        // Check if disposed to return appropriate message
        if (this.disposed) {
          this.log('debug', 'acquire rejected - disposed during mutex wait', { resource });
          return {
            acquired: false,
            reason: 'LockManager has been disposed',
          };
        }
        this.log('warn', 'acquire timeout waiting for mutex', { resource, acquireTimeout });
        return {
          acquired: false,
          reason: `timeout waiting for lock on '${resource}' after ${String(acquireTimeout)}ms`,
        };
      }

      // Check acquireTimeout after acquiring mutex (time may have passed)
      if (acquireTimeout > 0 && Date.now() - startTime >= acquireTimeout) {
        this.releaseMutex(resource);
        this.log('warn', 'acquire timeout after mutex acquired', { resource, acquireTimeout });
        return {
          acquired: false,
          reason: `timeout waiting for lock on '${resource}' after ${String(acquireTimeout)}ms`,
        };
      }

      try {
        return await this.doAcquire(resource, holderId, reentrant, acquireTimeout, ttl, startTime);
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
    acquireTimeout: number,
    ttl: number,
    startTime: number
  ): Promise<LockResult> {
    // Retry loop - handles case where lock is grabbed by another holder after release
    while (true) {
      // Check if resource is already locked
      const existingLockId = this.locksByResource.get(resource);

      if (existingLockId !== undefined && existingLockId !== '') {
        const existingLock = this.locks.get(existingLockId);

        // Handle reentrant case (same holder)
        if (reentrant && existingLock?.holderId === holderId) {
          return this.handleReentrantAcquire(existingLock, existingLockId, ttl);
        }

        // Different holder - wait for lock to be released
        const remainingTimeout = acquireTimeout > 0 ? acquireTimeout - (Date.now() - startTime) : 0;
        if (remainingTimeout <= 0 && acquireTimeout > 0) {
          this.log('warn', 'acquire timeout in doAcquire', { resource, acquireTimeout });
          return {
            acquired: false,
            reason: `timeout waiting for lock on '${resource}' after ${String(acquireTimeout)}ms`,
          };
        }

        const released = await this.waitForRelease(resource, remainingTimeout);
        if (!released) {
          this.log('warn', 'acquire timeout waiting for release', { resource, acquireTimeout });
          return {
            acquired: false,
            reason: `timeout waiting for lock on '${resource}' after ${String(acquireTimeout)}ms`,
          };
        }

        // Check disposed IMMEDIATELY after await (dispose may have been called during wait)
        if (this.disposed) {
          this.log('debug', 'acquire rejected - disposed during wait', { resource });
          return {
            acquired: false,
            reason: 'LockManager has been disposed',
          };
        }

        // After release, loop back to re-check (another holder may have grabbed it)
        // This replaces the single check with a retry loop
        continue;
      }

      // Check disposed BEFORE creating lock (race with dispose after waitForRelease)
      if (this.disposed) {
        this.log('debug', 'acquire rejected - disposed before createNewLock', { resource });
        return {
          acquired: false,
          reason: 'LockManager has been disposed',
        };
      }

      // Resource is not locked - create new lock
      return this.createNewLock(resource, holderId, ttl);
    }
  }

  /**
   * Handle reentrant acquire (same holder acquiring same lock)
   * Uses max expiration to prevent timer drift (lock living forever with frequent reacquires)
   */
  private handleReentrantAcquire(
    existingLock: LockHolder,
    existingLockId: string,
    ttl: number
  ): LockResult {
    existingLock.refCount++;

    this.log('debug', 'reentrant acquire', {
      resource: existingLock.resource,
      lockId: existingLockId,
      refCount: existingLock.refCount,
      ttl,
    });

    // Extend expiration on reentrant acquire (only if new expiration is later)
    if (ttl > 0) {
      const now = Date.now();
      const newExpiration = now + ttl;

      // Only extend if new expiration is later than current (prevents timer drift)
      if (existingLock.expiresAt === undefined || existingLock.expiresAt === null || newExpiration > existingLock.expiresAt) {
        const timeUntilExpiration = newExpiration - now;
        existingLock.expiresAt = newExpiration;

        // Clear old timer FIRST, then create new one (prevents timer leak)
        if (existingLock.timer !== undefined && existingLock.timer !== null) {
          clearTimeout(existingLock.timer);
        }
        existingLock.timer = setTimeout(() => {
          this.autoRelease(existingLockId);
        }, timeUntilExpiration);

        this.log('debug', 'extended lock TTL on reentrant acquire', {
          resource: existingLock.resource,
          newExpiresAt: newExpiration,
        });
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
  private createNewLock(resource: string, holderId: string, ttl: number): LockResult {
    const lockId = uuidv4();
    const now = Date.now();

    const lock: LockHolder = {
      lockId,
      resource,
      acquiredAt: now,
      expiresAt: ttl > 0 ? now + ttl : undefined,
      holderId,
      refCount: 1,
    };

    // Store timer reference for cleanup
    if (lock.expiresAt !== undefined && lock.expiresAt !== null) {
      lock.timer = setTimeout(() => {
        this.autoRelease(lockId);
      }, ttl);
    }

    this.setLock(lockId, lock);

    this.log('debug', 'lock acquired', {
      resource,
      lockId,
      holderId,
      ttl: ttl > 0 ? ttl : 'infinite',
      expiresAt: lock.expiresAt,
    });

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
  public async release(lockId: string): Promise<void> {
    // If disposed, return silently - releaseAll() already cleaned up all locks
    // This enables safe usage in finally blocks (e.g., withLock)
    if (this.disposed) {
      this.log('debug', 'release skipped - disposed', { lockId });
      return;
    }

    const lock = this.locks.get(lockId);

    if (!lock) {
      throw new Error(`Lock with ID '${lockId}' not found`);
    }

    // Validate refCount before decrement (prevents double-release corruption)
    if (lock.refCount <= 0) {
      throw new Error(`Lock with ID '${lockId}' has invalid refCount: ${String(lock.refCount)}`);
    }

    // Decrement refCount for reentrant locks
    lock.refCount--;

    this.log('debug', 'release', {
      resource: lock.resource,
      lockId,
      refCountAfter: lock.refCount,
    });

    if (lock.refCount <= 0) {
      // Clear timer before deleting lock
      if (lock.timer) {
        clearTimeout(lock.timer);
        lock.timer = undefined;
      }

      const resource = lock.resource;

      // Delete lock from both maps
      this.deleteLock(lockId, resource);

      this.log('debug', 'lock fully released', { resource, lockId });

      // Emit release event (for waiters)
      this.lockEvents.emit(`lock:release:${resource}`);
    }

    return Promise.resolve();
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
  public isLocked(resource: string): Promise<boolean> {
    // Check if disposed
    if (this.disposed) {
      return Promise.resolve(false); // Disposed manager has no locks
    }

    const lockId = this.locksByResource.get(resource);
    if (lockId === undefined || lockId === null || lockId === '') {
      return Promise.resolve(false);
    }

    // Lock exists in map = resource is locked
    // Don't check expiration here - that's the timer's job
    return Promise.resolve(this.locks.has(lockId));
  }

  /**
   * Get lock holder information (read-only)
   */
  public getLockHolder(resource: string): Promise<LockHolder | undefined> {
    // Check if disposed
    if (this.disposed) {
      return Promise.resolve(undefined); // Disposed manager has no locks
    }

    const lockId = this.locksByResource.get(resource);
    if (lockId === undefined || lockId === null || lockId === '') {
      return Promise.resolve(undefined);
    }

    return Promise.resolve(this.locks.get(lockId));
  }

  /**
   * Release all locks and clear all pending mutexes
   */
  public releaseAll(): Promise<void> {
    // Clear all timers first
    for (const lock of this.locks.values()) {
      if (lock.timer !== undefined && lock.timer !== null) {
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

    return Promise.resolve();
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
  public async dispose(): Promise<void> {
    // Already disposed - idempotent
    if (this.disposed) {
      return;
    }

    // 1. Set disposed flag FIRST to reject new operations
    this.disposed = true;

    // 2. Release all locks - this emits events to wake up waiters
    // Waiters will check disposed flag and exit gracefully
    await this.releaseAll();

    // 3. Give in-flight operations a chance to complete
    const startWait = Date.now();
    while (this.inFlightOps > 0 && Date.now() - startWait < this.disposeTimeout) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // 4. Remove all listeners LAST (after events have been processed)
    this.lockEvents.removeAllListeners();
  }

  /**
   * Check if LockManager has been disposed
   */
  public isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get active locks count (read-only)
   */
  public getActiveLocksCount(): Promise<number> {
    // Check if disposed
    if (this.disposed) {
      return Promise.resolve(0); // Disposed manager has no locks
    }
    return Promise.resolve(this.locks.size);
  }

  /**
   * Get all active locks (read-only)
   */
  public getActiveLocks(): Promise<LockHolder[]> {
    // Check if disposed
    if (this.disposed) {
      return Promise.resolve([]); // Disposed manager has no locks
    }
    return Promise.resolve(Array.from(this.locks.values()));
  }

  /**
   * Execute callback with lock held
   */
  public async withLock<T>(
    resource: string,
    callback: () => Promise<T>,
    options?: LockOptions
  ): Promise<T> {
    const result = await this.acquire(resource, options);

    if (!result.acquired) {
      throw new Error(result.reason ?? 'Failed to acquire lock');
    }

    try {
      return await callback();
    } finally {
      if (result.lockId !== undefined && result.lockId !== null && result.lockId !== '') {
        await this.release(result.lockId);
      }
    }
  }

  /**
   * Extend lock TTL without reacquiring
   *
   * Use this to extend a lock's lifetime without incrementing refCount.
   * Unlike reentrant acquire, extend() doesn't change refCount.
   *
   * @param lockId - The lock ID to extend
   * @param ttl - New TTL in milliseconds (must be > 0)
   * @returns ExtendResult with extended=true and newExpiresAt on success
   */
  public async extend(lockId: string, ttl: number): Promise<ExtendResult> {
    // Check if disposed
    if (this.disposed) {
      this.log('debug', 'extend rejected - disposed', { lockId });
      return {
        extended: false,
        reason: 'LockManager has been disposed',
      };
    }

    // Validate TTL
    if (ttl < 0) {
      throw new Error('ttl must be non-negative');
    }

    const lock = this.locks.get(lockId);

    if (!lock) {
      this.log('debug', 'extend failed - lock not found', { lockId });
      return {
        extended: false,
        reason: `Lock with ID '${lockId}' not found`,
      };
    }

    // Clear old timer first (always)
    if (lock.timer) {
      clearTimeout(lock.timer);
      lock.timer = undefined;
    }

    // Handle ttl=0: make lock infinite (no expiration)
    if (ttl === 0) {
      lock.expiresAt = undefined;

      this.log('debug', 'lock extended to infinite', {
        resource: lock.resource,
        lockId,
      });

      return {
        extended: true,
        newExpiresAt: undefined,
      };
    }

    // For ttl > 0: set new expiration and timer
    const now = Date.now();
    const newExpiration = now + ttl;

    lock.expiresAt = newExpiration;
    lock.timer = setTimeout(() => {
      this.autoRelease(lockId);
    }, ttl);

    this.log('debug', 'lock extended', {
      resource: lock.resource,
      lockId,
      newExpiresAt: newExpiration,
      ttl,
    });

    return {
      extended: true,
      newExpiresAt: newExpiration,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Auto-release lock on expiration
   * Uses double-check pattern for race condition safety
   */
  private autoRelease(lockId: string): void {
    // Check disposed FIRST - don't emit events on disposed manager
    if (this.disposed) {
      return;
    }

    // First check: lock exists?
    const lock = this.locks.get(lockId);
    if (!lock) {
      return;
    }

    // Check if lock has expired
    if (lock.expiresAt !== undefined && lock.expiresAt !== null && Date.now() >= lock.expiresAt) {
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
