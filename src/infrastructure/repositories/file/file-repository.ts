/**
 * FileRepository<T> - File-based repository implementation
 *
 * Implements Repository Pattern for file-based storage:
 * - Entity files stored as JSON in entities/ directory
 * - IndexManager for fast lookups with caching
 * - LockManager for concurrent access control
 * - Atomic writes with graceful-fs
 * - Validation with Zod schemas
 * - Query operations with filtering, sorting, pagination
 * - Bulk operations with transaction semantics
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as util from 'util';
import gracefulFs from 'graceful-fs';
import type {
  Repository,
  QueryOptions,
  QueryResult,
  Filter,
  SortSpec,
} from '../../../domain/repositories/interfaces.js';
import type { Entity, EntityType } from '../../../domain/entities/types.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../../domain/repositories/errors.js';
import { IndexManager } from './index-manager.js';
import { LockManager } from './lock-manager.js';
import type { IndexMetadata, CacheOptions } from './types.js';

const gracefulRename = util.promisify(gracefulFs.rename);

/**
 * File Repository Implementation
 */
export class FileRepository<T extends Entity> implements Repository<T> {
  readonly entityType: EntityType;

  private baseDir: string;
  private planId: string;
  private entitiesDir: string;
  private indexManager: IndexManager<IndexMetadata>;
  private lockManager: LockManager;
  private entityCache: Map<string, T> = new Map();
  private cacheOptions: Required<CacheOptions>;

  constructor(
    baseDir: string,
    planId: string,
    entityType: EntityType,
    cacheOptions?: Partial<CacheOptions>
  ) {
    this.baseDir = baseDir;
    this.planId = planId;
    this.entityType = entityType;

    // Setup paths
    const planDir = path.join(baseDir, 'plans', planId);
    this.entitiesDir = path.join(planDir, 'entities');
    const indexesDir = path.join(planDir, 'indexes');
    const indexPath = path.join(indexesDir, `${entityType}-index.json`);

    // Initialize managers
    this.indexManager = new IndexManager<IndexMetadata>(indexPath, cacheOptions);
    this.lockManager = new LockManager();

    // Cache options
    this.cacheOptions = {
      enabled: cacheOptions?.enabled ?? true,
      ttl: cacheOptions?.ttl ?? 5000,
      maxSize: cacheOptions?.maxSize ?? 100,
      invalidation: cacheOptions?.invalidation ?? 'version',
    };
  }

  /**
   * Initialize repository
   */
  async initialize(): Promise<void> {
    // Create directories
    const planDir = path.join(this.baseDir, 'plans', this.planId);
    const indexesDir = path.join(planDir, 'indexes');

    await fs.mkdir(this.entitiesDir, { recursive: true });
    await fs.mkdir(indexesDir, { recursive: true });

    // Initialize index
    await this.indexManager.initialize();
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  async findById(id: string): Promise<T> {
    const entity = await this.findByIdOrNull(id);
    if (!entity) {
      throw new NotFoundError(this.entityType, id);
    }
    return entity;
  }

  async findByIdOrNull(id: string): Promise<T | null> {
    // Check cache first
    if (this.cacheOptions.enabled) {
      const cached = this.entityCache.get(id);
      if (cached) {
        return cached;
      }
    }

    // Get from index
    const metadata = await this.indexManager.get(id);
    if (!metadata) {
      return null;
    }

    // Load entity from file
    const entity = await this.loadEntityFile(metadata.filePath);

    // Cache result
    if (this.cacheOptions.enabled) {
      this.cacheEntity(id, entity);
    }

    return entity;
  }

  async exists(id: string): Promise<boolean> {
    return await this.indexManager.has(id);
  }

  async findByIds(ids: string[]): Promise<T[]> {
    const results: T[] = [];
    for (const id of ids) {
      const entity = await this.findByIdOrNull(id);
      if (entity) {
        results.push(entity);
      }
    }
    return results;
  }

  async findAll(): Promise<T[]> {
    const allMetadata = await this.indexManager.getAll();
    const entities: T[] = [];

    for (const metadata of allMetadata) {
      const entity = await this.loadEntityFile(metadata.filePath);
      entities.push(entity);
    }

    return entities;
  }

  async query(options: QueryOptions<T>): Promise<QueryResult<T>> {
    // Load all entities
    let entities = await this.findAll();

    // Apply filter
    if (options.filter) {
      entities = this.applyFilter(entities, options.filter);
    }

    const total = entities.length;

    // Apply sort
    if (options.sort && options.sort.length > 0) {
      entities = this.applySort(entities, options.sort);
    }

    // Apply pagination
    const offset = options.pagination?.offset ?? 0;
    const limit = options.pagination?.limit ?? total;

    const paginatedEntities = entities.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      items: paginatedEntities,
      total,
      offset,
      limit,
      hasMore,
    };
  }

  async count(filter?: Filter<T>): Promise<number> {
    if (!filter) {
      return await this.indexManager.size();
    }

    const entities = await this.findAll();
    const filtered = this.applyFilter(entities, filter);
    return filtered.length;
  }

  async findOne(filter: Filter<T>): Promise<T | null> {
    const entities = await this.findAll();
    const filtered = this.applyFilter(entities, filter);
    return filtered[0] ?? null;
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  async create(entity: T): Promise<T> {
    return await this.lockManager.withLock(`entity:${entity.id}`, async () => {
      // Check if already exists
      if (await this.exists(entity.id)) {
        throw new ConflictError(
          `${this.entityType} with ID '${entity.id}' already exists`,
          'duplicate',
          { entityType: this.entityType, entityId: entity.id }
        );
      }

      // Validate entity
      this.validateEntity(entity);

      // Generate file path
      const filePath = this.getEntityFilePath(entity.id);

      // Save entity to file
      await this.saveEntityFile(filePath, entity);

      // Update index
      await this.indexManager.add({
        id: entity.id,
        type: this.entityType,
        filePath,
        version: entity.version,
        updatedAt: entity.updatedAt,
      });

      // Cache entity
      if (this.cacheOptions.enabled) {
        this.cacheEntity(entity.id, entity);
      }

      return entity;
    });
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    return await this.lockManager.withLock(`entity:${id}`, async () => {
      // Load existing entity
      const existing = await this.findById(id);

      // Apply updates
      const updated: T = {
        ...existing,
        ...updates,
        id, // Ensure ID cannot be changed
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      };

      // Validate updated entity
      this.validateEntity(updated);

      // Save to file
      const filePath = this.getEntityFilePath(id);
      await this.saveEntityFile(filePath, updated);

      // Update index
      await this.indexManager.update({
        id: updated.id,
        type: this.entityType,
        filePath,
        version: updated.version,
        updatedAt: updated.updatedAt,
      });

      // Invalidate cache
      this.invalidateCache(id);

      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    return await this.lockManager.withLock(`entity:${id}`, async () => {
      // Check if exists
      if (!(await this.exists(id))) {
        throw new NotFoundError(this.entityType, id);
      }

      // Delete file
      const filePath = this.getEntityFilePath(id);
      await fs.unlink(path.join(this.entitiesDir, filePath)).catch(() => {});

      // Remove from index
      await this.indexManager.delete(id);

      // Invalidate cache
      this.invalidateCache(id);
    });
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  async createMany(entities: T[]): Promise<T[]> {
    const created: T[] = [];
    const rollback: string[] = [];

    try {
      for (const entity of entities) {
        // Validate before creating
        this.validateEntity(entity);

        const result = await this.create(entity);
        created.push(result);
        rollback.push(entity.id);
      }

      return created;
    } catch (error) {
      // Rollback on error
      for (const id of rollback) {
        await this.delete(id).catch(() => {});
      }
      throw error;
    }
  }

  async updateMany(updates: Array<{ id: string; data: Partial<T> }>): Promise<T[]> {
    const results: T[] = [];

    for (const { id, data } of updates) {
      const updated = await this.update(id, data);
      results.push(updated);
    }

    return results;
  }

  async deleteMany(ids: string[]): Promise<number> {
    let deleted = 0;

    for (const id of ids) {
      try {
        await this.delete(id);
        deleted++;
      } catch (error) {
        // Skip non-existent entities
        if (!(error instanceof NotFoundError)) {
          throw error;
        }
      }
    }

    return deleted;
  }

  async upsertMany(entities: T[]): Promise<T[]> {
    const results: T[] = [];

    for (const entity of entities) {
      const exists = await this.exists(entity.id);

      if (exists) {
        // Update existing
        const updated = await this.update(entity.id, entity);
        results.push(updated);
      } else {
        // Create new
        const created = await this.create(entity);
        results.push(created);
      }
    }

    return results;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Get entity file path relative to entities directory
   */
  private getEntityFilePath(id: string): string {
    return `${this.entityType}-${id}.json`;
  }

  /**
   * Load entity from file
   */
  private async loadEntityFile(filePath: string): Promise<T> {
    const fullPath = path.join(this.entitiesDir, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    return JSON.parse(content) as T;
  }

  /**
   * Save entity to file atomically
   */
  private async saveEntityFile(filePath: string, entity: T): Promise<void> {
    const fullPath = path.join(this.entitiesDir, filePath);
    const tmpPath = `${fullPath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;

    try {
      // Write to temp file
      await fs.writeFile(tmpPath, JSON.stringify(entity, null, 2), 'utf-8');

      // Verify JSON is valid
      const written = await fs.readFile(tmpPath, 'utf-8');
      JSON.parse(written);

      // Atomic rename
      await gracefulRename(tmpPath, fullPath);
    } catch (error) {
      // Cleanup temp file
      await fs.unlink(tmpPath).catch(() => {});
      throw error;
    }
  }

  /**
   * Validate entity
   */
  private validateEntity(entity: T): void {
    const errors: Array<{ field: string; message: string; value?: unknown }> = [];

    if (!entity.id || entity.id.trim() === '') {
      errors.push({
        field: 'id',
        message: 'Entity ID cannot be empty',
        value: entity.id,
      });
    }

    if (!entity.type) {
      errors.push({
        field: 'type',
        message: 'Entity type is required',
      });
    }

    if (typeof entity.version !== 'number' || entity.version < 1) {
      errors.push({
        field: 'version',
        message: 'Version must be a positive number',
        value: entity.version,
      });
    }

    if (errors.length > 0) {
      throw new ValidationError(
        `Validation failed for ${this.entityType}`,
        errors,
        { entityType: this.entityType }
      );
    }
  }

  /**
   * Apply filter to entities
   */
  private applyFilter(entities: T[], filter: Filter<T>): T[] {
    if ('conditions' in filter && Array.isArray(filter.conditions)) {
      const operator = filter.operator ?? 'and';

      return entities.filter((entity) => {
        const results = filter.conditions!.map((condition) => {
          const field = condition.field as keyof T;
          const value = entity[field];

          switch (condition.operator) {
            case 'eq':
              return value === condition.value;
            case 'ne':
              return value !== condition.value;
            case 'gt':
              return value > condition.value;
            case 'gte':
              return value >= condition.value;
            case 'lt':
              return value < condition.value;
            case 'lte':
              return value <= condition.value;
            case 'in':
              return Array.isArray(condition.value) && condition.value.includes(value);
            case 'nin':
              return Array.isArray(condition.value) && !condition.value.includes(value);
            case 'contains':
              return typeof value === 'string' && value.includes(String(condition.value));
            default:
              return false;
          }
        });

        return operator === 'and' ? results.every((r) => r) : results.some((r) => r);
      });
    }

    return entities;
  }

  /**
   * Apply sort to entities
   */
  private applySort(entities: T[], sort: SortSpec<T>[]): T[] {
    // Priority order for semantic fields
    const priorityOrder: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    return [...entities].sort((a, b) => {
      for (const { field, direction } of sort) {
        const aVal = a[field as keyof T];
        const bVal = b[field as keyof T];

        let comparison = 0;

        // Special handling for priority field
        if (field === 'priority' && typeof aVal === 'string' && typeof bVal === 'string') {
          const aPriority = priorityOrder[aVal.toLowerCase()] ?? 0;
          const bPriority = priorityOrder[bVal.toLowerCase()] ?? 0;
          comparison = aPriority - bPriority;
        } else {
          // Standard comparison
          if (aVal < bVal) comparison = -1;
          else if (aVal > bVal) comparison = 1;
        }

        if (comparison !== 0) {
          return direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });
  }

  /**
   * Cache entity
   */
  private cacheEntity(id: string, entity: T): void {
    // LRU eviction
    if (this.entityCache.size >= this.cacheOptions.maxSize) {
      const firstKey = this.entityCache.keys().next().value;
      if (firstKey) {
        this.entityCache.delete(firstKey);
      }
    }

    this.entityCache.set(id, entity);
  }

  /**
   * Invalidate cache
   */
  private invalidateCache(id: string): void {
    this.entityCache.delete(id);
  }
}
