/**
 * Infrastructure exports
 *
 * File-based repository implementations and supporting utilities.
 */

// ============================================================================
// Factory
// ============================================================================
export { FileRepositoryFactory } from './factory/repository-factory.js';
export type { RepositoryFactoryConfig } from './factory/repository-factory.js';

// ============================================================================
// File Repositories
// ============================================================================
export { FilePlanRepository } from './repositories/file/file-plan-repository.js';
export { FileRepository } from './repositories/file/file-repository.js';
export { FileLinkRepository } from './repositories/file/file-link-repository.js';
export { FileUnitOfWork } from './repositories/file/file-unit-of-work.js';
export { BaseFileRepository } from './repositories/file/base-file-repository.js';

// ============================================================================
// Lock Manager
// ============================================================================
export { FileLockManager } from './repositories/file/file-lock-manager.js';

// ============================================================================
// Index Manager
// ============================================================================
export { IndexManager } from './repositories/file/index-manager.js';

// ============================================================================
// File Utils
// ============================================================================
export { atomicWriteJSON, loadJSON } from './repositories/file/file-utils.js';

// ============================================================================
// Types
// ============================================================================
export {
  DEFAULT_CACHE_OPTIONS,
  type CacheOptions,
  type IndexMetadata,
  type LinkIndexMetadata,
  type FileStorageConfig,
  type PlanPaths,
  type LogLevel,
  type LockLogger,
} from './repositories/file/types.js';
