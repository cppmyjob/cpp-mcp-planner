import { v4 as uuidv4 } from 'uuid';
import type { FileStorage } from '../../infrastructure/file-storage.js';
import type { RepositoryFactory, Repository, LinkRepository } from '../repositories/interfaces.js';
import { NotFoundError } from '../repositories/errors.js';
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
  results: Array<{ success: boolean; id?: string; error?: string }>;
  tempIdMapping: Record<string, string>;
}

export interface ExecuteBatchInput {
  planId: string;
  operations: BatchOperation[];
}

/**
 * In-Memory Repository - implements Repository<T> interface but works with in-memory maps
 */
class InMemoryRepository<T extends Entity> implements Repository<T> {
  constructor(
    private entityType: EntityType,
    private planId: string,
    private entitiesMap: Map<string, Entity[]>
  ) {}

  async findById(id: string): Promise<T> {
    const entities = await this.findAll();
    const entity = entities.find(e => e.id === id);
    if (!entity) {
      throw new NotFoundError(this.entityType, id);
    }
    return entity;
  }

  async findAll(): Promise<T[]> {
    const entities = this.entitiesMap.get(this.planId) || [];
    return entities as T[];
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
    const updated: T = {
      ...existing,
      ...updates,
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

  async exists(id: string): Promise<boolean> {
    const entities = await this.findAll();
    return entities.some(e => e.id === id);
  }
}

/**
 * In-Memory Link Repository
 */
class InMemoryLinkRepository implements LinkRepository {
  constructor(
    private planId: string,
    private linksMap: Map<string, Link[]>
  ) {}

  async findById(id: string): Promise<Link> {
    const links = await this.findAll();
    const link = links.find(l => l.id === id);
    if (!link) {
      throw new NotFoundError('link', id);
    }
    return link;
  }

  async findAll(): Promise<Link[]> {
    return this.linksMap.get(this.planId) || [];
  }

  async create(link: Link): Promise<Link> {
    const links = await this.findAll();
    links.push(link);
    this.linksMap.set(this.planId, links);
    return link;
  }

  async delete(id: string): Promise<void> {
    const links = await this.findAll();
    const index = links.findIndex(l => l.id === id);
    if (index === -1) {
      throw new NotFoundError('link', id);
    }
    links.splice(index, 1);
    this.linksMap.set(this.planId, links);
  }

  async findBySource(sourceId: string): Promise<Link[]> {
    const links = await this.findAll();
    return links.filter(l => l.sourceId === sourceId);
  }

  async findByTarget(targetId: string): Promise<Link[]> {
    const links = await this.findAll();
    return links.filter(l => l.targetId === targetId);
  }

  async findByRelation(relationType: string): Promise<Link[]> {
    const links = await this.findAll();
    return links.filter(l => l.relationType === relationType);
  }
}

/**
 * In-Memory Repository Factory
 */
class InMemoryRepositoryFactory implements RepositoryFactory {
  private repositoryCache = new Map<string, Repository<any>>();
  private linkRepo: InMemoryLinkRepository;

  constructor(
    private planId: string,
    private requirementsMap: Map<string, Requirement[]>,
    private solutionsMap: Map<string, Solution[]>,
    private phasesMap: Map<string, Phase[]>,
    private decisionsMap: Map<string, Decision[]>,
    private artifactsMap: Map<string, Artifact[]>,
    private linksMap: Map<string, Link[]>
  ) {
    this.linkRepo = new InMemoryLinkRepository(planId, linksMap);
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
    throw new Error('PlanRepository not supported in batch mode');
  }

  createUnitOfWork(planId: string): any {
    throw new Error('UnitOfWork not supported in batch mode');
  }

  getBackend(): any {
    return 'memory';
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
 * This adapter wraps FileStorage and provides an in-memory layer for batch operations.
 * All reads/writes go through memory, allowing for transactional rollback.
 */
class InMemoryStorage {
  // In-memory entity stores (public for InMemoryRepositoryFactory access)
  public requirementsMap: Map<string, Requirement[]> = new Map();
  public solutionsMap: Map<string, Solution[]> = new Map();
  public phasesMap: Map<string, Phase[]> = new Map();
  public decisionsMap: Map<string, Decision[]> = new Map();
  public artifactsMap: Map<string, Artifact[]> = new Map();
  public linksMap: Map<string, Link[]> = new Map();
  private manifestsMap: Map<string, PlanManifest> = new Map();

  constructor(
    private realStorage: FileStorage,
    private planId: string
  ) {}

  /**
   * Load all entities for a plan into memory
   */
  async loadAllIntoMemory(): Promise<void> {
    // Load all entity types into memory
    const [requirements, solutions, phases, decisions, artifacts, links, manifest] = await Promise.all([
      this.realStorage.loadEntities<Requirement>(this.planId, 'requirements'),
      this.realStorage.loadEntities<Solution>(this.planId, 'solutions'),
      this.realStorage.loadEntities<Phase>(this.planId, 'phases'),
      this.realStorage.loadEntities<Decision>(this.planId, 'decisions'),
      this.realStorage.loadEntities<Artifact>(this.planId, 'artifacts'),
      this.realStorage.loadLinks(this.planId),
      this.realStorage.loadManifest(this.planId)
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

    // Atomic write of all changes
    await Promise.all([
      this.realStorage.saveEntities(this.planId, 'requirements', requirements),
      this.realStorage.saveEntities(this.planId, 'solutions', solutions),
      this.realStorage.saveEntities(this.planId, 'phases', phases),
      this.realStorage.saveEntities(this.planId, 'decisions', decisions),
      this.realStorage.saveEntities(this.planId, 'artifacts', artifacts),
      this.realStorage.saveLinks(this.planId, links),
      manifest ? this.realStorage.saveManifest(this.planId, manifest) : Promise.resolve()
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
    return this.realStorage.planExists(planId);
  }
}

/**
 * Batch Service (Proof of Concept)
 *
 * Implements in-memory batching for transactional operations.
 * All operations execute in memory, then flush atomically to disk.
 */
export class BatchService {
  constructor(
    private storage: FileStorage,
    private planService: PlanService,
    private requirementService: RequirementService,
    private solutionService: SolutionService,
    private phaseService: PhaseService,
    private linkingService: LinkingService,
    private decisionService: DecisionService,
    private artifactService: ArtifactService
  ) {}

  async executeBatch(input: ExecuteBatchInput): Promise<BatchResult> {
    // Validate plan exists
    const exists = await this.storage.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    // 1. Create in-memory storage and load all entities
    const memoryStorage = new InMemoryStorage(this.storage, input.planId);
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
      memoryStorage, // PhaseService still uses FileStorage
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

    const results: Array<{ success: boolean; id?: string; error?: string }> = [];
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
