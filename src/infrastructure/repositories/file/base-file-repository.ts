/**
 * BaseFileRepository - Abstract base class for file-based repositories
 *
 * Provides common functionality shared across all file repositories:
 * - Atomic JSON writes with graceful-fs (Windows EPERM/EBUSY handling)
 * - JSON file loading
 * - LRU cache operations
 * - Lazy initialization pattern
 *
 * This eliminates code duplication across FileRepository, FileLinkRepository,
 * and FilePlanRepository while ensuring consistent behavior (especially
 * gracefulRename for Windows compatibility).
 */

import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import * as util from 'util';
import gracefulFs from 'graceful-fs';
import { DEFAULT_CACHE_OPTIONS, type CacheOptions } from './types.js';

// graceful-fs provides retry logic for Windows file locking issues (EPERM/EBUSY/EACCES)
const gracefulRename = util.promisify(gracefulFs.rename);

/**
 * Abstract base class for file-based repositories
 *
 * Subclasses must implement:
 * - initialize(): Setup repository-specific directories and indexes
 */
export abstract class BaseFileRepository {
  protected initialized = false;
  protected readonly cacheOptions: Required<CacheOptions>;

  constructor(
    protected readonly baseDir: string,
    cacheOptions?: Partial<CacheOptions>
  ) {
    // DEFAULT_CACHE_OPTIONS from types.ts provides all required fields
    this.cacheOptions = {
      ...DEFAULT_CACHE_OPTIONS,
      ...cacheOptions,
    } as Required<CacheOptions>;
  }

  // ============================================================================
  // Abstract Methods
  // ============================================================================

  /**
   * Initialize repository
   * Must be implemented by subclasses to setup directories, indexes, etc.
   */
  abstract initialize(): Promise<void>;

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Ensure repository is initialized (lazy initialization pattern)
   * Safe to call multiple times - will only initialize once
   */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Mark repository as initialized
   * Should be called by subclass initialize() after setup is complete
   */
  protected markInitialized(): void {
    this.initialized = true;
  }

  /**
   * Check if repository is initialized
   */
  protected isInitializedState(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // Atomic File Operations
  // ============================================================================

  /**
   * Write JSON data to file atomically
   *
   * Uses temp file + rename pattern for crash safety:
   * 1. Write to temp file
   * 2. Verify JSON is valid
   * 3. Atomic rename to target (using graceful-fs for Windows compatibility)
   *
   * WINDOWS EPERM ISSUE:
   * On Windows, fs.rename() often fails with "EPERM: operation not permitted" when:
   * - Windows Defender is scanning the file
   * - Windows Search Indexer has the file open
   * - IDE (VS Code, etc.) holds file handles
   *
   * We use graceful-fs which provides retry logic (up to 60s) for these errors.
   *
   * @param filePath - Target file path
   * @param data - Data to write (will be JSON.stringify'd)
   */
  protected async atomicWriteJSON(filePath: string, data: unknown): Promise<void> {
    const tmpPath = `${filePath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;

    try {
      // Write to temp file
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');

      // Verify JSON is valid before committing
      const written = await fs.readFile(tmpPath, 'utf-8');
      JSON.parse(written);

      // Atomic rename using graceful-fs (retries on EPERM/EBUSY/EACCES)
      await gracefulRename(tmpPath, filePath);
    } catch (error) {
      // Cleanup temp file on error
      await fs.unlink(tmpPath).catch(() => {});
      throw error;
    }
  }

  /**
   * Load JSON data from file
   *
   * @param filePath - File path to read
   * @returns Parsed JSON data
   * @throws If file doesn't exist or JSON is invalid
   */
  protected async loadJSON<T>(filePath: string): Promise<T> {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  }

  // ============================================================================
  // LRU Cache Operations
  // ============================================================================

  /**
   * Get value from cache
   *
   * @param cache - Cache Map instance
   * @param key - Cache key
   * @returns Cached value or undefined if not found
   */
  protected cacheGet<T>(cache: Map<string, T>, key: string): T | undefined {
    return cache.get(key);
  }

  /**
   * Set value in cache with LRU eviction
   *
   * If cache is full (at maxSize), removes oldest entry before adding new one.
   * This prevents memory leaks from unbounded cache growth.
   *
   * @param cache - Cache Map instance
   * @param key - Cache key
   * @param value - Value to cache
   */
  protected cacheSet<T>(cache: Map<string, T>, key: string, value: T): void {
    // LRU eviction - remove oldest entry if cache is full
    if (cache.size >= this.cacheOptions.maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
      }
    }
    cache.set(key, value);
  }

  /**
   * Invalidate (remove) cache entry
   *
   * @param cache - Cache Map instance
   * @param key - Cache key to remove
   */
  protected cacheInvalidate<T>(cache: Map<string, T>, key: string): void {
    cache.delete(key);
  }

  /**
   * Clear all entries from cache
   *
   * @param cache - Cache Map instance
   */
  protected cacheClear<T>(cache: Map<string, T>): void {
    cache.clear();
  }
}
