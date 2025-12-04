import { v4 as uuidv4 } from 'uuid';
import type { FileStorage } from '../../infrastructure/file-storage.js';
import type { PlanService } from './plan-service.js';
import type { RequirementService } from './requirement-service.js';
import type { SolutionService } from './solution-service.js';
import type { PhaseService } from './phase-service.js';
import type { LinkingService } from './linking-service.js';
import type { DecisionService } from './decision-service.js';
import type { ArtifactService } from './artifact-service.js';
import type {
  Entity,
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
export type EntityType = 'requirement' | 'solution' | 'phase' | 'link' | 'decision' | 'artifact';

export interface BatchOperation {
  entity_type: EntityType;
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
 * In-Memory Storage Adapter
 *
 * This adapter wraps FileStorage and provides an in-memory layer for batch operations.
 * All reads/writes go through memory, allowing for transactional rollback.
 */
class InMemoryStorage {
  // In-memory entity stores
  private requirementsMap: Map<string, Requirement[]> = new Map();
  private solutionsMap: Map<string, Solution[]> = new Map();
  private phasesMap: Map<string, Phase[]> = new Map();
  private decisionsMap: Map<string, Decision[]> = new Map();
  private artifactsMap: Map<string, Artifact[]> = new Map();
  private linksMap: Map<string, Link[]> = new Map();
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

    // 2. Create in-memory service instances
    const memReqService = new (this.requirementService.constructor as any)(
      memoryStorage,
      this.planService
    );
    const memSolService = new (this.solutionService.constructor as any)(
      memoryStorage,
      this.planService
    );
    const memPhaseService = new (this.phaseService.constructor as any)(
      memoryStorage,
      this.planService
    );
    const memLinkService = new (this.linkingService.constructor as any)(
      memoryStorage
    );
    const memDecService = new (this.decisionService.constructor as any)(
      memoryStorage,
      this.planService
    );
    const memArtService = new (this.artifactService.constructor as any)(
      memoryStorage,
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

        switch (op.entity_type) {
          case 'requirement':
            result = await memReqService.addRequirement({
              planId: input.planId,
              requirement: resolvedPayload
            });
            results.push({ success: true, id: result.requirementId });

            // Track temp ID mapping
            if (resolvedPayload.tempId) {
              tempIdMapping[resolvedPayload.tempId] = result.requirementId;
            }
            break;

          case 'solution':
            result = await memSolService.proposeSolution({
              planId: input.planId,
              solution: resolvedPayload
            });
            results.push({ success: true, id: result.solutionId });

            if (resolvedPayload.tempId) {
              tempIdMapping[resolvedPayload.tempId] = result.solutionId;
            }
            break;

          case 'phase':
            result = await memPhaseService.addPhase({
              planId: input.planId,
              phase: resolvedPayload
            });
            results.push({ success: true, id: result.phaseId });

            if (resolvedPayload.tempId) {
              tempIdMapping[resolvedPayload.tempId] = result.phaseId;
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
            result = await memDecService.recordDecision({
              planId: input.planId,
              decision: resolvedPayload
            });
            results.push({ success: true, id: result.decisionId });

            if (resolvedPayload.tempId) {
              tempIdMapping[resolvedPayload.tempId] = result.decisionId;
            }
            break;

          case 'artifact':
            result = await memArtService.addArtifact({
              planId: input.planId,
              artifact: resolvedPayload
            });
            results.push({ success: true, id: result.artifactId });

            if (resolvedPayload.tempId) {
              tempIdMapping[resolvedPayload.tempId] = result.artifactId;
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
