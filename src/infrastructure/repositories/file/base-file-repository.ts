/**
 * BaseFileRepository - Abstract base class for file-based repositories
 *
 * Provides common functionality shared across all file repositories:
 * - Atomic JSON writes with write-file-atomic (Windows EPERM/EBUSY handling)
 * - JSON file loading
 * - LRU cache operations
 * - Lazy initialization pattern
 *
 * This eliminates code duplication across FileRepository, FileLinkRepository,
 * and FilePlanRepository while ensuring consistent behavior.
 */

import { DEFAULT_CACHE_OPTIONS, type CacheOptions } from './types.js';
import { atomicWriteJSON as sharedAtomicWriteJSON, loadJSON as sharedLoadJSON } from './file-utils.js';

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
    // DEFAULT_CACHE_OPTIONS provides all required fields, spread order ensures
    // user options override defaults while maintaining complete Required<CacheOptions>
    this.cacheOptions = {
      ...DEFAULT_CACHE_OPTIONS,
      ...cacheOptions,
    };
  }

  // ============================================================================
  // Abstract Methods
  // ============================================================================

  /**
   * Initialize repository
   * Must be implemented by subclasses to setup directories, indexes, etc.
   */
  public abstract initialize(): Promise<void>;

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
  // Atomic File Operations (delegates to shared file-utils.ts)
  // ============================================================================

  /**
   * Write JSON data to file atomically
   *
   * Delegates to shared utility in file-utils.ts which handles:
   * - Temp file + rename pattern for crash safety
   * - Windows EPERM/EBUSY handling via write-file-atomic
   *
   * @param filePath - Target file path
   * @param data - Data to write (will be JSON.stringify'd)
   */
  protected async atomicWriteJSON(filePath: string, data: unknown): Promise<void> {
    return sharedAtomicWriteJSON(filePath, data);
  }

  /**
   * Load JSON data from file
   *
   * Delegates to shared utility in file-utils.ts.
   *
   * @param filePath - File path to read
   * @returns Parsed JSON data
   * @throws If file doesn't exist or JSON is invalid
   */
  protected async loadJSON<T>(filePath: string): Promise<T> {
    return sharedLoadJSON<T>(filePath);
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
      if (firstKey !== undefined && firstKey !== '') {
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
