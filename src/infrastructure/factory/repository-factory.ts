/**
 * RepositoryFactory - Factory Pattern for Repository creation
 *
 * Creates and caches repository instances with shared resources:
 * - Shared FileLockManager across all repositories for cross-process safety
 * - Repository caching per plan+type to avoid duplicate instances
 * - Support for File storage backend (SQLite/PostgreSQL in future)
 * - Unified cache configuration
 */

import type { Repository, LinkRepository, UnitOfWork, PlanRepository, StorageBackend } from '../../domain/repositories/interfaces.js';
import type { Entity, EntityType } from '../../domain/entities/types.js';
import { FileRepository } from '../repositories/file/file-repository.js';
import { FileLinkRepository } from '../repositories/file/file-link-repository.js';
import { FileUnitOfWork } from '../repositories/file/file-unit-of-work.js';
import { FilePlanRepository } from '../repositories/file/file-plan-repository.js';
import type { FileLockManager } from '../repositories/file/file-lock-manager.js';
import type { CacheOptions } from '../repositories/file/types.js';

/**
 * Storage configuration for RepositoryFactory
 *
 * @example
 * ```typescript
 * const lockManager = new FileLockManager(baseDir);
 * await lockManager.initialize();
 *
 * const factory = new RepositoryFactory({
 *   type: 'file',
 *   baseDir: './data',
 *   lockManager,
 *   cacheOptions: { enabled: true, ttl: 5000 }
 * });
 * ```
 */
export interface StorageConfig {
  /** Storage backend type. Currently only 'file' is supported. Future: 'sqlite' | 'postgresql' | 'mongodb' */
  type: 'file';

  /** Base directory for file storage */
  baseDir: string;

  /** Shared FileLockManager instance for cross-process safety */
  lockManager: FileLockManager;

  /** Optional cache configuration for all repositories */
  cacheOptions?: Partial<CacheOptions>;
}

/**
 * Repository Factory - Factory Pattern for creating repository instances
 *
 * Features:
 * - Creates and caches repository instances per plan+type
 * - Shares FileLockManager across all repositories for cross-process safety
 * - Supports unified cache configuration
 * - Provides dispose() for cleanup
 *
 * Usage Pattern:
 * 1. Create shared FileLockManager
 * 2. Create RepositoryFactory with config
 * 3. Get repositories via createRepository() or createLinkRepository()
 * 4. Dispose factory when done
 *
 * @example Basic Usage
 * ```typescript
 * const lockManager = new FileLockManager(baseDir);
 * await lockManager.initialize();
 *
 * const factory = new RepositoryFactory({
 *   type: 'file',
 *   baseDir,
 *   lockManager
 * });
 *
 * // Get cached repository
 * const reqRepo = factory.createRepository<Requirement>('requirement', planId);
 * await reqRepo.initialize();
 *
 * // Use repository
 * const req = await reqRepo.create({...});
 *
 * // Cleanup
 * await factory.dispose();
 * ```
 *
 * @example With UnitOfWork
 * ```typescript
 * const uow = factory.createUnitOfWork(planId);
 * await uow.initialize();
 *
 * await uow.execute(async () => {
 *   const repo = uow.getRepository<Requirement>('requirement');
 *   await repo.create({...});
 * });
 * ```
 */
export class RepositoryFactory {
  private readonly config: StorageConfig;
  private readonly repositoryCache = new Map<string, Repository<any>>();
  private readonly linkRepositoryCache = new Map<string, LinkRepository>();
  private readonly uowCache = new Map<string, UnitOfWork>();
  private planRepository?: PlanRepository;

  constructor(config: StorageConfig) {
    if (!config) {
      throw new Error('Storage config is required');
    }

    if (config.type !== 'file') {
      throw new Error(`Unsupported storage type: ${config.type}. Only 'file' is currently supported.`);
    }

    this.config = config;
  }

  /**
   * Create or retrieve cached entity repository
   *
   * Returns the same instance for the same plan+entityType combination.
   * Repositories are lazily initialized - call repository.initialize() before use.
   *
   * @param entityType - Type of entity ('requirement', 'solution', 'phase', etc.)
   * @param planId - Plan ID
   * @returns Repository instance (cached if already created)
   *
   * @example
   * ```typescript
   * const reqRepo = factory.createRepository<Requirement>('requirement', 'plan-123');
   * await reqRepo.initialize();
   * const req = await reqRepo.create({...});
   * ```
   */
  createRepository<T extends Entity>(entityType: EntityType, planId: string): Repository<T> {
    // Validate inputs
    if (!entityType || typeof entityType !== 'string' || entityType.trim() === '') {
      throw new Error('entityType is required and must be a non-empty string');
    }
    if (!planId || typeof planId !== 'string' || planId.trim() === '') {
      throw new Error('planId is required and must be a non-empty string');
    }

    const cacheKey = `${planId}:${entityType}`;

    // Check cache
    if (this.repositoryCache.has(cacheKey)) {
      return this.repositoryCache.get(cacheKey) as Repository<T>;
    }

    // Create new repository
    const repository = new FileRepository<T>(
      this.config.baseDir,
      planId,
      entityType,
      this.config.cacheOptions,
      this.config.lockManager
    );

    // Cache and return
    this.repositoryCache.set(cacheKey, repository);
    return repository;
  }

  /**
   * Create or retrieve cached link repository
   *
   * Returns the same instance for the same planId.
   * Repository is lazily initialized - call linkRepo.initialize() before use.
   *
   * @param planId - Plan ID
   * @returns LinkRepository instance (cached if already created)
   *
   * @example
   * ```typescript
   * const linkRepo = factory.createLinkRepository('plan-123');
   * await linkRepo.initialize();
   * const link = await linkRepo.createLink({...});
   * ```
   */
  createLinkRepository(planId: string): LinkRepository {
    // Validate input
    if (!planId || typeof planId !== 'string' || planId.trim() === '') {
      throw new Error('planId is required and must be a non-empty string');
    }

    // Check cache
    if (this.linkRepositoryCache.has(planId)) {
      return this.linkRepositoryCache.get(planId)!;
    }

    // Create new link repository
    // Note: FileLockManager is required (not optional) for factory-created instances.
    // This differs from FileRepository where lockManager is optional (last parameter).
    // Factory pattern ensures shared lock manager across all repositories for cross-process safety.
    const linkRepo = new FileLinkRepository(
      this.config.baseDir,
      planId,
      this.config.lockManager, // Required - factory provides shared instance
      this.config.cacheOptions
    );

    // Cache and return
    this.linkRepositoryCache.set(planId, linkRepo);
    return linkRepo;
  }

  /**
   * Create or retrieve cached Plan Repository
   *
   * Returns singleton instance - only one PlanRepository per factory.
   * Repository is lazily initialized - call planRepo.initialize() before use.
   *
   * @returns PlanRepository instance (cached if already created)
   *
   * @example
   * ```typescript
   * const planRepo = factory.createPlanRepository();
   * await planRepo.initialize();
   *
   * const planIds = await planRepo.listPlans();
   * const manifest = await planRepo.loadManifest('plan-123');
   * ```
   */
  createPlanRepository(): PlanRepository {
    if (this.planRepository) {
      return this.planRepository;
    }

    // Create new PlanRepository
    this.planRepository = new FilePlanRepository(this.config.baseDir);

    return this.planRepository;
  }

  /**
   * Create or retrieve cached Unit of Work
   *
   * Returns the same instance for the same planId.
   * UnitOfWork is lazily initialized - call uow.initialize() before use.
   *
   * @param planId - Plan ID
   * @returns UnitOfWork instance (cached if already created)
   *
   * @example
   * ```typescript
   * const uow = factory.createUnitOfWork('plan-123');
   * await uow.initialize();
   *
   * await uow.execute(async () => {
   *   const repo = uow.getRepository<Requirement>('requirement');
   *   await repo.create({...});
   * });
   * ```
   */
  createUnitOfWork(planId: string): UnitOfWork {
    // Validate input
    if (!planId || typeof planId !== 'string' || planId.trim() === '') {
      throw new Error('planId is required and must be a non-empty string');
    }

    // Check cache
    if (this.uowCache.has(planId)) {
      return this.uowCache.get(planId)!;
    }

    // Create new UoW
    const uow = new FileUnitOfWork(
      this.config.baseDir,
      planId,
      this.config.lockManager,
      this.config.cacheOptions
    );

    // Cache and return
    this.uowCache.set(planId, uow);
    return uow;
  }

  /**
   * Dispose factory and all cached repositories
   *
   * Cleans up all cached repositories, link repositories, and UnitOfWork instances.
   *
   * IMPORTANT:
   * - After dispose(), the factory should not be used. Create a new factory instance if needed.
   * - The shared FileLockManager is NOT disposed - caller owns it and is responsible for disposal.
   *
   * @example
   * ```typescript
   * const factory = new RepositoryFactory({ type: 'file', baseDir, lockManager });
   * // ... use factory ...
   * await factory.dispose();
   * // factory is now unusable, but lockManager is still valid
   * await lockManager.dispose(); // Caller disposes when done
   * ```
   */
  async dispose(): Promise<void> {
    // Dispose all cached repositories
    for (const repo of this.repositoryCache.values()) {
      if ('dispose' in repo && typeof repo.dispose === 'function') {
        await (repo as any).dispose();
      }
    }
    this.repositoryCache.clear();

    // Dispose all cached link repositories
    for (const linkRepo of this.linkRepositoryCache.values()) {
      if ('dispose' in linkRepo && typeof (linkRepo as any).dispose === 'function') {
        await (linkRepo as any).dispose();
      }
    }
    this.linkRepositoryCache.clear();

    // Dispose all cached UoWs
    for (const uow of this.uowCache.values()) {
      if ('dispose' in uow && typeof (uow as any).dispose === 'function') {
        await (uow as any).dispose();
      }
    }
    this.uowCache.clear();

    // Dispose plan repository if exists
    if (this.planRepository && 'dispose' in this.planRepository && typeof (this.planRepository as any).dispose === 'function') {
      await (this.planRepository as any).dispose();
    }
    this.planRepository = undefined;

    // DO NOT dispose shared lock manager - caller owns it
    // The FileLockManager is injected via constructor and should be disposed by the caller
  }

  /**
   * Get the storage backend type
   */
  getBackend(): StorageBackend {
    return this.config.type as StorageBackend;
  }

  /**
   * Close all connections and cleanup (alias for dispose)
   */
  async close(): Promise<void> {
    return this.dispose();
  }
}
