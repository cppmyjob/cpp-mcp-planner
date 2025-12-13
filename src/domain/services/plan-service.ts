import { v4 as uuidv4 } from 'uuid';
import type { RepositoryFactory, PlanRepository } from '../repositories/interfaces.js';
import type {
  PlanManifest,
  PlanStatus,
  Requirement,
  Solution,
  Decision,
  Phase,
  Artifact,
  Link,
} from '../entities/types.js';
import type { UsageGuide } from '../entities/usage-guide.js';
import { DEFAULT_USAGE_GUIDE } from '../constants/default-usage-guide.js';
import { validatePlanName, validatePlanStatus } from './validators.js';

// Constants
const MAX_HISTORY_DEPTH = 10;
const DEFAULT_HISTORY_DEPTH = 5;
const DEFAULT_PLANS_PAGE_LIMIT = 50;

// Input types
export interface CreatePlanInput {
  name: string;
  description: string;
  author?: string;
  enableHistory?: boolean; // Sprint 7: Enable version history tracking (default: false)
  maxHistoryDepth?: number; // Sprint 7: Maximum versions to keep (0-10), 0 means unlimited
}

export interface ListPlansInput {
  status?: PlanStatus;
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'updated_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface GetPlanInput {
  planId: string;
  includeEntities?: boolean;
  entityTypes?: ('requirement' | 'solution' | 'decision' | 'phase' | 'artifact')[];
}

export interface UpdatePlanInput {
  planId: string;
  updates: {
    name?: string;
    description?: string;
    status?: PlanStatus;
    enableHistory?: boolean; // Sprint 7: Update history settings
    maxHistoryDepth?: number; // Sprint 7: Update max history depth (0-10)
  };
}

export interface ArchivePlanInput {
  planId: string;
  permanent?: boolean;
}

export interface SetActivePlanInput {
  planId: string;
  workspacePath?: string;
}

export interface GetActivePlanInput {
  workspacePath?: string;
  includeGuide?: boolean;
}

export interface GetSummaryInput {
  planId: string;
}

// Output types
export interface CreatePlanResult {
  planId: string;
}

export interface ListPlansResult {
  plans: {
    id: string;
    name: string;
    description: string;
    status: PlanStatus;
    createdAt: string;
    updatedAt: string;
    statistics: PlanManifest['statistics'];
  }[];
  total: number;
  hasMore: boolean;
}

export interface GetPlanResult {
  plan: {
    manifest: PlanManifest;
    entities?: {
      requirements: Requirement[];
      solutions: Solution[];
      decisions: Decision[];
      phases: Phase[];
      artifacts: Artifact[];
    };
    links?: Link[];
  };
}

export interface UpdatePlanResult {
  success: boolean;
  planId: string;
}

export interface ArchivePlanResult {
  success: boolean;
  message: string;
}

export interface SetActivePlanResult {
  success: boolean;
  activePlan: {
    planId: string;
    planName: string;
    workspacePath: string;
  };
}

export interface GetActivePlanResult {
  activePlan: {
    planId: string;
    plan: PlanManifest;
    lastUpdated: string;
    usageGuide?: UsageGuide;
  } | null;
}

export interface PhaseSummaryItem {
  id: string;
  title: string;
  status: string;
  progress: number;
  path: string;
  childCount: number;
}

export interface GetSummaryResult {
  plan: {
    id: string;
    name: string;
    description: string;
    status: PlanStatus;
    createdAt: string;
    updatedAt: string;
  };
  phases: PhaseSummaryItem[];
  statistics: PlanManifest['statistics'];
}

export class PlanService {
  private readonly planRepo: PlanRepository;

  constructor(private readonly repositoryFactory: RepositoryFactory) {
    this.planRepo = repositoryFactory.createPlanRepository();
  }

  public async createPlan(input: CreatePlanInput): Promise<CreatePlanResult> {
    // Sprint 1: Validate required fields
    validatePlanName(input.name);

    const planId = uuidv4();
    const now = new Date().toISOString();

    // Sprint 7: Validate history settings
    if (input.maxHistoryDepth !== undefined) {
      if (input.maxHistoryDepth < 0 || input.maxHistoryDepth > MAX_HISTORY_DEPTH) {
        throw new Error(`maxHistoryDepth must be between 0 and ${String(MAX_HISTORY_DEPTH)}`);
      }
      if (!Number.isInteger(input.maxHistoryDepth)) {
        throw new Error('maxHistoryDepth must be an integer');
      }
    }

    const manifest: PlanManifest = {
      id: planId,
      name: input.name,
      description: input.description,
      status: 'active',
      author: input.author ?? 'claude-code',
      createdAt: now,
      updatedAt: now,
      version: 1,
      lockVersion: 1,
      statistics: {
        totalRequirements: 0,
        totalSolutions: 0,
        totalDecisions: 0,
        totalPhases: 0,
        totalArtifacts: 0,
        completionPercentage: 0,
      },
    };

    // Sprint 7: Configure history settings
    // Priority: explicit values > inferred from each other > defaults
    if (input.enableHistory !== undefined) {
      manifest.enableHistory = input.enableHistory;

      // If enableHistory is explicitly set and maxHistoryDepth is not provided, set defaults
      if (input.maxHistoryDepth === undefined) {
        manifest.maxHistoryDepth = input.enableHistory ? DEFAULT_HISTORY_DEPTH : 0; // Default when enabled, 0 when disabled
      } else {
        manifest.maxHistoryDepth = input.maxHistoryDepth;
      }
    } else if (input.maxHistoryDepth !== undefined) {
      // If only maxHistoryDepth is provided, infer enableHistory from it
      manifest.maxHistoryDepth = input.maxHistoryDepth;
      manifest.enableHistory = input.maxHistoryDepth > 0;
    }
    // If neither is provided, history remains disabled (fields are undefined)

    await this.planRepo.createPlan(planId);
    await this.planRepo.saveManifest(planId, manifest);

    // Note: Individual entity repositories create their directories on first write
    // No need to initialize empty entity files with RepositoryFactory pattern

    return {
      planId,
    };
  }

  public async listPlans(input: ListPlansInput): Promise<ListPlansResult> {
    const planIds = await this.planRepo.listPlans();
    const manifests: PlanManifest[] = [];

    for (const planId of planIds) {
      try {
        const manifest = await this.planRepo.loadManifest(planId);
        manifests.push(manifest);
      } catch {
        // Skip invalid plans
      }
    }

    // Filter by status
    const filtered = input.status !== undefined
      ? manifests.filter((m) => m.status === input.status)
      : manifests;

    // Sort
    const sortBy = input.sortBy ?? 'updated_at';
    const sortOrder = input.sortOrder ?? 'desc';

    filtered.sort((a, b) => {
      let valueA: string | number;
      let valueB: string | number;

      if (sortBy === 'name') {
        valueA = a.name.toLowerCase();
        valueB = b.name.toLowerCase();
      } else if (sortBy === 'created_at') {
        valueA = a.createdAt;
        valueB = b.createdAt;
      } else {
        valueA = a.updatedAt;
        valueB = b.updatedAt;
      }

      if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Pagination
    const total = filtered.length;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? DEFAULT_PLANS_PAGE_LIMIT;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      plans: paginated.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        status: m.status,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        statistics: m.statistics,
      })),
      total,
      hasMore: offset + limit < total,
    };
  }

  public async getPlan(input: GetPlanInput): Promise<GetPlanResult> {
    const exists = await this.planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const manifest = await this.planRepo.loadManifest(input.planId);

    const result: GetPlanResult = {
      plan: { manifest },
    };

    if (input.includeEntities === true) {
      const reqRepo = this.repositoryFactory.createRepository<Requirement>('requirement', input.planId);
      const solRepo = this.repositoryFactory.createRepository<Solution>('solution', input.planId);
      const decRepo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
      const phaseRepo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);
      const artRepo = this.repositoryFactory.createRepository<Artifact>('artifact', input.planId);
      const linkRepo = this.repositoryFactory.createLinkRepository(input.planId);

      const [requirements, solutions, decisions, phases, artifacts, links] = await Promise.all([
        reqRepo.findAll(),
        solRepo.findAll(),
        decRepo.findAll(),
        phaseRepo.findAll(),
        artRepo.findAll(),
        linkRepo.findAllLinks(),
      ]);

      result.plan.entities = {
        requirements,
        solutions,
        decisions,
        phases,
        artifacts,
      };
      result.plan.links = links;
    }

    return result;
  }

  public async updatePlan(input: UpdatePlanInput): Promise<UpdatePlanResult> {
    // Sprint 1: Validate fields before any operations
    if (input.updates.name !== undefined) {
      validatePlanName(input.updates.name);
    }
    validatePlanStatus(input.updates.status);

    const exists = await this.planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const manifest = await this.planRepo.loadManifest(input.planId);
    const now = new Date().toISOString();

    // Apply updates
    if (input.updates.name !== undefined) {
      manifest.name = input.updates.name;
    }
    if (input.updates.description !== undefined) {
      manifest.description = input.updates.description;
    }
    if (input.updates.status !== undefined) {
      manifest.status = input.updates.status;
    }

    // Sprint 7: Update history settings
    if (input.updates.enableHistory !== undefined) {
      manifest.enableHistory = input.updates.enableHistory;
    }
    if (input.updates.maxHistoryDepth !== undefined) {
      // Validate maxHistoryDepth
      if (input.updates.maxHistoryDepth < 0 || input.updates.maxHistoryDepth > MAX_HISTORY_DEPTH) {
        throw new Error(`maxHistoryDepth must be between 0 and ${String(MAX_HISTORY_DEPTH)}`);
      }
      if (!Number.isInteger(input.updates.maxHistoryDepth)) {
        throw new Error('maxHistoryDepth must be an integer');
      }
      manifest.maxHistoryDepth = input.updates.maxHistoryDepth;
    }

    manifest.updatedAt = now;
    manifest.version += 1;
    manifest.lockVersion += 1;  // Sprint 7 fix: Increment lockVersion for optimistic locking

    await this.planRepo.saveManifest(input.planId, manifest);

    return {
      success: true,
      planId: input.planId,
    };
  }

  public async archivePlan(input: ArchivePlanInput): Promise<ArchivePlanResult> {
    const exists = await this.planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    if (input.permanent === true) {
      await this.planRepo.deletePlan(input.planId);
      return {
        success: true,
        message: 'Plan permanently deleted',
      };
    }

    // Soft delete - just change status
    await this.updatePlan({
      planId: input.planId,
      updates: { status: 'archived' },
    });

    return {
      success: true,
      message: 'Plan archived',
    };
  }

  public async setActivePlan(input: SetActivePlanInput): Promise<SetActivePlanResult> {
    const exists = await this.planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const manifest = await this.planRepo.loadManifest(input.planId);
    const workspacePath = input.workspacePath ?? process.cwd();
    const now = new Date().toISOString();

    const activePlans = await this.planRepo.loadActivePlans();
    activePlans[workspacePath] = {
      planId: input.planId,
      lastUpdated: now,
    };

    await this.planRepo.saveActivePlans(activePlans);

    return {
      success: true,
      activePlan: {
        planId: input.planId,
        planName: manifest.name,
        workspacePath,
      },
    };
  }

  /**
   * Get the active plan for the specified workspace.
   *
   * @param input - Configuration for retrieving the active plan
   * @param input.workspacePath - The workspace path (defaults to current working directory)
   * @param input.includeGuide - Include usage guide in response (default: false)
   *
   * @returns The active plan with optional usage guide
   *
   * @remarks
   * **Best Practice (Sprint 6):**
   * - Omit `includeGuide` parameter or set to `false` for regular calls (saves ~2.5KB)
   * - Set `includeGuide: true` only on first call or when you need to reference the guide
   * - The guide contains essential commands, formatting instructions, and best practices
   *
   * **Performance Impact:**
   * - Without guide: ~500 bytes payload
   * - With guide: ~3000 bytes payload (5x larger)
   *
   * @example
   * ```typescript
   * // First call - get guide
   * const result = await planService.getActivePlan({
   *   workspacePath: '/my/project',
   *   includeGuide: true  // Get guide for reference
   * });
   *
   * // Subsequent calls - omit guide for better performance
   * const result = await planService.getActivePlan({
   *   workspacePath: '/my/project'
   *   // includeGuide defaults to false
   * });
   * ```
   */
  public async getActivePlan(input: GetActivePlanInput): Promise<GetActivePlanResult> {
    const workspacePath = input.workspacePath ?? process.cwd();
    const includeGuide = input.includeGuide === true; // Default: false (Sprint 6 change)
    const activePlans = await this.planRepo.loadActivePlans();

    if (!(workspacePath in activePlans)) {
      return { activePlan: null };
    }
    const mapping = activePlans[workspacePath];

    try {
      const manifest = await this.planRepo.loadManifest(mapping.planId);

      // Build response with optional guide
      const response: GetActivePlanResult = {
        activePlan: {
          planId: mapping.planId,
          plan: manifest,
          lastUpdated: mapping.lastUpdated,
          ...(includeGuide ? { usageGuide: DEFAULT_USAGE_GUIDE } : {}),
        },
      };

      return response;
    } catch {
      // Plan was deleted, clear mapping
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing from runtime mapping object
      delete activePlans[workspacePath];
      await this.planRepo.saveActivePlans(activePlans);
      return { activePlan: null };
    }
  }

  public async getSummary(input: GetSummaryInput): Promise<GetSummaryResult> {
    const exists = await this.planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const manifest = await this.planRepo.loadManifest(input.planId);
    const phaseRepo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);
    const phases = await phaseRepo.findAll();

    // Calculate child counts for each phase
    const childCounts = new Map<string, number>();
    for (const phase of phases) {
      if (phase.parentId !== null && phase.parentId !== '') {
        childCounts.set(phase.parentId, (childCounts.get(phase.parentId) ?? 0) + 1);
      }
    }

    // Convert phases to summary format
    const phaseSummaries: PhaseSummaryItem[] = phases.map((phase) => ({
      id: phase.id,
      title: phase.title,
      status: phase.status,
      progress: phase.progress,
      path: phase.path,
      childCount: childCounts.get(phase.id) ?? 0,
    }));

    return {
      plan: {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        status: manifest.status,
        createdAt: manifest.createdAt,
        updatedAt: manifest.updatedAt,
      },
      phases: phaseSummaries,
      statistics: manifest.statistics,
    };
  }

  // Helper to update statistics
  public async updateStatistics(planId: string): Promise<void> {
    const manifest = await this.planRepo.loadManifest(planId);

    const reqRepo = this.repositoryFactory.createRepository<Requirement>('requirement', planId);
    const solRepo = this.repositoryFactory.createRepository<Solution>('solution', planId);
    const decRepo = this.repositoryFactory.createRepository<Decision>('decision', planId);
    const phaseRepo = this.repositoryFactory.createRepository<Phase>('phase', planId);
    const artRepo = this.repositoryFactory.createRepository<Artifact>('artifact', planId);

    const [requirements, solutions, decisions, phases, artifacts] = await Promise.all([
      reqRepo.findAll(),
      solRepo.findAll(),
      decRepo.findAll(),
      phaseRepo.findAll(),
      artRepo.findAll(),
    ]);

    manifest.statistics.totalRequirements = requirements.length;
    manifest.statistics.totalSolutions = solutions.length;
    manifest.statistics.totalDecisions = decisions.length;
    manifest.statistics.totalPhases = phases.length;
    manifest.statistics.totalArtifacts = artifacts.length;

    // Calculate completion percentage
    if (phases.length > 0) {
      const completedPhases = phases.filter(
        (p) => p.status === 'completed'
      ).length;
      manifest.statistics.completionPercentage = Math.round(
        (completedPhases / phases.length) * 100
      );
    }

    manifest.updatedAt = new Date().toISOString();
    await this.planRepo.saveManifest(planId, manifest);
  }
}
