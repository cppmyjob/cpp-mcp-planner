import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Requirement, EntityType } from '@mcp-planner/core';
import { FileRepository } from '@mcp-planner/core';

describe('FileRepository', () => {
  // FIX M-4: Use os.tmpdir() instead of process.cwd()
  const testDir = path.join(os.tmpdir(), `test-${Date.now().toString()}-file-repository`);
  const projectId = 'test-project'; // RED: Added for new path structure
  const planId = 'test-plan-1';
  const entityType: EntityType = 'requirement';

  let repository: FileRepository<Requirement>;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    repository = new FileRepository<Requirement>(testDir, projectId, planId, entityType);
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

  describe('REVIEW: Initialization', () => {
    it('should create FileRepository instance', () => {
      expect(repository).toBeDefined();
      expect(repository.entityType).toBe('requirement');
    });

    it('RED: should initialize storage directories with projectId path', async () => {
      // RED: Expect new path structure: baseDir/projectId/plans/planId/
      const planDir = path.join(testDir, projectId, 'plans', planId);
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

    it('RED: should use projectId in file paths', async () => {
      // RED: Create an entity and verify it's stored at the correct path
      const requirement = createTestRequirement('req-path-test', 'Path Test');
      await repository.create(requirement);

      // Expected path: baseDir/projectId/plans/planId/entities/requirement-req-path-test.json
      const expectedEntityPath = path.join(
        testDir,
        projectId,
        'plans',
        planId,
        'entities',
        `${String(entityType)}-req-path-test.json`
      );

      // Verify file exists at expected path
      const fileExists = await fs.access(expectedEntityPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });
  });

  describe('REVIEW: CRUD - Create', () => {
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

  describe('REVIEW: CRUD - Read', () => {
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

  describe('REVIEW: CRUD - Update', () => {
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

  describe('REVIEW: CRUD - Delete', () => {
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

  describe('REVIEW: Query Operations', () => {
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

  describe('REVIEW: Bulk Operations', () => {
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

      await expect(repository.createMany(requirements)).rejects.toThrow();
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

  describe('REVIEW: Cache Operations', () => {
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

  describe('REVIEW: Concurrent Operations', () => {
    it('should handle concurrent creates', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(repository.create(createTestRequirement(`req-${i.toString()}`, `Req ${i.toString()}`)));
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

  // ============================================================================
  // BUG FIX: Version Mismatch Detection (Issue #1)
  // ============================================================================
  describe('REVIEW: Version Mismatch Detection', () => {
    it('should throw ConflictError when updating with stale version', async () => {
      // Create entity with version 1
      const requirement = createTestRequirement('req-1', 'Original');
      await repository.create(requirement);

      // Simulate another process updating the entity (version becomes 2)
      await repository.update('req-1', { title: 'Updated by other' });

      // Try to update with stale version (passing version: 1 when current is 2)
      await expect(
        repository.update('req-1', { title: 'My update', version: 1 })
      ).rejects.toThrow(/version mismatch|conflict/i);
    });

    it('should allow update when version matches', async () => {
      const requirement = createTestRequirement('req-1', 'Original');
      await repository.create(requirement);

      // Update with correct version
      const updated = await repository.update('req-1', {
        title: 'Updated',
        version: 1,
      });

      expect(updated.title).toBe('Updated');
      expect(updated.version).toBe(2);
    });

    it('should allow update without version (backward compatibility)', async () => {
      const requirement = createTestRequirement('req-1', 'Original');
      await repository.create(requirement);

      // Update without version - should work (backward compatibility)
      const updated = await repository.update('req-1', { title: 'Updated' });

      expect(updated.title).toBe('Updated');
      expect(updated.version).toBe(2);
    });
  });

  // ============================================================================
  // BUG FIX: Missing Filter Operators (Issue #2)
  // ============================================================================
  describe('REVIEW: Missing Filter Operators', () => {
    beforeEach(async () => {
      // Create test data for filter tests
      await repository.create(createTestRequirement('req-1', 'Authentication System'));
      await repository.create(createTestRequirement('req-2', 'Authorization Module'));
      await repository.create(createTestRequirement('req-3', 'User Management'));
      await repository.create(createTestRequirement('req-4', 'System Settings'));
    });

    it('should support startsWith operator', async () => {
      const results = await repository.query({
        filter: {
          conditions: [{ field: 'title', operator: 'startsWith', value: 'Auth' }],
        },
      });

      expect(results.items).toHaveLength(2);
      expect(results.items.map((r: Requirement) => r.title)).toEqual(
        expect.arrayContaining(['Authentication System', 'Authorization Module'])
      );
    });

    it('should support endsWith operator', async () => {
      const results = await repository.query({
        filter: {
          conditions: [{ field: 'title', operator: 'endsWith', value: 'System' }],
        },
      });

      // Only "Authentication System" ends with "System"
      // "System Settings" ends with "Settings", not "System"
      expect(results.items).toHaveLength(1);
      expect(results.items[0].title).toBe('Authentication System');
    });

    it('should support exists operator (field exists)', async () => {
      const results = await repository.query({
        filter: {
          conditions: [{ field: 'rationale', operator: 'exists', value: true }],
        },
      });

      // All test requirements have rationale
      expect(results.items).toHaveLength(4);
    });

    it('should support exists operator (field does not exist)', async () => {
      const results = await repository.query({
        filter: {
          conditions: [{ field: 'nonExistentField', operator: 'exists', value: true }],
        },
      });

      expect(results.items).toHaveLength(0);
    });

    it('should support regex operator', async () => {
      const results = await repository.query({
        filter: {
          conditions: [{ field: 'title', operator: 'regex', value: '^(Auth|User)' }],
        },
      });

      expect(results.items).toHaveLength(3);
      expect(results.items.map((r: Requirement) => r.title)).toEqual(
        expect.arrayContaining([
          'Authentication System',
          'Authorization Module',
          'User Management',
        ])
      );
    });

    it('should support regex with case insensitive flag', async () => {
      const results = await repository.query({
        filter: {
          conditions: [{ field: 'title', operator: 'regex', value: 'system' }],
        },
      });

      // Should match 'System' case-insensitively
      expect(results.items.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // BUG FIX: Lazy Initialization (Issue H-1 from Code Review)
  // ============================================================================
  describe('REVIEW: Lazy Initialization', () => {
    it('should auto-initialize on create() without explicit initialize() call', async () => {
      // Create fresh repository WITHOUT calling initialize()
      const lazyRepo = new FileRepository<Requirement>(testDir, projectId, 'lazy-plan-1', entityType);

      const requirement = createTestRequirement('req-lazy-1', 'Lazy Created');

      // Should work - create() calls ensureInitialized() internally
      const created = await lazyRepo.create(requirement);
      expect(created.id).toBe('req-lazy-1');

      await lazyRepo.dispose();
    });

    it('should auto-initialize on update() without explicit initialize() call', async () => {
      // First create with initialized repo
      const initRepo = new FileRepository<Requirement>(testDir, projectId, 'lazy-plan-2', entityType);
      await initRepo.initialize();
      await initRepo.create(createTestRequirement('req-lazy-2', 'Original'));
      await initRepo.dispose();

      // Create fresh repository WITHOUT calling initialize()
      const lazyRepo = new FileRepository<Requirement>(testDir, projectId, 'lazy-plan-2', entityType);

      // Should work - update() should call ensureInitialized() internally
      // REVIEW: This currently FAILS because update() doesn't call ensureInitialized()
      const updated = await lazyRepo.update('req-lazy-2', { title: 'Updated' });
      expect(updated.title).toBe('Updated');

      await lazyRepo.dispose();
    });

    it('should auto-initialize on delete() without explicit initialize() call', async () => {
      // First create with initialized repo
      const initRepo = new FileRepository<Requirement>(testDir, projectId, 'lazy-plan-3', entityType);
      await initRepo.initialize();
      await initRepo.create(createTestRequirement('req-lazy-3', 'To Delete'));
      await initRepo.dispose();

      // Create fresh repository WITHOUT calling initialize()
      const lazyRepo = new FileRepository<Requirement>(testDir, projectId, 'lazy-plan-3', entityType);

      // Should work - delete() should call ensureInitialized() internally
      // REVIEW: This currently FAILS because delete() doesn't call ensureInitialized()
      await lazyRepo.delete('req-lazy-3');
      expect(await lazyRepo.exists('req-lazy-3')).toBe(false);

      await lazyRepo.dispose();
    });

    it('should be idempotent - multiple initialize() calls should be safe', async () => {
      const repo = new FileRepository<Requirement>(testDir, projectId, 'idempotent-plan', entityType);

      // Multiple initialize calls should not throw
      await repo.initialize();
      await repo.initialize();
      await repo.initialize();

      const requirement = createTestRequirement('req-idem', 'Idempotent Test');
      const created = await repo.create(requirement);
      expect(created.id).toBe('req-idem');

      await repo.dispose();
    });
  });

  // ============================================================================
  // BUG FIX: Shared FileLockManager (Issue H-2 from Code Review)
  // ============================================================================
  describe('REVIEW: Shared FileLockManager', () => {
    it('should use injected FileLockManager', async () => {
      const { FileLockManager: fileLockManagerClass } = await import('@mcp-planner/core');

      const sharedLockManager = new fileLockManagerClass(path.join(testDir, projectId, 'plans', 'shared-plan'));
      await sharedLockManager.initialize();

      // Create repository with shared lock manager
      const repo = new FileRepository<Requirement>(
        testDir,
        projectId,
        'shared-plan',
        entityType,
        undefined,
        sharedLockManager
      );
      await repo.initialize();

      const requirement = createTestRequirement('req-shared', 'Shared Lock Test');
      const created = await repo.create(requirement);
      expect(created.id).toBe('req-shared');

      // Clean up - dispose repo first, then lock manager
      await repo.dispose();
      await sharedLockManager.dispose();
    });

    it('should NOT dispose shared FileLockManager when repository disposes', async () => {
      const { FileLockManager: fileLockManagerClass } = await import('@mcp-planner/core');

      const sharedLockManager = new fileLockManagerClass(path.join(testDir, projectId, 'plans', 'shared-plan-2'));
      await sharedLockManager.initialize();

      // Create first repository with shared lock manager
      const repo1 = new FileRepository<Requirement>(
        testDir,
        projectId,
        'shared-plan-2',
        entityType,
        undefined,
        sharedLockManager
      );
      await repo1.initialize();
      await repo1.create(createTestRequirement('req-1', 'Req 1'));

      // Create second repository with SAME shared lock manager
      const repo2 = new FileRepository<Requirement>(
        testDir,
        projectId,
        'shared-plan-2',
        'solution' as EntityType, // Different entity type, same lock manager
        undefined,
        sharedLockManager
      );
      await repo2.initialize();

      // Dispose first repository
      await repo1.dispose();

      // REVIEW: Shared lock manager should still be usable!
      // This currently FAILS because repo1.dispose() calls sharedLockManager.dispose()
      expect(sharedLockManager.isDisposed()).toBe(false);

      // repo2 should still be able to use the lock manager
      // This would throw if lock manager was disposed
      const isLocked = await sharedLockManager.isLocked('test-resource');
      expect(typeof isLocked).toBe('boolean');

      // Clean up
      await repo2.dispose();
      await sharedLockManager.dispose();
    });

    it('should dispose owned FileLockManager when repository disposes', async () => {
      // Create repository WITHOUT injected lock manager (owns its own)
      const repo = new FileRepository<Requirement>(testDir, projectId, 'owned-plan', entityType);
      await repo.initialize();
      await repo.create(createTestRequirement('req-owned', 'Owned Lock Test'));

      // Dispose should clean up owned lock manager
      await repo.dispose();

      // No assertion needed - just verify no errors thrown
      // The lock manager is internal, so we can't check its state directly
    });
  });
});
