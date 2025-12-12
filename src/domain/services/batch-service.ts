import { v4 as uuidv4 } from 'uuid';
import type { RepositoryFactory, Repository, LinkRepository, PlanRepository, QueryOptions, QueryResult, Filter } from '../repositories/interfaces.js';
import { NotFoundError, ConflictError } from '../repositories/errors.js';
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

export interface BatchOperation {
  entity_type: BatchEntityType;
  payload: any;
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
  readonly entityType: EntityType;

  constructor(
    entityType: EntityType,
    private readonly planId: string,
    private readonly entitiesMap: Map<string, Entity[]>
  ) {
    this.entityType = entityType;
  }

  async findById(id: string): Promise<T> {
    const entity = await this.findByIdOrNull(id);
    if (!entity) {
      throw new NotFoundError(this.entityType, id);
    }
    return entity;
  }

  async findByIdOrNull(id: string): Promise<T | null> {
    const entities = await this.findAll();
    return entities.find(e => e.id === id) || null;
  }

  async exists(id: string): Promise<boolean> {
    const entities = await this.findAll();
    return entities.some(e => e.id === id);
  }

  async findByIds(ids: string[]): Promise<T[]> {
    const entities = await this.findAll();
    return entities.filter(e => ids.includes(e.id));
  }

  async findAll(): Promise<T[]> {
    const entities = this.entitiesMap.get(this.planId) || [];
    return entities as T[];
  }

  async query(options: QueryOptions<T>): Promise<QueryResult<T>> {
    // Simple implementation for batch mode - no filtering/sorting
    const entities = await this.findAll();
    const offset = options.pagination?.offset || 0;
    const limit = options.pagination?.limit || entities.length;

    const items = entities.slice(offset, offset + limit);

    return {
      items,
      total: entities.length,
      offset,
      limit,
      hasMore: offset + limit < entities.length,
    };
  }

  async count(filter?: Filter<T>): Promise<number> {
    const entities = await this.findAll();
    return entities.length;
  }

  async findOne(filter: Filter<T>): Promise<T | null> {
    const entities = await this.findAll();
    return entities[0] || null;
  }

  async create(entity: T): Promise<T> {
    const entities = await this.findAll();
    entities.push(entity);
    this.entitiesMap.set(this.planId, entities);
    return entity;
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    const entities = await this.findAll();
    const index = entities.findIndex(e => e.id === id);
    if (index === -1) {
      throw new NotFoundError(this.entityType, id);
    }

    const existing = entities[index];

    // FIX C-1: Optimistic locking - check version if provided in updates
    if ('version' in updates && updates.version !== undefined && updates.version !== existing.version) {
      throw new ConflictError(
        `Version mismatch for ${this.entityType} ${id}: expected ${existing.version}, got ${updates.version}`,
        'version',
        { expectedVersion: existing.version, providedVersion: updates.version }
      );
    }

    // Remove version from updates to prevent overwrite, manage it internally
    const { version: _, ...updatesWithoutVersion } = updates;

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

  async delete(id: string): Promise<void> {
    const entities = await this.findAll();
    const index = entities.findIndex(e => e.id === id);
    if (index === -1) {
      throw new NotFoundError(this.entityType, id);
    }
    entities.splice(index, 1);
    this.entitiesMap.set(this.planId, entities);
  }

  async deleteMany(ids: string[]): Promise<number> {
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

  async createMany(entities: T[]): Promise<T[]> {
    const created: T[] = [];
    for (const entity of entities) {
      created.push(await this.create(entity));
    }
    return created;
  }

  async updateMany(updates: { id: string; data: Partial<T> }[]): Promise<T[]> {
    const updated: T[] = [];
    for (const { id, data } of updates) {
      updated.push(await this.update(id, data));
    }
    return updated;
  }

  async upsertMany(entities: T[]): Promise<T[]> {
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

  private async findAll(): Promise<Link[]> {
    return this.linksMap.get(this.planId) || [];
  }

  async getLinkById(id: string): Promise<Link> {
    const links = await this.findAll();
    const link = links.find(l => l.id === id);
    if (!link) {
      throw new NotFoundError('link', id);
    }
    return link;
  }

  async createLink(link: Omit<Link, 'id' | 'createdAt' | 'createdBy'>): Promise<Link> {
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

  async deleteLink(id: string): Promise<void> {
    const links = await this.findAll();
    const index = links.findIndex(l => l.id === id);
    if (index === -1) {
      throw new NotFoundError('link', id);
    }
    links.splice(index, 1);
    this.linksMap.set(this.planId, links);
  }

  async findLinksBySource(sourceId: string, relationType?: string): Promise<Link[]> {
    const links = await this.findAll();
    return links.filter(l =>
      l.sourceId === sourceId &&
      (!relationType || l.relationType === relationType)
    );
  }

  async findLinksByTarget(targetId: string, relationType?: string): Promise<Link[]> {
    const links = await this.findAll();
    return links.filter(l =>
      l.targetId === targetId &&
      (!relationType || l.relationType === relationType)
    );
  }

  async findLinksByEntity(entityId: string, direction?: 'incoming' | 'outgoing' | 'both'): Promise<Link[]> {
    const links = await this.findAll();
    const dir = direction || 'both';

    if (dir === 'outgoing') {
      return links.filter(l => l.sourceId === entityId);
    }
    if (dir === 'incoming') {
      return links.filter(l => l.targetId === entityId);
    }
    return links.filter(l => l.sourceId === entityId || l.targetId === entityId);
  }

  async findAllLinks(relationType?: string): Promise<Link[]> {
    const links = await this.findAll();
    if (!relationType) {
      return links;
    }
    return links.filter(l => l.relationType === relationType);
  }

  async deleteLinksForEntity(entityId: string): Promise<number> {
    const links = await this.findAll();
    const toDelete = links.filter(l => l.sourceId === entityId || l.targetId === entityId);

    for (const link of toDelete) {
      await this.deleteLink(link.id);
    }

    return toDelete.length;
  }

  async linkExists(sourceId: string, targetId: string, relationType: string): Promise<boolean> {
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

  async initialize(): Promise<void> {
    // No-op
  }

  async planExists(planId: string): Promise<boolean> {
    return planId === this.validPlanId;
  }

  async createPlan(): Promise<void> {
    throw new Error('createPlan not supported in batch mode');
  }

  async deletePlan(): Promise<void> {
    throw new Error('deletePlan not supported in batch mode');
  }

  async listPlans(): Promise<string[]> {
    throw new Error('listPlans not supported in batch mode');
  }

  async saveManifest(): Promise<void> {
    throw new Error('saveManifest not supported in batch mode');
  }

  async loadManifest(): Promise<any> {
    throw new Error('loadManifest not supported in batch mode');
  }

  async saveActivePlans(): Promise<void> {
    throw new Error('saveActivePlans not supported in batch mode');
  }

  async loadActivePlans(): Promise<any> {
    throw new Error('loadActivePlans not supported in batch mode');
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
  private readonly repositoryCache = new Map<string, Repository<any>>();
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

  createRepository<T extends Entity>(entityType: EntityType, planId: string): Repository<T> {
    const cacheKey = `${entityType}:${planId}`;
    if (this.repositoryCache.has(cacheKey)) {
      return this.repositoryCache.get(cacheKey)!;
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
        throw new Error(`Unsupported entity type: ${entityType}`);
    }

    const repo = new InMemoryRepository<T>(entityType, planId, entitiesMap);
    this.repositoryCache.set(cacheKey, repo);
    return repo;
  }

  createLinkRepository(planId: string): LinkRepository {
    return this.linkRepo;
  }

  createPlanRepository(): any {
    return this.planRepo;
  }

  createUnitOfWork(planId: string): any {
    throw new Error('UnitOfWork not supported in batch mode');
  }

  // FIX M-3: Return 'file' as this is memory-backed simulation of file storage
  getBackend(): 'file' {
    return 'file';
  }

  async close(): Promise<void> {
    // No-op for in-memory
  }

  async dispose(): Promise<void> {
    this.repositoryCache.clear();
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
  async loadAllIntoMemory(): Promise<void> {
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
  async flushToDisk(): Promise<void> {
    const requirements = this.requirementsMap.get(this.planId) || [];
    const solutions = this.solutionsMap.get(this.planId) || [];
    const phases = this.phasesMap.get(this.planId) || [];
    const decisions = this.decisionsMap.get(this.planId) || [];
    const artifacts = this.artifactsMap.get(this.planId) || [];
    const links = this.linksMap.get(this.planId) || [];
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
      } catch (err: any) {
        // If link already exists (ConflictError with duplicate), skip it
        // This can happen if batch is retried or link was created outside batch
        if (err.conflictType !== 'duplicate') {
          throw err;
        }
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

  async loadEntities<T extends Entity>(planId: string, entityType: string): Promise<T[]> {
    switch (entityType) {
      case 'requirements':
        return (this.requirementsMap.get(planId) || []) as unknown as T[];
      case 'solutions':
        return (this.solutionsMap.get(planId) || []) as unknown as T[];
      case 'phases':
        return (this.phasesMap.get(planId) || []) as unknown as T[];
      case 'decisions':
        return (this.decisionsMap.get(planId) || []) as unknown as T[];
      case 'artifacts':
        return (this.artifactsMap.get(planId) || []) as unknown as T[];
      default:
        return [];
    }
  }

  async saveEntities<T extends Entity>(
    planId: string,
    entityType: string,
    entities: T[]
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
  }

  async loadLinks(planId: string): Promise<Link[]> {
    return this.linksMap.get(planId) || [];
  }

  async saveLinks(planId: string, links: Link[]): Promise<void> {
    this.linksMap.set(planId, links);
  }

  async loadManifest(planId: string): Promise<PlanManifest> {
    const manifest = this.manifestsMap.get(planId);
    if (!manifest) {
      throw new Error('Manifest not found');
    }
    return manifest;
  }

  async saveManifest(planId: string, manifest: PlanManifest): Promise<void> {
    this.manifestsMap.set(planId, manifest);
  }

  async planExists(planId: string): Promise<boolean> {
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

  async executeBatch(input: ExecuteBatchInput): Promise<BatchResult> {
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
    const memReqService = new (this.requirementService.constructor as any)(
      memoryRepoFactory,
      this.planService
    );
    const memSolService = new (this.solutionService.constructor as any)(
      memoryRepoFactory,
      this.planService
    );
    const memPhaseService = new (this.phaseService.constructor as any)(
      memoryRepoFactory, // PhaseService migrated to RepositoryFactory
      this.planService
    );
    const memLinkService = new (this.linkingService.constructor as any)(
      memoryRepoFactory
    );
    const memDecService = new (this.decisionService.constructor as any)(
      memoryRepoFactory,
      this.planService
    );
    const memArtService = new (this.artifactService.constructor as any)(
      memoryRepoFactory,
      this.planService
    );

    const results: { success: boolean; id?: string; error?: string }[] = [];
    const tempIdMapping: Record<string, string> = {};

    try {
      // 3. Execute operations sequentially in memory
      for (const op of input.operations) {
        let result: any;

        // Resolve temp IDs in payload
        const resolvedPayload = this.resolveTempIds(op.payload, tempIdMapping, op.entity_type);

        // Check if this is an update operation
        const isUpdate = resolvedPayload.action === 'update';

        switch (op.entity_type) {
          case 'requirement':
            if (isUpdate) {
              // Resolve temp ID in id field if needed
              const requirementId = tempIdMapping[resolvedPayload.id] || resolvedPayload.id;
              result = await memReqService.updateRequirement({
                planId: input.planId,
                requirementId,
                updates: resolvedPayload.updates
              });
              results.push({ success: true, id: requirementId });
            } else {
              result = await memReqService.addRequirement({
                planId: input.planId,
                requirement: resolvedPayload
              });
              results.push({ success: true, id: result.requirementId });

              // Track temp ID mapping
              if (resolvedPayload.tempId) {
                tempIdMapping[resolvedPayload.tempId] = result.requirementId;
              }
            }
            break;

          case 'solution':
            if (isUpdate) {
              const solutionId = tempIdMapping[resolvedPayload.id] || resolvedPayload.id;
              result = await memSolService.updateSolution({
                planId: input.planId,
                solutionId,
                updates: resolvedPayload.updates
              });
              results.push({ success: true, id: solutionId });
            } else {
              result = await memSolService.proposeSolution({
                planId: input.planId,
                solution: resolvedPayload
              });
              results.push({ success: true, id: result.solutionId });

              if (resolvedPayload.tempId) {
                tempIdMapping[resolvedPayload.tempId] = result.solutionId;
              }
            }
            break;

          case 'phase':
            if (isUpdate) {
              const phaseId = tempIdMapping[resolvedPayload.id] || resolvedPayload.id;
              result = await memPhaseService.updatePhase({
                planId: input.planId,
                phaseId,
                updates: resolvedPayload.updates
              });
              results.push({ success: true, id: phaseId });
            } else {
              result = await memPhaseService.addPhase({
                planId: input.planId,
                phase: resolvedPayload
              });
              results.push({ success: true, id: result.phaseId });

              if (resolvedPayload.tempId) {
                tempIdMapping[resolvedPayload.tempId] = result.phaseId;
              }
            }
            break;

          case 'link':
            result = await memLinkService.linkEntities({
              planId: input.planId,
              ...resolvedPayload
            });
            results.push({ success: true, id: result.linkId });
            break;

          case 'decision':
            if (isUpdate) {
              const decisionId = tempIdMapping[resolvedPayload.id] || resolvedPayload.id;
              result = await memDecService.updateDecision({
                planId: input.planId,
                decisionId,
                updates: resolvedPayload.updates
              });
              results.push({ success: true, id: decisionId });
            } else {
              result = await memDecService.recordDecision({
                planId: input.planId,
                decision: resolvedPayload
              });
              results.push({ success: true, id: result.decisionId });

              if (resolvedPayload.tempId) {
                tempIdMapping[resolvedPayload.tempId] = result.decisionId;
              }
            }
            break;

          case 'artifact':
            if (isUpdate) {
              const artifactId = tempIdMapping[resolvedPayload.id] || resolvedPayload.id;
              result = await memArtService.updateArtifact({
                planId: input.planId,
                artifactId,
                updates: resolvedPayload.updates
              });
              results.push({ success: true, id: artifactId });
            } else {
              result = await memArtService.addArtifact({
                planId: input.planId,
                artifact: resolvedPayload
              });
              results.push({ success: true, id: result.artifactId });

              if (resolvedPayload.tempId) {
                tempIdMapping[resolvedPayload.tempId] = result.artifactId;
              }
            }
            break;

          default:
            throw new Error(`Unknown entity_type: ${op.entity_type}`);
        }
      }

      // 4. All operations succeeded - flush to disk atomically
      await memoryStorage.flushToDisk();

      // 5. Update statistics (only once after all operations)
      await this.planService.updateStatistics(input.planId);

      return { results, tempIdMapping };

    } catch (error) {
      // Rollback: simply don't write to disk
      // Memory will be garbage collected
      throw error;
    }
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
  private resolveTempIds(payload: any, mapping: Record<string, string>, entityType?: string): any {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

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

    const fieldMap = entityType ? ID_FIELDS[entityType] || {} : {};

    return resolveFieldTempIds(payload, fieldMap, mapping);
  }
}
