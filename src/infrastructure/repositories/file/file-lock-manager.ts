/**
 * FileLockManager - Cross-process file locking using proper-lockfile
 *
 * Provides file-based locking for multi-process safety:
 * - Uses proper-lockfile for cross-process synchronization
 * - Supports lock timeouts and retries
 * - Automatic stale lock detection and recovery
 * - Integrates with LockManager for in-process + cross-process safety
 *
 * IMPORTANT: This lock manager does NOT support reentrant locks.
 * Calling acquire() twice on the same resource from the same process
 * will block until timeout.
 */

import lockfile from 'proper-lockfile';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import type { LockLogger, LogLevel } from './types.js';

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
 * FileLockManager options
 */
export interface FileLockManagerOptions {
  /**
   * How long to wait for lock acquisition (ms)
   * @default 10000
   */
  acquireTimeout?: number;

  /**
   * Time between lock acquisition retries (ms)
   * @default 100
   */
  retryInterval?: number;

  /**
   * Stale lock detection threshold (ms)
   * If lock file is older than this, it's considered stale.
   *
   * IMPORTANT: On Windows, file operations can take up to 60 seconds
   * due to graceful-fs retries when Windows Defender or Search Indexer
   * holds file handles. Default is set accordingly.
   *
   * @default 120000 on Windows, 30000 on other platforms
   */
  staleThreshold?: number;

  /**
   * Directory for lock files
   * @default '.locks' relative to baseDir
   */
  lockDir?: string;

  /**
   * Optional logger for debugging
   */
  logger?: LockLogger;

  /**
   * Minimum log level
   * @default 'warn'
   */
  logLevel?: LogLevel;

  /**
   * Timeout for dispose() to wait for lock releases (ms)
   * If releases take longer, dispose will complete anyway
   * @default 5000
   */
  disposeTimeout?: number;

  /**
   * Callback invoked when a lock is externally released (stale detection).
   * This indicates the critical section may have been compromised -
   * another process could have acquired and used the resource.
   *
   * Use this for monitoring, alerting, or defensive actions.
   */
  onLockCompromised?: (resource: string, heldForMs: number) => void;
}

/**
 * Options for withLock() method
 */
export interface WithLockOptions {
  /**
   * Custom acquire timeout for this operation
   */
  acquireTimeout?: number;
}

/**
 * Active lock entry
 */
interface ActiveLock {
  resource: string;
  lockPath: string;
  release: () => Promise<void>;
  acquiredAt: number;
}

/**
 * In-process mutex entry for serializing acquire operations
 */
interface MutexEntry {
  promise: Promise<void>;
  release: () => void;
}

/**
 * FileLockManager
 *
 * Cross-process file locking for multi-process MCP server safety
 */
export class FileLockManager {
  private baseDir: string;
  private lockDir: string;
  private acquireTimeout: number;
  private retryInterval: number;
  private staleThreshold: number;
  private disposeTimeout: number;
  private logger?: LockLogger;
  private logLevel: LogLevel;
  private onLockCompromised?: (resource: string, heldForMs: number) => void;

  /**
   * Platform-aware default stale threshold.
   * Windows needs longer due to graceful-fs retries (up to 60s).
   */
  private static readonly DEFAULT_STALE_THRESHOLD_WINDOWS = 120000; // 2 minutes
  private static readonly DEFAULT_STALE_THRESHOLD_OTHER = 30000; // 30 seconds

  /**
   * Active locks held by this process
   */
  private activeLocks: Map<string, ActiveLock> = new Map();

  /**
   * In-process mutex for serializing acquire operations per resource.
   *
   * NOTE: This mutex is technically NOT REQUIRED for correctness.
   * proper-lockfile already handles cross-process synchronization via file locks.
   * Multiple threads in the same process could all call lockfile.lock() directly
   * and proper-lockfile would serialize them via its retry mechanism.
   *
   * However, this in-process mutex provides a minor optimization:
   * - Reduces "thundering herd" effect when multiple in-process threads compete
   * - Prevents redundant retry loops hitting the file system simultaneously
   * - The performance benefit is minimal but the code complexity is low
   *
   * If you're simplifying this code, you can safely REMOVE this mutex and
   * rely solely on proper-lockfile. The mutex is released in finally{} immediately
   * after acquiring the file lock anyway, so it only serializes the acquire phase.
   */
  private acquireMutexes: Map<string, MutexEntry> = new Map();

  /**
   * Flag indicating if manager is disposed
   */
  private disposed: boolean = false;

  /**
   * Flag indicating if manager has been initialized
   */
  private initialized: boolean = false;

  constructor(baseDir: string, options?: FileLockManagerOptions) {
    this.baseDir = baseDir;
    this.lockDir = options?.lockDir ?? path.join(baseDir, '.locks');
    this.acquireTimeout = options?.acquireTimeout ?? 10000;
    this.retryInterval = options?.retryInterval ?? 100;
    this.staleThreshold =
      options?.staleThreshold ??
      (process.platform === 'win32'
        ? FileLockManager.DEFAULT_STALE_THRESHOLD_WINDOWS
        : FileLockManager.DEFAULT_STALE_THRESHOLD_OTHER);
    this.disposeTimeout = options?.disposeTimeout ?? 5000;
    this.logger = options?.logger;
    this.logLevel = options?.logLevel ?? 'warn';
    this.onLockCompromised = options?.onLockCompromised;
  }

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
   * Initialize the lock directory.
   * Must be called before using acquire(), withLock(), or isLocked().
   * Multiple calls are idempotent.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return; // Idempotent
    }
    await fs.mkdir(this.lockDir, { recursive: true });
    this.initialized = true;
    this.log('debug', 'FileLockManager initialized', { lockDir: this.lockDir });
  }

  /**
   * Check if manager has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure manager is initialized, throw if not
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('FileLockManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Acquire a file-based lock on a resource
   *
   * @param resource - Resource identifier (will be converted to safe filename)
   * @returns Release function to call when done. Returns true if released cleanly,
   *          false if lock was externally released (stale detection).
   * @throws Error if not initialized, disposed, or timeout
   */
  async acquire(resource: string): Promise<() => Promise<boolean>> {
    // Delegate to acquireWithOptions with default options
    return this.acquireWithOptions(resource, undefined);
  }

  /**
   * Acquire in-process mutex for a resource
   * Returns false if disposed during wait
   */
  private async acquireInProcessMutex(resource: string): Promise<boolean> {
    // Prepare our mutex entry
    let releaseFunc!: () => void;
    const promise = new Promise<void>((resolve) => {
      releaseFunc = resolve;
    });
    const ourMutex: MutexEntry = { promise, release: releaseFunc };

    while (true) {
      // Check disposed first
      if (this.disposed) {
        return false;
      }

      // Try to set our mutex
      if (!this.acquireMutexes.has(resource)) {
        this.acquireMutexes.set(resource, ourMutex);
        return true;
      }

      // Wait for existing mutex holder
      const existingMutex = this.acquireMutexes.get(resource);
      if (existingMutex) {
        await existingMutex.promise;
      }

      // Check disposed after await
      if (this.disposed) {
        return false;
      }

      // Loop back to try again (another waiter may have grabbed it)
    }
  }

  /**
   * Release in-process mutex for a resource
   */
  private releaseInProcessMutex(resource: string): void {
    const mutex = this.acquireMutexes.get(resource);
    if (mutex) {
      this.acquireMutexes.delete(resource);
      mutex.release(); // Wake up waiters
    }
  }

  /**
   * Release a file-based lock
   *
   * Safe to call after dispose() - will return silently.
   *
   * @returns true if lock was released cleanly, false if lock was externally
   *          released (stale detection) - indicating potential critical section compromise
   */
  async release(resource: string): Promise<boolean> {
    // If disposed, return silently - dispose() already cleaned up
    if (this.disposed) {
      this.log('debug', 'Release called on disposed manager', { resource });
      return true; // Consider clean since dispose handled it
    }

    const activeLock = this.activeLocks.get(resource);
    if (!activeLock) {
      this.log('debug', 'Release called for non-held lock', { resource });
      return true; // Already released, consider clean
    }

    try {
      await activeLock.release();
      this.log('debug', 'File lock released', { resource, heldFor: Date.now() - activeLock.acquiredAt });
      return true;
    } catch (error: any) {
      // Check for "lock already released" errors (stale detection, external release)
      const isAlreadyReleased =
        error.code === 'ENOTACQUIRED' ||
        error.message?.includes('already released') ||
        error.message?.includes('not acquired');

      if (isAlreadyReleased) {
        const heldFor = Date.now() - activeLock.acquiredAt;

        // Log warning - this indicates the lock was externally released
        // This could mean our critical section was compromised!
        this.log('warn', 'Lock was externally released (stale detection or external process)', {
          resource,
          heldFor,
          error: error.message,
        });

        // Invoke callback for monitoring/alerting
        if (this.onLockCompromised) {
          try {
            this.onLockCompromised(resource, heldFor);
          } catch {
            // Ignore errors in callback to avoid masking the real issue
          }
        }

        return false; // Lock was compromised
      } else {
        throw error;
      }
    } finally {
      this.activeLocks.delete(resource);
    }
  }

  /**
   * Execute callback with file lock held
   */
  async withLock<T>(
    resource: string,
    callback: () => Promise<T>,
    options?: WithLockOptions
  ): Promise<T> {
    const release = await this.acquireWithOptions(resource, options);
    try {
      return await callback();
    } finally {
      await release();
    }
  }

  /**
   * Acquire with custom options (internal helper)
   */
  private async acquireWithOptions(
    resource: string,
    options?: WithLockOptions
  ): Promise<() => Promise<boolean>> {
    // Check preconditions
    this.ensureInitialized();

    if (this.disposed) {
      throw new Error('FileLockManager has been disposed');
    }

    const lockPath = this.getLockPath(resource);
    const acquireTimeout = options?.acquireTimeout ?? this.acquireTimeout;

    // Acquire in-process mutex first (serializes concurrent acquire from same process)
    const mutexAcquired = await this.acquireInProcessMutex(resource);
    if (!mutexAcquired) {
      throw new Error('FileLockManager has been disposed');
    }

    try {
      // Check disposed again after mutex (may have changed while waiting)
      if (this.disposed) {
        throw new Error('FileLockManager has been disposed');
      }

      // Ensure lock file exists (proper-lockfile requires it)
      await this.ensureLockFile(lockPath);

      this.log('debug', 'Acquiring file lock', { resource, lockPath });

      const release = await lockfile.lock(lockPath, {
        stale: this.staleThreshold,
        retries: {
          retries: Math.ceil(acquireTimeout / this.retryInterval),
          minTimeout: this.retryInterval,
          maxTimeout: this.retryInterval,
        },
      });

      // Check disposed BEFORE storing in activeLocks
      if (this.disposed) {
        try {
          await release();
        } catch {
          // Ignore release errors during dispose
        }
        throw new Error('FileLockManager has been disposed');
      }

      const activeLock: ActiveLock = {
        resource,
        lockPath,
        release,
        acquiredAt: Date.now(),
      };

      this.activeLocks.set(resource, activeLock);

      // C2 FIX: Check disposed AGAIN after adding to activeLocks.
      // In JavaScript's single-threaded model, this is defensive programming.
      // The check above and set() are synchronous, so dispose() cannot interleave.
      // However, if dispose() ran BEFORE our check but AFTER lockfile.lock(),
      // the lock would be in the map after dispose() cleared it.
      // This second check ensures we clean up in that edge case.
      if (this.disposed) {
        // Lock was added after dispose started - clean it up
        this.activeLocks.delete(resource);
        try {
          await release();
        } catch {
          // Ignore release errors during dispose
        }
        throw new Error('FileLockManager has been disposed');
      }

      this.log('debug', 'File lock acquired', { resource, lockPath });

      return async (): Promise<boolean> => {
        return this.release(resource);
      };
    } catch (error: any) {
      if (error.code === 'ELOCKED') {
        this.log('warn', 'File lock acquisition timeout', { resource, timeout: acquireTimeout });
        throw new Error(`Timeout acquiring file lock on '${resource}' after ${acquireTimeout}ms`);
      }
      if (error.code === 'ENOENT') {
        throw new Error(`Lock file was deleted during operation for '${resource}'`);
      }
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        throw new Error(`Permission denied for lock file: ${lockPath}`);
      }
      throw error;
    } finally {
      this.releaseInProcessMutex(resource);
    }
  }

  /**
   * Check if a resource is locked (by any process)
   *
   * @throws Error if not initialized
   */
  async isLocked(resource: string): Promise<boolean> {
    this.ensureInitialized();

    // Check disposed BEFORE creating any files
    if (this.disposed) {
      throw new Error('FileLockManager has been disposed');
    }

    const lockPath = this.getLockPath(resource);

    try {
      // Ensure lock file exists
      await this.ensureLockFile(lockPath);
      return await lockfile.check(lockPath, { stale: this.staleThreshold });
    } catch {
      return false;
    }
  }

  /**
   * Check if this process holds the lock
   */
  isHeldByUs(resource: string): boolean {
    return this.activeLocks.has(resource);
  }

  /**
   * Dispose and release all held locks
   *
   * Order of operations (important for correctness):
   * 1. Set disposed flag (prevents new acquires)
   * 2. Release all file locks FIRST (frees resources for other processes)
   * 3. Release all in-process mutexes LAST (wakes up waiters who will see disposed=true)
   *
   * This order ensures that when in-process waiters wake up:
   * - They will see disposed=true and exit gracefully
   * - File locks are already released, so other processes can acquire
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.log('debug', 'Disposing FileLockManager', { activeLocks: this.activeLocks.size });

    // Step 1: Release all active file locks FIRST (with timeout)
    const releases = Array.from(this.activeLocks.values()).map(async (activeLock) => {
      try {
        await activeLock.release();
      } catch (error: any) {
        this.log('warn', 'Error releasing lock during dispose', {
          resource: activeLock.resource,
          error: error.message,
        });
      }
    });

    // Use disposeTimeout to prevent hanging forever
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        if (this.activeLocks.size > 0) {
          this.log('warn', 'Dispose timeout reached, some locks may not be released cleanly', {
            timeout: this.disposeTimeout,
            remainingLocks: this.activeLocks.size,
          });
        }
        resolve();
      }, this.disposeTimeout);
    });

    await Promise.race([Promise.all(releases), timeoutPromise]);

    // Clear timeout to prevent timer leak
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    this.activeLocks.clear();

    // Step 2: Release all in-process mutexes LAST (unblock waiters)
    // Waiters will wake up and see disposed=true, then exit gracefully
    for (const [_resource, mutex] of this.acquireMutexes) {
      mutex.release();
    }
    this.acquireMutexes.clear();
  }

  /**
   * Check if disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get number of active locks
   */
  getActiveLocksCount(): number {
    return this.activeLocks.size;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Convert resource name to safe lock file path
   *
   * Uses SHA256 hash to ensure unique file names for different resources.
   * This prevents collision between resources like 'plan:123', 'plan_123', 'plan/123'
   * which would all map to 'plan_123' with naive sanitization.
   */
  private getLockPath(resource: string): string {
    // Use SHA256 hash for unique, safe filenames
    // Take first 32 chars (128 bits) which is plenty for uniqueness
    const hash = createHash('sha256').update(resource).digest('hex').slice(0, 32);
    return path.join(this.lockDir, `${hash}.lock`);
  }

  /**
   * Ensure lock file exists (proper-lockfile requires it)
   *
   * Uses exclusive create (wx flag) to avoid TOCTOU race condition.
   */
  private async ensureLockFile(lockPath: string): Promise<void> {
    try {
      // Use 'wx' flag: create only if not exists (atomic)
      await fs.writeFile(lockPath, '', { flag: 'wx' });
    } catch (error: any) {
      // EEXIST is OK - file already exists
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
}
