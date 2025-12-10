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
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { LinkRepository } from '../../../domain/repositories/interfaces.js';
import type { Link, RelationType } from '../../../domain/entities/types.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../../domain/repositories/errors.js';
import { IndexManager } from './index-manager.js';
import { FileLockManager } from './file-lock-manager.js';
import type { LinkIndexMetadata, CacheOptions } from './types.js';

/**
 * File Link Repository Implementation
 */
export class FileLinkRepository implements LinkRepository {
  private baseDir: string;
  private planId: string;
  private linksDir: string;
  private indexManager: IndexManager<LinkIndexMetadata>;
  private fileLockManager: FileLockManager;
  private linkCache: Map<string, Link> = new Map();
  private cacheOptions: Required<CacheOptions>;
  private initialized: boolean = false;

  constructor(
    baseDir: string,
    planId: string,
    fileLockManager: FileLockManager,
    cacheOptions?: Partial<CacheOptions>
  ) {
    this.baseDir = baseDir;
    this.planId = planId;
    this.fileLockManager = fileLockManager;

    // Setup paths
    const planDir = path.join(baseDir, 'plans', planId);
    this.linksDir = path.join(planDir, 'links');
    const indexesDir = path.join(planDir, 'indexes');
    const indexPath = path.join(indexesDir, 'link-index.json');

    // Initialize index manager
    this.indexManager = new IndexManager<LinkIndexMetadata>(indexPath, cacheOptions);

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
    if (this.initialized) {
      return; // Already initialized
    }

    // Create directories
    const planDir = path.join(this.baseDir, 'plans', this.planId);
    const indexesDir = path.join(planDir, 'indexes');

    await fs.mkdir(this.linksDir, { recursive: true });
    await fs.mkdir(indexesDir, { recursive: true });

    // Initialize index manager
    await this.indexManager.initialize();

    this.initialized = true;
  }

  /**
   * Ensure repository is initialized (lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get FileLockManager instance (for testing)
   */
  getLockManager(): FileLockManager {
    return this.fileLockManager;
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  async createLink(link: Omit<Link, 'id' | 'createdAt' | 'createdBy'>): Promise<Link> {
    await this.ensureInitialized();

    // Validate
    this.validateLinkData(link);

    // Check for existing link with same composite key
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
      createdBy: 'system', // TODO: Get from context
    };

    // Get file path
    const filePath = this.getLinkFilePath(id);

    // Use FileLockManager for atomic create
    const release = await this.fileLockManager.acquire(`link:${id}`);
    try {
      // Write link file
      await fs.writeFile(filePath, JSON.stringify(fullLink, null, 2), 'utf-8');

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

      // Cache
      if (this.cacheOptions.enabled) {
        this.linkCache.set(id, fullLink);
      }

      return fullLink;
    } finally {
      await release();
    }
  }

  async getLinkById(id: string): Promise<Link> {
    const link = await this.getLinkByIdOrNull(id);
    if (!link) {
      throw new NotFoundError('link', id);
    }
    return link;
  }

  private async getLinkByIdOrNull(id: string): Promise<Link | null> {
    // Check cache
    if (this.cacheOptions.enabled) {
      const cached = this.linkCache.get(id);
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

    // Cache
    if (this.cacheOptions.enabled) {
      this.linkCache.set(id, link);
    }

    return link;
  }

  async findLinksBySource(sourceId: string, relationType?: string): Promise<Link[]> {
    const allMetadata = await this.indexManager.getAll();

    // Filter by source
    let filtered = allMetadata.filter((m: LinkIndexMetadata) => m.sourceId === sourceId);

    // Filter by relation type if provided
    if (relationType) {
      filtered = filtered.filter((m: LinkIndexMetadata) => m.relationType === relationType);
    }

    // Load links
    const links: Link[] = [];
    for (const metadata of filtered) {
      const link = await this.loadLinkFile(metadata.filePath);
      links.push(link);
    }

    return links;
  }

  async findLinksByTarget(targetId: string, relationType?: string): Promise<Link[]> {
    const allMetadata = await this.indexManager.getAll();

    // Filter by target
    let filtered = allMetadata.filter((m: LinkIndexMetadata) => m.targetId === targetId);

    // Filter by relation type if provided
    if (relationType) {
      filtered = filtered.filter((m: LinkIndexMetadata) => m.relationType === relationType);
    }

    // Load links
    const links: Link[] = [];
    for (const metadata of filtered) {
      const link = await this.loadLinkFile(metadata.filePath);
      links.push(link);
    }

    return links;
  }

  async findLinksByEntity(
    entityId: string,
    direction: 'incoming' | 'outgoing' | 'both' = 'both'
  ): Promise<Link[]> {
    const allMetadata = await this.indexManager.getAll();

    // Filter based on direction
    let filtered: LinkIndexMetadata[];
    if (direction === 'outgoing') {
      filtered = allMetadata.filter((m: LinkIndexMetadata) => m.sourceId === entityId);
    } else if (direction === 'incoming') {
      filtered = allMetadata.filter((m: LinkIndexMetadata) => m.targetId === entityId);
    } else {
      // both
      filtered = allMetadata.filter(
        (m: LinkIndexMetadata) => m.sourceId === entityId || m.targetId === entityId
      );
    }

    // Load links
    const links: Link[] = [];
    for (const metadata of filtered) {
      const link = await this.loadLinkFile(metadata.filePath);
      links.push(link);
    }

    return links;
  }

  async deleteLink(id: string): Promise<void> {
    // Check existence
    const metadata = await this.indexManager.get(id);
    if (!metadata) {
      throw new NotFoundError('link', id);
    }

    // Use FileLockManager for atomic delete
    const release = await this.fileLockManager.acquire(`link:${id}`);
    try {
      // Delete file
      await fs.unlink(metadata.filePath);

      // Remove from index
      await this.indexManager.delete(id);

      // Invalidate cache
      this.linkCache.delete(id);
    } finally {
      await release();
    }
  }

  async deleteLinksForEntity(entityId: string): Promise<number> {
    // Find all links for entity
    const links = await this.findLinksByEntity(entityId, 'both');

    // Delete each link
    for (const link of links) {
      await this.deleteLink(link.id);
    }

    return links.length;
  }

  async linkExists(sourceId: string, targetId: string, relationType: string): Promise<boolean> {
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

  async createMany(
    links: Array<Omit<Link, 'id' | 'createdAt' | 'createdBy'>>
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

  async deleteMany(idsOrFilter: string[] | LinkFilter): Promise<number> {
    let idsToDelete: string[];

    if (Array.isArray(idsOrFilter)) {
      // Delete by IDs
      idsToDelete = idsOrFilter;
    } else {
      // Delete by filter
      const links = await this.findLinksByFilter(idsOrFilter);
      idsToDelete = links.map((l) => l.id);
    }

    // Delete each link
    for (const id of idsToDelete) {
      try {
        await this.deleteLink(id);
      } catch (error) {
        // Continue on error (best effort)
      }
    }

    return idsToDelete.length;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private validateLinkData(link: Partial<Link>): void {
    const errors: Array<{ field: string; message: string; value?: unknown }> = [];

    if (!link.sourceId || link.sourceId.trim() === '') {
      errors.push({ field: 'sourceId', message: 'sourceId is required', value: link.sourceId });
    }

    if (!link.targetId || link.targetId.trim() === '') {
      errors.push({ field: 'targetId', message: 'targetId is required', value: link.targetId });
    }

    if (!link.relationType || link.relationType.trim() === '') {
      errors.push({
        field: 'relationType',
        message: 'relationType is required',
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

  private async loadLinkFile(filePath: string): Promise<Link> {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Link;
  }

  private async findLinksByFilter(filter: LinkFilter): Promise<Link[]> {
    const allMetadata = await this.indexManager.getAll();

    // Apply filters
    let filtered = allMetadata;

    if (filter.sourceId) {
      filtered = filtered.filter((m: LinkIndexMetadata) => m.sourceId === filter.sourceId);
    }

    if (filter.targetId) {
      filtered = filtered.filter((m: LinkIndexMetadata) => m.targetId === filter.targetId);
    }

    if (filter.relationType) {
      filtered = filtered.filter((m: LinkIndexMetadata) => m.relationType === filter.relationType);
    }

    // Load links
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
