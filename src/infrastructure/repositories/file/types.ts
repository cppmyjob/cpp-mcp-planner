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
 * Log levels for LockManager logging
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

/**
 * Logger interface for LockManager
 * Allows plugging in custom logging implementations (console, winston, pino, etc.)
 */
export interface LockLogger {
  debug?(message: string, context?: Record<string, unknown>): void;
  info?(message: string, context?: Record<string, unknown>): void;
  warn?(message: string, context?: Record<string, unknown>): void;
  error?(message: string, context?: Record<string, unknown>): void;
}

/**
 * LockManager constructor options
 */
export interface LockManagerOptions {
  /**
   * Default timeout for acquiring locks (ms)
   * How long to wait for a locked resource to become available
   * @default 10000 (10 seconds)
   */
  defaultAcquireTimeout?: number;

  /**
   * Default TTL for locks (ms)
   * How long a lock lives before auto-release
   * 0 = no auto-release (infinite)
   * @default 0 (infinite)
   */
  defaultTtl?: number;

  /**
   * Optional logger for debugging
   */
  logger?: LockLogger;

  /**
   * Minimum log level
   * @default 'none'
   */
  logLevel?: LogLevel;

  /**
   * Maximum retry attempts in doAcquire() loop
   * Prevents infinite loop under high contention
   * 0 = no limit (rely on acquireTimeout only)
   * @default 0 (no limit)
   */
  maxRetries?: number;

  /**
   * Timeout for dispose() to wait for in-flight operations (ms)
   * @default 100
   */
  disposeTimeout?: number;
}

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

  /** Lock expiration timestamp (TTL-based) */
  expiresAt?: number;

  /** Holder identifier (thread/process) */
  holderId: string;

  /** Number of times lock acquired (for reentrant locks) */
  refCount: number;

  /** Timer reference for auto-release (internal use) */
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Lock options for acquire()
 */
export interface LockOptions {
  /**
   * How long to wait for lock acquisition (ms)
   * - acquireTimeout > 0: wait up to N milliseconds
   * - acquireTimeout === 0: instant fail if locked
   * - acquireTimeout === undefined: use defaultAcquireTimeout
   */
  acquireTimeout?: number;

  /**
   * How long the lock lives after acquisition (ms)
   * - ttl > 0: auto-release after N milliseconds
   * - ttl === 0 or undefined: no auto-release (infinite)
   */
  ttl?: number;

  /**
   * @deprecated Use acquireTimeout instead. Will be removed in v2.0.
   * If both timeout and acquireTimeout are specified, acquireTimeout takes precedence.
   * For backwards compatibility: timeout is used for BOTH acquire timeout AND ttl
   * when acquireTimeout/ttl are not specified.
   */
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

/**
 * Result of extend() operation
 */
export interface ExtendResult {
  /** Whether extension was successful */
  extended: boolean;

  /** New expiration timestamp if extended */
  newExpiresAt?: number;

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

  /** Enable atomic writes with write-file-atomic */
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
 * Default acquire timeout (10 seconds)
 * How long to wait for a locked resource
 */
export const DEFAULT_ACQUIRE_TIMEOUT = 10000;

/**
 * Default TTL (0 = infinite, no auto-release)
 */
export const DEFAULT_LOCK_TTL = 0;

/**
 * @deprecated Use DEFAULT_ACQUIRE_TIMEOUT instead
 */
export const DEFAULT_LOCK_TIMEOUT = DEFAULT_ACQUIRE_TIMEOUT;

/**
 * Default index rebuild interval (1 hour)
 */
export const DEFAULT_INDEX_REBUILD_INTERVAL = 3600000;
