import { v4 as uuidv4 } from 'uuid';
import type { RepositoryFactory } from '../repositories/interfaces.js';
import type { PlanService } from './plan-service.js';
import type { VersionHistoryService } from './version-history-service.js';
import type { LinkingService } from './linking-service.js';
import type { Decision, DecisionStatus, AlternativeConsidered, Tag, VersionHistory, VersionDiff } from '../entities/types.js';
import { NotFoundError } from '../repositories/errors.js';
import { validateAlternativesConsidered, validateTags, validateRequiredString, validateOptionalString } from './validators.js';
import { filterEntity, filterEntities } from '../utils/field-filter.js';

// Constants
const MAX_DECISIONS_BATCH_SIZE = 100;
const DEFAULT_DECISIONS_PAGE_LIMIT = 50;

// Input types
export interface RecordDecisionInput {
  planId: string;
  decision: {
    title: string;  // REQUIRED
    question: string;  // REQUIRED
    decision: string;  // REQUIRED
    context?: string;  // Optional - default: ''
    alternativesConsidered?: AlternativeConsidered[];  // Optional - default: []
    consequences?: string;  // undefined OK
    impactScope?: string[];  // undefined OK
    tags?: Tag[];  // Optional - default: []
  };
}

export interface GetDecisionHistoryInput {
  planId: string;
  filters?: {
    tags?: Tag[];
    search?: string;
  };
  limit?: number;
  offset?: number;
}

export interface UpdateDecisionInput {
  planId: string;
  decisionId: string;
  updates?: Partial<RecordDecisionInput['decision']>;
  supersede?: {
    newDecision: string;
    reason: string;
  };
}

export interface ListDecisionsInput {
  planId: string;
  filters?: {
    status?: DecisionStatus;
    tags?: Tag[];
  };
  limit?: number;
  offset?: number;
  fields?: string[]; // Fields to include: summary (default), ['*'] (all), or custom list
  excludeMetadata?: boolean; // Exclude metadata fields (createdAt, updatedAt, version, metadata)
}

export interface GetDecisionInput {
  planId: string;
  decisionId: string;
  fields?: string[]; // Fields to include: summary (default), ['*'] (all), or custom list
  excludeMetadata?: boolean; // Exclude metadata fields (createdAt, updatedAt, version, metadata)
}

export interface GetDecisionResult {
  decision: Decision;
}

export interface GetDecisionsInput {
  planId: string;
  decisionIds: string[];
  fields?: string[];
  excludeMetadata?: boolean;
}

export interface GetDecisionsResult {
  decisions: Decision[];
  notFound: string[];
}

export interface SupersedeDecisionInput {
  planId: string;
  decisionId: string;
  newDecision: {
    decision: string;
    context?: string;
    consequences?: string;
  };
  reason: string;
}

export interface SupersedeDecisionResult {
  success: boolean;
  newDecisionId: string;
  supersededDecisionId: string;
}

// Output types
export interface RecordDecisionResult {
  decisionId: string;
}

export interface GetDecisionHistoryResult {
  decisions: Decision[];
  total: number;
  hasMore: boolean;
}

export interface UpdateDecisionResult {
  success: boolean;
  decisionId: string;
}

export interface ListDecisionsResult {
  decisions: Decision[];
  total: number;
  hasMore: boolean;
}

export class DecisionService {
  constructor(
    private readonly repositoryFactory: RepositoryFactory,
    private readonly planService: PlanService,
    private readonly versionHistoryService?: VersionHistoryService,
    private readonly linkingService?: LinkingService // BUG-015 FIX: Optional for cascading link deletion
  ) {}

  public async getDecision(input: GetDecisionInput): Promise<GetDecisionResult> {
    const repo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
    const decision = await repo.findById(input.decisionId);

    // Apply field filtering - GET operations default to all fields
    const filtered = filterEntity(
      decision,
      input.fields ?? ['*'],
      'decision',
      input.excludeMetadata,
      false
    ) as Decision;

    return { decision: filtered };
  }

  public async getDecisions(input: GetDecisionsInput): Promise<GetDecisionsResult> {
    // Enforce max limit
    if (input.decisionIds.length > MAX_DECISIONS_BATCH_SIZE) {
      throw new Error(`Cannot fetch more than ${String(MAX_DECISIONS_BATCH_SIZE)} decisions at once`);
    }

    // Handle empty array
    if (input.decisionIds.length === 0) {
      return { decisions: [], notFound: [] };
    }

    const repo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
    const foundDecisions: Decision[] = [];
    const notFound: string[] = [];

    // Collect found and not found IDs using batch findById
    for (const id of input.decisionIds) {
      try {
        const decision = await repo.findById(id);
        // Apply field filtering - decisions default to all fields
        const filtered = filterEntity(
          decision,
          input.fields ?? ['*'],
          'decision',
          input.excludeMetadata,
          false
        ) as Decision;
        foundDecisions.push(filtered);
      } catch (error: unknown) {
        // FIX M-2: Only treat NotFoundError as "not found", re-throw other errors
        if (error instanceof NotFoundError || (error instanceof Error && error.constructor.name === 'NotFoundError')) {
          notFound.push(id);
        } else {
          // Preserve error context
          throw error;
        }
      }
    }

    return { decisions: foundDecisions, notFound };
  }

  public async supersedeDecision(input: SupersedeDecisionInput): Promise<SupersedeDecisionResult> {
    // Sprint 3: Validate newDecision.decision is required and non-empty
    validateRequiredString(input.newDecision.decision, 'decision');

    const repo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
    const oldDecision = await repo.findById(input.decisionId);

    // Sprint 3: Validate decision is not already superseded
    if (oldDecision.status === 'superseded') {
      throw new Error('Cannot supersede a decision that is already superseded');
    }

    const now = new Date().toISOString();

    // BUG-014 FIX: Determine if newDecision.decision is UUID reference or new decision text
    // - If UUID format: REUSE existing decision (ADR pattern - link existing decisions)
    // - If plain text: CREATE new decision (backward compatibility)
    const existingDecision = await this.tryLoadExistingDecision(repo, input.newDecision.decision);
    const newDecisionId = existingDecision !== null
      ? await this.reuseExistingDecision(repo, oldDecision, existingDecision, now)
      : await this.createNewDecision(repo, oldDecision, input, now);

    return {
      success: true,
      newDecisionId,
      supersededDecisionId: oldDecision.id,
    };
  }

  /**
   * BUG-014 FIX: Helper to check if decision string is UUID and load existing decision
   * @returns Existing decision if UUID format and exists, null otherwise
   */
  private async tryLoadExistingDecision(
    repo: ReturnType<RepositoryFactory['createRepository']>,
    decisionStr: string
  ): Promise<Decision | null> {
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (8-4-4-4-12 hex digits)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuidFormat = uuidRegex.test(decisionStr);

    if (isUuidFormat) {
      // User provided UUID - try to load existing decision
      // If not found, findById will throw NotFoundError (expected behavior)
      return await repo.findById(decisionStr) as Decision;
    }

    // Plain text decision, not UUID
    return null;
  }

  /**
   * BUG-014 FIX: Reuse existing decision when superseding (ADR pattern)
   * Updates existing decision with supersedes link instead of creating duplicate
   */
  private async reuseExistingDecision(
    repo: ReturnType<RepositoryFactory['createRepository']>,
    oldDecision: Decision,
    existingDecision: Decision,
    now: string
  ): Promise<string> {
    const newDecisionId = existingDecision.id;

    // Update existing decision to add supersedes link
    existingDecision.supersedes = oldDecision.id;
    existingDecision.updatedAt = now;
    // version will be auto-incremented by repo.update()

    // Mark old decision as superseded FIRST (atomic operation order)
    oldDecision.status = 'superseded';
    oldDecision.updatedAt = now;
    oldDecision.version += 1;
    oldDecision.supersededBy = newDecisionId;
    await repo.update(oldDecision.id, oldDecision);

    // Update existing decision with supersedes link
    await repo.update(existingDecision.id, existingDecision);

    return newDecisionId;
  }

  /**
   * Create new decision when superseding (original behavior, backward compatibility)
   */
  private async createNewDecision(
    repo: ReturnType<RepositoryFactory['createRepository']>,
    oldDecision: Decision,
    input: SupersedeDecisionInput,
    now: string
  ): Promise<string> {
    const newDecisionId = uuidv4();

    // Create new decision FIRST (before modifying old decision for atomicity)
    const newDecision: Decision = {
      id: newDecisionId,
      type: 'decision',
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {
        createdBy: 'claude-code',
        tags: oldDecision.metadata.tags,
        annotations: [],
      },
      title: oldDecision.title,
      question: oldDecision.question,
      context: input.newDecision.context ?? oldDecision.context,
      decision: input.newDecision.decision,
      alternativesConsidered: [
        // BUG-014 FIX: Defensive guard for legacy data with missing alternativesConsidered
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        ...(oldDecision.alternativesConsidered ?? []),
        {
          option: oldDecision.decision,
          reasoning: 'Previous decision',
          whyNotChosen: input.reason,
        },
      ],
      consequences: input.newDecision.consequences ?? oldDecision.consequences,
      impactScope: oldDecision.impactScope,
      status: 'active',
      supersedes: oldDecision.id,
    };

    await repo.create(newDecision);

    // Mark old decision as superseded (only after new decision is created)
    oldDecision.status = 'superseded';
    oldDecision.updatedAt = now;
    oldDecision.version += 1;
    oldDecision.supersededBy = newDecisionId;
    await repo.update(oldDecision.id, oldDecision);

    return newDecisionId;
  }

  public async recordDecision(input: RecordDecisionInput): Promise<RecordDecisionResult> {
    // Validate REQUIRED fields
    validateRequiredString(input.decision.title, 'title');
    validateRequiredString(input.decision.question, 'question');
    validateRequiredString(input.decision.decision, 'decision');

    // Validate alternativesConsidered format
    validateAlternativesConsidered(input.decision.alternativesConsidered ?? []);
    // Validate tags format
    validateTags(input.decision.tags ?? []);

    // Validate optional string fields (BUG-003, BUG-029)
    validateOptionalString(input.decision.context, 'context');
    validateOptionalString(input.decision.consequences, 'consequences');

    const decisionId = uuidv4();
    const now = new Date().toISOString();

    const decision: Decision = {
      id: decisionId,
      type: 'decision',
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {
        createdBy: 'claude-code',
        tags: input.decision.tags ?? [],
        annotations: [],
      },
      title: input.decision.title,  // REQUIRED
      question: input.decision.question,  // REQUIRED
      decision: input.decision.decision,  // REQUIRED
      context: input.decision.context ?? '',  // DEFAULT: empty string
      alternativesConsidered: input.decision.alternativesConsidered ?? [],  // DEFAULT: empty array (BUG #8 fix)
      consequences: input.decision.consequences,  // undefined OK
      impactScope: input.decision.impactScope,  // undefined OK
      status: 'active',
    };

    const repo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
    await repo.create(decision);
    await this.planService.updateStatistics(input.planId);

    return { decisionId };
  }

  public async getDecisionHistory(input: GetDecisionHistoryInput): Promise<GetDecisionHistoryResult> {
    const repo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
    let decisions = await repo.findAll();

    if (input.filters) {
      if (input.filters.search !== undefined && input.filters.search !== '') {
        const search = input.filters.search.toLowerCase();
        decisions = decisions.filter(
          (d) =>
            d.title.toLowerCase().includes(search) ||
            d.question.toLowerCase().includes(search) ||
            d.decision.toLowerCase().includes(search)
        );
      }
      if (input.filters.tags && input.filters.tags.length > 0) {
        const filterTags = input.filters.tags;
        decisions = decisions.filter((d) =>
          filterTags.some((filterTag) =>
            d.metadata.tags.some((t) => t.key === filterTag.key && t.value === filterTag.value)
          )
        );
      }
    }

    // Sort by createdAt desc (newest first)
    decisions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = decisions.length;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? DEFAULT_DECISIONS_PAGE_LIMIT;
    const paginated = decisions.slice(offset, offset + limit);

    return {
      decisions: paginated,
      total,
      hasMore: offset + limit < total,
    };
  }

  public async updateDecision(input: UpdateDecisionInput): Promise<UpdateDecisionResult> {
    const repo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
    const decision = await repo.findById(input.decisionId);

    const now = new Date().toISOString();

    // Sprint 7: Save current version to history BEFORE updating
    if (this.versionHistoryService) {
      const currentSnapshot = JSON.parse(JSON.stringify(decision)) as Decision;
      await this.versionHistoryService.saveVersion(
        input.planId,
        input.decisionId,
        'decision',
        currentSnapshot,
        decision.version,
        'claude-code',
        'Auto-saved before update'
      );
    }

    // Handle supersede
    if (input.supersede) {
      // Mark old decision as superseded
      decision.status = 'superseded';

      const newDecisionId = uuidv4();
      decision.supersededBy = newDecisionId;

      // Create new decision
      const newDecision: Decision = {
        id: newDecisionId,
        type: 'decision',
        createdAt: now,
        updatedAt: now,
        version: 1,
        metadata: {
          createdBy: 'claude-code',
          tags: decision.metadata.tags,
          annotations: [],
        },
        title: decision.title,
        question: decision.question,
        context: decision.context,
        decision: input.supersede.newDecision,
        alternativesConsidered: [
          // BUG-014 FIX: Defensive guard for legacy data with missing alternativesConsidered
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          ...(decision.alternativesConsidered ?? []),
          {
            option: decision.decision,
            reasoning: 'Previous decision',
            whyNotChosen: input.supersede.reason,
          },
        ],
        consequences: decision.consequences,
        impactScope: decision.impactScope,
        status: 'active',
        supersedes: decision.id,
      };

      await repo.update(decision.id, decision);
      await repo.create(newDecision);

      return {
        success: true,
        decisionId: newDecisionId,
      };
    }

    // Regular update
    if (input.updates) {
      // BUG #18: Validate REQUIRED fields if provided in updates
      if (input.updates.title !== undefined) {
        validateRequiredString(input.updates.title, 'title');
        decision.title = input.updates.title;
      }
      if (input.updates.question !== undefined) {
        validateRequiredString(input.updates.question, 'question');
        decision.question = input.updates.question;
      }
      if (input.updates.context !== undefined) {
        // M-1 FIX: Validate optional string fields in update path (BUG-003, BUG-029)
        validateOptionalString(input.updates.context, 'context');
        decision.context = input.updates.context;
      }
      if (input.updates.decision !== undefined) {
        validateRequiredString(input.updates.decision, 'decision');
        decision.decision = input.updates.decision;
      }
      if (input.updates.alternativesConsidered !== undefined) {
        validateAlternativesConsidered(input.updates.alternativesConsidered);
        decision.alternativesConsidered = input.updates.alternativesConsidered;
      }
      if (input.updates.consequences !== undefined) {
        // M-1 FIX: Validate optional string fields in update path (BUG-003, BUG-029)
        validateOptionalString(input.updates.consequences, 'consequences');
        decision.consequences = input.updates.consequences;
      }
      if (input.updates.impactScope !== undefined) decision.impactScope = input.updates.impactScope;
      if (input.updates.tags !== undefined) {
        validateTags(input.updates.tags);
        decision.metadata.tags = input.updates.tags;
      }
    }

    // FIX #12: Don't manually increment version - FileRepository.update() does it automatically
    await repo.update(decision.id, decision);

    return { success: true, decisionId: input.decisionId };
  }

  public async listDecisions(input: ListDecisionsInput): Promise<ListDecisionsResult> {
    const repo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
    let decisions = await repo.findAll();

    if (input.filters) {
      const filters = input.filters;
      if (filters.status !== undefined) {
        decisions = decisions.filter((d) => d.status === filters.status);
      }
      if (input.filters.tags && input.filters.tags.length > 0) {
        const filterTags = input.filters.tags;
        decisions = decisions.filter((d) =>
          filterTags.some((filterTag) =>
            d.metadata.tags.some((t) => t.key === filterTag.key && t.value === filterTag.value)
          )
        );
      }
    }

    const total = decisions.length;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? DEFAULT_DECISIONS_PAGE_LIMIT;
    const paginated = decisions.slice(offset, offset + limit);

    // Apply field filtering
    const filtered = filterEntities(
      paginated,
      input.fields,
      'decision',
      input.excludeMetadata,
      false
    ) as Decision[];

    return {
      decisions: filtered,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Sprint 7: Get version history
   */
  public async getHistory(input: { planId: string; decisionId: string; limit?: number; offset?: number }): Promise<VersionHistory<Decision>> {
    if (!this.versionHistoryService) {
      throw new Error('Version history service not available');
    }

    const planRepo = this.repositoryFactory.createPlanRepository();
    const exists = await planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const history = await this.versionHistoryService.getHistory({
      planId: input.planId,
      entityId: input.decisionId,
      entityType: 'decision',
      limit: input.limit,
      offset: input.offset,
    });
    return history as VersionHistory<Decision>;
  }

  /**
   * Sprint 7: Compare two versions
   */
  public async diff(input: { planId: string; decisionId: string; version1: number; version2: number }): Promise<VersionDiff> {
    if (!this.versionHistoryService) {
      throw new Error('Version history service not available');
    }

    const planRepo = this.repositoryFactory.createPlanRepository();
    const exists = await planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const repo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
    const current = await repo.findById(input.decisionId);

    return this.versionHistoryService.diff({
      planId: input.planId,
      entityId: input.decisionId,
      entityType: 'decision',
      version1: input.version1,
      version2: input.version2,
      currentEntityData: current,
      currentVersion: current.version,
    });
  }

}
