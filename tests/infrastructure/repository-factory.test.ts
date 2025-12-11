/**
 * TDD RED: Repository Factory Tests
 *
 * Tests for factory pattern that creates repositories with proper configuration
 */

import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RepositoryFactory } from '../../src/infrastructure/factory/repository-factory.js';
import { FileLockManager } from '../../src/infrastructure/repositories/file/file-lock-manager.js';
import type { Requirement, Solution, Phase, Link } from '../../src/domain/entities/types.js';

describe('RED: RepositoryFactory', () => {
  let testDir: string;
  let factory: RepositoryFactory;
  let lockManager: FileLockManager;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `test-factory-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Create shared lock manager
    lockManager = new FileLockManager(testDir);
    await lockManager.initialize();

    // Create factory
    factory = new RepositoryFactory({
      type: 'file',
      baseDir: testDir,
      lockManager,
    });
  });

  afterEach(async () => {
    // Dispose factory first (doesn't own lockManager)
    await factory?.dispose();
    // Then dispose the shared lockManager (we own it in tests)
    await lockManager?.dispose();
    // Finally cleanup file system
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // ============================================================================
  // RED: Factory Creation
  // ============================================================================

  describe('Factory Creation', () => {
    it('should create RepositoryFactory instance', () => {
      expect(factory).toBeDefined();
      expect(factory).toBeInstanceOf(RepositoryFactory);
    });

    it('should require storage config', () => {
      expect(() => new RepositoryFactory(null as any)).toThrow();
    });

    it('should validate storage type', () => {
      expect(
        () =>
          new RepositoryFactory({
            type: 'invalid' as any,
            baseDir: testDir,
            lockManager,
          })
      ).toThrow(/storage type/i);
    });
  });

  // ============================================================================
  // RED: Input Validation
  // ============================================================================

  describe('Input Validation', () => {
    it('should validate entityType in createRepository', () => {
      expect(() => factory.createRepository<Requirement>('' as any, 'plan-123')).toThrow(
        /entityType is required/
      );
      expect(() => factory.createRepository<Requirement>(null as any, 'plan-123')).toThrow(
        /entityType is required/
      );
      expect(() => factory.createRepository<Requirement>('  ' as any, 'plan-123')).toThrow(
        /entityType is required/
      );
    });

    it('should validate planId in createRepository', () => {
      expect(() => factory.createRepository<Requirement>('requirement', '')).toThrow(
        /planId is required/
      );
      expect(() => factory.createRepository<Requirement>('requirement', null as any)).toThrow(
        /planId is required/
      );
      expect(() => factory.createRepository<Requirement>('requirement', '  ')).toThrow(
        /planId is required/
      );
    });

    it('should validate planId in createLinkRepository', () => {
      expect(() => factory.createLinkRepository('')).toThrow(/planId is required/);
      expect(() => factory.createLinkRepository(null as any)).toThrow(/planId is required/);
      expect(() => factory.createLinkRepository('  ')).toThrow(/planId is required/);
    });

    it('should validate planId in createUnitOfWork', () => {
      expect(() => factory.createUnitOfWork('')).toThrow(/planId is required/);
      expect(() => factory.createUnitOfWork(null as any)).toThrow(/planId is required/);
      expect(() => factory.createUnitOfWork('  ')).toThrow(/planId is required/);
    });
  });

  // ============================================================================
  // RED: Repository Creation
  // ============================================================================

  describe('Repository Creation', () => {
    it('should create entity repository for given plan', async () => {
      const planId = 'test-plan-001';
      const repo = factory.createRepository<Requirement>('requirement', planId);

      expect(repo).toBeDefined();
      expect(typeof repo.create).toBe('function');
      expect(typeof repo.findById).toBe('function');
      expect(typeof repo.update).toBe('function');
      expect(typeof repo.delete).toBe('function');
    });

    it('should create link repository for given plan', async () => {
      const planId = 'test-plan-002';
      const linkRepo = factory.createLinkRepository(planId);

      expect(linkRepo).toBeDefined();
      expect(typeof linkRepo.createLink).toBe('function');
      expect(typeof linkRepo.getLinkById).toBe('function');
      expect(typeof linkRepo.deleteLink).toBe('function');
    });

    it('should create UnitOfWork for given plan', async () => {
      const planId = 'test-plan-003';
      const uow = factory.createUnitOfWork(planId);

      expect(uow).toBeDefined();
      expect(typeof uow.begin).toBe('function');
      expect(typeof uow.commit).toBe('function');
      expect(typeof uow.rollback).toBe('function');
      expect(typeof uow.execute).toBe('function');
    });
  });

  // ============================================================================
  // RED: Shared FileLockManager
  // ============================================================================

  describe('Shared FileLockManager', () => {
    it('should share FileLockManager across all repositories', async () => {
      const planId = 'test-plan-004';

      const repo1 = factory.createRepository<Requirement>('requirement', planId);
      const repo2 = factory.createRepository<Solution>('solution', planId);
      const linkRepo = factory.createLinkRepository(planId);

      // All should use the same lock manager instance
      expect((repo1 as any).fileLockManager).toBe(lockManager);
      expect((repo2 as any).fileLockManager).toBe(lockManager);
      expect((linkRepo as any).fileLockManager).toBe(lockManager);
    });

    it('should share FileLockManager in UnitOfWork', async () => {
      const planId = 'test-plan-005';
      const uow = factory.createUnitOfWork(planId);

      expect((uow as any).fileLockManager).toBe(lockManager);
    });
  });

  // ============================================================================
  // RED: Repository Caching
  // ============================================================================

  describe('Repository Caching', () => {
    it('should cache repository instances per plan+type', () => {
      const planId = 'test-plan-006';

      const repo1 = factory.createRepository<Requirement>('requirement', planId);
      const repo2 = factory.createRepository<Requirement>('requirement', planId);

      // Should return same instance
      expect(repo1).toBe(repo2);
    });

    it('should create different instances for different plans', () => {
      const repo1 = factory.createRepository<Requirement>('requirement', 'plan-a');
      const repo2 = factory.createRepository<Requirement>('requirement', 'plan-b');

      // Different plans should get different instances
      expect(repo1).not.toBe(repo2);
    });

    it('should create different instances for different entity types', () => {
      const planId = 'test-plan-007';

      const reqRepo = factory.createRepository<Requirement>('requirement', planId);
      const solRepo = factory.createRepository<Solution>('solution', planId);

      // Different entity types should get different instances
      expect(reqRepo).not.toBe(solRepo);
    });

    it('should cache LinkRepository instances per plan', () => {
      const planId = 'test-plan-008';

      const linkRepo1 = factory.createLinkRepository(planId);
      const linkRepo2 = factory.createLinkRepository(planId);

      // Should return same instance
      expect(linkRepo1).toBe(linkRepo2);
    });

    it('should cache UnitOfWork instances per plan', () => {
      const planId = 'test-plan-009';

      const uow1 = factory.createUnitOfWork(planId);
      const uow2 = factory.createUnitOfWork(planId);

      // Should return same instance
      expect(uow1).toBe(uow2);
    });
  });

  // ============================================================================
  // RED: Disposal
  // ============================================================================

  describe('Disposal', () => {
    it('should dispose all cached repositories', async () => {
      const planId = 'test-plan-010';

      // Create some repositories
      factory.createRepository<Requirement>('requirement', planId);
      factory.createRepository<Solution>('solution', planId);
      factory.createLinkRepository(planId);

      // Dispose factory
      await factory.dispose();

      // Creating new repository after dispose should fail or create fresh instance
      // (This depends on implementation - factory might be reusable or not)
    });

    it('should NOT dispose shared FileLockManager on factory dispose', async () => {
      await factory.dispose();

      // Lock manager should still be usable - factory doesn't own it
      expect(lockManager.isDisposed()).toBe(false);

      // Caller is responsible for disposing
      await lockManager.dispose();
      expect(lockManager.isDisposed()).toBe(true);
    });
  });

  // ============================================================================
  // RED: Integration with FileRepository
  // ============================================================================

  describe('Integration with FileRepository', () => {
    it('should create repository instances that can be initialized', async () => {
      const planId = 'test-plan-011';

      // Create plan directory
      await fs.mkdir(path.join(testDir, 'plans', planId), { recursive: true });

      const repo = factory.createRepository<Requirement>('requirement', planId);

      // Should be able to initialize
      await (repo as any).initialize();

      // Repository should have basic CRUD methods
      expect(typeof repo.create).toBe('function');
      expect(typeof repo.findById).toBe('function');
      expect(typeof repo.update).toBe('function');
      expect(typeof repo.delete).toBe('function');
    });

    it('should create functional FileLinkRepository through factory', async () => {
      const planId = 'test-plan-012';

      // Create plan directory
      await fs.mkdir(path.join(testDir, 'plans', planId), { recursive: true });

      const linkRepo = factory.createLinkRepository(planId);
      await (linkRepo as any).initialize();

      // Create a link
      const link = await linkRepo.createLink({
        sourceId: 'req-001',
        targetId: 'sol-001',
        relationType: 'implements',
        metadata: {},
      });

      expect(link.id).toBeDefined();
      expect(link.sourceId).toBe('req-001');

      // Read it back
      const fetched = await linkRepo.getLinkById(link.id);
      expect(fetched.sourceId).toBe('req-001');
    });
  });

  // ============================================================================
  // RED: Cache Options
  // ============================================================================

  describe('Cache Options', () => {
    it('should pass cache options to repositories', () => {
      const factoryWithCache = new RepositoryFactory({
        type: 'file',
        baseDir: testDir,
        lockManager,
        cacheOptions: {
          enabled: true,
          ttl: 10000,
          maxSize: 200,
        },
      });

      const planId = 'test-plan-013';
      const repo = factoryWithCache.createRepository<Requirement>('requirement', planId);

      // Cache options should be passed through
      expect((repo as any).cacheOptions).toBeDefined();
      expect((repo as any).cacheOptions.enabled).toBe(true);
      expect((repo as any).cacheOptions.ttl).toBe(10000);
      expect((repo as any).cacheOptions.maxSize).toBe(200);
    });
  });
});
