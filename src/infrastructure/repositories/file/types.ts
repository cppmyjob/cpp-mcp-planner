/**
 * File Storage Repository Types
 *
 * Type definitions for file-based repository implementation:
 * - Index metadata structures
 * - Lock management types
 * - Cache configuration
 */

// ============================================================================
// Index Types
// ============================================================================

/**
 * Base index metadata structure
 * Stores entity location and basic info for fast lookups
 */
export interface IndexMetadata {
  /** Entity ID */
  id: string;

  /** Entity type */
  type: string;

  /** File path relative to plan directory */
  filePath: string;

  /** Entity version for optimistic locking */
  version: number;

  /** Last update timestamp */
  updatedAt: string;

  /** Optional custom metadata */
  [key: string]: unknown;
}

/**
 * Link index metadata
 * Optimized for relationship queries
 */
export interface LinkIndexMetadata extends IndexMetadata {
  /** Source entity ID */
  sourceId: string;

  /** Target entity ID */
  targetId: string;

  /** Relation type */
  relationType: string;

  /** Created timestamp (in addition to updatedAt from base) */
  createdAt: string;
}

/**
 * Index structure stored on disk
 */
export interface IndexFile<TMetadata = IndexMetadata> {
  /** Index format version */
  version: number;

  /** Index type identifier */
  indexType: string;

  /** Last update timestamp */
  lastUpdated: string;

  /** Indexed entries */
  entries: TMetadata[];

  /** Index statistics */
  stats?: {
    totalEntries: number;
    lastRebuild?: string;
  };
}

// ============================================================================
// Lock Types
// ============================================================================

/**
 * Lock holder information
 */
export interface LockHolder {
  /** Lock ID */
  lockId: string;

  /** Resource being locked */
  resource: string;

  /** Lock acquisition timestamp */
  acquiredAt: number;

  /** Lock expiration timestamp (for timeout) */
  expiresAt?: number;

  /** Holder identifier (thread/process) */
  holderId: string;

  /** Number of times lock acquired (for reentrant locks) */
  refCount: number;

  /** Timer reference for auto-release (internal use) */
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Lock options
 */
export interface LockOptions {
  /** Lock timeout in milliseconds */
  timeout?: number;

  /** Whether lock is reentrant (can be acquired multiple times by same holder) */
  reentrant?: boolean;

  /** Holder identifier (defaults to process.pid) */
  holderId?: string;
}

/**
 * Lock result
 */
export interface LockResult {
  /** Whether lock was acquired successfully */
  acquired: boolean;

  /** Lock ID if acquired */
  lockId?: string;

  /** Reason for failure */
  reason?: string;
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  /** Cached value */
  value: T;

  /** Cache timestamp */
  cachedAt: number;

  /** Time-to-live in milliseconds */
  ttl?: number;

  /** Version for cache invalidation */
  version?: number;
}

/**
 * Cache options
 */
export interface CacheOptions {
  /** Enable caching */
  enabled: boolean;

  /** Default TTL in milliseconds (0 = no expiration) */
  ttl: number;

  /** Maximum cache entries */
  maxSize: number;

  /** Cache invalidation strategy */
  invalidation: 'ttl' | 'version' | 'manual';
}

// ============================================================================
// Storage Configuration
// ============================================================================

/**
 * File storage configuration
 */
export interface FileStorageConfig {
  /** Base directory for storage */
  baseDir: string;

  /** Cache configuration */
  cache?: Partial<CacheOptions>;

  /** Lock timeout in milliseconds */
  lockTimeout?: number;

  /** Enable atomic writes with graceful-fs */
  atomicWrites?: boolean;

  /** Index rebuild interval in milliseconds (0 = never) */
  indexRebuildInterval?: number;
}

// ============================================================================
// Storage Paths
// ============================================================================

/**
 * Plan storage paths
 */
export interface PlanPaths {
  /** Plan root directory */
  root: string;

  /** Entities directory */
  entities: string;

  /** Links file */
  links: string;

  /** Manifest file */
  manifest: string;

  /** History directory */
  history: string;

  /** Indexes directory */
  indexes: string;

  /** Locks directory */
  locks: string;
}

/**
 * Entity type file names
 */
export const ENTITY_FILE_NAMES: Record<string, string> = {
  requirement: 'requirement.json',
  solution: 'solution.json',
  decision: 'decision.json',
  phase: 'phase.json',
  artifact: 'artifact.json',
};

/**
 * Index file names
 */
export const INDEX_FILE_NAMES = {
  requirement: 'requirement-index.json',
  solution: 'solution-index.json',
  decision: 'decision-index.json',
  phase: 'phase-index.json',
  artifact: 'artifact-index.json',
  links: 'links-index.json',
} as const;

/**
 * Default cache options
 */
export const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  enabled: true,
  ttl: 5000, // 5 seconds
  maxSize: 100,
  invalidation: 'version',
};

/**
 * Default lock timeout (10 seconds)
 */
export const DEFAULT_LOCK_TIMEOUT = 10000;

/**
 * Default index rebuild interval (1 hour)
 */
export const DEFAULT_INDEX_REBUILD_INTERVAL = 3600000;
