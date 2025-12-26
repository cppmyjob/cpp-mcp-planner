/**
 * FileUnitOfWork - File-based Unit of Work implementation
 *
 * Transaction management for file-based repositories:
 * - Best-effort transaction semantics (FIX C5: file system limitations)
 * - Shared FileLockManager across all repositories for cross-process safety
 * - Repository lifecycle management (lazy creation)
 * - Operation tracking for transaction state management
 * - Warning system for rollback limitations
 * - Cleanup and disposal support
 *
 * LIMITATION (FIX C5):
 * File system does not support native transactions. Rollback is best-effort:
 * - Created files may persist if delete fails during rollback
 * - Modified files cannot be restored to previous state
 * - Partial rollback may leave inconsistent state
 *
 * Recommendation: Use database backend (SQLite/PostgreSQL) for ACID guarantees.
 */

import type {
  UnitOfWork,
  TransactionOptions,
  Repository,
} from '../../../domain/repositories/interfaces.js';
import type { Entity, EntityType } from '../../../domain/entities/types.js';
import { FileRepository } from './file-repository.js';
import { FileLinkRepository } from './file-link-repository.js';
import { type FileLockManager } from './file-lock-manager.js';
import type { CacheOptions } from './types.js';

/**
 * Transaction state
 * FIX M-2: Simplified to only used states. 'committed' and 'rolled_back' were
 * never actually set - the state resets to 'idle' after commit/rollback for reuse.
 */
type TransactionState = 'idle' | 'active';

/**
 * Warning callback type
 */
export type WarningCallback = (message: string) => void;

/**
 * File Unit of Work Implementation
 */
export class FileUnitOfWork implements UnitOfWork {
  private readonly baseDir: string;
  private readonly projectId: string;
  private readonly planId: string;
  private readonly fileLockManager: FileLockManager;
  private readonly cacheOptions?: Partial<CacheOptions>;

  // Transaction state
  private state: TransactionState = 'idle';
  private options?: TransactionOptions;
  private operationCount = 0;
  private disposed = false;

  // Repository cache (lazy creation)
  private readonly repositories = new Map<EntityType, Repository<Entity>>();
  private linkRepository?: FileLinkRepository;

  // Warning system (FIX C5)
  private warningCallbacks: WarningCallback[] = [];

  constructor(
    baseDir: string,
    projectId: string,
    planId: string,
    fileLockManager: FileLockManager,
    cacheOptions?: Partial<CacheOptions>
  ) {
    this.baseDir = baseDir;
    this.projectId = projectId;
    this.planId = planId;
    this.fileLockManager = fileLockManager;
    this.cacheOptions = cacheOptions;
  }

  /**
   * Initialize Unit of Work
   */
  public initialize(): Promise<void> {
    // FileLockManager should already be initialized by caller
    // Just verify it's ready (FIX M-1)
    if (!this.fileLockManager.isInitialized()) {
      return Promise.reject(new Error('FileLockManager must be initialized before use'));
    }

    return Promise.resolve();
  }

  // ============================================================================
  // Transaction Lifecycle
  // ============================================================================

  public begin(options?: TransactionOptions): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error('Cannot begin transaction: Unit of Work is disposed'));
    }

    if (this.state !== 'idle') {
      return Promise.reject(new Error(`Cannot begin transaction: transaction already active`));
    }

    this.state = 'active';
    this.options = options;
    this.operationCount = 0;

    // Note: File system does not support native isolation levels
    // We only track the option for compatibility
    if (options?.isolationLevel !== undefined) {
      this.emitLimitationWarning(
        `LIMITATION: File system does not support isolation level '${options.isolationLevel}'. ` +
          `All operations use file-level locking. Consider database backend for ACID guarantees.`
      );
    }

    return Promise.resolve();
  }

  public commit(): Promise<void> {
    if (this.state !== 'active') {
      return Promise.reject(new Error('Cannot commit: no active transaction'));
    }

    // File operations are already persisted, nothing to do
    // Reset to 'idle' for reuse (FIX M-3)
    this.state = 'idle';
    this.operationCount = 0;

    return Promise.resolve();
  }

  public rollback(): Promise<void> {
    if (this.state !== 'active') {
      return Promise.reject(new Error('Cannot rollback: no active transaction'));
    }

    // Emit LIMITATION warning (FIX C5)
    this.emitLimitationWarning(
      'LIMITATION: File system does not support native rollback. ' +
        'Changes may have already been persisted. Best-effort cleanup attempted.'
    );

    // Reset to 'idle' for reuse (FIX M-3)
    this.state = 'idle';
    this.operationCount = 0;

    // Note: Actual rollback would require tracking all operations and reverting them
    // For file-based implementation, this is best-effort only

    return Promise.resolve();
  }

  public isActive(): boolean {
    return this.state === 'active';
  }

  public async execute<TResult>(fn: () => Promise<TResult>): Promise<TResult> {
    // Auto-begin if not active
    const shouldManageTransaction = this.state === 'idle';

    if (shouldManageTransaction) {
      await this.begin();
    }

    try {
      const result = await fn();

      // Auto-commit if we started the transaction
      if (shouldManageTransaction) {
        await this.commit();
      }

      return result;
    } catch (error) {
      // Auto-rollback if we started the transaction
      if (shouldManageTransaction && this.state === 'active') {
        await this.rollback();
      }

      throw error;
    }
  }

  // ============================================================================
  // Repository Access
  // ============================================================================

  public getRepository<T extends Entity>(entityType: EntityType): FileRepository<T> {
    // Check cache
    if (this.repositories.has(entityType)) {
      return this.repositories.get(entityType) as FileRepository<T>;
    }

    // Create new repository with shared FileLockManager and projectId
    const repository = new FileRepository<T>(
      this.baseDir,
      this.projectId,
      this.planId,
      entityType,
      this.cacheOptions,
      this.fileLockManager // Pass shared FileLockManager
    );

    // Cache and return (user must call repository.initialize())
    this.repositories.set(entityType, repository as Repository<Entity>);
    return repository;
  }

  public getLinkRepository(): FileLinkRepository {
    // Create with shared FileLockManager and projectId
    this.linkRepository ??= new FileLinkRepository(
      this.baseDir,
      this.projectId,
      this.planId,
      this.fileLockManager,
      this.cacheOptions
    );

    // Note: Repository initialization is lazy (called by user)

    return this.linkRepository;
  }

  /**
   * Get FileLockManager instance (for testing and repository sharing)
   */
  public getLockManager(): FileLockManager {
    return this.fileLockManager;
  }

  // ============================================================================
  // Warning System (FIX C5)
  // ============================================================================

  /**
   * Register warning callback
   */
  public onWarning(callback: WarningCallback): void {
    this.warningCallbacks.push(callback);
  }

  /**
   * Emit LIMITATION warning to all registered callbacks
   */
  private emitLimitationWarning(message: string): void {
    for (const callback of this.warningCallbacks) {
      callback(message);
    }
  }

  // ============================================================================
  // State Management
  // ============================================================================

  /**
   * Get current operation count (for testing)
   */
  public getOperationCount(): number {
    return this.operationCount;
  }

  /**
   * Increment operation count (called by repositories)
   */
  public incrementOperationCount(): void {
    this.operationCount++;
  }

  /**
   * Get current transaction state (for testing)
   */
  public getState(): TransactionState {
    return this.state;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Dispose Unit of Work and cleanup resources
   */
  public async dispose(): Promise<void> {
    // Dispose all cached repositories BEFORE clearing (FIX H-1)
    for (const repo of this.repositories.values()) {
      if ('dispose' in repo && typeof repo.dispose === 'function') {
        await (repo as { dispose: () => Promise<void> }).dispose();
      }
    }
    this.repositories.clear();

    // Dispose link repository if exists (FIX H-1)
    if (this.linkRepository) {
      await this.linkRepository.dispose();
      this.linkRepository = undefined;
    }

    // Reset transaction state
    this.state = 'idle';
    this.operationCount = 0;
    this.warningCallbacks = [];
    this.disposed = true;

    // Note: FileLockManager is shared and should be disposed by the factory
    // We don't dispose it here
  }

  /**
   * Check if Unit of Work is disposed (for testing)
   */
  public isDisposed(): boolean {
    return this.disposed;
  }
}
