/**
 * Repository Pattern Interfaces
 *
 * Universal storage abstraction supporting multiple backends:
 * - File system (current implementation)
 * - SQLite (future)
 * - PostgreSQL (future)
 * - MongoDB (future)
 */

import type { Entity, Link, EntityType } from '../entities/types.js';

// ============================================================================
// Query Types
// ============================================================================

/**
 * Filter operators for queries
 */
export type FilterOperator =
  | 'eq'      // Equal
  | 'ne'      // Not equal
  | 'gt'      // Greater than
  | 'gte'     // Greater than or equal
  | 'lt'      // Less than
  | 'lte'     // Less than or equal
  | 'in'      // In array
  | 'nin'     // Not in array
  | 'contains'  // String contains
  | 'startsWith' // String starts with
  | 'endsWith'   // String ends with
  | 'exists'     // Field exists
  | 'regex';     // Regular expression

/**
 * Filter condition
 */
export interface FilterCondition<T = any> {
  field: keyof T | string;
  operator: FilterOperator;
  value: any;
}

/**
 * Logical operators for combining filters
 */
export type LogicalOperator = 'and' | 'or' | 'not';

/**
 * Complex filter with logical operators
 */
export interface Filter<T = any> {
  conditions?: FilterCondition<T>[];
  operator?: LogicalOperator;
  nested?: Filter<T>[];
}

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort specification
 */
export interface SortSpec<T = any> {
  field: keyof T | string;
  direction: SortDirection;
}

/**
 * Pagination options
 */
export interface Pagination {
  offset: number;
  limit: number;
}

/**
 * Query options
 */
export interface QueryOptions<T = any> {
  filter?: Filter<T>;
  sort?: SortSpec<T>[];
  pagination?: Pagination;
  includeMetadata?: boolean;
}

/**
 * Query result with pagination metadata
 */
export interface QueryResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// ============================================================================
// Repository Interfaces
// ============================================================================

/**
 * Base read-only repository interface
 */
export interface ReadRepository<T extends Entity> {
  /**
   * Find entity by ID
   * @throws NotFoundError if entity doesn't exist
   */
  findById(id: string): Promise<T>;

  /**
   * Find entity by ID, returns null if not found
   */
  findByIdOrNull(id: string): Promise<T | null>;

  /**
   * Check if entity exists
   */
  exists(id: string): Promise<boolean>;

  /**
   * Find multiple entities by IDs
   * Missing entities are silently skipped
   */
  findByIds(ids: string[]): Promise<T[]>;

  /**
   * Find all entities (use with caution on large datasets)
   */
  findAll(): Promise<T[]>;

  /**
   * Query entities with filters, sorting, and pagination
   */
  query(options: QueryOptions<T>): Promise<QueryResult<T>>;

  /**
   * Count entities matching filter
   */
  count(filter?: Filter<T>): Promise<number>;

  /**
   * Find first entity matching filter
   */
  findOne(filter: Filter<T>): Promise<T | null>;
}

/**
 * Write-only repository interface
 */
export interface WriteRepository<T extends Entity> {
  /**
   * Create new entity
   * @throws ValidationError if data is invalid
   * @throws ConflictError if entity already exists
   */
  create(entity: T): Promise<T>;

  /**
   * Update existing entity
   * @throws NotFoundError if entity doesn't exist
   * @throws ValidationError if data is invalid
   * @throws ConflictError on version mismatch
   */
  update(id: string, entity: Partial<T>): Promise<T>;

  /**
   * Delete entity by ID
   * @throws NotFoundError if entity doesn't exist
   */
  delete(id: string): Promise<void>;

  /**
   * Delete multiple entities by IDs
   * Returns count of deleted entities
   */
  deleteMany(ids: string[]): Promise<number>;
}

/**
 * Bulk operations repository interface
 */
export interface BulkRepository<T extends Entity> {
  /**
   * Create multiple entities
   * @throws BulkOperationError if any operation fails
   */
  createMany(entities: T[]): Promise<T[]>;

  /**
   * Update multiple entities
   * @throws BulkOperationError if any operation fails
   */
  updateMany(updates: { id: string; data: Partial<T> }[]): Promise<T[]>;

  /**
   * Bulk upsert (insert or update)
   */
  upsertMany(entities: T[]): Promise<T[]>;
}

/**
 * Complete repository interface combining read, write, and bulk operations
 */
export interface Repository<T extends Entity>
  extends ReadRepository<T>,
    WriteRepository<T>,
    BulkRepository<T> {
  /**
   * Get entity type handled by this repository
   */
  readonly entityType: EntityType;
}

// ============================================================================
// Link Repository
// ============================================================================

/**
 * Repository for managing entity relationships
 */
export interface LinkRepository {
  /**
   * Create a new link
   * @throws ValidationError if link data is invalid
   * @throws ConflictError if link already exists
   */
  createLink(link: Omit<Link, 'id' | 'createdAt' | 'createdBy'>): Promise<Link>;

  /**
   * Get link by ID
   * @throws NotFoundError if link doesn't exist
   */
  getLinkById(id: string): Promise<Link>;

  /**
   * Find links by source entity ID
   */
  findLinksBySource(sourceId: string, relationType?: string): Promise<Link[]>;

  /**
   * Find links by target entity ID
   */
  findLinksByTarget(targetId: string, relationType?: string): Promise<Link[]>;

  /**
   * Find all links for an entity (both incoming and outgoing)
   */
  findLinksByEntity(entityId: string, direction?: 'incoming' | 'outgoing' | 'both'): Promise<Link[]>;

  /**
   * Find all links (optionally filtered by relation type)
   */
  findAllLinks(relationType?: string): Promise<Link[]>;

  /**
   * Delete link by ID
   */
  deleteLink(id: string): Promise<void>;

  /**
   * Delete all links for an entity
   */
  deleteLinksForEntity(entityId: string): Promise<number>;

  /**
   * Check if link exists
   */
  linkExists(sourceId: string, targetId: string, relationType: string): Promise<boolean>;
}

// ============================================================================
// Unit of Work Pattern
// ============================================================================

/**
 * Transaction isolation level
 */
export type IsolationLevel = 'read_uncommitted' | 'read_committed' | 'repeatable_read' | 'serializable';

/**
 * Transaction options
 */
export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  timeout?: number; // milliseconds
}

/**
 * Unit of Work pattern for managing transactions
 */
export interface UnitOfWork {
  /**
   * Begin transaction
   */
  begin(options?: TransactionOptions): Promise<void>;

  /**
   * Commit transaction
   */
  commit(): Promise<void>;

  /**
   * Rollback transaction
   */
  rollback(): Promise<void>;

  /**
   * Check if transaction is active
   */
  isActive(): boolean;

  /**
   * Execute operation within transaction
   */
  execute<TResult>(fn: () => Promise<TResult>): Promise<TResult>;
}

// ============================================================================
// Plan Repository
// ============================================================================

/**
 * Plan Repository for managing plans, manifests, and active plans index
 *
 * Handles plan-level operations that are not entity-specific:
 * - Plan directory management
 * - Manifest CRUD operations
 * - Active plans index (workspace tracking)
 */
export interface PlanRepository {
  /**
   * Initialize plan storage (create base directories)
   */
  initialize(): Promise<void>;

  /**
   * Create a new plan directory structure
   */
  createPlan(planId: string): Promise<void>;

  /**
   * Delete a plan and all its data
   */
  deletePlan(planId: string): Promise<void>;

  /**
   * List all plan IDs
   */
  listPlans(): Promise<string[]>;

  /**
   * Check if plan exists
   */
  planExists(planId: string): Promise<boolean>;

  /**
   * Save plan manifest
   */
  saveManifest(planId: string, manifest: any): Promise<void>;

  /**
   * Load plan manifest
   */
  loadManifest(planId: string): Promise<any>;

  /**
   * Save active plans index
   */
  saveActivePlans(index: any): Promise<void>;

  /**
   * Load active plans index
   */
  loadActivePlans(): Promise<any>;

  /**
   * Save export file
   * @param planId - Plan ID
   * @param filename - Export filename (e.g. 'plan-export.md')
   * @param content - Export content
   * @returns Full path to saved file
   */
  saveExport(planId: string, filename: string, content: string): Promise<string>;

  /**
   * Save version history for an entity
   * @param planId - Plan ID
   * @param entityType - Entity type (requirement, solution, etc.)
   * @param entityId - Entity ID
   * @param history - Version history data
   */
  saveVersionHistory(planId: string, entityType: string, entityId: string, history: any): Promise<void>;

  /**
   * Load version history for an entity
   * @param planId - Plan ID
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @returns Version history data, or null if not found
   */
  loadVersionHistory(planId: string, entityType: string, entityId: string): Promise<any | null>;

  /**
   * Delete version history for an entity
   * @param planId - Plan ID
   * @param entityType - Entity type
   * @param entityId - Entity ID
   */
  deleteVersionHistory(planId: string, entityType: string, entityId: string): Promise<void>;
}

// ============================================================================
// Repository Factory
// ============================================================================

/**
 * Storage backend type
 */
export type StorageBackend = 'file' | 'sqlite' | 'postgresql' | 'mongodb';

/**
 * Storage configuration
 */
export interface StorageConfig {
  backend: StorageBackend;
  path?: string; // For file and SQLite
  connectionString?: string; // For PostgreSQL and MongoDB
  options?: Record<string, unknown>;
}

/**
 * Repository factory for creating repositories
 */
export interface RepositoryFactory {
  /**
   * Create repository for entity type
   */
  createRepository<T extends Entity>(entityType: EntityType, planId: string): Repository<T>;

  /**
   * Create link repository
   */
  createLinkRepository(planId: string): LinkRepository;

  /**
   * Create plan repository (singleton, no planId needed)
   */
  createPlanRepository(): PlanRepository;

  /**
   * Create unit of work
   */
  createUnitOfWork(planId: string): UnitOfWork;

  /**
   * Get storage backend type
   */
  getBackend(): StorageBackend;

  /**
   * Close all connections and cleanup
   */
  close(): Promise<void>;
}
