/**
 * RepositoryFactory - Factory Pattern for Repository creation
 *
 * Creates and caches repository instances with shared resources:
 * - Shared FileLockManager across all repositories for cross-process safety
 * - Repository caching per plan+type to avoid duplicate instances
 * - Support for File storage backend (SQLite/PostgreSQL in future)
 * - Unified cache configuration
 */

import type { Repository, LinkRepository, UnitOfWork } from '../../domain/repositories/interfaces.js';
import type { Entity, EntityType } from '../../domain/entities/types.js';
import { FileRepository } from '../repositories/file/file-repository.js';
import { FileLinkRepository } from '../repositories/file/file-link-repository.js';
import { FileUnitOfWork } from '../repositories/file/file-unit-of-work.js';
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
  private config: StorageConfig;
  private repositoryCache: Map<string, Repository<any>> = new Map();
  private linkRepositoryCache: Map<string, LinkRepository> = new Map();
  private uowCache: Map<string, UnitOfWork> = new Map();

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
    // Check cache
    if (this.linkRepositoryCache.has(planId)) {
      return this.linkRepositoryCache.get(planId)!;
    }

    // Create new link repository
    const linkRepo = new FileLinkRepository(
      this.config.baseDir,
      planId,
      this.config.lockManager,
      this.config.cacheOptions
    );

    // Cache and return
    this.linkRepositoryCache.set(planId, linkRepo);
    return linkRepo;
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
   * Cleans up all cached repositories, link repositories, UnitOfWork instances,
   * and the shared FileLockManager.
   *
   * IMPORTANT: After dispose(), the factory should not be used.
   * Create a new factory instance if needed.
   *
   * @example
   * ```typescript
   * await factory.dispose();
   * // factory is now unusable - create new one if needed
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

    // Dispose shared lock manager
    await this.config.lockManager.dispose();
  }
}
