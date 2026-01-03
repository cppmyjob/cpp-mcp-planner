/**
 * GREEN: Phase 2.3.3 - DynamicRepositoryFactory
 *
 * Multi-project support with lazy initialization and async locking.
 *
 * Architecture:
 * - Caches FileRepositoryFactory instances per projectId in Map
 * - Uses getProjectId() from AsyncLocalStorage to select factory
 * - Per-project Mutex prevents race conditions during initialization
 * - Lazy initialization: planRepo.initialize() on first access
 * - Error handling: failed init removes factory from cache
 *
 * Usage (NestJS):
 * 1. CoreModule provides DynamicRepositoryFactory as RepositoryFactory
 * 2. ProjectContextMiddleware sets project context via runWithProjectContext()
 * 3. Services call repositoryFactory.createPlanRepository() which uses getProjectId()
 *
 * References:
 * - Decision 23: DynamicRepositoryFactory + Getter Pattern
 * - Decision 20: Hybrid Approach (AsyncLocalStorage + nestjs-cls)
 */

import { Mutex } from 'async-mutex';
import { getProjectId } from '@mcp-planner/core';
import {
  FileRepositoryFactory,
  FileConfigRepository,
  type RepositoryFactoryConfig,
  type FileLockManager,
  type Repository,
  type LinkRepository,
  type PlanRepository,
  type ConfigRepository,
  type UnitOfWork,
  type Entity,
  type EntityType,
  type RepositoryFactory,
  type StorageBackend,
} from '@mcp-planner/core';

/**
 * DynamicRepositoryFactory - Multi-project repository factory with lazy initialization
 *
 * Features:
 * - Caches FileRepositoryFactory instances per projectId
 * - Uses AsyncLocalStorage context (getProjectId()) to select factory
 * - Lazy initialization with async mutex for race condition prevention
 * - planRepo.initialize() called on first access per projectId
 * - Failed initialization removes factory from cache
 * - close() disposes all cached factories
 *
 * Thread Safety:
 * - Per-project Mutex ensures only one initialization per projectId
 * - Concurrent requests for same projectId wait for initialization
 * - Different projectIds initialize in parallel
 *
 * Error Handling:
 * - Failed planRepo.initialize() removes factory from cache
 * - Error propagates to caller
 * - No silent failures or corrupted cache state
 *
 * @example
 * ```typescript
 * const lockManager = new FileLockManager(baseDir);
 * await lockManager.initialize();
 *
 * const factory = new DynamicRepositoryFactory(baseDir, lockManager);
 *
 * // Inside request with projectId context:
 * await runWithProjectContext('my-project', async () => {
 *   const planRepo = factory.createPlanRepository(); // Uses getProjectId()
 *   await planRepo.initialize();
 *   const plans = await planRepo.listPlans();
 * });
 * ```
 */
export class DynamicRepositoryFactory implements RepositoryFactory {
  private readonly baseDir: string;
  private readonly lockManager: FileLockManager;
  private readonly cacheOptions?: Partial<{ enabled: boolean; ttl: number; maxSize: number }>;

  // Cache: projectId -> FileRepositoryFactory
  private readonly factoryCache = new Map<string, FileRepositoryFactory>();

  // Per-project Mutex for initialization
  private readonly mutexMap = new Map<string, Mutex>();

  // Initialization state: projectId -> boolean (true if initialized)
  private readonly initializedMap = new Map<string, boolean>();

  // PlanRepository wrapper cache: projectId -> lazy PlanRepository wrapper
  private readonly wrapperCache = new Map<string, PlanRepository>();

  // PlanRepository cache: projectId -> real PlanRepository from FileRepositoryFactory
  private readonly planRepoCache = new Map<string, PlanRepository>();

  // Closed state
  private closed = false;

  /**
   * Create DynamicRepositoryFactory
   *
   * @param baseDir - Base directory for file storage
   * @param lockManager - Shared FileLockManager instance
   * @param cacheOptions - Optional cache configuration
   */
  constructor(
    baseDir: string,
    lockManager: FileLockManager,
    cacheOptions?: Partial<{ enabled: boolean; ttl: number; maxSize: number }>
  ) {
    this.baseDir = baseDir;
    this.lockManager = lockManager;
    this.cacheOptions = cacheOptions;
  }

  /**
   * Get or create FileRepositoryFactory for current projectId
   *
   * Uses getProjectId() from AsyncLocalStorage to determine projectId.
   * Caches factory per projectId with lazy initialization.
   * Per-project Mutex prevents race conditions.
   *
   * @returns FileRepositoryFactory for current projectId
   * @throws Error if projectId context is missing
   * @throws Error if initialization fails
   *
   * @private
   */
  private async getOrCreateFactory(): Promise<FileRepositoryFactory> {
    if (this.closed) {
      throw new Error('DynamicRepositoryFactory is closed');
    }

    const projectId = getProjectId();
    if (projectId == null) {
      throw new Error('projectId context is missing. Ensure request is wrapped with runWithProjectContext()');
    }

    // Return cached factory if exists and initialized
    if (this.factoryCache.has(projectId) && this.initializedMap.get(projectId) === true) {
      const cached = this.factoryCache.get(projectId);
      if (cached == null) {
        throw new Error(`Factory cache inconsistency for ${projectId}`);
      }
      return cached;
    }

    // Get or create per-project mutex
    let mutex = this.mutexMap.get(projectId);
    if (!mutex) {
      mutex = new Mutex();
      this.mutexMap.set(projectId, mutex);
    }

    // Acquire lock for initialization
    const release = await mutex.acquire();

    try {
      // Double-check: another concurrent request may have initialized
      if (this.factoryCache.has(projectId) && this.initializedMap.get(projectId) === true) {
        const cached = this.factoryCache.get(projectId);
        if (cached == null) {
          throw new Error(`Factory cache inconsistency for ${projectId}`);
        }
        return cached;
      }

      // Create FileRepositoryFactory for this projectId
      const config: RepositoryFactoryConfig = {
        type: 'file',
        baseDir: this.baseDir,
        projectId,
        lockManager: this.lockManager,
        cacheOptions: this.cacheOptions,
      };

      const factory = new FileRepositoryFactory(config);

      // Initialize PlanRepository (critical step)
      const planRepo = factory.createPlanRepository();
      try {
        await planRepo.initialize();
      } catch (error) {
        // Failed initialization: remove factory from cache
        this.factoryCache.delete(projectId);
        this.initializedMap.delete(projectId);
        // Propagate error
        throw error;
      }

      // Cache factory and mark as initialized
      this.factoryCache.set(projectId, factory);
      this.initializedMap.set(projectId, true);

      return factory;
    } finally {
      release();
    }
  }

  /**
   * Create or retrieve cached entity repository
   *
   * Delegates to FileRepositoryFactory for current projectId.
   * Uses getProjectId() from AsyncLocalStorage.
   *
   * @param entityType - Type of entity
   * @param planId - Plan ID
   * @returns Repository instance
   */
  public createRepository<T extends Entity>(entityType: EntityType, planId: string): Repository<T> {
    if (this.closed) {
      throw new Error('DynamicRepositoryFactory is closed');
    }

    const projectId = getProjectId();
    if (projectId == null) {
      throw new Error('projectId context is missing. Ensure request is wrapped with runWithProjectContext()');
    }

    const factory = this.factoryCache.get(projectId);
    if (factory == null || this.initializedMap.get(projectId) !== true) {
      throw new Error(
        `FileRepositoryFactory for projectId "${projectId}" is not initialized. Call createPlanRepository() first.`
      );
    }

    return factory.createRepository<T>(entityType, planId);
  }

  /**
   * Create or retrieve cached link repository
   *
   * Delegates to FileRepositoryFactory for current projectId.
   * Uses getProjectId() from AsyncLocalStorage.
   *
   * @param planId - Plan ID
   * @returns LinkRepository instance
   */
  public createLinkRepository(planId: string): LinkRepository {
    if (this.closed) {
      throw new Error('DynamicRepositoryFactory is closed');
    }

    const projectId = getProjectId();
    if (projectId == null) {
      throw new Error('projectId context is missing. Ensure request is wrapped with runWithProjectContext()');
    }

    const factory = this.factoryCache.get(projectId);
    if (factory == null || this.initializedMap.get(projectId) !== true) {
      throw new Error(
        `FileRepositoryFactory for projectId "${projectId}" is not initialized. Call createPlanRepository() first.`
      );
    }

    return factory.createLinkRepository(planId);
  }

  /**
   * Create or retrieve cached Plan Repository
   *
   * Uses getProjectId() from AsyncLocalStorage to select factory.
   * Lazy initialization: initializes factory on first method call.
   *
   * Returns a wrapper that defers projectId lookup until first method call.
   * Once projectId is established, caches the real PlanRepository for that project.
   *
   * @returns PlanRepository instance for current projectId
   * @throws Error if projectId context is missing (on first method call)
   */
  public createPlanRepository(): PlanRepository {
    if (this.closed) {
      throw new Error('DynamicRepositoryFactory is closed');
    }

    // Try to get current projectId (may not be available during service construction)
    let currentProjectId: string | undefined;
    try {
      const pid = getProjectId();
      if (pid != null && pid !== '') {
        currentProjectId = pid;
      }
    } catch {
      // No projectId context - will create uncached lazy wrapper
    }

    // If projectId is available and wrapper is cached, return cached wrapper
    if (currentProjectId !== undefined && this.wrapperCache.has(currentProjectId)) {
      const cached = this.wrapperCache.get(currentProjectId);
      if (cached == null) {
        throw new Error(`Wrapper cache inconsistency for ${currentProjectId}`);
      }
      return cached;
    }

    // Create lazy wrapper that defers projectId lookup until method calls
    // This allows PlanService construction without requiring project context
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const factoryInstance = this;

    // Helper to get or create cached real repo for current project context
    const getOrCreateRealRepo = async (): Promise<PlanRepository> => {
      const projectId = getProjectId();
      if (projectId == null) {
        throw new Error('projectId context is missing. Ensure request is wrapped with runWithProjectContext()');
      }

      // Check if we have cached PlanRepository for this projectId
      if (factoryInstance.planRepoCache.has(projectId)) {
        const cached = factoryInstance.planRepoCache.get(projectId);
        if (cached == null) {
          throw new Error(`PlanRepository cache inconsistency for ${projectId}`);
        }
        return cached;
      }

      // Get or create factory for this projectId (this handles initialization)
      const factory = await factoryInstance.getOrCreateFactory();
      const realRepo = factory.createPlanRepository();

      // Cache the real repository for this projectId
      factoryInstance.planRepoCache.set(projectId, realRepo);

      return realRepo;
    };

    const wrapper: PlanRepository = {
      async initialize() {
        const repo = await getOrCreateRealRepo();
        return repo.initialize();
      },

      async createPlan(planId: string) {
        const repo = await getOrCreateRealRepo();
        return repo.createPlan(planId);
      },

      async deletePlan(planId: string) {
        const repo = await getOrCreateRealRepo();
        return repo.deletePlan(planId);
      },

      async listPlans() {
        const repo = await getOrCreateRealRepo();
        return repo.listPlans();
      },

      async planExists(planId: string) {
        const repo = await getOrCreateRealRepo();
        return repo.planExists(planId);
      },

      async saveManifest(planId: string, manifest) {
        const repo = await getOrCreateRealRepo();
        return repo.saveManifest(planId, manifest);
      },

      async loadManifest(planId: string) {
        const repo = await getOrCreateRealRepo();
        return repo.loadManifest(planId);
      },

      async saveActivePlans(index) {
        const repo = await getOrCreateRealRepo();
        return repo.saveActivePlans(index);
      },

      async loadActivePlans() {
        const repo = await getOrCreateRealRepo();
        return repo.loadActivePlans();
      },

      async saveExport(planId: string, filename: string, content: string) {
        const repo = await getOrCreateRealRepo();
        return repo.saveExport(planId, filename, content);
      },

      async saveVersionHistory(planId: string, entityType: string, entityId: string, history) {
        const repo = await getOrCreateRealRepo();
        return repo.saveVersionHistory(planId, entityType, entityId, history);
      },

      async loadVersionHistory(planId: string, entityType: string, entityId: string) {
        const repo = await getOrCreateRealRepo();
        return repo.loadVersionHistory(planId, entityType, entityId);
      },

      async deleteVersionHistory(planId: string, entityType: string, entityId: string) {
        const repo = await getOrCreateRealRepo();
        return repo.deleteVersionHistory(planId, entityType, entityId);
      },
    };

    // Cache wrapper if projectId is available
    if (currentProjectId !== undefined) {
      this.wrapperCache.set(currentProjectId, wrapper);
    }

    return wrapper;
  }

  /**
   * Create or retrieve cached Config Repository
   *
   * ConfigRepository is workspace-level (uses workspacePath, not projectId storage).
   * It doesn't require factory initialization since it operates independently.
   *
   * @returns ConfigRepository instance
   */
  public createConfigRepository(): ConfigRepository {
    if (this.closed) {
      throw new Error('DynamicRepositoryFactory is closed');
    }

    // ConfigRepository is workspace-level and doesn't need projectId context
    // Create directly without requiring factory initialization
    return new FileConfigRepository();
  }

  /**
   * Create unit of work for batch operations
   *
   * Delegates to FileRepositoryFactory for current projectId.
   * Uses getProjectId() from AsyncLocalStorage.
   *
   * @param planId - Plan ID
   * @returns UnitOfWork instance
   */
  public createUnitOfWork(planId: string): UnitOfWork {
    if (this.closed) {
      throw new Error('DynamicRepositoryFactory is closed');
    }

    const projectId = getProjectId();
    if (projectId == null) {
      throw new Error('projectId context is missing. Ensure request is wrapped with runWithProjectContext()');
    }

    const factory = this.factoryCache.get(projectId);
    if (factory == null || this.initializedMap.get(projectId) !== true) {
      throw new Error(
        `FileRepositoryFactory for projectId "${projectId}" is not initialized. Call createPlanRepository() first.`
      );
    }

    return factory.createUnitOfWork(planId);
  }

  /**
   * Get projectId from current async context
   *
   * Returns the current projectId from AsyncLocalStorage context.
   *
   * @returns The projectId from async context
   * @throws Error if projectId context is missing
   */
  public getProjectId(): string {
    const projectId = getProjectId();
    if (projectId == null) {
      throw new Error('projectId context is missing. Ensure request is wrapped with runWithProjectContext()');
    }
    return projectId;
  }

  /**
   * Get the storage backend type
   */
  public getBackend(): StorageBackend {
    return 'file';
  }

  /**
   * Close factory and dispose all cached FileRepositoryFactory instances
   *
   * Calls dispose() on each cached factory, clears all caches and mutex maps.
   * After close(), factory is unusable.
   */
  public async close(): Promise<void> {
    this.closed = true;

    // Dispose all cached factories
    const disposePromises: Promise<void>[] = [];
    for (const factory of this.factoryCache.values()) {
      disposePromises.push(factory.dispose());
    }

    await Promise.all(disposePromises);

    // Clear all caches
    this.factoryCache.clear();
    this.mutexMap.clear();
    this.initializedMap.clear();
    this.wrapperCache.clear();
    this.planRepoCache.clear();
  }
}
