import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IndexManager, type IndexMetadata, type LinkIndexMetadata } from '@mcp-planner/core';

describe('IndexManager', () => {
  const testDir = path.join(process.cwd(), '.test-data', 'index-manager');
  const indexPath = path.join(testDir, 'test-index.json');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('RED: Basic Operations', () => {
    it('should create IndexManager instance', () => {
      const manager = new IndexManager<IndexMetadata>(indexPath);
      expect(manager).toBeDefined();
    });

    it('should initialize empty index', async () => {
      const manager = new IndexManager<IndexMetadata>(indexPath);
      await manager.initialize();

      const exists = await fs.access(indexPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should load existing index from disk', async () => {
      const testData: IndexMetadata[] = [
        { id: '1', type: 'requirement', filePath: 'entities/requirement.json', version: 1, updatedAt: '2025-01-01' },
        { id: '2', type: 'solution', filePath: 'entities/solution.json', version: 1, updatedAt: '2025-01-02' },
      ];

      const manager = new IndexManager<IndexMetadata>(indexPath);
      await manager.initialize();
      await manager.saveIndex(testData);

      const manager2 = new IndexManager<IndexMetadata>(indexPath);
      await manager2.initialize();
      const loaded = await manager2.getAll();

      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe('1');
      expect(loaded[1].id).toBe('2');
    });
  });

  describe('RED: CRUD Operations', () => {
    let manager: IndexManager;

    beforeEach(async () => {
      manager = new IndexManager<IndexMetadata>(indexPath);
      await manager.initialize();
    });

    it('should add entry to index', async () => {
      const entry: IndexMetadata = {
        id: 'req-1',
        type: 'requirement',
        filePath: 'entities/requirement.json',
        version: 1,
        updatedAt: '2025-01-01',
      };

      await manager.add(entry);
      const result = await manager.get('req-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('req-1');
      expect(result?.type).toBe('requirement');
    });

    it('should get entry by ID', async () => {
      const entry: IndexMetadata = {
        id: 'sol-1',
        type: 'solution',
        filePath: 'entities/solution.json',
        version: 1,
        updatedAt: '2025-01-02',
      };

      await manager.add(entry);
      const result = await manager.get('sol-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('sol-1');
    });

    it('should return undefined for non-existent entry', async () => {
      const result = await manager.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should update existing entry', async () => {
      const entry: IndexMetadata = {
        id: 'phase-1',
        type: 'phase',
        filePath: 'entities/phase.json',
        version: 1,
        updatedAt: '2025-01-01',
      };

      await manager.add(entry);

      const updated: IndexMetadata = {
        ...entry,
        version: 2,
        updatedAt: '2025-01-02',
      };

      await manager.update(updated);
      const result = await manager.get('phase-1');

      expect(result?.version).toBe(2);
      expect(result?.updatedAt).toBe('2025-01-02');
    });

    it('should delete entry by ID', async () => {
      const entry: IndexMetadata = {
        id: 'dec-1',
        type: 'decision',
        filePath: 'entities/decision.json',
        version: 1,
        updatedAt: '2025-01-01',
      };

      await manager.add(entry);
      await manager.delete('dec-1');

      const result = await manager.get('dec-1');
      expect(result).toBeUndefined();
    });

    it('should get all entries', async () => {
      await manager.add({ id: '1', type: 'req', filePath: 'f1', version: 1, updatedAt: '2025-01-01' });
      await manager.add({ id: '2', type: 'sol', filePath: 'f2', version: 1, updatedAt: '2025-01-02' });
      await manager.add({ id: '3', type: 'dec', filePath: 'f3', version: 1, updatedAt: '2025-01-03' });

      const all = await manager.getAll();
      expect(all).toHaveLength(3);
    });

    it('should clear all entries', async () => {
      await manager.add({ id: '1', type: 'req', filePath: 'f1', version: 1, updatedAt: '2025-01-01' });
      await manager.add({ id: '2', type: 'sol', filePath: 'f2', version: 1, updatedAt: '2025-01-02' });

      await manager.clear();
      const all = await manager.getAll();

      expect(all).toHaveLength(0);
    });
  });

  describe('RED: Query Operations', () => {
    let manager: IndexManager;

    beforeEach(async () => {
      manager = new IndexManager<IndexMetadata>(indexPath);
      await manager.initialize();

      // Add test data
      await manager.add({ id: 'req-1', type: 'requirement', filePath: 'f1', version: 1, updatedAt: '2025-01-01' });
      await manager.add({ id: 'req-2', type: 'requirement', filePath: 'f2', version: 2, updatedAt: '2025-01-02' });
      await manager.add({ id: 'sol-1', type: 'solution', filePath: 'f3', version: 1, updatedAt: '2025-01-03' });
    });

    it('should find entries by predicate', async () => {
      const requirements = await manager.find(entry => entry.type === 'requirement');
      expect(requirements).toHaveLength(2);
      expect(requirements.every(r => r.type === 'requirement')).toBe(true);
    });

    it('should find first entry matching predicate', async () => {
      const firstReq = await manager.findOne(entry => entry.type === 'requirement');
      expect(firstReq).toBeDefined();
      expect(firstReq?.id).toBe('req-1');
    });

    it('should return undefined if no match found', async () => {
      const result = await manager.findOne(entry => entry.type === 'artifact');
      expect(result).toBeUndefined();
    });

    it('should check if entry exists', async () => {
      const exists = await manager.has('req-1');
      const notExists = await manager.has('non-existent');

      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });

    it('should get index size', async () => {
      const size = await manager.size();
      expect(size).toBe(3);
    });
  });

  describe('RED: Cache Operations', () => {
    it('should enable caching', async () => {
      const manager = new IndexManager<IndexMetadata>(indexPath, {
        enabled: true,
        ttl: 5000,
        maxSize: 100,
        invalidation: 'version',
      });
      await manager.initialize();

      await manager.add({ id: '1', type: 'req', filePath: 'f1', version: 1, updatedAt: '2025-01-01' });

      // First access - loads from disk
      const result1 = await manager.get('1');
      // Second access - should use cache
      const result2 = await manager.get('1');

      expect(result1).toEqual(result2);
    });

    it('should invalidate cache on update', async () => {
      const manager = new IndexManager<IndexMetadata>(indexPath, {
        enabled: true,
        ttl: 5000,
        maxSize: 100,
        invalidation: 'version',
      });
      await manager.initialize();

      await manager.add({ id: '1', type: 'req', filePath: 'f1', version: 1, updatedAt: '2025-01-01' });
      await manager.get('1'); // Cache it

      await manager.update({ id: '1', type: 'req', filePath: 'f1', version: 2, updatedAt: '2025-01-02' });
      const result = await manager.get('1');

      expect(result?.version).toBe(2);
    });

    it('should respect cache TTL', async () => {
      const manager = new IndexManager<IndexMetadata>(indexPath, {
        enabled: true,
        ttl: 100, // 100ms TTL
        maxSize: 100,
        invalidation: 'ttl',
      });
      await manager.initialize();

      await manager.add({ id: '1', type: 'req', filePath: 'f1', version: 1, updatedAt: '2025-01-01' });
      await manager.get('1'); // Cache it

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should reload from disk
      const result = await manager.get('1');
      expect(result).toBeDefined();
    });
  });

  describe('RED: Atomic Operations', () => {
    let manager: IndexManager;

    beforeEach(async () => {
      manager = new IndexManager<IndexMetadata>(indexPath);
      await manager.initialize();
    });

    it('should handle concurrent writes atomically', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          manager.add({
            id: `item-${i.toString()}`,
            type: 'requirement',
            filePath: `file-${i.toString()}`,
            version: 1,
            updatedAt: '2025-01-01',
          })
        );
      }

      await Promise.all(promises);
      const size = await manager.size();

      expect(size).toBe(10);
    });

    it('should rebuild index', async () => {
      await manager.add({ id: '1', type: 'req', filePath: 'f1', version: 1, updatedAt: '2025-01-01' });
      await manager.add({ id: '2', type: 'sol', filePath: 'f2', version: 1, updatedAt: '2025-01-02' });

      await manager.rebuild();
      const all = await manager.getAll();

      expect(all).toHaveLength(2);
    });
  });

  describe('RED: Link Index', () => {
    let manager: IndexManager<LinkIndexMetadata>;

    beforeEach(async () => {
      manager = new IndexManager<LinkIndexMetadata>(indexPath);
      await manager.initialize();
    });

    it('should store link metadata', async () => {
      const link: LinkIndexMetadata = {
        id: 'link-1',
        type: 'link',
        filePath: 'links.json',
        version: 1,
        updatedAt: '2025-01-01',
        sourceId: 'req-1',
        targetId: 'sol-1',
        relationType: 'implements',
        createdAt: '2025-01-01',
      };

      await manager.add(link);
      const result = await manager.get('link-1');

      expect(result).toBeDefined();
      expect(result?.sourceId).toBe('req-1');
      expect(result?.targetId).toBe('sol-1');
    });

    it('should find links by source', async () => {
      await manager.add({ id: 'l1', type: 'link', filePath: 'links.json', version: 1, updatedAt: '2025-01-01', sourceId: 'req-1', targetId: 'sol-1', relationType: 'implements', createdAt: '2025-01-01' });
      await manager.add({ id: 'l2', type: 'link', filePath: 'links.json', version: 1, updatedAt: '2025-01-02', sourceId: 'req-1', targetId: 'sol-2', relationType: 'implements', createdAt: '2025-01-02' });
      await manager.add({ id: 'l3', type: 'link', filePath: 'links.json', version: 1, updatedAt: '2025-01-03', sourceId: 'req-2', targetId: 'sol-3', relationType: 'implements', createdAt: '2025-01-03' });

      const links = await manager.find(link => link.sourceId === 'req-1');
      expect(links).toHaveLength(2);
    });

    it('should find links by target', async () => {
      await manager.add({ id: 'l1', type: 'link', filePath: 'links.json', version: 1, updatedAt: '2025-01-01', sourceId: 'req-1', targetId: 'sol-1', relationType: 'implements', createdAt: '2025-01-01' });
      await manager.add({ id: 'l2', type: 'link', filePath: 'links.json', version: 1, updatedAt: '2025-01-02', sourceId: 'req-2', targetId: 'sol-1', relationType: 'implements', createdAt: '2025-01-02' });

      const links = await manager.find(link => link.targetId === 'sol-1');
      expect(links).toHaveLength(2);
    });
  });
});
