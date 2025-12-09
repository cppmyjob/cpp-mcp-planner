/**
 * IndexManager - Fast entity lookup with caching
 *
 * Manages index metadata for file-based storage:
 * - In-memory caching with TTL
 * - Atomic writes using graceful-fs
 * - Query operations (find, findOne, etc.)
 * - Cache invalidation strategies
 */

import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import * as util from 'util';
import gracefulFs from 'graceful-fs';
import type {
  IndexMetadata,
  IndexFile,
  CacheEntry,
  CacheOptions,
  DEFAULT_CACHE_OPTIONS,
} from './types.js';

const gracefulRename = util.promisify(gracefulFs.rename);

/**
 * IndexManager<TMetadata>
 *
 * Generic index manager for storing and querying entity metadata
 */
export class IndexManager<TMetadata extends IndexMetadata = IndexMetadata> {
  private indexPath: string;
  private cache: Map<string, CacheEntry<TMetadata>> = new Map();
  private cacheOptions: CacheOptions;
  private inMemoryIndex: Map<string, TMetadata> = new Map();
  private isDirty: boolean = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    indexPath: string,
    cacheOptions?: Partial<CacheOptions>
  ) {
    this.indexPath = indexPath;
    this.cacheOptions = {
      enabled: cacheOptions?.enabled ?? true,
      ttl: cacheOptions?.ttl ?? 5000,
      maxSize: cacheOptions?.maxSize ?? 100,
      invalidation: cacheOptions?.invalidation ?? 'version',
    };
  }

  /**
   * Initialize index from disk or create new one
   */
  async initialize(): Promise<void> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      const indexFile: IndexFile<TMetadata> = JSON.parse(content);

      // Load entries into memory
      for (const entry of indexFile.entries) {
        this.inMemoryIndex.set(entry.id, entry);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Index doesn't exist, create empty one
        await this.saveIndexFile();
      } else {
        throw error;
      }
    }
  }

  /**
   * Add new entry to index
   */
  async add(entry: TMetadata): Promise<void> {
    this.inMemoryIndex.set(entry.id, entry);
    this.isDirty = true;
    this.invalidateCache(entry.id);
    await this.saveIndexFile();
  }

  /**
   * Get entry by ID
   */
  async get(id: string): Promise<TMetadata | undefined> {
    // Check cache first
    if (this.cacheOptions.enabled) {
      const cached = this.getCached(id);
      if (cached !== undefined) {
        return cached;
      }
    }

    const entry = this.inMemoryIndex.get(id);

    // Cache the result
    if (entry && this.cacheOptions.enabled) {
      this.setCached(id, entry);
    }

    return entry;
  }

  /**
   * Update existing entry
   */
  async update(entry: TMetadata): Promise<void> {
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
  async delete(id: string): Promise<void> {
    this.inMemoryIndex.delete(id);
    this.isDirty = true;
    this.invalidateCache(id);
    await this.saveIndexFile();
  }

  /**
   * Get all entries
   */
  async getAll(): Promise<TMetadata[]> {
    return Array.from(this.inMemoryIndex.values());
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    this.inMemoryIndex.clear();
    this.cache.clear();
    this.isDirty = true;
    await this.saveIndexFile();
  }

  /**
   * Find entries matching predicate
   */
  async find(predicate: (entry: TMetadata) => boolean): Promise<TMetadata[]> {
    const results: TMetadata[] = [];
    for (const entry of this.inMemoryIndex.values()) {
      if (predicate(entry)) {
        results.push(entry);
      }
    }
    return results;
  }

  /**
   * Find first entry matching predicate
   */
  async findOne(predicate: (entry: TMetadata) => boolean): Promise<TMetadata | undefined> {
    for (const entry of this.inMemoryIndex.values()) {
      if (predicate(entry)) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * Check if entry exists
   */
  async has(id: string): Promise<boolean> {
    return this.inMemoryIndex.has(id);
  }

  /**
   * Get index size
   */
  async size(): Promise<number> {
    return this.inMemoryIndex.size;
  }

  /**
   * Save entire index (for batch updates)
   */
  async saveIndex(entries: TMetadata[]): Promise<void> {
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
  async rebuild(): Promise<void> {
    // Rebuild keeps existing entries and forces save
    this.isDirty = true;
    await this.saveIndexFile();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Save index file to disk atomically (with queue to prevent concurrent writes)
   */
  private async saveIndexFile(): Promise<void> {
    // Queue writes to prevent concurrent atomicWrite calls
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

      await this.atomicWrite(this.indexPath, indexFile);
      this.isDirty = false;
    });

    await this.writeQueue;
  }

  /**
   * Atomic write to prevent data corruption (from file-storage.ts)
   */
  private async atomicWrite(filePath: string, data: unknown): Promise<void> {
    const tmpPath = `${filePath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;

    try {
      // Write to temp file
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');

      // Verify JSON is valid before committing
      const written = await fs.readFile(tmpPath, 'utf-8');
      JSON.parse(written);

      // Atomic rename using graceful-fs
      await gracefulRename(tmpPath, filePath);
    } catch (error) {
      // Cleanup temp file on error
      await fs.unlink(tmpPath).catch(() => {});
      throw error;
    }
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
      if (firstKey) {
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
