import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileRepository } from '../../src/infrastructure/repositories/file/file-repository.js';
import type { Requirement, EntityType } from '../../src/domain/entities/types.js';

describe('FileRepository', () => {
  const testDir = path.join(process.cwd(), '.test-data', 'file-repository');
  const planId = 'test-plan-1';
  const entityType: EntityType = 'requirement';

  let repository: FileRepository<Requirement>;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    repository = new FileRepository<Requirement>(testDir, planId, entityType);
    await repository.initialize();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // Helper to create test requirement
  const createTestRequirement = (id: string, title: string): Requirement => ({
    id,
    type: 'requirement',
    title,
    description: `Description for ${title}`,
    rationale: 'Test rationale',
    source: { type: 'user-request' },
    acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
    priority: 'high',
    category: 'functional',
    status: 'draft',
    votes: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    metadata: {
      createdBy: 'test',
      tags: [],
      annotations: [],
    },
  });

  describe('RED: Initialization', () => {
    it('should create FileRepository instance', () => {
      expect(repository).toBeDefined();
      expect(repository.entityType).toBe('requirement');
    });

    it('should initialize storage directories', async () => {
      const planDir = path.join(testDir, 'plans', planId);
      const entitiesDir = path.join(planDir, 'entities');
      const indexesDir = path.join(planDir, 'indexes');

      const [planExists, entitiesExists, indexesExists] = await Promise.all([
        fs.access(planDir).then(() => true).catch(() => false),
        fs.access(entitiesDir).then(() => true).catch(() => false),
        fs.access(indexesDir).then(() => true).catch(() => false),
      ]);

      expect(planExists).toBe(true);
      expect(entitiesExists).toBe(true);
      expect(indexesExists).toBe(true);
    });
  });

  describe('RED: CRUD - Create', () => {
    it('should create new entity', async () => {
      const requirement = createTestRequirement('req-1', 'Test Requirement 1');
      const created = await repository.create(requirement);

      expect(created).toBeDefined();
      expect(created.id).toBe('req-1');
      expect(created.title).toBe('Test Requirement 1');
    });

    it('should throw ConflictError if entity already exists', async () => {
      const requirement = createTestRequirement('req-1', 'Test Requirement 1');
      await repository.create(requirement);

      await expect(repository.create(requirement)).rejects.toThrow(/already exists/);
    });

    it('should update index on create', async () => {
      const requirement = createTestRequirement('req-1', 'Test Requirement 1');
      await repository.create(requirement);

      const exists = await repository.exists('req-1');
      expect(exists).toBe(true);
    });

    it('should validate entity before create', async () => {
      const invalid = { ...createTestRequirement('req-1', 'Test'), id: '' };
      await expect(repository.create(invalid as Requirement)).rejects.toThrow(/validation/i);
    });
  });

  describe('RED: CRUD - Read', () => {
    it('should find entity by ID', async () => {
      const requirement = createTestRequirement('req-1', 'Test Requirement 1');
      await repository.create(requirement);

      const found = await repository.findById('req-1');
      expect(found).toBeDefined();
      expect(found.id).toBe('req-1');
      expect(found.title).toBe('Test Requirement 1');
    });

    it('should throw NotFoundError if entity not found', async () => {
      await expect(repository.findById('non-existent')).rejects.toThrow(/not found/);
    });

    it('should return null for findByIdOrNull when not found', async () => {
      const result = await repository.findByIdOrNull('non-existent');
      expect(result).toBeNull();
    });

    it('should check if entity exists', async () => {
      const requirement = createTestRequirement('req-1', 'Test Requirement 1');
      await repository.create(requirement);

      expect(await repository.exists('req-1')).toBe(true);
      expect(await repository.exists('non-existent')).toBe(false);
    });

    it('should find multiple entities by IDs', async () => {
      await repository.create(createTestRequirement('req-1', 'Req 1'));
      await repository.create(createTestRequirement('req-2', 'Req 2'));
      await repository.create(createTestRequirement('req-3', 'Req 3'));

      const found = await repository.findByIds(['req-1', 'req-3', 'non-existent']);
      expect(found).toHaveLength(2);
      expect(found.map(r => r.id)).toEqual(['req-1', 'req-3']);
    });

    it('should find all entities', async () => {
      await repository.create(createTestRequirement('req-1', 'Req 1'));
      await repository.create(createTestRequirement('req-2', 'Req 2'));
      await repository.create(createTestRequirement('req-3', 'Req 3'));

      const all = await repository.findAll();
      expect(all).toHaveLength(3);
    });
  });

  describe('RED: CRUD - Update', () => {
    it('should update existing entity', async () => {
      const requirement = createTestRequirement('req-1', 'Original Title');
      await repository.create(requirement);

      const updated = await repository.update('req-1', {
        title: 'Updated Title',
        priority: 'critical',
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.priority).toBe('critical');
      expect(updated.version).toBe(2);
    });

    it('should throw NotFoundError when updating non-existent entity', async () => {
      await expect(
        repository.update('non-existent', { title: 'New Title' })
      ).rejects.toThrow(/not found/);
    });

    it('should increment version on update', async () => {
      const requirement = createTestRequirement('req-1', 'Test');
      await repository.create(requirement);

      const updated1 = await repository.update('req-1', { title: 'Update 1' });
      expect(updated1.version).toBe(2);

      const updated2 = await repository.update('req-1', { title: 'Update 2' });
      expect(updated2.version).toBe(3);
    });

    it('should update index on update', async () => {
      const requirement = createTestRequirement('req-1', 'Original');
      await repository.create(requirement);

      await repository.update('req-1', { title: 'Updated' });
      const found = await repository.findById('req-1');

      expect(found.title).toBe('Updated');
    });
  });

  describe('RED: CRUD - Delete', () => {
    it('should delete entity by ID', async () => {
      const requirement = createTestRequirement('req-1', 'Test');
      await repository.create(requirement);

      await repository.delete('req-1');
      expect(await repository.exists('req-1')).toBe(false);
    });

    it('should throw NotFoundError when deleting non-existent entity', async () => {
      await expect(repository.delete('non-existent')).rejects.toThrow(/not found/);
    });

    it('should update index on delete', async () => {
      const requirement = createTestRequirement('req-1', 'Test');
      await repository.create(requirement);

      await repository.delete('req-1');
      const exists = await repository.exists('req-1');

      expect(exists).toBe(false);
    });

    it('should delete multiple entities', async () => {
      await repository.create(createTestRequirement('req-1', 'Req 1'));
      await repository.create(createTestRequirement('req-2', 'Req 2'));
      await repository.create(createTestRequirement('req-3', 'Req 3'));

      const deletedCount = await repository.deleteMany(['req-1', 'req-3']);
      expect(deletedCount).toBe(2);

      expect(await repository.exists('req-1')).toBe(false);
      expect(await repository.exists('req-2')).toBe(true);
      expect(await repository.exists('req-3')).toBe(false);
    });
  });

  describe('RED: Query Operations', () => {
    beforeEach(async () => {
      await repository.create(createTestRequirement('req-1', 'High Priority Functional'));
      await repository.create({ ...createTestRequirement('req-2', 'Low Priority Functional'), priority: 'low' });
      await repository.create({ ...createTestRequirement('req-3', 'High Priority Technical'), category: 'technical' });
      await repository.create({ ...createTestRequirement('req-4', 'Critical Functional'), priority: 'critical' });
    });

    it('should query with filter', async () => {
      const result = await repository.query({
        filter: {
          conditions: [{ field: 'priority', operator: 'eq', value: 'high' }],
        },
      });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should query with multiple conditions', async () => {
      const result = await repository.query({
        filter: {
          operator: 'and',
          conditions: [
            { field: 'priority', operator: 'eq', value: 'high' },
            { field: 'category', operator: 'eq', value: 'functional' },
          ],
        },
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('req-1');
    });

    it('should query with sort', async () => {
      const result = await repository.query({
        sort: [{ field: 'priority', direction: 'desc' }],
      });

      expect(result.items[0].priority).toBe('critical');
    });

    it('should query with pagination', async () => {
      const result = await repository.query({
        pagination: { offset: 1, limit: 2 },
      });

      expect(result.items).toHaveLength(2);
      expect(result.offset).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.total).toBe(4);
      expect(result.hasMore).toBe(true);
    });

    it('should count entities with filter', async () => {
      const count = await repository.count({
        conditions: [{ field: 'priority', operator: 'eq', value: 'high' }],
      });

      expect(count).toBe(2);
    });

    it('should find one entity with filter', async () => {
      const found = await repository.findOne({
        conditions: [{ field: 'priority', operator: 'eq', value: 'critical' }],
      });

      expect(found).toBeDefined();
      expect(found?.priority).toBe('critical');
    });

    it('should return null when findOne finds nothing', async () => {
      const found = await repository.findOne({
        conditions: [{ field: 'priority', operator: 'eq', value: 'medium' }],
      });

      expect(found).toBeNull();
    });
  });

  describe('RED: Bulk Operations', () => {
    it('should create multiple entities', async () => {
      const requirements = [
        createTestRequirement('req-1', 'Req 1'),
        createTestRequirement('req-2', 'Req 2'),
        createTestRequirement('req-3', 'Req 3'),
      ];

      const created = await repository.createMany(requirements);
      expect(created).toHaveLength(3);
      expect(await repository.count()).toBe(3);
    });

    it('should rollback on bulk create failure', async () => {
      const requirements = [
        createTestRequirement('req-1', 'Req 1'),
        { ...createTestRequirement('req-2', 'Req 2'), id: '' }, // Invalid
        createTestRequirement('req-3', 'Req 3'),
      ];

      await expect(repository.createMany(requirements as Requirement[])).rejects.toThrow();
      expect(await repository.count()).toBe(0);
    });

    it('should update multiple entities', async () => {
      await repository.create(createTestRequirement('req-1', 'Req 1'));
      await repository.create(createTestRequirement('req-2', 'Req 2'));
      await repository.create(createTestRequirement('req-3', 'Req 3'));

      const updates = [
        { id: 'req-1', data: { priority: 'critical' as const } },
        { id: 'req-3', data: { priority: 'low' as const } },
      ];

      const updated = await repository.updateMany(updates);
      expect(updated).toHaveLength(2);
      expect(updated[0].priority).toBe('critical');
      expect(updated[1].priority).toBe('low');
    });

    it('should upsert entities (insert new or update existing)', async () => {
      await repository.create(createTestRequirement('req-1', 'Existing'));

      const entities = [
        { ...createTestRequirement('req-1', 'Updated Existing'), version: 2 },
        createTestRequirement('req-2', 'New Entity'),
      ];

      const upserted = await repository.upsertMany(entities);
      expect(upserted).toHaveLength(2);

      const found1 = await repository.findById('req-1');
      const found2 = await repository.findById('req-2');

      expect(found1.title).toBe('Updated Existing');
      expect(found2.title).toBe('New Entity');
    });
  });

  describe('RED: Cache Operations', () => {
    it('should cache read operations', async () => {
      const requirement = createTestRequirement('req-1', 'Test');
      await repository.create(requirement);

      // First read - from disk
      const found1 = await repository.findById('req-1');
      // Second read - from cache
      const found2 = await repository.findById('req-1');

      expect(found1).toEqual(found2);
    });

    it('should invalidate cache on update', async () => {
      const requirement = createTestRequirement('req-1', 'Original');
      await repository.create(requirement);

      await repository.findById('req-1'); // Cache it
      await repository.update('req-1', { title: 'Updated' });

      const found = await repository.findById('req-1');
      expect(found.title).toBe('Updated');
    });

    it('should invalidate cache on delete', async () => {
      const requirement = createTestRequirement('req-1', 'Test');
      await repository.create(requirement);

      await repository.findById('req-1'); // Cache it
      await repository.delete('req-1');

      await expect(repository.findById('req-1')).rejects.toThrow(/not found/);
    });
  });

  describe('RED: Concurrent Operations', () => {
    it('should handle concurrent creates', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(repository.create(createTestRequirement(`req-${i}`, `Req ${i}`)));
      }

      await Promise.all(promises);
      expect(await repository.count()).toBe(10);
    });

    it('should handle concurrent updates', async () => {
      await repository.create(createTestRequirement('req-1', 'Test'));

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(repository.update('req-1', { votes: i }));
      }

      await Promise.all(promises);
      const found = await repository.findById('req-1');
      expect(found.version).toBeGreaterThan(1);
    });
  });
});
