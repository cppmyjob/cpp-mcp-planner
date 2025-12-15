import { v4 as uuidv4 } from 'uuid';
import type { RepositoryFactory } from '../repositories/interfaces.js';
import type { PlanService } from './plan-service.js';
import type { VersionHistoryService } from './version-history-service.js';
import type { DecisionService } from './decision-service.js';
import type { LinkingService } from './linking-service.js';
import type { Solution, SolutionStatus, Tradeoff, EffortEstimate, Tag, VersionHistory, VersionDiff, Requirement } from '../entities/types.js';
import { NotFoundError } from '../repositories/errors.js';
import { validateEffortEstimate, validateTags, validateRequiredString, validateOptionalString } from './validators.js';
import { filterEntity, filterEntities } from '../utils/field-filter.js';

// Constants
const MAX_SOLUTIONS_BATCH_SIZE = 100;
const DEFAULT_SOLUTIONS_PAGE_LIMIT = 50;

// Input types
export interface ProposeSolutionInput {
  planId: string;
  solution: {
    title: string;  // REQUIRED
    description?: string;  // Optional - default: ''
    approach?: string;     // Optional - default: ''
    implementationNotes?: string;
    tradeoffs?: Tradeoff[];  // Optional - default: []
    addressing?: string[];   // Optional - default: []
    evaluation?: {           // Optional - default: { effortEstimate: {value:0, unit:'hours', confidence:'low'}, technicalFeasibility:'medium', riskAssessment:'' }
      effortEstimate: EffortEstimate;
      technicalFeasibility: 'high' | 'medium' | 'low';
      riskAssessment: string;
      dependencies?: string[];
      performanceImpact?: string;
    };
    tags?: Tag[];
  };
}

export interface CompareSolutionsInput {
  planId: string;
  solutionIds: string[];
  aspects?: string[];
}

/**
 * Input for selecting a solution
 */
export interface SelectSolutionInput {
  planId: string;
  solutionId: string;
  /** Reason for selecting this solution (stored in solution.selectionReason) */
  reason?: string;
  /**
   * Automatically create an ADR Decision record documenting this solution selection.
   * The Decision will include:
   * - title: "Solution Selection: {solution.title}"
   * - context: solution description and approach
   * - decision: selected solution with reason
   * - alternativesConsidered: other solutions addressing same requirements
   * - consequences: from solution.evaluation.riskAssessment
   * - impactScope: solution.addressing (requirement IDs)
   *
   * @default false
   */
  createDecisionRecord?: boolean;
}

export interface UpdateSolutionInput {
  planId: string;
  solutionId: string;
  updates: Partial<ProposeSolutionInput['solution']>;
}

export interface ListSolutionsInput {
  planId: string;
  filters?: {
    status?: SolutionStatus;
    addressingRequirement?: string;
    tags?: Tag[];
  };
  limit?: number;
  offset?: number;
  fields?: string[]; // Fields to include: summary (default), ['*'] (all), or custom list
  excludeMetadata?: boolean; // Exclude metadata fields (createdAt, updatedAt, version, metadata)
}

export interface DeleteSolutionInput {
  planId: string;
  solutionId: string;
  force?: boolean;
}

export interface GetSolutionInput {
  planId: string;
  solutionId: string;
  fields?: string[]; // Fields to include: summary (default), ['*'] (all), or custom list
  excludeMetadata?: boolean; // Exclude metadata fields (createdAt, updatedAt, version, metadata)
}

export interface GetSolutionResult {
  solution: Solution;
}

export interface GetSolutionsInput {
  planId: string;
  solutionIds: string[];
  fields?: string[];
  excludeMetadata?: boolean;
}

export interface BulkUpdateSolutionsInput {
  planId: string;
  updates: {
    solutionId: string;
    updates: Partial<{
      title: string;
      description: string;
      approach: string;
      addressing: string[];
      implementationNotes: string;
      tradeoffs: {
        aspect: string;
        pros: string[];
        cons: string[];
        score?: number;
      }[];
      evaluation: {
        technicalFeasibility: 'high' | 'medium' | 'low';
        effortEstimate: {
          value: number;
          unit: 'hours' | 'days' | 'weeks' | 'story-points' | 'minutes';
          confidence: 'low' | 'medium' | 'high';
        };
        riskAssessment: string;
      };
      status: 'proposed' | 'selected' | 'rejected';
    }>;
  }[];
  atomic?: boolean;
}

export interface BulkUpdateSolutionsResult {
  updated: number;
  failed: number;
  results: {
    solutionId: string;
    success: boolean;
    error?: string;
  }[];
}

export interface GetSolutionsResult {
  solutions: Solution[];
  notFound: string[];
}

// Output types
export interface ProposeSolutionResult {
  solutionId: string;
}

export interface CompareSolutionsResult {
  comparison: {
    solutions: Solution[];
    matrix: {
      aspect: string;
      solutions: {
        solutionId: string;
        solutionTitle: string;
        pros: string[];
        cons: string[];
        score?: number;
      }[];
      winner?: string;
    }[];
    summary: {
      bestOverall?: string;
      recommendations: string[];
    };
  };
}

/**
 * Result of solution selection
 */
export interface SelectSolutionResult {
  success: boolean;
  solutionId: string;
  /** IDs of solutions that were deselected (rejected) because they addressed same requirements */
  deselectedIds?: string[];
  /**
   * ID of automatically created Decision record (only present when createDecisionRecord=true)
   * Use this ID to retrieve the full Decision record via DecisionService.getDecision()
   */
  decisionId?: string;
}

export interface UpdateSolutionResult {
  success: boolean;
  solutionId: string;
}

export interface ListSolutionsResult {
  solutions: Solution[];
  total: number;
  hasMore: boolean;
}

export interface DeleteSolutionResult {
  success: boolean;
  message: string;
}

export class SolutionService {
  constructor(
    private readonly repositoryFactory: RepositoryFactory,
    private readonly planService: PlanService,
    private readonly versionHistoryService?: VersionHistoryService,
    private readonly decisionService?: DecisionService, // TDD Sprint: Optional DecisionService for auto-creating Decision records
    private readonly linkingService?: LinkingService // REQ-5: Optional for cascade delete
  ) {}

  public async getSolution(input: GetSolutionInput): Promise<GetSolutionResult> {
    const repo = this.repositoryFactory.createRepository<Solution>('solution', input.planId);
    const solution = await repo.findById(input.solutionId);

    // Apply field filtering - GET operations default to all fields
    const filtered = filterEntity(
      solution,
      input.fields ?? ['*'],
      'solution',
      input.excludeMetadata,
      false
    ) as Solution;

    return { solution: filtered };
  }

  public async getSolutions(input: GetSolutionsInput): Promise<GetSolutionsResult> {
    // Enforce max limit
    if (input.solutionIds.length > MAX_SOLUTIONS_BATCH_SIZE) {
      throw new Error(`Cannot fetch more than ${String(MAX_SOLUTIONS_BATCH_SIZE)} solutions at once`);
    }

    // Handle empty array
    if (input.solutionIds.length === 0) {
      return { solutions: [], notFound: [] };
    }

    const repo = this.repositoryFactory.createRepository<Solution>('solution', input.planId);
    const foundSolutions: Solution[] = [];
    const notFound: string[] = [];

    // Fetch each solution by ID
    for (const id of input.solutionIds) {
      try {
        const solution = await repo.findById(id);
        // Apply field filtering - solutions default to all fields
        const filtered = filterEntity(
          solution,
          input.fields ?? ['*'],
          'solution',
          input.excludeMetadata,
          false
        ) as Solution;
        foundSolutions.push(filtered);
      } catch (error: unknown) {
        // L-1 FIX: Only treat NotFoundError as "not found", re-throw other errors
        if (error instanceof NotFoundError || (error instanceof Error && error.constructor.name === 'NotFoundError')) {
          notFound.push(id);
        } else {
          // Preserve error context
          throw error;
        }
      }
    }

    return { solutions: foundSolutions, notFound };
  }

  public async proposeSolution(input: ProposeSolutionInput): Promise<ProposeSolutionResult> {
    // Validate REQUIRED fields
    validateRequiredString(input.solution.title, 'title');

    // Validate tradeoffs format
    this.validateTradeoffs(input.solution.tradeoffs ?? []);
    // Validate effortEstimate format (only if evaluation is provided)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-optional-chain
    if (input.solution.evaluation !== undefined && input.solution.evaluation.effortEstimate !== undefined) {
      validateEffortEstimate(input.solution.evaluation.effortEstimate);
    }
    // Validate tags format
    validateTags(input.solution.tags ?? []);

    // Validate optional string fields (BUG-003, BUG-029)
    validateOptionalString(input.solution.description, 'description');
    validateOptionalString(input.solution.approach, 'approach');

    // BUG #5 FIX: Validate addressing[] references exist
    const addressingIds = input.solution.addressing ?? [];
    if (addressingIds.length > 0) {
      await this.validateAddressingReferences(input.planId, addressingIds);
    }

    const solutionId = uuidv4();
    const now = new Date().toISOString();

    const solution: Solution = {
      id: solutionId,
      type: 'solution',
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {
        createdBy: 'claude-code',
        tags: input.solution.tags ?? [],
        annotations: [],
      },
      title: input.solution.title,  // REQUIRED
      description: input.solution.description ?? '',  // DEFAULT: empty string
      approach: input.solution.approach ?? '',        // DEFAULT: empty string
      implementationNotes: input.solution.implementationNotes,  // undefined OK
      tradeoffs: input.solution.tradeoffs ?? [],      // DEFAULT: empty array (BUG #6 fix)
      addressing: input.solution.addressing ?? [],    // DEFAULT: empty array
      evaluation: input.solution.evaluation ?? {      // DEFAULT: default evaluation
        effortEstimate: { value: 0, unit: 'hours', confidence: 'low' },
        technicalFeasibility: 'medium',
        riskAssessment: '',
      },
      status: 'proposed',
    };

    const repo = this.repositoryFactory.createRepository<Solution>('solution', input.planId);
    await repo.create(solution);
    await this.planService.updateStatistics(input.planId);

    return { solutionId: solution.id };
  }

  public async compareSolutions(input: CompareSolutionsInput): Promise<CompareSolutionsResult> {
    // Validate solutionIds parameter
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (input.solutionIds === undefined || input.solutionIds === null || !Array.isArray(input.solutionIds) || input.solutionIds.length === 0) {
      throw new Error('solutionIds must be a non-empty array');
    }

    // BUG-023 FIX: Compare requires at least 2 solutions
    const MIN_SOLUTIONS_FOR_COMPARE = 2;
    if (input.solutionIds.length < MIN_SOLUTIONS_FOR_COMPARE) {
      throw new Error('compare requires at least 2 solutions');
    }

    const repo = this.repositoryFactory.createRepository<Solution>('solution', input.planId);
    const solutions: Solution[] = [];
    for (const id of input.solutionIds) {
      try {
        const solution = await repo.findById(id);
        solutions.push(solution);
      } catch {
        // Skip not found solutions
      }
    }

    // Collect all aspects
    const aspectsSet = new Set<string>();
    solutions.forEach((s) => {
      // LEGACY SUPPORT: Keep defensive guard for backward compatibility with old data
      // TODO Sprint 3: Remove after data migration applies defaults to all existing entities
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (s.tradeoffs !== undefined && s.tradeoffs !== null) {
        s.tradeoffs.forEach((t) => aspectsSet.add(t.aspect));
      }
    });

    let aspects = Array.from(aspectsSet);
    if (input.aspects && input.aspects.length > 0) {
      const filterAspects = input.aspects;
      aspects = aspects.filter((a) => filterAspects.includes(a));
    }

    // Build comparison matrix
    const matrix = aspects.map((aspect) => {
      const solutionData = solutions.map((s) => {
        // LEGACY SUPPORT: Keep defensive guard for backward compatibility with old data
        // TODO Sprint 3: Remove after data migration applies defaults to all existing entities
        // New solutions created with proposeSolution() will always have tradeoffs=[]
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const tradeoff = (s.tradeoffs !== undefined && s.tradeoffs !== null)
          ? s.tradeoffs.find((t) => t.aspect === aspect)
          : undefined;
        return {
          solutionId: s.id,
          solutionTitle: s.title,
          pros: tradeoff?.pros ?? [],
          cons: tradeoff?.cons ?? [],
          score: tradeoff?.score,
        };
      });

      // Find winner for this aspect
      const withScores = solutionData.filter((d) => d.score !== undefined);
      let winner: string | undefined;
      if (withScores.length > 0) {
        const best = withScores.reduce((a, b) =>
          (a.score ?? 0) > (b.score ?? 0) ? a : b
        );
        winner = best.solutionId;
      }

      return { aspect, solutions: solutionData, winner };
    });

    // Calculate overall best
    const scores: Record<string, number[]> = {};
    solutions.forEach((s) => {
      // LEGACY SUPPORT: Keep defensive guard for backward compatibility with old data
      // TODO Sprint 3: Remove after data migration applies defaults to all existing entities
      // New solutions created with proposeSolution() will always have tradeoffs=[]
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (s.tradeoffs !== undefined && s.tradeoffs !== null) {
        scores[s.id] = s.tradeoffs
          .filter((t) => t.score !== undefined)
          .map((t) => {
            if (t.score === undefined) {
              throw new Error('Unexpected undefined score after filtering');
            }
            return t.score;
          });
      } else {
        scores[s.id] = [];
      }
    });

    let bestOverall: string | undefined;
    let bestAvg = -1;
    for (const [id, scoreList] of Object.entries(scores)) {
      if (scoreList.length > 0) {
        const avg = scoreList.reduce((a, b) => a + b, 0) / scoreList.length;
        if (avg > bestAvg) {
          bestAvg = avg;
          bestOverall = id;
        }
      }
    }

    return {
      comparison: {
        solutions,
        matrix,
        summary: {
          bestOverall,
          recommendations: bestOverall !== undefined && bestOverall !== ''
            ? [`${solutions.find((s) => s.id === bestOverall)?.title ?? ''} has the highest average score`]
            : [],
        },
      },
    };
  }

  /**
   * Select a solution and optionally create an ADR Decision record
   *
   * This method:
   * 1. Marks the specified solution as 'selected'
   * 2. Deselects (rejects) other solutions addressing the same requirements
   * 3. Optionally creates a Decision record documenting the selection (when createDecisionRecord=true)
   *
   * @param input - Selection parameters including optional createDecisionRecord flag
   * @returns Selection result with optional decisionId
   *
   * @example
   * // Select solution and create Decision record
   * const result = await service.selectSolution({
   *   planId: 'plan-123',
   *   solutionId: 'sol-456',
   *   reason: 'Best balance of performance and maintainability',
   *   createDecisionRecord: true
   * });
   * console.log(result.decisionId); // ID of created Decision record
   */
  public async selectSolution(input: SelectSolutionInput): Promise<SelectSolutionResult> {
    const repo = this.repositoryFactory.createRepository<Solution>('solution', input.planId);
    const solution = await repo.findById(input.solutionId);

    // Find and deselect other solutions that address the same requirements
    const allSolutions = await repo.findAll();
    const deselected: Solution[] = [];

    for (const s of allSolutions) {
      if (
        s.id !== input.solutionId &&
        s.status === 'selected' &&
        s.addressing.some((r) => solution.addressing.includes(r))
      ) {
        s.status = 'rejected';
        await repo.update(s.id, s);
        deselected.push(s);
      }
    }

    // Select this solution
    solution.status = 'selected';
    solution.selectionReason = input.reason;
    await repo.update(solution.id, solution);

    // TDD Sprint: Auto-create Decision record if requested
    const decisionId = await this.createDecisionRecordIfRequested(
      input,
      solution,
      allSolutions
    );

    return {
      success: true,
      solutionId: input.solutionId,
      deselectedIds: deselected.length > 0 ? deselected.map((s) => s.id) : undefined,
      decisionId,
    };
  }

  public async updateSolution(input: UpdateSolutionInput): Promise<UpdateSolutionResult> {
    const repo = this.repositoryFactory.createRepository<Solution>('solution', input.planId);
    const solution = await repo.findById(input.solutionId);

    // Sprint 7: Save current version to history BEFORE updating
    if (this.versionHistoryService) {
      const currentSnapshot = JSON.parse(JSON.stringify(solution)) as Solution;
      await this.versionHistoryService.saveVersion(
        input.planId,
        input.solutionId,
        'solution',
        currentSnapshot,
        solution.version,
        'claude-code',
        'Auto-saved before update'
      );
    }

    // BUG #18: Validate title if provided in updates
    if (input.updates.title !== undefined) {
      validateRequiredString(input.updates.title, 'title');
      solution.title = input.updates.title;
    }
    if (input.updates.description !== undefined) {
      // M-2 FIX: Validate optional string fields in update path (BUG-003, BUG-029)
      validateOptionalString(input.updates.description, 'description');
      solution.description = input.updates.description;
    }
    if (input.updates.approach !== undefined) {
      // M-2 FIX: Validate optional string fields in update path (BUG-003, BUG-029)
      validateOptionalString(input.updates.approach, 'approach');
      solution.approach = input.updates.approach;
    }
    if (input.updates.implementationNotes !== undefined) {
      // M-2 FIX: Validate optional string fields in update path (BUG-003, BUG-029)
      validateOptionalString(input.updates.implementationNotes, 'implementationNotes');
      solution.implementationNotes = input.updates.implementationNotes;
    }
    if (input.updates.tradeoffs !== undefined) {
      this.validateTradeoffs(input.updates.tradeoffs);
      solution.tradeoffs = input.updates.tradeoffs;
    }
    if (input.updates.addressing !== undefined) solution.addressing = input.updates.addressing;
    if (input.updates.evaluation !== undefined) {
      validateEffortEstimate(input.updates.evaluation.effortEstimate);
      solution.evaluation = input.updates.evaluation;
    }
    if (input.updates.tags !== undefined) {
      validateTags(input.updates.tags);
      solution.metadata.tags = input.updates.tags;
    }

    await repo.update(solution.id, solution);

    return { success: true, solutionId: input.solutionId };
  }

  public async listSolutions(input: ListSolutionsInput): Promise<ListSolutionsResult> {
    const repo = this.repositoryFactory.createRepository<Solution>('solution', input.planId);
    let solutions = await repo.findAll();

    if (input.filters !== undefined) {
      const filters = input.filters;
      if (filters.status !== undefined) {
        solutions = solutions.filter((s) => s.status === filters.status);
      }
      if (filters.addressingRequirement !== undefined && filters.addressingRequirement !== '') {
        const reqId = filters.addressingRequirement;
        solutions = solutions.filter((s) =>
          s.addressing.includes(reqId)
        );
      }
    }

    const total = solutions.length;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? DEFAULT_SOLUTIONS_PAGE_LIMIT;
    const paginated = solutions.slice(offset, offset + limit);

    // Apply field filtering
    const filtered = filterEntities(
      paginated,
      input.fields,
      'solution',
      input.excludeMetadata,
      false
    ) as Solution[];

    return {
      solutions: filtered,
      total,
      hasMore: offset + limit < total,
    };
  }

  public async deleteSolution(input: DeleteSolutionInput): Promise<DeleteSolutionResult> {
    const repo = this.repositoryFactory.createRepository<Solution>('solution', input.planId);

    // Verify exists (throws NotFoundError if not found)
    await repo.findById(input.solutionId);

    // REQ-5: Cascade delete all links for this solution
    if (this.linkingService) {
      await this.linkingService.deleteLinksForEntity(input.planId, input.solutionId);
    }

    await repo.delete(input.solutionId);
    await this.planService.updateStatistics(input.planId);

    return { success: true, message: 'Solution deleted' };
  }

  /**
   * BUG #5 FIX: Validate that all requirement IDs in addressing[] exist
   */
  private async validateAddressingReferences(planId: string, addressingIds: string[]): Promise<void> {
    const reqRepo = this.repositoryFactory.createRepository<Requirement>('requirement', planId);

    for (const reqId of addressingIds) {
      try {
        await reqRepo.findById(reqId);
      } catch {
        throw new Error(`Requirement '${reqId}' not found`);
      }
    }
  }

  private validateTradeoffs(tradeoffs: unknown[]): void {
    if (!Array.isArray(tradeoffs)) {
      return; // Empty or not array is OK
    }

    for (let i = 0; i < tradeoffs.length; i++) {
      const t = tradeoffs[i] as Record<string, unknown>;

      // Check for invalid { pro, con } format
      if ('pro' in t || 'con' in t) {
        throw new Error(
          `Invalid tradeoff format at index ${String(i)}: found { pro, con } format. ` +
          `Expected { aspect: string, pros: string[], cons: string[] }`
        );
      }

      // Validate required fields
      if (typeof t.aspect !== 'string' || t.aspect === '') {
        throw new Error(
          `Invalid tradeoff at index ${String(i)}: 'aspect' must be a non-empty string`
        );
      }

      if (!Array.isArray(t.pros)) {
        throw new Error(
          `Invalid tradeoff at index ${String(i)}: 'pros' must be an array of strings`
        );
      }

      if (!Array.isArray(t.cons)) {
        throw new Error(
          `Invalid tradeoff at index ${String(i)}: 'cons' must be an array of strings`
        );
      }
    }
  }

  /**
   * Sprint 7: Get version history
   */
  public async getHistory(input: { planId: string; solutionId: string; limit?: number; offset?: number }): Promise<VersionHistory<Solution>> {
    if (!this.versionHistoryService) {
      throw new Error('Version history service not available');
    }

    const planRepo = this.repositoryFactory.createPlanRepository();
    const exists = await planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    // REQ-6: Load current entity to get accurate currentVersion
    const repo = this.repositoryFactory.createRepository<Solution>('solution', input.planId);
    let currentVersion = 1;
    try {
      const currentSolution = await repo.findById(input.solutionId);
      currentVersion = currentSolution.version;
    } catch {
      // Entity might be deleted - use version from history file
    }

    const history = await this.versionHistoryService.getHistory({
      planId: input.planId,
      entityId: input.solutionId,
      entityType: 'solution',
      limit: input.limit,
      offset: input.offset,
    });

    // REQ-6: Override currentVersion with actual entity version
    history.currentVersion = currentVersion;

    return history as VersionHistory<Solution>;
  }

  /**
   * Sprint 7: Compare two versions
   */
  public async diff(input: { planId: string; solutionId: string; version1: number; version2: number }): Promise<VersionDiff> {
    if (!this.versionHistoryService) {
      throw new Error('Version history service not available');
    }

    const planRepo = this.repositoryFactory.createPlanRepository();
    const exists = await planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const repo = this.repositoryFactory.createRepository<Solution>('solution', input.planId);
    const current = await repo.findById(input.solutionId);

    return this.versionHistoryService.diff({
      planId: input.planId,
      entityId: input.solutionId,
      entityType: 'solution',
      version1: input.version1,
      version2: input.version2,
      currentEntityData: current,
      currentVersion: current.version,
    });
  }

  /**
   * Sprint 9: Bulk update multiple solutions in one call
   * REFACTOR: Uses common bulkUpdateEntities utility
   */
  public async bulkUpdateSolutions(input: BulkUpdateSolutionsInput): Promise<BulkUpdateSolutionsResult> {
    const repo = this.repositoryFactory.createRepository<Solution>('solution', input.planId);

    if (input.atomic === true) {
      // ATOMIC MODE: All-or-nothing with true rollback
      // Phase 1: Load all entities and validate
      const toUpdate: Solution[] = [];
      const results: { solutionId: string; success: boolean; error?: string }[] = [];

      for (const update of input.updates) {
        try {
          // Load solution (create deep copy to avoid mutations until save)
          const originalSolution = await repo.findById(update.solutionId);
          const solution = JSON.parse(JSON.stringify(originalSolution)) as Solution;

          // Save original to history before update
          if (this.versionHistoryService) {
            await this.versionHistoryService.saveVersion(
              input.planId,
              update.solutionId,
              'solution',
              originalSolution,
              originalSolution.version,
              'claude-code',
              'Auto-saved before bulk update'
            );
          }

          // Apply updates with validation
          if (update.updates.title !== undefined) solution.title = update.updates.title;
          if (update.updates.description !== undefined) solution.description = update.updates.description;
          if (update.updates.approach !== undefined) solution.approach = update.updates.approach;
          if (update.updates.implementationNotes !== undefined)
            solution.implementationNotes = update.updates.implementationNotes;
          if (update.updates.tradeoffs !== undefined) {
            this.validateTradeoffs(update.updates.tradeoffs);
            solution.tradeoffs = update.updates.tradeoffs;
          }
          if (update.updates.addressing !== undefined) solution.addressing = update.updates.addressing;
          if (update.updates.evaluation !== undefined) {
            validateEffortEstimate(update.updates.evaluation.effortEstimate);
            solution.evaluation = update.updates.evaluation;
          }
          // Tags validation (using type assertion due to Partial<> limitations)
          const updates = update.updates as Record<string, unknown>;
          if (updates.tags !== undefined && updates.tags !== null) {
            validateTags(updates.tags as unknown[]);
            solution.metadata.tags = updates.tags as typeof solution.metadata.tags;
          }

          solution.updatedAt = new Date().toISOString();
          solution.version = solution.version + 1;

          toUpdate.push(solution);
          results.push({ solutionId: update.solutionId, success: true });
        } catch (error: unknown) {
          // In atomic mode, any error causes full rejection (no partial updates)
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Atomic bulk update failed: ${message}`);
        }
      }

      // Phase 2: All validations passed - save atomically
      await repo.upsertMany(toUpdate);

      return {
        updated: toUpdate.length,
        failed: 0,
        results,
      };
    } else {
      // NON-ATOMIC MODE: Continue on errors (partial success allowed)
      const results: { solutionId: string; success: boolean; error?: string }[] = [];
      let updated = 0;
      let failed = 0;

      for (const update of input.updates) {
        try {
          await this.updateSolution({
            planId: input.planId,
            solutionId: update.solutionId,
            updates: update.updates,
          });
          results.push({
            solutionId: update.solutionId,
            success: true,
          });
          updated++;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({
            solutionId: update.solutionId,
            success: false,
            error: message,
          });
          failed++;
        }
      }

      return {
        updated,
        failed,
        results,
      };
    }
  }

  /**
   * TDD Sprint: Create Decision record from Solution selection (private helper)
   *
   * This method automatically creates an ADR Decision record documenting the solution selection.
   * It extracts relevant information from the selected solution and related alternatives.
   *
   * @param input - Original selectSolution input
   * @param selectedSolution - The solution that was selected
   * @param allSolutions - All solutions in the plan (for finding alternatives)
   * @returns Decision ID if created, undefined otherwise
   */
  private async createDecisionRecordIfRequested(
    input: SelectSolutionInput,
    selectedSolution: Solution,
    allSolutions: Solution[]
  ): Promise<string | undefined> {
    if (input.createDecisionRecord !== true || this.decisionService === undefined) {
      return undefined;
    }

    // Collect all solutions addressing the same requirements for alternativesConsidered
    const allSolutionsForRequirements = allSolutions.filter((s) =>
      s.addressing.some((req) => selectedSolution.addressing.includes(req))
    );

    // Build alternativesConsidered from other solutions (excluding the selected one)
    const alternativesConsidered = allSolutionsForRequirements
      .filter((s) => s.id !== input.solutionId)
      .map((altSolution) => ({
        option: altSolution.title,
        reasoning: (altSolution.description !== '') ? altSolution.description : altSolution.approach,
        whyNotChosen:
          altSolution.status === 'rejected'
            ? `Rejected in favor of ${selectedSolution.title}`
            : 'Not selected',
      }));

    // Create Decision record
    const decisionInput = {
      planId: input.planId,
      decision: {
        title: `Solution Selection: ${selectedSolution.title}`,
        question: `Which solution should be selected for requirements ${selectedSolution.addressing.join(', ')}?`,
        context: `${selectedSolution.description}\n\nApproach: ${selectedSolution.approach}${
          selectedSolution.implementationNotes !== undefined && selectedSolution.implementationNotes !== ''
            ? `\n\nImplementation Notes: ${selectedSolution.implementationNotes}`
            : ''
        }`,
        decision: `Selected: ${selectedSolution.title}${input.reason !== undefined && input.reason !== '' ? ` - ${input.reason}` : ''}`,
        alternativesConsidered,
        consequences: (selectedSolution.evaluation.riskAssessment !== '') ? selectedSolution.evaluation.riskAssessment : 'To be determined',
        impactScope: selectedSolution.addressing,
      },
    };

    const decisionResult = await this.decisionService.recordDecision(decisionInput);
    return decisionResult.decisionId;
  }

}
