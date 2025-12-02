import { v4 as uuidv4 } from 'uuid';
import type { FileStorage } from '../../infrastructure/file-storage.js';
import type { PlanService } from './plan-service.js';
import type { Decision, DecisionStatus, AlternativeConsidered, Tag } from '../entities/types.js';
import { validateAlternativesConsidered, validateTags } from './validators.js';

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
}

export interface GetDecisionInput {
  planId: string;
  decisionId: string;
}

export interface GetDecisionResult {
  decision: Decision;
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
  newDecision: Decision;
  supersededDecision: Decision;
}

// Output types
export interface RecordDecisionResult {
  decisionId: string;
  decision: Decision;
}

export interface GetDecisionHistoryResult {
  decisions: Decision[];
  total: number;
  hasMore: boolean;
}

export interface UpdateDecisionResult {
  success: boolean;
  decision: Decision;
  superseded?: Decision;
}

export interface ListDecisionsResult {
  decisions: Decision[];
  total: number;
  hasMore: boolean;
}

export class DecisionService {
  constructor(
    private storage: FileStorage,
    private planService: PlanService
  ) {}

  async getDecision(input: GetDecisionInput): Promise<GetDecisionResult> {
    const decisions = await this.storage.loadEntities<Decision>(input.planId, 'decisions');
    const decision = decisions.find((d) => d.id === input.decisionId);

    if (!decision) {
      throw new Error('Decision not found');
    }

    return { decision };
  }

  async supersedeDecision(input: SupersedeDecisionInput): Promise<SupersedeDecisionResult> {
    const decisions = await this.storage.loadEntities<Decision>(input.planId, 'decisions');
    const index = decisions.findIndex((d) => d.id === input.decisionId);

    if (index === -1) {
      throw new Error('Decision not found');
    }

    const oldDecision = decisions[index];
    const now = new Date().toISOString();

    // Mark old decision as superseded
    oldDecision.status = 'superseded';
    oldDecision.updatedAt = now;
    oldDecision.version += 1;

    // Create new decision
    const newDecisionId = uuidv4();
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

    oldDecision.supersededBy = newDecisionId;
    decisions[index] = oldDecision;
    decisions.push(newDecision);

    await this.storage.saveEntities(input.planId, 'decisions', decisions);

    return {
      success: true,
      newDecision,
      supersededDecision: oldDecision,
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

    const decisions = await this.storage.loadEntities<Decision>(input.planId, 'decisions');
    decisions.push(decision);
    await this.storage.saveEntities(input.planId, 'decisions', decisions);
    await this.planService.updateStatistics(input.planId);

    return { decisionId, decision };
  }

  async getDecisionHistory(input: GetDecisionHistoryInput): Promise<GetDecisionHistoryResult> {
    let decisions = await this.storage.loadEntities<Decision>(input.planId, 'decisions');

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
    const decisions = await this.storage.loadEntities<Decision>(input.planId, 'decisions');
    const index = decisions.findIndex((d) => d.id === input.decisionId);

    if (index === -1) {
      throw new Error('Decision not found');
    }

    const decision = decisions[index];
    const now = new Date().toISOString();

    // Handle supersede
    if (input.supersede) {
      // Mark old decision as superseded
      decision.status = 'superseded';
      decision.updatedAt = now;
      decision.version += 1;
      decisions[index] = decision;

      // Create new decision
      const newDecisionId = uuidv4();
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

      decision.supersededBy = newDecisionId;
      decisions.push(newDecision);
      await this.storage.saveEntities(input.planId, 'decisions', decisions);

      return {
        success: true,
        decision: newDecision,
        superseded: decision,
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

    decision.updatedAt = now;
    decision.version += 1;
    decisions[index] = decision;
    await this.storage.saveEntities(input.planId, 'decisions', decisions);

    return { success: true, decision };
  }

  async listDecisions(input: ListDecisionsInput): Promise<ListDecisionsResult> {
    let decisions = await this.storage.loadEntities<Decision>(input.planId, 'decisions');

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

    return {
      decisions: paginated,
      total,
      hasMore: offset + limit < total,
    };
  }
}

export default DecisionService;
