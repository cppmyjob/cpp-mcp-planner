/**
 * FileLinkRepository - File-based repository for Link entities
 *
 * Specialized repository for managing entity relationships:
 * - Link files stored as JSON in links/ directory
 * - IndexManager with LinkIndexMetadata for composite key lookups
 * - FileLockManager for cross-process concurrent access control
 * - Source/Target indexes for efficient queries
 * - Bulk operations with transaction semantics
 * - Support for RelationType filtering
 *
 * Extends BaseFileRepository to inherit common functionality:
 * - atomicWriteJSON() for safe file writes
 * - loadJSON() for file reading
 * - LRU cache operations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import type { LinkRepository } from '../../../domain/repositories/interfaces.js';
import type { Link, RelationType } from '../../../domain/entities/types.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../../domain/repositories/errors.js';
import { IndexManager } from './index-manager.js';
import { type FileLockManager } from './file-lock-manager.js';
import { BaseFileRepository } from './base-file-repository.js';
import type { LinkIndexMetadata, CacheOptions } from './types.js';

/**
 * File Link Repository Implementation
 *
 * Extends BaseFileRepository for common file operations
 */
export class FileLinkRepository
  extends BaseFileRepository
  implements LinkRepository
{
  private readonly planId: string;
  private readonly linksDir: string;
  private readonly indexManager: IndexManager<LinkIndexMetadata>;
  private readonly fileLockManager: FileLockManager;
  private readonly linkCache = new Map<string, Link>();

  constructor(
    baseDir: string,
    planId: string,
    fileLockManager: FileLockManager,
    cacheOptions?: Partial<CacheOptions>
  ) {
    super(baseDir, cacheOptions);
    this.planId = planId;
    this.fileLockManager = fileLockManager;

    // Setup paths
    const planDir = path.join(baseDir, 'plans', planId);
    this.linksDir = path.join(planDir, 'links');
    const indexesDir = path.join(planDir, 'indexes');
    const indexPath = path.join(indexesDir, 'link-index.json');

    // Initialize index manager
    this.indexManager = new IndexManager<LinkIndexMetadata>(indexPath, cacheOptions);
  }

  /**
   * Initialize repository
   */
  public async initialize(): Promise<void> {
    if (this.isInitializedState()) {
      return; // Already initialized
    }

    // Create directories
    const planDir = path.join(this.baseDir, 'plans', this.planId);
    const indexesDir = path.join(planDir, 'indexes');

    await fs.mkdir(this.linksDir, { recursive: true });
    await fs.mkdir(indexesDir, { recursive: true });

    // Initialize index manager
    await this.indexManager.initialize();

    this.markInitialized();
  }

  // ensureInitialized() is inherited from BaseFileRepository

  /**
   * Get FileLockManager instance (for testing)
   */
  public getLockManager(): FileLockManager {
    return this.fileLockManager;
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  public async createLink(link: Omit<Link, 'id' | 'createdAt' | 'createdBy'>): Promise<Link> {
    await this.ensureInitialized();

    // Validate
    this.validateLinkData(link);

    // FIX H-1: Lock on composite key to prevent race condition
    // The lock must be acquired BEFORE the duplicate check to avoid TOCTOU
    const compositeKey = `link:${link.sourceId}:${link.targetId}:${link.relationType}`;

    return await this.fileLockManager.withLock(compositeKey, async () => {
      // Check for existing link with same composite key (now inside lock)
      const exists = await this.linkExists(link.sourceId, link.targetId, link.relationType);
      if (exists) {
        throw new ConflictError(
          `Link already exists: ${link.sourceId} -> ${link.targetId} (${link.relationType})`,
          'duplicate',
          { sourceId: link.sourceId, targetId: link.targetId, relationType: link.relationType }
        );
      }

      // Create link with generated fields
      const id = uuidv4();
      const now = new Date().toISOString();
      const fullLink: Link = {
        ...link,
        id,
        createdAt: now,
        createdBy: 'system', // Default system user; context-based user tracking not yet implemented
      };

      // Get file path
      const filePath = this.getLinkFilePath(id);

      // Atomic write link file
      await this.saveLinkFile(filePath, fullLink);

      // Update index
      const metadata: LinkIndexMetadata = {
        id,
        type: 'link',
        filePath,
        sourceId: fullLink.sourceId,
        targetId: fullLink.targetId,
        relationType: fullLink.relationType,
        createdAt: fullLink.createdAt,
        updatedAt: now,
        version: 1,
      };

      await this.indexManager.add(metadata);

      // Cache with LRU eviction
      if (this.cacheOptions.enabled) {
        this.cacheLink(id, fullLink);
      }

      return fullLink;
    });
  }

  public async getLinkById(id: string): Promise<Link> {
    await this.ensureInitialized();
    const link = await this.getLinkByIdOrNull(id);
    if (!link) {
      throw new NotFoundError('link', id);
    }
    return link;
  }

  private async getLinkByIdOrNull(id: string): Promise<Link | null> {
    // Note: ensureInitialized() called by public methods
    // Check cache (delegates to base class)
    if (this.cacheOptions.enabled) {
      const cached = this.cacheGet(this.linkCache, id);
      if (cached) {
        return cached;
      }
    }

    // Get from index
    const metadata = await this.indexManager.get(id);
    if (!metadata) {
      return null;
    }

    // Load from file
    const link = await this.loadLinkFile(metadata.filePath);

    // Cache with LRU eviction
    if (this.cacheOptions.enabled) {
      this.cacheLink(id, link);
    }

    return link;
  }

  public async findLinksBySource(sourceId: string, relationType?: string): Promise<Link[]> {
    await this.ensureInitialized();
    return this.findLinksByPredicate(
      (m: LinkIndexMetadata) => m.sourceId === sourceId && (relationType === undefined || relationType === null || relationType === '' || m.relationType === relationType)
    );
  }

  public async findLinksByTarget(targetId: string, relationType?: string): Promise<Link[]> {
    await this.ensureInitialized();
    return this.findLinksByPredicate(
      (m: LinkIndexMetadata) => m.targetId === targetId && (relationType === undefined || relationType === null || relationType === '' || m.relationType === relationType)
    );
  }

  public async findLinksByEntity(
    entityId: string,
    direction: 'incoming' | 'outgoing' | 'both' = 'both'
  ): Promise<Link[]> {
    await this.ensureInitialized();

    const predicates: Record<typeof direction, (m: LinkIndexMetadata) => boolean> = {
      outgoing: (m) => m.sourceId === entityId,
      incoming: (m) => m.targetId === entityId,
      both: (m) => m.sourceId === entityId || m.targetId === entityId,
    };

    return this.findLinksByPredicate(predicates[direction]);
  }

  public async findAllLinks(relationType?: string): Promise<Link[]> {
    await this.ensureInitialized();

    if (relationType !== undefined && relationType !== '') {
      return this.findLinksByPredicate((m: LinkIndexMetadata) => m.relationType === relationType);
    }

    // Return all links
    return this.findLinksByPredicate(() => true);
  }

  public async deleteLink(id: string): Promise<void> {
    await this.ensureInitialized();

    // Use FileLockManager with withLock for atomic delete (FIX M-2, FIX H-2)
    await this.fileLockManager.withLock(`link:${id}`, async () => {
      // Re-check existence INSIDE lock to avoid TOCTOU (FIX H-2)
      const metadata = await this.indexManager.get(id);
      if (!metadata) {
        throw new NotFoundError('link', id);
      }

      // Delete file
      await fs.unlink(metadata.filePath);

      // Remove from index
      await this.indexManager.delete(id);

      // Invalidate cache (delegates to base class)
      this.cacheInvalidate(this.linkCache, id);
    });
  }

  public async deleteLinksForEntity(entityId: string): Promise<number> {
    await this.ensureInitialized(); // FIX M-1: Consistent initialization pattern
    // Find all links for entity
    const links = await this.findLinksByEntity(entityId, 'both');

    // Delete each link
    for (const link of links) {
      await this.deleteLink(link.id);
    }

    return links.length;
  }

  public async linkExists(sourceId: string, targetId: string, relationType: string): Promise<boolean> {
    await this.ensureInitialized();
    const allMetadata = await this.indexManager.getAll();

    // Check for exact match on composite key
    return allMetadata.some(
      (m: LinkIndexMetadata) =>
        m.sourceId === sourceId && m.targetId === targetId && m.relationType === relationType
    );
  }

  // ============================================================================
  // Bulk Operations (FIX M2)
  // ============================================================================

  public async createMany(
    links: Omit<Link, 'id' | 'createdAt' | 'createdBy'>[]
  ): Promise<Link[]> {
    const created: Link[] = [];
    const createdIds: string[] = [];

    try {
      for (const linkData of links) {
        const link = await this.createLink(linkData);
        created.push(link);
        createdIds.push(link.id);
      }

      return created;
    } catch (error) {
      // Rollback on failure - best effort
      for (const id of createdIds) {
        try {
          await this.deleteLink(id);
        } catch {
          // Ignore rollback errors (best effort)
        }
      }

      throw error;
    }
  }

  public async deleteMany(idsOrFilter: string[] | LinkFilter): Promise<number> {
    let idsToDelete: string[];

    if (Array.isArray(idsOrFilter)) {
      // Delete by IDs
      idsToDelete = idsOrFilter;
    } else {
      // Delete by filter
      const links = await this.findLinksByFilter(idsOrFilter);
      idsToDelete = links.map((l) => l.id);
    }

    // Delete each link, track actual successes
    let successCount = 0;
    for (const id of idsToDelete) {
      try {
        await this.deleteLink(id);
        successCount++;
      } catch {
        // Continue on error (best effort) - link may not exist or already deleted
      }
    }

    return successCount;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Valid RelationType values per CLAUDE.md
   */
  private static readonly VALID_RELATION_TYPES: readonly string[] = [
    'implements', 'addresses', 'depends_on', 'blocks',
    'alternative_to', 'supersedes', 'references', 'derived_from', 'has_artifact'
  ];

  private validateLinkData(link: Partial<Link>): void {
    const errors: { field: string; message: string; value?: unknown }[] = [];

    if (link.sourceId === undefined || link.sourceId === null || link.sourceId === '' || link.sourceId.trim() === '') {
      errors.push({ field: 'sourceId', message: 'sourceId is required', value: link.sourceId });
    }

    if (link.targetId === undefined || link.targetId === null || link.targetId === '' || link.targetId.trim() === '') {
      errors.push({ field: 'targetId', message: 'targetId is required', value: link.targetId });
    }

    if (link.relationType === undefined || link.relationType === null) {
      errors.push({
        field: 'relationType',
        message: 'relationType is required',
        value: link.relationType,
      });
    } else if (!FileLinkRepository.VALID_RELATION_TYPES.includes(link.relationType)) {
      errors.push({
        field: 'relationType',
        message: `relationType must be one of: ${FileLinkRepository.VALID_RELATION_TYPES.join(', ')}`,
        value: link.relationType,
      });
    }

    if (errors.length > 0) {
      throw new ValidationError('Link validation failed', errors);
    }
  }

  private getLinkFilePath(id: string): string {
    return path.join(this.linksDir, `${id}.json`);
  }

  /**
   * Load link from file (delegates to base class)
   */
  private async loadLinkFile(filePath: string): Promise<Link> {
    return this.loadJSON<Link>(filePath);
  }

  /**
   * Cache link with LRU eviction (delegates to base class)
   */
  private cacheLink(id: string, link: Link): void {
    this.cacheSet(this.linkCache, id, link);
  }

  /**
   * Save link to file atomically (delegates to base class)
   */
  private async saveLinkFile(filePath: string, link: Link): Promise<void> {
    await this.atomicWriteJSON(filePath, link);
  }

  /**
   * Dispose repository and release resources
   */
  public dispose(): Promise<void> {
    // Clear cache (delegates to base class)
    this.cacheClear(this.linkCache);

    // Note: FileLockManager is shared and should be disposed by caller
    // We don't dispose it here as we don't own it

    return Promise.resolve();
  }

  private async findLinksByFilter(filter: LinkFilter): Promise<Link[]> {
    await this.ensureInitialized(); // FIX M-1: Defensive consistency
    return this.findLinksByPredicate((m: LinkIndexMetadata) => {
      if (filter.sourceId !== undefined && filter.sourceId !== null && filter.sourceId !== '' && m.sourceId !== filter.sourceId) return false;
      if (filter.targetId !== undefined && filter.targetId !== null && filter.targetId !== '' && m.targetId !== filter.targetId) return false;
      if (filter.relationType !== undefined && filter.relationType !== null && m.relationType !== filter.relationType) return false;
      return true;
    });
  }

  /**
   * Generic helper for filtering and loading links by predicate
   * Eliminates code duplication across findLinksBySource/Target/Entity/Filter
   */
  private async findLinksByPredicate(
    predicate: (metadata: LinkIndexMetadata) => boolean
  ): Promise<Link[]> {
    const allMetadata = await this.indexManager.getAll();
    const filtered = allMetadata.filter(predicate);

    // Load all matching links
    const links: Link[] = [];
    for (const metadata of filtered) {
      const link = await this.loadLinkFile(metadata.filePath);
      links.push(link);
    }

    return links;
  }
}

/**
 * Link filter for bulk delete operations (FIX M2)
 */
export interface LinkFilter {
  sourceId?: string;
  targetId?: string;
  relationType?: RelationType;
}
