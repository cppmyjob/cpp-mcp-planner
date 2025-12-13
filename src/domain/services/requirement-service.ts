import { v4 as uuidv4 } from 'uuid';
import type { RepositoryFactory } from '../../infrastructure/factory/repository-factory.js';
import type { PlanService } from './plan-service.js';
import type { VersionHistoryService } from './version-history-service.js';
import type {
  Requirement,
  RequirementSource,
  RequirementPriority,
  RequirementCategory,
  RequirementStatus,
  Tag,
  VersionHistory,
  VersionDiff,
} from '../entities/types.js';
import { NotFoundError } from '../repositories/errors.js';
import { validateTags, validateRequiredString, validateRequiredEnum } from './validators.js';
import { filterEntities, filterEntity } from '../utils/field-filter.js';

// Constants
const MAX_REQUIREMENTS_BATCH_SIZE = 100;
const DEFAULT_REQUIREMENTS_PAGE_LIMIT = 50;

// Input types
export interface AddRequirementInput {
  planId: string;
  requirement: {
    title: string;  // REQUIRED
    description?: string;  // Optional - default: ''
    rationale?: string;
    source?: {  // Optional object, but source.type is REQUIRED if source provided
      type: RequirementSource;  // REQUIRED
      context?: string;
      parentId?: string;
    };
    acceptanceCriteria?: string[];  // Optional - default: []
    priority?: RequirementPriority;  // Optional - default: 'medium'
    category?: RequirementCategory;  // Optional - default: 'functional'
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

export interface ResetAllVotesInput {
  planId: string;
}

export interface BulkUpdateRequirementsInput {
  planId: string;
  updates: {
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
  }[];
  atomic?: boolean; // Default: false (non-atomic mode)
}

// Output types
export interface AddRequirementResult {
  requirementId: string;
}

export interface GetRequirementResult {
  requirement: Requirement;
  traceability?: {
    solutions: unknown[];
    selectedSolution: unknown;
    implementingPhases: unknown[];
    decisions: unknown[];
    linkedRequirements: Requirement[];
  };
}

export interface GetRequirementsInput {
  planId: string;
  requirementIds: string[];
  fields?: string[];
  excludeMetadata?: boolean;
}

export interface GetRequirementsResult {
  requirements: Requirement[];
  notFound: string[];
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

export interface BulkUpdateRequirementsResult {
  updated: number;
  failed: number;
  results: {
    requirementId: string;
    success: boolean;
    error?: string;
  }[];
}

export interface UnvoteRequirementResult {
  success: boolean;
  votes: number;
}

// Sprint 5: Array Field Operations interfaces
export type RequirementArrayField = 'acceptanceCriteria';

export interface ArrayAppendInput {
  planId: string;
  requirementId: string;
  field: RequirementArrayField;
  value: string;
}

export interface ArrayPrependInput {
  planId: string;
  requirementId: string;
  field: RequirementArrayField;
  value: string;
}

export interface ArrayInsertAtInput {
  planId: string;
  requirementId: string;
  field: RequirementArrayField;
  index: number;
  value: string;
}

export interface ArrayUpdateAtInput {
  planId: string;
  requirementId: string;
  field: RequirementArrayField;
  index: number;
  value: string;
}

export interface ArrayRemoveAtInput {
  planId: string;
  requirementId: string;
  field: RequirementArrayField;
  index: number;
}

export interface ArrayOperationResult {
  success: true;
  field: RequirementArrayField;
  newLength: number;
}

// Sprint 7: Version History input/output types
export interface GetRequirementHistoryInput {
  planId: string;
  requirementId: string;
  limit?: number;
  offset?: number;
}

export interface DiffRequirementInput {
  planId: string;
  requirementId: string;
  version1: number;
  version2: number;
}

export interface ResetAllVotesResult {
  success: boolean;
  updated: number;
}

export class RequirementService {
  constructor(
    private readonly repositoryFactory: RepositoryFactory,
    private readonly planService: PlanService,
    private readonly versionHistoryService?: VersionHistoryService // Sprint 7: Optional for backward compatibility
  ) {}

  public async addRequirement(input: AddRequirementInput): Promise<AddRequirementResult> {
    const planRepo = this.repositoryFactory.createPlanRepository();
    const exists = await planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    // Validate REQUIRED fields
    validateRequiredString(input.requirement.title, 'title');

    // Validate source.type is provided
    if (input.requirement.source === undefined) {
      throw new Error('source is required');
    }
    validateRequiredEnum(
      input.requirement.source.type,
      'source.type',
      ['user-request', 'discovered', 'derived']
    );

    // Validate tags format
    validateTags(input.requirement.tags ?? []);

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
        tags: input.requirement.tags ?? [],
        annotations: [],
      },
      title: input.requirement.title,  // REQUIRED
      description: input.requirement.description ?? '',  // DEFAULT: empty string
      rationale: input.requirement.rationale,  // undefined OK
      source: input.requirement.source,  // source.type is REQUIRED and validated above
      acceptanceCriteria: input.requirement.acceptanceCriteria ?? [],  // DEFAULT: empty array
      priority: input.requirement.priority ?? 'medium',  // DEFAULT: medium
      category: input.requirement.category ?? 'functional',  // DEFAULT: functional
      status: 'draft',
      votes: 0,
      impact: input.requirement.impact,  // undefined OK
    };

    // Create requirement via repository
    const repo = this.repositoryFactory.createRepository<Requirement>('requirement', input.planId);
    await repo.create(requirement);

    // Update statistics
    await this.planService.updateStatistics(input.planId);

    return {
      requirementId: requirement.id,
    };
  }

  public async getRequirement(input: GetRequirementInput): Promise<GetRequirementResult> {
    const repo = this.repositoryFactory.createRepository<Requirement>('requirement', input.planId);
    const requirement = await repo.findById(input.requirementId);

    // Apply field filtering - GET operations default to all fields
    const filtered = filterEntity(
      requirement,
      input.fields ?? ['*'],
      'requirement',
      input.excludeMetadata,
      false
    ) as Requirement;

    const result: GetRequirementResult = { requirement: filtered };

    if (input.includeTraceability === true) {
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

  public async getRequirements(input: GetRequirementsInput): Promise<GetRequirementsResult> {
    // Enforce max limit
    if (input.requirementIds.length > MAX_REQUIREMENTS_BATCH_SIZE) {
      throw new Error(`Cannot fetch more than ${String(MAX_REQUIREMENTS_BATCH_SIZE)} requirements at once`);
    }

    // Handle empty array
    if (input.requirementIds.length === 0) {
      return { requirements: [], notFound: [] };
    }

    const repo = this.repositoryFactory.createRepository<Requirement>('requirement', input.planId);
    const foundRequirements: Requirement[] = [];
    const notFound: string[] = [];

    // Fetch each requirement by ID
    for (const id of input.requirementIds) {
      try {
        const requirement = await repo.findById(id);
        // Apply field filtering - requirements default to all fields
        const filtered = filterEntity(
          requirement,
          input.fields ?? ['*'],
          'requirement',
          input.excludeMetadata,
          false
        ) as Requirement;
        foundRequirements.push(filtered);
      } catch (error: unknown) {
        // FIX M-1: Only treat NotFoundError as "not found", re-throw other errors
        if (error instanceof NotFoundError || (error instanceof Error && error.constructor.name === 'NotFoundError')) {
          notFound.push(id);
        } else {
          // Preserve error context and re-throw
          throw error;
        }
      }
    }

    return { requirements: foundRequirements, notFound };
  }

  public async updateRequirement(
    input: UpdateRequirementInput
  ): Promise<UpdateRequirementResult> {
    const repo = this.repositoryFactory.createRepository<Requirement>('requirement', input.planId);
    const requirement = await repo.findById(input.requirementId);

    // Sprint 7: Save current version to history BEFORE updating
    if (this.versionHistoryService) {
      // Create a deep copy of the current requirement state
      const currentSnapshot = JSON.parse(JSON.stringify(requirement)) as Requirement;
      await this.versionHistoryService.saveVersion(
        input.planId,
        input.requirementId,
        'requirement',
        currentSnapshot,
        requirement.version, // Save with current version number
        'claude-code',
        'Auto-saved before update'
      );
    }

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

    await repo.update(requirement.id, requirement);

    return {
      success: true,
      requirementId: input.requirementId,
    };
  }

  public async listRequirements(
    input: ListRequirementsInput
  ): Promise<ListRequirementsResult> {
    const repo = this.repositoryFactory.createRepository<Requirement>('requirement', input.planId);

    // Build query options (currently unused, reserved for future pagination implementation)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const queryOptions: { limit: number; offset: number } = {
      limit: input.limit ?? DEFAULT_REQUIREMENTS_PAGE_LIMIT,
      offset: input.offset ?? 0,
    };

    // Build filter (Note: Repository pattern may not support complex tag filtering - fallback to in-memory)
    let requirements = await repo.findAll();

    // Apply filters in-memory (TODO: move to repository layer for performance)
    if (input.filters !== undefined) {
      const filters = input.filters;
      if (filters.priority !== undefined) {
        requirements = requirements.filter(
          (r) => r.priority === filters.priority
        );
      }
      if (filters.category !== undefined) {
        requirements = requirements.filter(
          (r) => r.category === filters.category
        );
      }
      if (filters.status !== undefined) {
        requirements = requirements.filter(
          (r) => r.status === filters.status
        );
      }
      if (filters.tags && filters.tags.length > 0) {
        const filterTags = filters.tags;
        requirements = requirements.filter((r) =>
          filterTags.some((filterTag) =>
            r.metadata.tags.some(
              (t) => t.key === filterTag.key && t.value === filterTag.value
            )
          )
        );
      }
    }

    // Pagination
    const total = requirements.length;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? DEFAULT_REQUIREMENTS_PAGE_LIMIT;
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

  public async deleteRequirement(
    input: DeleteRequirementInput
  ): Promise<DeleteRequirementResult> {
    const repo = this.repositoryFactory.createRepository<Requirement>('requirement', input.planId);

    // Verify exists (throws NotFoundError if not found)
    await repo.findById(input.requirementId);

    // TODO: Check for links if not force
    // For now, just delete
    await repo.delete(input.requirementId);

    // Update statistics
    await this.planService.updateStatistics(input.planId);

    return {
      success: true,
      message: 'Requirement deleted',
    };
  }

  public async voteForRequirement(
    input: VoteForRequirementInput
  ): Promise<VoteForRequirementResult> {
    const repo = this.repositoryFactory.createRepository<Requirement>('requirement', input.planId);
    const requirement = await repo.findById(input.requirementId);

    // Initialize votes if undefined (backward compatibility)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    requirement.votes ??= 0;

    // Increment votes
    requirement.votes += 1;

    await repo.update(requirement.id, requirement);

    return {
      success: true,
      votes: requirement.votes,
    };
  }

  public async unvoteRequirement(
    input: UnvoteRequirementInput
  ): Promise<UnvoteRequirementResult> {
    const repo = this.repositoryFactory.createRepository<Requirement>('requirement', input.planId);
    const requirement = await repo.findById(input.requirementId);

    // Initialize votes if undefined (backward compatibility)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    requirement.votes ??= 0;

    // Validate: cannot go below 0
    if (requirement.votes <= 0) {
      throw new Error('Cannot unvote: votes cannot be negative');
    }

    // Decrement votes
    requirement.votes -= 1;

    await repo.update(requirement.id, requirement);

    return {
      success: true,
      votes: requirement.votes,
    };
  }

  /**
   * Sprint 5: Array Field Operations
   * Validate that field is a valid array field for Requirement
   */
  private validateArrayField(field: string): asserts field is RequirementArrayField {
    const validFields: RequirementArrayField[] = ['acceptanceCriteria'];
    if (!validFields.includes(field as RequirementArrayField)) {
      throw new Error(`Field ${field} is not a valid array field. Valid fields: ${validFields.join(', ')}`);
    }
  }

  /**
   * Execute an array operation with common load/save logic
   * @param planId - Plan identifier
   * @param requirementId - Requirement identifier
   * @param field - Array field to modify
   * @param operation - Function that transforms the current array to new array
   * @returns Operation result with success status and new array length
   */
  private async executeArrayOperation(
    planId: string,
    requirementId: string,
    field: RequirementArrayField,
    operation: (currentArray: string[]) => string[]
  ): Promise<ArrayOperationResult> {
    const planRepo = this.repositoryFactory.createPlanRepository();
    const exists = await planRepo.planExists(planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const repo = this.repositoryFactory.createRepository<Requirement>('requirement', planId);
    const requirement = await repo.findById(requirementId);

    const currentArray = requirement[field];
    const newArray = operation(currentArray);

    requirement[field] = newArray;

    await repo.update(requirement.id, requirement);

    return {
      success: true,
      field,
      newLength: newArray.length,
    };
  }

  /**
   * Append item to end of array field
   */
  public async arrayAppend(input: ArrayAppendInput): Promise<ArrayOperationResult> {
    this.validateArrayField(input.field);
    return this.executeArrayOperation(
      input.planId,
      input.requirementId,
      input.field,
      (currentArray) => [...currentArray, input.value]
    );
  }

  /**
   * Prepend item to beginning of array field
   */
  public async arrayPrepend(input: ArrayPrependInput): Promise<ArrayOperationResult> {
    this.validateArrayField(input.field);
    return this.executeArrayOperation(
      input.planId,
      input.requirementId,
      input.field,
      (currentArray) => [input.value, ...currentArray]
    );
  }

  /**
   * Insert item at specific index in array field
   */
  public async arrayInsertAt(input: ArrayInsertAtInput): Promise<ArrayOperationResult> {
    this.validateArrayField(input.field);
    return this.executeArrayOperation(
      input.planId,
      input.requirementId,
      input.field,
      (currentArray) => {
        if (input.index < 0 || input.index > currentArray.length) {
          throw new Error(`Index ${String(input.index)} is out of bounds for array of length ${String(currentArray.length)}`);
        }
        const newArray = [...currentArray];
        newArray.splice(input.index, 0, input.value);
        return newArray;
      }
    );
  }

  /**
   * Update item at specific index in array field
   */
  public async arrayUpdateAt(input: ArrayUpdateAtInput): Promise<ArrayOperationResult> {
    this.validateArrayField(input.field);
    return this.executeArrayOperation(
      input.planId,
      input.requirementId,
      input.field,
      (currentArray) => {
        if (input.index < 0 || input.index >= currentArray.length) {
          throw new Error(`Index ${String(input.index)} is out of bounds for array of length ${String(currentArray.length)}`);
        }
        const newArray = [...currentArray];
        newArray[input.index] = input.value;
        return newArray;
      }
    );
  }

  /**
   * Remove item at specific index in array field
   */
  public async arrayRemoveAt(input: ArrayRemoveAtInput): Promise<ArrayOperationResult> {
    this.validateArrayField(input.field);
    return this.executeArrayOperation(
      input.planId,
      input.requirementId,
      input.field,
      (currentArray) => {
        if (input.index < 0 || input.index >= currentArray.length) {
          throw new Error(`Index ${String(input.index)} is out of bounds for array of length ${String(currentArray.length)}`);
        }
        const newArray = [...currentArray];
        newArray.splice(input.index, 1);
        return newArray;
      }
    );
  }

  /**
   * Sprint 7: Get version history for a requirement
   * Note: Can retrieve history even for deleted requirements
   */
  public async getHistory(input: GetRequirementHistoryInput): Promise<VersionHistory<Requirement>> {
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
      entityId: input.requirementId,
      entityType: 'requirement',
      limit: input.limit,
      offset: input.offset,
    });
    return history as VersionHistory<Requirement>;
  }

  /**
   * Sprint 7: Compare two versions of a requirement
   */
  public async diff(input: DiffRequirementInput): Promise<VersionDiff> {
    if (!this.versionHistoryService) {
      throw new Error('Version history service not available');
    }

    const planRepo = this.repositoryFactory.createPlanRepository();
    const exists = await planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    // Load current requirement to support diffing with current version
    const repo = this.repositoryFactory.createRepository<Requirement>('requirement', input.planId);
    const currentRequirement = await repo.findById(input.requirementId);

    return this.versionHistoryService.diff({
      planId: input.planId,
      entityId: input.requirementId,
      entityType: 'requirement',
      version1: input.version1,
      version2: input.version2,
      currentEntityData: currentRequirement,
      currentVersion: currentRequirement.version,
    });
  }

  /**
   * Sprint 9: Bulk update multiple requirements in one call
   * REFACTORED: Uses common bulkUpdateEntities utility
   */
  public async bulkUpdateRequirements(
    input: BulkUpdateRequirementsInput
  ): Promise<BulkUpdateRequirementsResult> {
    const repo = this.repositoryFactory.createRepository<Requirement>('requirement', input.planId);

    if (input.atomic === true) {
      // ATOMIC MODE: All-or-nothing with true rollback
      // Phase 1: Load all entities and validate
      const toUpdate: Requirement[] = [];
      const results: { requirementId: string; success: boolean; error?: string }[] = [];

      for (const update of input.updates) {
        try {
          // Load requirement (create deep copy to avoid mutations until save)
          const originalRequirement = await repo.findById(update.requirementId);
          const requirement = JSON.parse(JSON.stringify(originalRequirement)) as Requirement;

          // Save original to history before update
          if (this.versionHistoryService) {
            await this.versionHistoryService.saveVersion(
              input.planId,
              update.requirementId,
              'requirement',
              originalRequirement,
              originalRequirement.version,
              'claude-code',
              'Auto-saved before bulk update'
            );
          }

          // Apply updates with validation
          if (update.updates.title !== undefined) requirement.title = update.updates.title;
          if (update.updates.description !== undefined) requirement.description = update.updates.description;
          if (update.updates.rationale !== undefined) requirement.rationale = update.updates.rationale;
          if (update.updates.acceptanceCriteria !== undefined)
            requirement.acceptanceCriteria = update.updates.acceptanceCriteria;
          if (update.updates.priority !== undefined) requirement.priority = update.updates.priority;
          if (update.updates.category !== undefined) requirement.category = update.updates.category;
          if (update.updates.status !== undefined) requirement.status = update.updates.status;
          if (update.updates.impact !== undefined) requirement.impact = update.updates.impact;
          if (update.updates.tags !== undefined) {
            validateTags(update.updates.tags);
            requirement.metadata.tags = update.updates.tags;
          }

          requirement.updatedAt = new Date().toISOString();
          requirement.version = requirement.version + 1;

          toUpdate.push(requirement);
          results.push({ requirementId: update.requirementId, success: true });
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
      const results: { requirementId: string; success: boolean; error?: string }[] = [];
      let updated = 0;
      let failed = 0;

      for (const update of input.updates) {
        try {
          await this.updateRequirement({
            planId: input.planId,
            requirementId: update.requirementId,
            updates: update.updates,
          });
          results.push({
            requirementId: update.requirementId,
            success: true,
          });
          updated++;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({
            requirementId: update.requirementId,
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

  public async resetAllVotes(
    input: ResetAllVotesInput
  ): Promise<ResetAllVotesResult> {
    const planRepo = this.repositoryFactory.createPlanRepository();
    const exists = await planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const repo = this.repositoryFactory.createRepository<Requirement>('requirement', input.planId);
    const requirements = await repo.findAll();

    let updated = 0;

    // Reset votes for all requirements
    for (const requirement of requirements) {
      // Check if votes need to be updated (non-zero)
      const needsUpdate = requirement.votes !== 0;

      if (needsUpdate) {
        requirement.votes = 0;
        await repo.update(requirement.id, requirement);
        updated++;
      }
    }

    return {
      success: true,
      updated,
    };
  }
}
