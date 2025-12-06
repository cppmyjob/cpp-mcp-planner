import { v4 as uuidv4 } from 'uuid';
import type { FileStorage } from '../../infrastructure/file-storage.js';
import type { PlanService } from './plan-service.js';
import type {
  Requirement,
  RequirementSource,
  RequirementPriority,
  RequirementCategory,
  RequirementStatus,
  Tag,
} from '../entities/types.js';
import { validateTags } from './validators.js';
import { filterEntity, filterEntities } from '../utils/field-filter.js';

// Input types
export interface AddRequirementInput {
  planId: string;
  requirement: {
    title: string;
    description: string;
    rationale?: string;
    source: {
      type: RequirementSource;
      context?: string;
      parentId?: string;
    };
    acceptanceCriteria: string[];
    priority: RequirementPriority;
    category: RequirementCategory;
    impact?: {
      scope: string[];
      complexityEstimate: number;
      riskLevel: 'low' | 'medium' | 'high';
    };
    tags?: Tag[];
  };
}

export interface GetRequirementInput {
  planId: string;
  requirementId: string;
  includeTraceability?: boolean;
  fields?: string[]; // Fields to include: summary (default), ['*'] (all), or custom list
  excludeMetadata?: boolean; // Exclude metadata fields (createdAt, updatedAt, version, metadata)
}

export interface UpdateRequirementInput {
  planId: string;
  requirementId: string;
  updates: Partial<{
    title: string;
    description: string;
    rationale: string;
    acceptanceCriteria: string[];
    priority: RequirementPriority;
    category: RequirementCategory;
    status: RequirementStatus;
    impact: {
      scope: string[];
      complexityEstimate: number;
      riskLevel: 'low' | 'medium' | 'high';
    };
    tags: Tag[];
  }>;
}

export interface ListRequirementsInput {
  planId: string;
  filters?: {
    priority?: RequirementPriority;
    category?: RequirementCategory;
    status?: RequirementStatus;
    tags?: Tag[];
  };
  limit?: number;
  offset?: number;
  fields?: string[]; // Fields to include: summary (default), ['*'] (all), or custom list
  excludeMetadata?: boolean; // Exclude metadata fields (createdAt, updatedAt, version, metadata)
}

export interface DeleteRequirementInput {
  planId: string;
  requirementId: string;
  force?: boolean;
}

export interface VoteForRequirementInput {
  planId: string;
  requirementId: string;
}

export interface UnvoteRequirementInput {
  planId: string;
  requirementId: string;
}

// Output types
export interface AddRequirementResult {
  requirementId: string;
}

export interface GetRequirementResult {
  requirement: Requirement;
  traceability?: {
    solutions: unknown[];
    selectedSolution: unknown | null;
    implementingPhases: unknown[];
    decisions: unknown[];
    linkedRequirements: Requirement[];
  };
}

export interface UpdateRequirementResult {
  success: boolean;
  requirementId: string;
}

export interface ListRequirementsResult {
  requirements: Requirement[];
  total: number;
  hasMore: boolean;
}

export interface DeleteRequirementResult {
  success: boolean;
  message: string;
  warnings?: string[];
}

export interface VoteForRequirementResult {
  success: boolean;
  votes: number;
}

export interface UnvoteRequirementResult {
  success: boolean;
  votes: number;
}

export class RequirementService {
  constructor(
    private storage: FileStorage,
    private planService: PlanService
  ) {}

  async addRequirement(input: AddRequirementInput): Promise<AddRequirementResult> {
    const exists = await this.storage.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    // Validate required fields
    if (!input.requirement.title || input.requirement.title.trim() === '') {
      throw new Error('Title is required');
    }
    if (!input.requirement.description || input.requirement.description.trim() === '') {
      throw new Error('Description is required');
    }

    // Validate tags format
    validateTags(input.requirement.tags || []);

    const requirementId = uuidv4();
    const now = new Date().toISOString();

    const requirement: Requirement = {
      id: requirementId,
      type: 'requirement',
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {
        createdBy: 'claude-code',
        tags: input.requirement.tags || [],
        annotations: [],
      },
      title: input.requirement.title,
      description: input.requirement.description,
      rationale: input.requirement.rationale,
      source: input.requirement.source,
      acceptanceCriteria: input.requirement.acceptanceCriteria,
      priority: input.requirement.priority,
      category: input.requirement.category,
      status: 'draft',
      votes: 0, // Initialize vote count
      impact: input.requirement.impact,
    };

    // Load existing requirements, add new one, save
    const requirements = await this.storage.loadEntities<Requirement>(
      input.planId,
      'requirements'
    );
    requirements.push(requirement);
    await this.storage.saveEntities(input.planId, 'requirements', requirements);

    // Update statistics
    await this.planService.updateStatistics(input.planId);

    return {
      requirementId,
    };
  }

  async getRequirement(input: GetRequirementInput): Promise<GetRequirementResult> {
    const requirements = await this.storage.loadEntities<Requirement>(
      input.planId,
      'requirements'
    );

    const requirement = requirements.find((r) => r.id === input.requirementId);
    if (!requirement) {
      throw new Error('Requirement not found');
    }

    // Apply field filtering - GET operations default to all fields
    const filtered = filterEntity(
      requirement,
      input.fields ?? ['*'],
      'requirement',
      input.excludeMetadata,
      false
    ) as Requirement;

    const result: GetRequirementResult = { requirement: filtered };

    if (input.includeTraceability) {
      // TODO: Implement traceability when linking is done
      result.traceability = {
        solutions: [],
        selectedSolution: null,
        implementingPhases: [],
        decisions: [],
        linkedRequirements: [],
      };
    }

    return result;
  }

  async updateRequirement(
    input: UpdateRequirementInput
  ): Promise<UpdateRequirementResult> {
    const requirements = await this.storage.loadEntities<Requirement>(
      input.planId,
      'requirements'
    );

    const index = requirements.findIndex((r) => r.id === input.requirementId);
    if (index === -1) {
      throw new Error('Requirement not found');
    }

    const requirement = requirements[index];
    const now = new Date().toISOString();

    // Apply updates
    if (input.updates.title !== undefined) {
      requirement.title = input.updates.title;
    }
    if (input.updates.description !== undefined) {
      requirement.description = input.updates.description;
    }
    if (input.updates.rationale !== undefined) {
      requirement.rationale = input.updates.rationale;
    }
    if (input.updates.acceptanceCriteria !== undefined) {
      requirement.acceptanceCriteria = input.updates.acceptanceCriteria;
    }
    if (input.updates.priority !== undefined) {
      requirement.priority = input.updates.priority;
    }
    if (input.updates.category !== undefined) {
      requirement.category = input.updates.category;
    }
    if (input.updates.status !== undefined) {
      requirement.status = input.updates.status;
    }
    if (input.updates.impact !== undefined) {
      requirement.impact = input.updates.impact;
    }
    if (input.updates.tags !== undefined) {
      validateTags(input.updates.tags);
      requirement.metadata.tags = input.updates.tags;
    }

    requirement.updatedAt = now;
    requirement.version += 1;

    requirements[index] = requirement;
    await this.storage.saveEntities(input.planId, 'requirements', requirements);

    return {
      success: true,
      requirementId: input.requirementId,
    };
  }

  async listRequirements(
    input: ListRequirementsInput
  ): Promise<ListRequirementsResult> {
    let requirements = await this.storage.loadEntities<Requirement>(
      input.planId,
      'requirements'
    );

    // Apply filters
    if (input.filters) {
      if (input.filters.priority) {
        requirements = requirements.filter(
          (r) => r.priority === input.filters!.priority
        );
      }
      if (input.filters.category) {
        requirements = requirements.filter(
          (r) => r.category === input.filters!.category
        );
      }
      if (input.filters.status) {
        requirements = requirements.filter(
          (r) => r.status === input.filters!.status
        );
      }
      if (input.filters.tags && input.filters.tags.length > 0) {
        requirements = requirements.filter((r) =>
          input.filters!.tags!.some((filterTag) =>
            r.metadata.tags.some(
              (t) => t.key === filterTag.key && t.value === filterTag.value
            )
          )
        );
      }
    }

    // Pagination
    const total = requirements.length;
    const offset = input.offset || 0;
    const limit = input.limit || 50;
    const paginated = requirements.slice(offset, offset + limit);

    // Apply field filtering
    const filtered = filterEntities(
      paginated,
      input.fields,
      'requirement',
      input.excludeMetadata,
      false
    ) as Requirement[];

    return {
      requirements: filtered,
      total,
      hasMore: offset + limit < total,
    };
  }

  async deleteRequirement(
    input: DeleteRequirementInput
  ): Promise<DeleteRequirementResult> {
    const requirements = await this.storage.loadEntities<Requirement>(
      input.planId,
      'requirements'
    );

    const index = requirements.findIndex((r) => r.id === input.requirementId);
    if (index === -1) {
      throw new Error('Requirement not found');
    }

    // TODO: Check for links if not force
    // For now, just delete

    requirements.splice(index, 1);
    await this.storage.saveEntities(input.planId, 'requirements', requirements);

    // Update statistics
    await this.planService.updateStatistics(input.planId);

    return {
      success: true,
      message: 'Requirement deleted',
    };
  }

  async voteForRequirement(
    input: VoteForRequirementInput
  ): Promise<VoteForRequirementResult> {
    const requirements = await this.storage.loadEntities<Requirement>(
      input.planId,
      'requirements'
    );

    const index = requirements.findIndex((r) => r.id === input.requirementId);
    if (index === -1) {
      throw new Error('Requirement not found');
    }

    const requirement = requirements[index];
    const now = new Date().toISOString();

    // Increment votes
    requirement.votes += 1;
    requirement.updatedAt = now;
    requirement.version += 1;

    requirements[index] = requirement;
    await this.storage.saveEntities(input.planId, 'requirements', requirements);

    return {
      success: true,
      votes: requirement.votes,
    };
  }

  async unvoteRequirement(
    input: UnvoteRequirementInput
  ): Promise<UnvoteRequirementResult> {
    const requirements = await this.storage.loadEntities<Requirement>(
      input.planId,
      'requirements'
    );

    const index = requirements.findIndex((r) => r.id === input.requirementId);
    if (index === -1) {
      throw new Error('Requirement not found');
    }

    const requirement = requirements[index];

    // Validate: cannot go below 0
    if (requirement.votes <= 0) {
      throw new Error('Cannot unvote: votes cannot be negative');
    }

    const now = new Date().toISOString();

    // Decrement votes
    requirement.votes -= 1;
    requirement.updatedAt = now;
    requirement.version += 1;

    requirements[index] = requirement;
    await this.storage.saveEntities(input.planId, 'requirements', requirements);

    return {
      success: true,
      votes: requirement.votes,
    };
  }
}

export default RequirementService;
