import { v4 as uuidv4 } from 'uuid';
import type { RepositoryFactory } from '../repositories/interfaces.js';
import type { PlanService } from './plan-service.js';
import type { VersionHistoryService } from './version-history-service.js';
import type { Decision, DecisionStatus, AlternativeConsidered, Tag, VersionHistory, VersionDiff } from '../entities/types.js';
import { NotFoundError } from '../repositories/errors.js';
import { validateAlternativesConsidered, validateTags } from './validators.js';
import { filterEntity, filterEntities } from '../utils/field-filter.js';

// Input types
export interface RecordDecisionInput {
  planId: string;
  decision: {
    title: string;
    question: string;
    context: string;
    decision: string;
    alternativesConsidered: AlternativeConsidered[];
    consequences?: string;
    impactScope?: string[];
    tags?: Tag[];
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
    private repositoryFactory: RepositoryFactory,
    private planService: PlanService,
    private versionHistoryService?: VersionHistoryService
  ) {}

  async getDecision(input: GetDecisionInput): Promise<GetDecisionResult> {
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

  async getDecisions(input: GetDecisionsInput): Promise<GetDecisionsResult> {
    // Enforce max limit
    if (input.decisionIds.length > 100) {
      throw new Error('Cannot fetch more than 100 decisions at once');
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
      } catch (error: any) {
        // FIX M-2: Only treat NotFoundError as "not found", re-throw other errors
        if (error instanceof NotFoundError || error.constructor.name === 'NotFoundError') {
          notFound.push(id);
        } else {
          // Preserve error context
          throw error;
        }
      }
    }

    return { decisions: foundDecisions, notFound };
  }

  async supersedeDecision(input: SupersedeDecisionInput): Promise<SupersedeDecisionResult> {
    const repo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
    const oldDecision = await repo.findById(input.decisionId);

    const now = new Date().toISOString();
    const newDecisionId = uuidv4();

    // Mark old decision as superseded
    oldDecision.status = 'superseded';
    oldDecision.updatedAt = now;
    oldDecision.version += 1;
    oldDecision.supersededBy = newDecisionId;

    // Create new decision
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
      context: input.newDecision.context || oldDecision.context,
      decision: input.newDecision.decision,
      alternativesConsidered: [
        ...oldDecision.alternativesConsidered,
        {
          option: oldDecision.decision,
          reasoning: 'Previous decision',
          whyNotChosen: input.reason,
        },
      ],
      consequences: input.newDecision.consequences || oldDecision.consequences,
      impactScope: oldDecision.impactScope,
      status: 'active',
      supersedes: oldDecision.id,
    };

    // Update old decision and create new one
    await repo.update(oldDecision.id, oldDecision);
    await repo.create(newDecision);

    return {
      success: true,
      newDecisionId: newDecisionId,
      supersededDecisionId: oldDecision.id,
    };
  }

  async recordDecision(input: RecordDecisionInput): Promise<RecordDecisionResult> {
    // Validate alternativesConsidered format
    validateAlternativesConsidered(input.decision.alternativesConsidered);
    // Validate tags format
    validateTags(input.decision.tags || []);

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
        tags: input.decision.tags || [],
        annotations: [],
      },
      title: input.decision.title,
      question: input.decision.question,
      context: input.decision.context,
      decision: input.decision.decision,
      alternativesConsidered: input.decision.alternativesConsidered,
      consequences: input.decision.consequences,
      impactScope: input.decision.impactScope,
      status: 'active',
    };

    const repo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
    await repo.create(decision);
    await this.planService.updateStatistics(input.planId);

    return { decisionId };
  }

  async getDecisionHistory(input: GetDecisionHistoryInput): Promise<GetDecisionHistoryResult> {
    const repo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
    let decisions = await repo.findAll();

    if (input.filters) {
      if (input.filters.search) {
        const search = input.filters.search.toLowerCase();
        decisions = decisions.filter(
          (d) =>
            d.title.toLowerCase().includes(search) ||
            d.question.toLowerCase().includes(search) ||
            d.decision.toLowerCase().includes(search)
        );
      }
      if (input.filters.tags && input.filters.tags.length > 0) {
        decisions = decisions.filter((d) =>
          input.filters!.tags!.some((filterTag) =>
            d.metadata.tags.some((t) => t.key === filterTag.key && t.value === filterTag.value)
          )
        );
      }
    }

    // Sort by createdAt desc (newest first)
    decisions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = decisions.length;
    const offset = input.offset || 0;
    const limit = input.limit || 50;
    const paginated = decisions.slice(offset, offset + limit);

    return {
      decisions: paginated,
      total,
      hasMore: offset + limit < total,
    };
  }

  async updateDecision(input: UpdateDecisionInput): Promise<UpdateDecisionResult> {
    const repo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
    const decision = await repo.findById(input.decisionId);

    const now = new Date().toISOString();

    // Sprint 7: Save current version to history BEFORE updating
    if (this.versionHistoryService) {
      const currentSnapshot = JSON.parse(JSON.stringify(decision));
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
          ...decision.alternativesConsidered,
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
      if (input.updates.title !== undefined) decision.title = input.updates.title;
      if (input.updates.question !== undefined) decision.question = input.updates.question;
      if (input.updates.context !== undefined) decision.context = input.updates.context;
      if (input.updates.decision !== undefined) decision.decision = input.updates.decision;
      if (input.updates.alternativesConsidered !== undefined) {
        validateAlternativesConsidered(input.updates.alternativesConsidered);
        decision.alternativesConsidered = input.updates.alternativesConsidered;
      }
      if (input.updates.consequences !== undefined)
        decision.consequences = input.updates.consequences;
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

  async listDecisions(input: ListDecisionsInput): Promise<ListDecisionsResult> {
    const repo = this.repositoryFactory.createRepository<Decision>('decision', input.planId);
    let decisions = await repo.findAll();

    if (input.filters) {
      if (input.filters.status) {
        decisions = decisions.filter((d) => d.status === input.filters!.status);
      }
      if (input.filters.tags && input.filters.tags.length > 0) {
        decisions = decisions.filter((d) =>
          input.filters!.tags!.some((filterTag) =>
            d.metadata.tags.some((t) => t.key === filterTag.key && t.value === filterTag.value)
          )
        );
      }
    }

    const total = decisions.length;
    const offset = input.offset || 0;
    const limit = input.limit || 50;
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
  async getHistory(input: { planId: string; decisionId: string; limit?: number; offset?: number }): Promise<VersionHistory<Decision>> {
    if (!this.versionHistoryService) {
      throw new Error('Version history service not available');
    }

    const planRepo = this.repositoryFactory.createPlanRepository();
    const exists = await planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    return this.versionHistoryService.getHistory({
      planId: input.planId,
      entityId: input.decisionId,
      entityType: 'decision',
      limit: input.limit,
      offset: input.offset,
    });
  }

  /**
   * Sprint 7: Compare two versions
   */
  async diff(input: { planId: string; decisionId: string; version1: number; version2: number }): Promise<VersionDiff> {
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

export default DecisionService;
