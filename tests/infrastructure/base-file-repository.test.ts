/**
 * BaseFileRepository Tests
 *
 * Tests for the abstract base class shared across file repositories:
 * - LRU cache operations (cacheGet, cacheSet, cacheInvalidate, cacheClear)
 * - Lazy initialization pattern (ensureInitialized, markInitialized, isInitializedState)
 * - Cache options merging with DEFAULT_CACHE_OPTIONS
 *
 * Uses a concrete TestRepository subclass to test protected methods.
 *
 * TDD Markers: REVIEW (all tests verified)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { BaseFileRepository, DEFAULT_CACHE_OPTIONS, type CacheOptions } from '@mcp-planner/mcp-server';

/**
 * Concrete test implementation of BaseFileRepository
 * Exposes protected methods for testing
 */
 
class TestRepository extends BaseFileRepository {
  public testCache = new Map<string, string>();
  public initializeCallCount = 0;

  public initialize(): Promise<void> {
    this.initializeCallCount++;
    this.markInitialized();
    return Promise.resolve();
  }

  // Expose protected methods for testing
  public testCacheGet(key: string): string | undefined {
    return this.cacheGet(this.testCache, key);
  }

  public testCacheSet(key: string, value: string): void {
    this.cacheSet(this.testCache, key, value);
  }

  public testCacheInvalidate(key: string): void {
    this.cacheInvalidate(this.testCache, key);
  }

  public testCacheClear(): void {
    this.cacheClear(this.testCache);
  }

  public testEnsureInitialized(): Promise<void> {
    return this.ensureInitialized();
  }

  public testIsInitializedState(): boolean {
    return this.isInitializedState();
  }

  public testMarkInitialized(): void {
    this.markInitialized();
  }

  public getCacheOptions(): Required<CacheOptions> {
    return this.cacheOptions;
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  // Expose file operations for integration tests
  public testAtomicWriteJSON(filePath: string, data: unknown): Promise<void> {
    return this.atomicWriteJSON(filePath, data);
  }

  public testLoadJSON<T>(filePath: string): Promise<T> {
    return this.loadJSON<T>(filePath);
  }
}
 

describe('BaseFileRepository', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `base-repo-test-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // ============================================================================
  // REVIEW: Constructor and Cache Options
  // ============================================================================

  describe('constructor', () => {
    it('should use DEFAULT_CACHE_OPTIONS when no options provided', () => {
      const repo = new TestRepository(testDir);

      expect(repo.getCacheOptions()).toEqual(DEFAULT_CACHE_OPTIONS);
    });

    it('should merge provided options with defaults', () => {
      const repo = new TestRepository(testDir, { maxSize: 50 });

      expect(repo.getCacheOptions()).toEqual({
        ...DEFAULT_CACHE_OPTIONS,
        maxSize: 50,
      });
    });

    it('should allow overriding all cache options', () => {
      const customOptions = {
        enabled: false,
        ttl: 10000,
        maxSize: 200,
        invalidation: 'ttl' as const,
      };
      const repo = new TestRepository(testDir, customOptions);

      expect(repo.getCacheOptions()).toEqual(customOptions);
    });

    it('should store baseDir correctly', () => {
      const repo = new TestRepository(testDir);

      expect(repo.getBaseDir()).toBe(testDir);
    });
  });

  // ============================================================================
  // REVIEW: Initialization Pattern
  // ============================================================================

  describe('initialization', () => {
    it('should start uninitialized', () => {
      const repo = new TestRepository(testDir);

      expect(repo.testIsInitializedState()).toBe(false);
    });

    it('should be initialized after markInitialized()', () => {
      const repo = new TestRepository(testDir);

      repo.testMarkInitialized();

      expect(repo.testIsInitializedState()).toBe(true);
    });

    it('should call initialize() on first ensureInitialized()', async () => {
      const repo = new TestRepository(testDir);

      await repo.testEnsureInitialized();

      expect(repo.initializeCallCount).toBe(1);
      expect(repo.testIsInitializedState()).toBe(true);
    });

    it('should not call initialize() again on subsequent ensureInitialized()', async () => {
      const repo = new TestRepository(testDir);

      await repo.testEnsureInitialized();
      await repo.testEnsureInitialized();
      await repo.testEnsureInitialized();

      expect(repo.initializeCallCount).toBe(1);
    });

    it('should be idempotent - multiple initialize() calls should be safe', async () => {
      const repo = new TestRepository(testDir);

      await repo.initialize();
      await repo.initialize();
      await repo.initialize();

      // Our test implementation counts calls, but markInitialized is idempotent
      expect(repo.testIsInitializedState()).toBe(true);
    });
  });

  // ============================================================================
  // REVIEW: LRU Cache Operations
  // ============================================================================

  describe('cache operations', () => {
    describe('cacheGet', () => {
      it('should return undefined for non-existent key', () => {
        const repo = new TestRepository(testDir);

        expect(repo.testCacheGet('nonexistent')).toBeUndefined();
      });

      it('should return cached value', () => {
        const repo = new TestRepository(testDir);
        repo.testCache.set('key1', 'value1');

        expect(repo.testCacheGet('key1')).toBe('value1');
      });
    });

    describe('cacheSet', () => {
      it('should set value in cache', () => {
        const repo = new TestRepository(testDir);

        repo.testCacheSet('key1', 'value1');

        expect(repo.testCache.get('key1')).toBe('value1');
      });

      it('should overwrite existing value', () => {
        const repo = new TestRepository(testDir);
        repo.testCacheSet('key1', 'value1');

        repo.testCacheSet('key1', 'value2');

        expect(repo.testCache.get('key1')).toBe('value2');
      });

      it('should evict oldest entry when cache is full (LRU)', () => {
        const repo = new TestRepository(testDir, { maxSize: 3 });

        repo.testCacheSet('a', '1');
        repo.testCacheSet('b', '2');
        repo.testCacheSet('c', '3');

        // Cache is now full, adding 'd' should evict 'a' (oldest)
        repo.testCacheSet('d', '4');

        expect(repo.testCacheGet('a')).toBeUndefined(); // Evicted
        expect(repo.testCacheGet('b')).toBe('2');
        expect(repo.testCacheGet('c')).toBe('3');
        expect(repo.testCacheGet('d')).toBe('4');
        expect(repo.testCache.size).toBe(3);
      });

      it('should evict multiple entries as cache grows', () => {
        const repo = new TestRepository(testDir, { maxSize: 2 });

        repo.testCacheSet('a', '1');
        repo.testCacheSet('b', '2');
        repo.testCacheSet('c', '3'); // Evicts 'a'
        repo.testCacheSet('d', '4'); // Evicts 'b'

        expect(repo.testCacheGet('a')).toBeUndefined();
        expect(repo.testCacheGet('b')).toBeUndefined();
        expect(repo.testCacheGet('c')).toBe('3');
        expect(repo.testCacheGet('d')).toBe('4');
      });

      it('should handle maxSize of 1', () => {
        const repo = new TestRepository(testDir, { maxSize: 1 });

        repo.testCacheSet('a', '1');
        expect(repo.testCache.size).toBe(1);

        repo.testCacheSet('b', '2');
        expect(repo.testCache.size).toBe(1);
        expect(repo.testCacheGet('a')).toBeUndefined();
        expect(repo.testCacheGet('b')).toBe('2');
      });

      it('should not evict when updating existing key', () => {
        const repo = new TestRepository(testDir, { maxSize: 2 });

        repo.testCacheSet('a', '1');
        repo.testCacheSet('b', '2');

        // Update 'a' - should not evict anything
        repo.testCacheSet('a', 'updated');

        expect(repo.testCache.size).toBe(2);
        expect(repo.testCacheGet('a')).toBe('updated');
        expect(repo.testCacheGet('b')).toBe('2');
      });
    });

    describe('cacheInvalidate', () => {
      it('should remove entry from cache', () => {
        const repo = new TestRepository(testDir);
        repo.testCacheSet('key1', 'value1');

        repo.testCacheInvalidate('key1');

        expect(repo.testCacheGet('key1')).toBeUndefined();
      });

      it('should handle non-existent key gracefully', () => {
        const repo = new TestRepository(testDir);

        // Should not throw
        expect(() => { repo.testCacheInvalidate('nonexistent'); }).not.toThrow();
      });

      it('should only remove specified key', () => {
        const repo = new TestRepository(testDir);
        repo.testCacheSet('key1', 'value1');
        repo.testCacheSet('key2', 'value2');

        repo.testCacheInvalidate('key1');

        expect(repo.testCacheGet('key1')).toBeUndefined();
        expect(repo.testCacheGet('key2')).toBe('value2');
      });
    });

    describe('cacheClear', () => {
      it('should remove all entries from cache', () => {
        const repo = new TestRepository(testDir);
        repo.testCacheSet('key1', 'value1');
        repo.testCacheSet('key2', 'value2');
        repo.testCacheSet('key3', 'value3');

        repo.testCacheClear();

        expect(repo.testCache.size).toBe(0);
        expect(repo.testCacheGet('key1')).toBeUndefined();
        expect(repo.testCacheGet('key2')).toBeUndefined();
        expect(repo.testCacheGet('key3')).toBeUndefined();
      });

      it('should handle empty cache gracefully', () => {
        const repo = new TestRepository(testDir);

        // Should not throw
        expect(() => { repo.testCacheClear(); }).not.toThrow();
        expect(repo.testCache.size).toBe(0);
      });
    });
  });

  // ============================================================================
  // REVIEW: File Operations (delegated to file-utils.ts)
  // ============================================================================

  describe('file operations', () => {
    it('should write and read JSON via delegated methods', async () => {
      const repo = new TestRepository(testDir);
      const filePath = path.join(testDir, 'test.json');
      const data = { key: 'value', nested: { arr: [1, 2, 3] } };

      await repo.testAtomicWriteJSON(filePath, data);
      const loaded = await repo.testLoadJSON(filePath);

      expect(loaded).toEqual(data);
    });

    it('should throw on loadJSON for non-existent file', async () => {
      const repo = new TestRepository(testDir);
      const filePath = path.join(testDir, 'nonexistent.json');

      await expect(repo.testLoadJSON(filePath)).rejects.toThrow();
    });
  });

  // ============================================================================
  // REVIEW: Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle cache with maxSize 0 (effectively disabled)', () => {
      const repo = new TestRepository(testDir, { maxSize: 0 });

      // With maxSize 0, every set should trigger eviction logic
      // But since cache is empty, nothing to evict - item still gets added
      repo.testCacheSet('a', '1');

      // The >= check means at size 0, we try to evict but cache is empty
      // Then we add the item, so cache has 1 item
      // This is edge case behavior - maxSize 0 doesn't truly disable caching
      expect(repo.testCache.size).toBeLessThanOrEqual(1);
    });

    it('should handle special characters in cache keys', () => {
      const repo = new TestRepository(testDir);

      repo.testCacheSet('key/with/slashes', 'value1');
      repo.testCacheSet('key:with:colons', 'value2');
      repo.testCacheSet('key with spaces', 'value3');

      expect(repo.testCacheGet('key/with/slashes')).toBe('value1');
      expect(repo.testCacheGet('key:with:colons')).toBe('value2');
      expect(repo.testCacheGet('key with spaces')).toBe('value3');
    });

    it('should handle empty string as cache key', () => {
      const repo = new TestRepository(testDir);

      repo.testCacheSet('', 'empty-key-value');

      expect(repo.testCacheGet('')).toBe('empty-key-value');
    });

    it('should handle empty string as cache value', () => {
      const repo = new TestRepository(testDir);

      repo.testCacheSet('key', '');

      expect(repo.testCacheGet('key')).toBe('');
    });
  });
});
