/**
 * IndexManager - Fast entity lookup with caching
 *
 * Manages index metadata for file-based storage:
 * - In-memory caching with TTL
 * - Atomic writes using shared file-utils.ts
 * - Query operations (find, findOne, etc.)
 * - Cache invalidation strategies
 */

import type {
  IndexMetadata,
  IndexFile,
  CacheEntry,
  CacheOptions,
} from './types.js';
import { DEFAULT_CACHE_OPTIONS } from './types.js';
import { atomicWriteJSON, loadJSON } from './file-utils.js';

/**
 * IndexManager<TMetadata>
 *
 * Generic index manager for storing and querying entity metadata
 */
export class IndexManager<TMetadata extends IndexMetadata = IndexMetadata> {
  private readonly indexPath: string;
  private readonly cache = new Map<string, CacheEntry<TMetadata>>();
  private readonly cacheOptions: CacheOptions;
  private readonly inMemoryIndex = new Map<string, TMetadata>();
  private isDirty = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    indexPath: string,
    cacheOptions?: Partial<CacheOptions>
  ) {
    this.indexPath = indexPath;
    // Use DEFAULT_CACHE_OPTIONS from types.ts as single source of truth
    this.cacheOptions = {
      ...DEFAULT_CACHE_OPTIONS,
      ...cacheOptions,
    };
  }

  /**
   * Initialize index from disk or create new one
   *
   * Uses shared loadJSON from file-utils.ts.
   */
  public async initialize(): Promise<void> {
    try {
      const indexFile = await loadJSON<IndexFile<TMetadata>>(this.indexPath);

      // Load entries into memory
      for (const entry of indexFile.entries) {
        this.inMemoryIndex.set(entry.id, entry);
      }
    } catch (error) {
      // Handle file not found - create empty index
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        await this.saveIndexFile();
      } else {
        throw error;
      }
    }
  }

  /**
   * Add new entry to index
   */
  public async add(entry: TMetadata): Promise<void> {
    this.inMemoryIndex.set(entry.id, entry);
    this.isDirty = true;
    this.invalidateCache(entry.id);
    await this.saveIndexFile();
  }

  /**
   * Get entry by ID
   */
  public get(id: string): Promise<TMetadata | undefined> {
    // Check cache first
    if (this.cacheOptions.enabled) {
      const cached = this.getCached(id);
      if (cached !== undefined) {
        return Promise.resolve(cached);
      }
    }

    const entry = this.inMemoryIndex.get(id);

    // Cache the result
    if (entry && this.cacheOptions.enabled) {
      this.setCached(id, entry);
    }

    return Promise.resolve(entry);
  }

  /**
   * Update existing entry
   */
  public async update(entry: TMetadata): Promise<void> {
    if (!this.inMemoryIndex.has(entry.id)) {
      throw new Error(`Entry with ID '${entry.id}' not found`);
    }

    this.inMemoryIndex.set(entry.id, entry);
    this.isDirty = true;
    this.invalidateCache(entry.id);
    await this.saveIndexFile();
  }

  /**
   * Delete entry by ID
   */
  public async delete(id: string): Promise<void> {
    this.inMemoryIndex.delete(id);
    this.isDirty = true;
    this.invalidateCache(id);
    await this.saveIndexFile();
  }

  /**
   * Get all entries
   */
  public getAll(): Promise<TMetadata[]> {
    return Promise.resolve(Array.from(this.inMemoryIndex.values()));
  }

  /**
   * Clear all entries
   */
  public async clear(): Promise<void> {
    this.inMemoryIndex.clear();
    this.cache.clear();
    this.isDirty = true;
    await this.saveIndexFile();
  }

  /**
   * Find entries matching predicate
   */
  public find(predicate: (entry: TMetadata) => boolean): Promise<TMetadata[]> {
    const results: TMetadata[] = [];
    for (const entry of this.inMemoryIndex.values()) {
      if (predicate(entry)) {
        results.push(entry);
      }
    }
    return Promise.resolve(results);
  }

  /**
   * Find first entry matching predicate
   */
  public findOne(predicate: (entry: TMetadata) => boolean): Promise<TMetadata | undefined> {
    for (const entry of this.inMemoryIndex.values()) {
      if (predicate(entry)) {
        return Promise.resolve(entry);
      }
    }
    return Promise.resolve(undefined);
  }

  /**
   * Check if entry exists
   */
  public has(id: string): Promise<boolean> {
    return Promise.resolve(this.inMemoryIndex.has(id));
  }

  /**
   * Get index size
   */
  public size(): Promise<number> {
    return Promise.resolve(this.inMemoryIndex.size);
  }

  /**
   * Save entire index (for batch updates)
   */
  public async saveIndex(entries: TMetadata[]): Promise<void> {
    this.inMemoryIndex.clear();
    for (const entry of entries) {
      this.inMemoryIndex.set(entry.id, entry);
    }
    this.cache.clear();
    this.isDirty = true;
    await this.saveIndexFile();
  }

  /**
   * Rebuild index (refresh from source)
   */
  public async rebuild(): Promise<void> {
    // Rebuild keeps existing entries and forces save
    this.isDirty = true;
    await this.saveIndexFile();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Save index file to disk atomically (with queue to prevent concurrent writes)
   *
   * Delegates to shared atomicWriteJSON from file-utils.ts for Windows compatibility.
   */
  private async saveIndexFile(): Promise<void> {
    // Queue writes to prevent concurrent atomicWriteJSON calls
    this.writeQueue = this.writeQueue.then(async () => {
      const indexFile: IndexFile<TMetadata> = {
        version: 1,
        indexType: 'entity-index',
        lastUpdated: new Date().toISOString(),
        entries: Array.from(this.inMemoryIndex.values()),
        stats: {
          totalEntries: this.inMemoryIndex.size,
          lastRebuild: new Date().toISOString(),
        },
      };

      await atomicWriteJSON(this.indexPath, indexFile);
      this.isDirty = false;
    });

    await this.writeQueue;
  }

  /**
   * Get cached entry
   */
  private getCached(id: string): TMetadata | undefined {
    const cached = this.cache.get(id);
    if (!cached) {
      return undefined;
    }

    // Check TTL
    if (this.cacheOptions.invalidation === 'ttl' && this.cacheOptions.ttl > 0) {
      const now = Date.now();
      const age = now - cached.cachedAt;
      if (age > this.cacheOptions.ttl) {
        this.cache.delete(id);
        return undefined;
      }
    }

    return cached.value;
  }

  /**
   * Set cached entry
   */
  private setCached(id: string, entry: TMetadata): void {
    // Enforce max cache size (LRU eviction)
    if (this.cache.size >= this.cacheOptions.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined && firstKey !== '') {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(id, {
      value: entry,
      cachedAt: Date.now(),
      ttl: this.cacheOptions.ttl,
      version: entry.version,
    });
  }

  /**
   * Invalidate cache entry
   */
  private invalidateCache(id: string): void {
    this.cache.delete(id);
  }
}
