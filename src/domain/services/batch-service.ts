import { v4 as uuidv4 } from 'uuid';
import type { RepositoryFactory, Repository, LinkRepository, PlanRepository, QueryOptions, QueryResult, Filter } from '../repositories/interfaces.js';
import { NotFoundError, ConflictError, ValidationError } from '../repositories/errors.js';
import type { PlanService } from './plan-service.js';
import type { RequirementService } from './requirement-service.js';
import type { SolutionService } from './solution-service.js';
import type { PhaseService } from './phase-service.js';
import type { LinkingService } from './linking-service.js';
import type { DecisionService } from './decision-service.js';
import type { ArtifactService } from './artifact-service.js';
import type {
  Entity,
  EntityType,
  Link,
  Requirement,
  Solution,
  Phase,
  Decision,
  Artifact,
  PlanManifest
} from '../entities/types.js';
import { resolveFieldTempIds } from '../utils/temp-id-resolver.js';

// Batch operation types
export type BatchEntityType = 'requirement' | 'solution' | 'phase' | 'link' | 'decision' | 'artifact';

// Payload types for batch operations
export interface RequirementPayload {
  tempId?: string;
  title: string;
  description: string;
  priority?: string;
  source?: {
    type: string;
    parentId?: string;
  };
  [key: string]: unknown;
}

export interface SolutionPayload {
  tempId?: string;
  title: string;
  description: string;
  addressing?: string[];
  [key: string]: unknown;
}

export interface PhasePayload {
  tempId?: string;
  title: string;
  description?: string;
  parentId?: string;
  [key: string]: unknown;
}

export interface LinkPayload {
  sourceId: string;
  targetId: string;
  relationType: string;
  [key: string]: unknown;
}

export interface DecisionPayload {
  tempId?: string;
  title: string;
  description: string;
  [key: string]: unknown;
}

export interface ArtifactPayload {
  tempId?: string;
  title: string;
  description: string;
  artifactType: string;
  relatedPhaseId?: string;
  relatedSolutionId?: string;
  relatedRequirementIds?: string[];
  [key: string]: unknown;
}

export interface BatchOperation {
  entityType: BatchEntityType;
  payload: Record<string, unknown>;
}

export interface BatchResult {
  results: { success: boolean; id?: string; error?: string }[];
  tempIdMapping: Record<string, string>;
}

export interface ExecuteBatchInput {
  planId: string;
  operations: BatchOperation[];
}

/**
 * In-Memory Repository - Transactional repository for batch operations
 *
 * Implements Repository<T> interface but operates entirely in memory.
 * Used exclusively by BatchService for atomic batch operations with rollback capability.
 *
 * IMPORTANT:
 * - Data is NOT persisted - changes are flushed atomically via InMemoryStorage
 * - Lifecycle: created per batch, disposed after execution
 * - Implements full Repository<T> interface for LSP compliance
 *
 * @internal
 */
class InMemoryRepository<T extends Entity> implements Repository<T> {
  public readonly entityType: EntityType;

  constructor(
    entityType: EntityType,
    private readonly planId: string,
    private readonly entitiesMap: Map<string, Entity[]>
  ) {
    this.entityType = entityType;
  }

  public async findById(id: string): Promise<T> {
    const entity = await this.findByIdOrNull(id);
    if (!entity) {
      throw new NotFoundError(this.entityType, id);
    }
    return entity;
  }

  public async findByIdOrNull(id: string): Promise<T | null> {
    const entities = await this.findAll();
    return entities.find(e => e.id === id) ?? null;
  }

  public async exists(id: string): Promise<boolean> {
    const entities = await this.findAll();
    return entities.some(e => e.id === id);
  }

  public async findByIds(ids: string[]): Promise<T[]> {
    const entities = await this.findAll();
    return entities.filter(e => ids.includes(e.id));
  }

  public findAll(): Promise<T[]> {
    const entities = this.entitiesMap.get(this.planId) ?? [];
    return Promise.resolve(entities as T[]);
  }

  public async query(options: QueryOptions<T>): Promise<QueryResult<T>> {
    // Simple implementation for batch mode - no filtering/sorting
    const entities = await this.findAll();
    const offset = options.pagination?.offset ?? 0;
    const limit = options.pagination?.limit ?? entities.length;

    const items = entities.slice(offset, offset + limit);

    return {
      items,
      total: entities.length,
      offset,
      limit,
      hasMore: offset + limit < entities.length,
    };
  }

  public async count(_filter?: Filter<T>): Promise<number> {
    const entities = await this.findAll();
    return entities.length;
  }

  public async findOne(_filter: Filter<T>): Promise<T | null> {
    const entities = await this.findAll();
    return entities[0] ?? null;
  }

  public async create(entity: T): Promise<T> {
    const entities = await this.findAll();
    entities.push(entity);
    this.entitiesMap.set(this.planId, entities);
    return entity;
  }

  public async update(id: string, updates: Partial<T>): Promise<T> {
    const entities = await this.findAll();
    const index = entities.findIndex(e => e.id === id);
    if (index === -1) {
      throw new NotFoundError(this.entityType, id);
    }

    const existing = entities[index];

    // FIX C-1: Optimistic locking - check version if provided in updates
    if ('version' in updates && updates.version !== undefined && updates.version !== existing.version) {
      throw new ConflictError(
        `Version mismatch for ${this.entityType} ${id}: expected ${String(existing.version)}, got ${String(updates.version)}`,
        'version',
        { expectedVersion: existing.version, providedVersion: updates.version }
      );
    }

    // Remove version from updates to prevent overwrite, manage it internally
    const { version: providedVersion, ...updatesWithoutVersion } = updates;
    void providedVersion; // Excluded from updates, version is managed internally

    const updated: T = {
      ...existing,
      ...updatesWithoutVersion,
      id,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    entities[index] = updated;
    this.entitiesMap.set(this.planId, entities);
    return updated;
  }

  public async delete(id: string): Promise<void> {
    const entities = await this.findAll();
    const index = entities.findIndex(e => e.id === id);
    if (index === -1) {
      throw new NotFoundError(this.entityType, id);
    }
    entities.splice(index, 1);
    this.entitiesMap.set(this.planId, entities);
  }

  public async deleteMany(ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      try {
        await this.delete(id);
        count++;
      } catch {
        // Continue on error - entity may not exist
      }
    }
    return count;
  }

  public async createMany(entities: T[]): Promise<T[]> {
    const created: T[] = [];
    for (const entity of entities) {
      created.push(await this.create(entity));
    }
    return created;
  }

  public async updateMany(updates: { id: string; data: Partial<T> }[]): Promise<T[]> {
    const updated: T[] = [];
    for (const { id, data } of updates) {
      updated.push(await this.update(id, data));
    }
    return updated;
  }

  public async upsertMany(entities: T[]): Promise<T[]> {
    const upserted: T[] = [];
    for (const entity of entities) {
      const exists = await this.exists(entity.id);
      if (exists) {
        upserted.push(await this.update(entity.id, entity));
      } else {
        upserted.push(await this.create(entity));
      }
    }
    return upserted;
  }
}

/**
 * In-Memory Link Repository - Transactional link repository for batch operations
 *
 * Implements LinkRepository interface but operates entirely in memory.
 * Used exclusively by BatchService for atomic batch link operations.
 *
 * @internal
 */
class InMemoryLinkRepository implements LinkRepository {
  constructor(
    private readonly planId: string,
    private readonly linksMap: Map<string, Link[]>
  ) {}

  private findAll(): Promise<Link[]> {
    return Promise.resolve(this.linksMap.get(this.planId) ?? []);
  }

  public async getLinkById(id: string): Promise<Link> {
    const links = await this.findAll();
    const link = links.find(l => l.id === id);
    if (!link) {
      throw new NotFoundError('link', id);
    }
    return link;
  }

  public async createLink(link: Omit<Link, 'id' | 'createdAt' | 'createdBy'>): Promise<Link> {
    const id = uuidv4();
    const fullLink: Link = {
      ...link,
      id,
      createdAt: new Date().toISOString(),
      createdBy: 'system',
    };
    const links = await this.findAll();
    links.push(fullLink);
    this.linksMap.set(this.planId, links);
    return fullLink;
  }

  public async deleteLink(id: string): Promise<void> {
    const links = await this.findAll();
    const index = links.findIndex(l => l.id === id);
    if (index === -1) {
      throw new NotFoundError('link', id);
    }
    links.splice(index, 1);
    this.linksMap.set(this.planId, links);
  }

  public async findLinksBySource(sourceId: string, relationType?: string): Promise<Link[]> {
    const links = await this.findAll();
    return links.filter(l =>
      l.sourceId === sourceId &&
      (relationType === undefined || relationType === '' || l.relationType === relationType)
    );
  }

  public async findLinksByTarget(targetId: string, relationType?: string): Promise<Link[]> {
    const links = await this.findAll();
    return links.filter(l =>
      l.targetId === targetId &&
      (relationType === undefined || relationType === '' || l.relationType === relationType)
    );
  }

  public async findLinksByEntity(entityId: string, direction?: 'incoming' | 'outgoing' | 'both'): Promise<Link[]> {
    const links = await this.findAll();
    const dir = direction ?? 'both';

    if (dir === 'outgoing') {
      return links.filter(l => l.sourceId === entityId);
    }
    if (dir === 'incoming') {
      return links.filter(l => l.targetId === entityId);
    }
    return links.filter(l => l.sourceId === entityId || l.targetId === entityId);
  }

  public async findAllLinks(relationType?: string): Promise<Link[]> {
    const links = await this.findAll();
    if (relationType === undefined || relationType === '') {
      return links;
    }
    return links.filter(l => l.relationType === relationType);
  }

  public async deleteLinksForEntity(entityId: string): Promise<number> {
    const links = await this.findAll();
    const toDelete = links.filter(l => l.sourceId === entityId || l.targetId === entityId);

    for (const link of toDelete) {
      await this.deleteLink(link.id);
    }

    return toDelete.length;
  }

  public async linkExists(sourceId: string, targetId: string, relationType: string): Promise<boolean> {
    const links = await this.findAll();
    return links.some(l =>
      l.sourceId === sourceId &&
      l.targetId === targetId &&
      l.relationType === relationType
    );
  }
}

/**
 * In-Memory Plan Repository - Minimal PlanRepository for batch operations
 *
 * Provides basic plan existence checking for batch mode.
 * Only supports planExists() - other methods not needed in batch context.
 *
 * @internal
 */
class InMemoryPlanRepository {
  constructor(private readonly validPlanId: string) {}

  public async initialize(): Promise<void> {
    // No-op
  }

  public planExists(planId: string): Promise<boolean> {
    return Promise.resolve(planId === this.validPlanId);
  }

  public createPlan(): Promise<void> {
    throw new Error('createPlan not supported in batch mode');
  }

  public deletePlan(): Promise<void> {
    throw new Error('deletePlan not supported in batch mode');
  }

  public listPlans(): Promise<string[]> {
    throw new Error('listPlans not supported in batch mode');
  }

  public saveManifest(): Promise<void> {
    throw new Error('saveManifest not supported in batch mode');
  }

  public loadManifest(): Promise<PlanManifest> {
    throw new Error('loadManifest not supported in batch mode');
  }

  public saveActivePlans(): Promise<void> {
    throw new Error('saveActivePlans not supported in batch mode');
  }

  public loadActivePlans(): Promise<never> {
    throw new Error('loadActivePlans not supported in batch mode');
  }

  public saveExport(): Promise<string> {
    throw new Error('saveExport not supported in batch mode');
  }

  public saveVersionHistory(): Promise<void> {
    throw new Error('saveVersionHistory not supported in batch mode');
  }

  public loadVersionHistory(): Promise<never> {
    throw new Error('loadVersionHistory not supported in batch mode');
  }

  public deleteVersionHistory(): Promise<void> {
    throw new Error('deleteVersionHistory not supported in batch mode');
  }
}

/**
 * In-Memory Repository Factory - Factory for batch operation repositories
 *
 * Creates in-memory repositories that share the same memory maps.
 * Used exclusively by BatchService for atomic batch operations.
 *
 * LIMITATIONS:
 * - createPlanRepository(): Returns minimal implementation (only planExists supported)
 * - createUnitOfWork(): Not supported (throws error)
 *
 * @internal
 */
class InMemoryRepositoryFactory implements RepositoryFactory {
  private readonly repositoryCache = new Map<string, Repository<Entity>>();
  private readonly linkRepo: InMemoryLinkRepository;
  private readonly planRepo: InMemoryPlanRepository;

  constructor(
    private readonly planId: string,
    private readonly requirementsMap: Map<string, Requirement[]>,
    private readonly solutionsMap: Map<string, Solution[]>,
    private readonly phasesMap: Map<string, Phase[]>,
    private readonly decisionsMap: Map<string, Decision[]>,
    private readonly artifactsMap: Map<string, Artifact[]>,
    private readonly linksMap: Map<string, Link[]>
  ) {
    this.linkRepo = new InMemoryLinkRepository(planId, linksMap);
    this.planRepo = new InMemoryPlanRepository(planId);
  }

  public createRepository<T extends Entity>(entityType: EntityType, planId: string): Repository<T> {
    const cacheKey = `${entityType}:${planId}`;
    if (this.repositoryCache.has(cacheKey)) {
      const cached = this.repositoryCache.get(cacheKey);
      if (!cached) {
        throw new Error(`Repository cache inconsistency for ${cacheKey}`);
      }
      return cached as Repository<T>;
    }

    let entitiesMap: Map<string, Entity[]>;
    switch (entityType) {
      case 'requirement':
        entitiesMap = this.requirementsMap as Map<string, Entity[]>;
        break;
      case 'solution':
        entitiesMap = this.solutionsMap as Map<string, Entity[]>;
        break;
      case 'phase':
        entitiesMap = this.phasesMap as Map<string, Entity[]>;
        break;
      case 'decision':
        entitiesMap = this.decisionsMap as Map<string, Entity[]>;
        break;
      case 'artifact':
        entitiesMap = this.artifactsMap as Map<string, Entity[]>;
        break;
      default:
        throw new Error(`Unsupported entity type: ${String(entityType)}`);
    }

    const repo = new InMemoryRepository<T>(entityType, planId, entitiesMap);
    this.repositoryCache.set(cacheKey, repo);
    return repo;
  }

  public createLinkRepository(_planId: string): LinkRepository {
    return this.linkRepo;
  }

  public createPlanRepository(): PlanRepository {
    return this.planRepo;
  }

  public createUnitOfWork(_planId: string): never {
    throw new Error('UnitOfWork not supported in batch mode');
  }

  // FIX M-3: Return 'file' as this is memory-backed simulation of file storage
  public getBackend(): 'file' {
    return 'file';
  }

  public async close(): Promise<void> {
    // No-op for in-memory
  }

  public dispose(): Promise<void> {
    this.repositoryCache.clear();
    return Promise.resolve();
  }
}

/**
 * In-Memory Storage Adapter
 *
 * This adapter provides an in-memory layer for batch operations.
 * All reads/writes go through memory, allowing for transactional rollback.
 */
class InMemoryStorage {
  // In-memory entity stores (public for InMemoryRepositoryFactory access)
  public requirementsMap = new Map<string, Requirement[]>();
  public solutionsMap = new Map<string, Solution[]>();
  public phasesMap = new Map<string, Phase[]>();
  public decisionsMap = new Map<string, Decision[]>();
  public artifactsMap = new Map<string, Artifact[]>();
  public linksMap = new Map<string, Link[]>();
  private readonly manifestsMap = new Map<string, PlanManifest>();
  private readonly planRepo: PlanRepository;

  constructor(
    private readonly repositoryFactory: RepositoryFactory,
    private readonly planId: string
  ) {
    this.planRepo = repositoryFactory.createPlanRepository();
  }

  /**
   * Load all entities for a plan into memory
   */
  public async loadAllIntoMemory(): Promise<void> {
    // Create repositories for each entity type
    const reqRepo = this.repositoryFactory.createRepository<Requirement>('requirement', this.planId);
    const solRepo = this.repositoryFactory.createRepository<Solution>('solution', this.planId);
    const decRepo = this.repositoryFactory.createRepository<Decision>('decision', this.planId);
    const artRepo = this.repositoryFactory.createRepository<Artifact>('artifact', this.planId);
    const phaseRepo = this.repositoryFactory.createRepository<Phase>('phase', this.planId);
    const linkRepo = this.repositoryFactory.createLinkRepository(this.planId);

    // Load all entity types into memory via repositories
    const [requirements, solutions, decisions, artifacts, phases, links, manifest] = await Promise.all([
      reqRepo.findAll(),
      solRepo.findAll(),
      decRepo.findAll(),
      artRepo.findAll(),
      phaseRepo.findAll(),
      linkRepo.findAllLinks(),
      this.planRepo.loadManifest(this.planId)
    ]);

    this.requirementsMap.set(this.planId, requirements);
    this.solutionsMap.set(this.planId, solutions);
    this.phasesMap.set(this.planId, phases);
    this.decisionsMap.set(this.planId, decisions);
    this.artifactsMap.set(this.planId, artifacts);
    this.linksMap.set(this.planId, links);
    this.manifestsMap.set(this.planId, manifest);
  }

  /**
   * Flush all in-memory changes to disk atomically
   */
  public async flushToDisk(): Promise<void> {
    const requirements = this.requirementsMap.get(this.planId) ?? [];
    const solutions = this.solutionsMap.get(this.planId) ?? [];
    const phases = this.phasesMap.get(this.planId) ?? [];
    const decisions = this.decisionsMap.get(this.planId) ?? [];
    const artifacts = this.artifactsMap.get(this.planId) ?? [];
    const links = this.linksMap.get(this.planId) ?? [];
    const manifest = this.manifestsMap.get(this.planId);

    // Create repositories for each entity type
    const reqRepo = this.repositoryFactory.createRepository<Requirement>('requirement', this.planId);
    const solRepo = this.repositoryFactory.createRepository<Solution>('solution', this.planId);
    const decRepo = this.repositoryFactory.createRepository<Decision>('decision', this.planId);
    const artRepo = this.repositoryFactory.createRepository<Artifact>('artifact', this.planId);
    const phaseRepo = this.repositoryFactory.createRepository<Phase>('phase', this.planId);
    const linkRepo = this.repositoryFactory.createLinkRepository(this.planId);

    // Save links through LinkRepository (individual files)
    for (const link of links) {
      try {
        await linkRepo.createLink({
          sourceId: link.sourceId,
          targetId: link.targetId,
          relationType: link.relationType,
          metadata: link.metadata,
        });
      } catch (err: unknown) {
        // If link already exists (ConflictError with duplicate), skip it
        // This can happen if batch is retried or link was created outside batch
        if (err instanceof ConflictError && err.conflictType !== 'duplicate') {
          throw err;
        }
        // Silently ignore duplicate link errors
      }
    }

    // Atomic write of all changes via upsertMany (to individual files)
    await Promise.all([
      requirements.length > 0 ? reqRepo.upsertMany(requirements) : Promise.resolve([]),
      solutions.length > 0 ? solRepo.upsertMany(solutions) : Promise.resolve([]),
      decisions.length > 0 ? decRepo.upsertMany(decisions) : Promise.resolve([]),
      artifacts.length > 0 ? artRepo.upsertMany(artifacts) : Promise.resolve([]),
      phases.length > 0 ? phaseRepo.upsertMany(phases) : Promise.resolve([]),
      manifest ? this.planRepo.saveManifest(this.planId, manifest) : Promise.resolve()
    ]);
  }

  // FileStorage-compatible methods (work in-memory)

  public loadEntities<T extends Entity>(planId: string, entityType: string): Promise<T[]> {
    switch (entityType) {
      case 'requirements':
        return Promise.resolve((this.requirementsMap.get(planId) ?? []) as unknown as T[]);
      case 'solutions':
        return Promise.resolve((this.solutionsMap.get(planId) ?? []) as unknown as T[]);
      case 'phases':
        return Promise.resolve((this.phasesMap.get(planId) ?? []) as unknown as T[]);
      case 'decisions':
        return Promise.resolve((this.decisionsMap.get(planId) ?? []) as unknown as T[]);
      case 'artifacts':
        return Promise.resolve((this.artifactsMap.get(planId) ?? []) as unknown as T[]);
      default:
        return Promise.resolve([]);
    }
  }

  public saveEntities(
    planId: string,
    entityType: string,
    entities: Entity[]
  ): Promise<void> {
    // Save to in-memory map (NOT to disk)
    switch (entityType) {
      case 'requirements':
        this.requirementsMap.set(planId, entities as unknown as Requirement[]);
        break;
      case 'solutions':
        this.solutionsMap.set(planId, entities as unknown as Solution[]);
        break;
      case 'phases':
        this.phasesMap.set(planId, entities as unknown as Phase[]);
        break;
      case 'decisions':
        this.decisionsMap.set(planId, entities as unknown as Decision[]);
        break;
      case 'artifacts':
        this.artifactsMap.set(planId, entities as unknown as Artifact[]);
        break;
    }
    return Promise.resolve();
  }

  public loadLinks(planId: string): Promise<Link[]> {
    return Promise.resolve(this.linksMap.get(planId) ?? []);
  }

  public saveLinks(planId: string, links: Link[]): Promise<void> {
    this.linksMap.set(planId, links);
    return Promise.resolve();
  }

  public loadManifest(planId: string): Promise<PlanManifest> {
    const manifest = this.manifestsMap.get(planId);
    if (!manifest) {
      throw new Error('Manifest not found');
    }
    return Promise.resolve(manifest);
  }

  public saveManifest(planId: string, manifest: PlanManifest): Promise<void> {
    this.manifestsMap.set(planId, manifest);
    return Promise.resolve();
  }

  public async planExists(planId: string): Promise<boolean> {
    return this.planRepo.planExists(planId);
  }
}

/**
 * Batch Service (Proof of Concept)
 *
 * Implements in-memory batching for transactional operations.
 * All operations execute in memory, then flush atomically to disk.
 */
export class BatchService {
  private readonly planRepo: PlanRepository;

  constructor(
    private readonly repositoryFactory: RepositoryFactory,
    private readonly planService: PlanService,
    private readonly requirementService: RequirementService,
    private readonly solutionService: SolutionService,
    private readonly phaseService: PhaseService,
    private readonly linkingService: LinkingService,
    private readonly decisionService: DecisionService,
    private readonly artifactService: ArtifactService
  ) {
    this.planRepo = repositoryFactory.createPlanRepository();
  }

  public async executeBatch(input: ExecuteBatchInput): Promise<BatchResult> {
    // BUG-026 FIX: Validate operations array is not empty (service-level validation)
    // Empty operations waste resources and indicate user error
    const EMPTY_OPERATIONS_COUNT = 0;
    const EMPTY_OPERATIONS_ERROR = 'operations array cannot be empty';

    if (input.operations.length === EMPTY_OPERATIONS_COUNT) {
      throw new ValidationError(
        EMPTY_OPERATIONS_ERROR,
        [{ field: 'operations', message: EMPTY_OPERATIONS_ERROR }]
      );
    }

    // Validate plan exists
    const exists = await this.planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    // 1. Create in-memory storage and load all entities
    const memoryStorage = new InMemoryStorage(this.repositoryFactory, input.planId);
    await memoryStorage.loadAllIntoMemory();

    // 2. Create in-memory RepositoryFactory
    const memoryRepoFactory = new InMemoryRepositoryFactory(
      input.planId,
      memoryStorage.requirementsMap,
      memoryStorage.solutionsMap,
      memoryStorage.phasesMap,
      memoryStorage.decisionsMap,
      memoryStorage.artifactsMap,
      memoryStorage.linksMap
    );

    // 3. Create in-memory service instances with RepositoryFactory
    type ServiceConstructor<T> = new (factory: RepositoryFactory, planService?: PlanService) => T;

    const memReqService = new (this.requirementService.constructor as ServiceConstructor<RequirementService>)(
      memoryRepoFactory,
      this.planService
    );
    const memSolService = new (this.solutionService.constructor as ServiceConstructor<SolutionService>)(
      memoryRepoFactory,
      this.planService
    );
    const memPhaseService = new (this.phaseService.constructor as ServiceConstructor<PhaseService>)(
      memoryRepoFactory, // PhaseService migrated to RepositoryFactory
      this.planService
    );
    const memLinkService = new (this.linkingService.constructor as new (factory: RepositoryFactory) => LinkingService)(
      memoryRepoFactory
    );
    const memDecService = new (this.decisionService.constructor as ServiceConstructor<DecisionService>)(
      memoryRepoFactory,
      this.planService
    );
    const memArtService = new (this.artifactService.constructor as ServiceConstructor<ArtifactService>)(
      memoryRepoFactory,
      this.planService
    );

    const results: { success: boolean; id?: string; error?: string }[] = [];
    const tempIdMapping: Record<string, string> = {};

    // 3. Execute operations sequentially in memory
    // Note: If any operation fails, the error bubbles up and flushToDisk() is never called,
    // so changes remain in memory only and are rolled back through garbage collection
    for (const op of input.operations) {
        let result: { id?: string; requirementId?: string; solutionId?: string; phaseId?: string; linkId?: string; decisionId?: string; artifactId?: string } | undefined;

        // Resolve temp IDs in payload
        const resolvedPayload = this.resolveTempIds(op.payload, tempIdMapping, op.entityType);

        // Check if this is an update operation
        const isUpdate = (resolvedPayload as { action?: string }).action === 'update';

        switch (op.entityType) {
          case 'requirement':
            if (isUpdate) {
              // Resolve temp ID in id field if needed
              const payloadWithId = resolvedPayload as { id: string; updates: Record<string, unknown> };
              const requirementId = tempIdMapping[payloadWithId.id] ?? payloadWithId.id;
              result = await memReqService.updateRequirement({
                planId: input.planId,
                requirementId,
                updates: payloadWithId.updates as Partial<Requirement>
              });
              results.push({ success: true, id: requirementId });
            } else {
              result = await memReqService.addRequirement({
                planId: input.planId,
                requirement: resolvedPayload as unknown as RequirementPayload
              } as unknown as Parameters<typeof memReqService.addRequirement>[0]);
              results.push({ success: true, id: result.requirementId });

              // Track temp ID mapping
              const payloadWithTempId = resolvedPayload as { tempId?: string };
              const tempId = payloadWithTempId.tempId;
              if (typeof tempId === 'string' && result.requirementId !== undefined) {
                tempIdMapping[tempId] = result.requirementId;
              }
            }
            break;

          case 'solution':
            if (isUpdate) {
              const payloadWithId = resolvedPayload as { id: string; updates: Record<string, unknown> };
              const solutionId = tempIdMapping[payloadWithId.id] ?? payloadWithId.id;
              result = await memSolService.updateSolution({
                planId: input.planId,
                solutionId,
                updates: payloadWithId.updates as Partial<Solution>
              });
              results.push({ success: true, id: solutionId });
            } else {
              result = await memSolService.proposeSolution({
                planId: input.planId,
                solution: resolvedPayload as unknown as SolutionPayload
              } as unknown as Parameters<typeof memSolService.proposeSolution>[0]);
              results.push({ success: true, id: result.solutionId });

              const payloadWithTempId = resolvedPayload as { tempId?: string };
              const tempId = payloadWithTempId.tempId;
              if (typeof tempId === 'string' && result.solutionId !== undefined) {
                tempIdMapping[tempId] = result.solutionId;
              }
            }
            break;

          case 'phase':
            if (isUpdate) {
              const payloadWithId = resolvedPayload as { id: string; updates: Record<string, unknown> };
              const phaseId = tempIdMapping[payloadWithId.id] ?? payloadWithId.id;
              result = await memPhaseService.updatePhase({
                planId: input.planId,
                phaseId,
                updates: payloadWithId.updates as Partial<Phase>
              });
              results.push({ success: true, id: phaseId });
            } else {
              result = await memPhaseService.addPhase({
                planId: input.planId,
                phase: resolvedPayload as unknown as PhasePayload
              } as unknown as Parameters<typeof memPhaseService.addPhase>[0]);
              results.push({ success: true, id: result.phaseId });

              const payloadWithTempId = resolvedPayload as { tempId?: string };
              const tempId = payloadWithTempId.tempId;
              if (typeof tempId === 'string' && result.phaseId !== undefined) {
                tempIdMapping[tempId] = result.phaseId;
              }
            }
            break;

          case 'link':
            result = await memLinkService.linkEntities({
              planId: input.planId,
              ...(resolvedPayload as unknown as LinkPayload)
            } as unknown as Parameters<typeof memLinkService.linkEntities>[0]);
            results.push({ success: true, id: result.linkId });
            break;

          case 'decision':
            if (isUpdate) {
              const payloadWithId = resolvedPayload as { id: string; updates: Record<string, unknown> };
              const decisionId = tempIdMapping[payloadWithId.id] ?? payloadWithId.id;
              result = await memDecService.updateDecision({
                planId: input.planId,
                decisionId,
                updates: payloadWithId.updates as Partial<Decision>
              });
              results.push({ success: true, id: decisionId });
            } else {
              result = await memDecService.recordDecision({
                planId: input.planId,
                decision: resolvedPayload as unknown as DecisionPayload
              } as unknown as Parameters<typeof memDecService.recordDecision>[0]);
              results.push({ success: true, id: result.decisionId });

              const payloadWithTempId = resolvedPayload as { tempId?: string };
              const tempId = payloadWithTempId.tempId;
              if (typeof tempId === 'string' && result.decisionId !== undefined) {
                tempIdMapping[tempId] = result.decisionId;
              }
            }
            break;

          case 'artifact':
            if (isUpdate) {
              const payloadWithId = resolvedPayload as { id: string; updates: Record<string, unknown> };
              const artifactId = tempIdMapping[payloadWithId.id] ?? payloadWithId.id;
              result = await memArtService.updateArtifact({
                planId: input.planId,
                artifactId,
                updates: payloadWithId.updates as Partial<Artifact>
              });
              results.push({ success: true, id: artifactId });
            } else {
              result = await memArtService.addArtifact({
                planId: input.planId,
                artifact: resolvedPayload as unknown as ArtifactPayload
              } as unknown as Parameters<typeof memArtService.addArtifact>[0]);
              results.push({ success: true, id: result.artifactId });

              const payloadWithTempId = resolvedPayload as { tempId?: string };
              const tempId = payloadWithTempId.tempId;
              if (typeof tempId === 'string' && result.artifactId !== undefined) {
                tempIdMapping[tempId] = result.artifactId;
              }
            }
            break;

          default:
            throw new Error(`Unknown entityType: ${String(op.entityType)}`);
        }
      }

    // 4. All operations succeeded - flush to disk atomically
    await memoryStorage.flushToDisk();

    // 5. Update statistics (only once after all operations)
    await this.planService.updateStatistics(input.planId);

    return { results, tempIdMapping };
  }

  /**
   * Resolve temporary IDs ($0, $1, etc.) in payload
   * Only resolves temp IDs in specific ID fields:
   * - requirement: source.parentId
   * - solution: addressing[]
   * - decision: supersededBy, supersedes
   * - phase: parentId
   * - artifact: relatedPhaseId, relatedSolutionId, relatedRequirementIds[]
   * - link: sourceId, targetId
   */
  private resolveTempIds(payload: Record<string, unknown>, mapping: Record<string, string>, entityType?: string): Record<string, unknown> {
    // payload is Record<string, unknown>, so it cannot be null or undefined

    // Define ID fields per entity type
    const ID_FIELDS: Record<string, Record<string, boolean>> = {
      requirement: { 'source.parentId': true },
      solution: { 'addressing': true },
      decision: { 'supersededBy': true, 'supersedes': true },
      phase: { 'parentId': true },
      artifact: {
        'relatedPhaseId': true,
        'relatedSolutionId': true,
        'relatedRequirementIds': true
      },
      link: { 'sourceId': true, 'targetId': true }
    };

    const fieldMap = (entityType !== undefined && entityType !== '') ? (ID_FIELDS[entityType] ?? {}) : {};

    const resolved = resolveFieldTempIds(payload, fieldMap, mapping);
    return resolved ?? payload;
  }
}
