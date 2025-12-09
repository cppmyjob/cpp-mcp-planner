/**
 * FileLockManager - Cross-process file locking using proper-lockfile
 *
 * Provides file-based locking for multi-process safety:
 * - Uses proper-lockfile for cross-process synchronization
 * - Supports lock timeouts and retries
 * - Automatic stale lock detection and recovery
 * - Integrates with LockManager for in-process + cross-process safety
 */

import lockfile from 'proper-lockfile';
import * as fs from 'fs/promises';
import * as path from 'path';
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
   * If lock file is older than this, it's considered stale
   * @default 10000
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
   * @default 'none'
   */
  logLevel?: LogLevel;
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
  private logger?: LockLogger;
  private logLevel: LogLevel;

  /**
   * Active locks held by this process
   */
  private activeLocks: Map<string, ActiveLock> = new Map();

  /**
   * Flag indicating if manager is disposed
   */
  private disposed: boolean = false;

  constructor(baseDir: string, options?: FileLockManagerOptions) {
    this.baseDir = baseDir;
    this.lockDir = options?.lockDir ?? path.join(baseDir, '.locks');
    this.acquireTimeout = options?.acquireTimeout ?? 10000;
    this.retryInterval = options?.retryInterval ?? 100;
    this.staleThreshold = options?.staleThreshold ?? 10000;
    this.logger = options?.logger;
    this.logLevel = options?.logLevel ?? 'none';
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
   * Initialize the lock directory
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.lockDir, { recursive: true });
    this.log('debug', 'FileLockManager initialized', { lockDir: this.lockDir });
  }

  /**
   * Acquire a file-based lock on a resource
   *
   * @param resource - Resource identifier (will be converted to safe filename)
   * @returns Release function to call when done
   */
  async acquire(resource: string): Promise<() => Promise<void>> {
    if (this.disposed) {
      throw new Error('FileLockManager has been disposed');
    }

    const lockPath = this.getLockPath(resource);

    // Ensure lock file exists (proper-lockfile requires it)
    await this.ensureLockFile(lockPath);

    this.log('debug', 'Acquiring file lock', { resource, lockPath });

    try {
      const release = await lockfile.lock(lockPath, {
        stale: this.staleThreshold,
        retries: {
          retries: Math.ceil(this.acquireTimeout / this.retryInterval),
          minTimeout: this.retryInterval,
          maxTimeout: this.retryInterval,
        },
      });

      const activeLock: ActiveLock = {
        resource,
        lockPath,
        release,
        acquiredAt: Date.now(),
      };

      this.activeLocks.set(resource, activeLock);

      this.log('debug', 'File lock acquired', { resource, lockPath });

      // Return wrapped release function
      return async () => {
        await this.release(resource);
      };
    } catch (error: any) {
      if (error.code === 'ELOCKED') {
        this.log('warn', 'File lock acquisition timeout', { resource, timeout: this.acquireTimeout });
        throw new Error(`Timeout acquiring file lock on '${resource}' after ${this.acquireTimeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Release a file-based lock
   */
  async release(resource: string): Promise<void> {
    const activeLock = this.activeLocks.get(resource);
    if (!activeLock) {
      this.log('debug', 'Release called for non-held lock', { resource });
      return; // Already released
    }

    try {
      await activeLock.release();
      this.log('debug', 'File lock released', { resource, heldFor: Date.now() - activeLock.acquiredAt });
    } catch (error: any) {
      // Ignore "not locked" errors - may have been released by stale detection
      if (error.code !== 'ENOTACQUIRED') {
        throw error;
      }
    } finally {
      this.activeLocks.delete(resource);
    }
  }

  /**
   * Execute callback with file lock held
   */
  async withLock<T>(resource: string, callback: () => Promise<T>): Promise<T> {
    const release = await this.acquire(resource);
    try {
      return await callback();
    } finally {
      await release();
    }
  }

  /**
   * Check if a resource is locked (by any process)
   */
  async isLocked(resource: string): Promise<boolean> {
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
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.log('debug', 'Disposing FileLockManager', { activeLocks: this.activeLocks.size });

    // Release all active locks
    const releases = Array.from(this.activeLocks.keys()).map((resource) =>
      this.release(resource).catch((error) => {
        this.log('warn', 'Error releasing lock during dispose', { resource, error: error.message });
      })
    );

    await Promise.all(releases);
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
   */
  private getLockPath(resource: string): string {
    // Convert resource to safe filename (replace unsafe chars)
    const safeName = resource.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.lockDir, `${safeName}.lock`);
  }

  /**
   * Ensure lock file exists (proper-lockfile requires it)
   */
  private async ensureLockFile(lockPath: string): Promise<void> {
    try {
      await fs.access(lockPath);
    } catch {
      // Create empty lock file
      await fs.writeFile(lockPath, '', 'utf-8');
    }
  }
}
