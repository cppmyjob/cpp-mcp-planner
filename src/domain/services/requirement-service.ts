import { v4 as uuidv4 } from 'uuid';
import type { FileStorage } from '../../infrastructure/file-storage.js';
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

export interface BulkUpdateRequirementsInput {
  planId: string;
  updates: Array<{
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
  }>;
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
    selectedSolution: unknown | null;
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
  results: Array<{
    requirementId: string;
    success: boolean;
    error?: string;
  }>;
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

export class RequirementService {
  constructor(
    private storage: FileStorage,
    private planService: PlanService,
    private versionHistoryService?: VersionHistoryService // Sprint 7: Optional for backward compatibility
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

  async getRequirements(input: GetRequirementsInput): Promise<GetRequirementsResult> {
    // Enforce max limit
    if (input.requirementIds.length > 100) {
      throw new Error('Cannot fetch more than 100 requirements at once');
    }

    // Handle empty array
    if (input.requirementIds.length === 0) {
      return { requirements: [], notFound: [] };
    }

    const allRequirements = await this.storage.loadEntities<Requirement>(
      input.planId,
      'requirements'
    );

    const foundRequirements: Requirement[] = [];
    const notFound: string[] = [];

    // Collect found and not found IDs
    for (const id of input.requirementIds) {
      const requirement = allRequirements.find((r) => r.id === id);
      if (requirement) {
        // Apply field filtering - requirements default to all fields
        const filtered = filterEntity(
          requirement,
          input.fields ?? ['*'],
          'requirement',
          input.excludeMetadata,
          false
        ) as Requirement;
        foundRequirements.push(filtered);
      } else {
        notFound.push(id);
      }
    }

    return { requirements: foundRequirements, notFound };
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

    // Sprint 7: Save current version to history BEFORE updating
    if (this.versionHistoryService) {
      // Create a deep copy of the current requirement state
      const currentSnapshot = JSON.parse(JSON.stringify(requirement));
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
    const exists = await this.storage.planExists(planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const requirements = await this.storage.loadEntities<Requirement>(planId, 'requirements');
    const requirement = requirements.find((r) => r.id === requirementId);
    if (!requirement) {
      throw new Error('Requirement not found');
    }

    const currentArray = requirement[field] || [];
    const newArray = operation(currentArray);

    requirement[field] = newArray;
    requirement.updatedAt = new Date().toISOString();
    requirement.version += 1;

    await this.storage.saveEntities(planId, 'requirements', requirements);

    return {
      success: true,
      field,
      newLength: newArray.length,
    };
  }

  /**
   * Append item to end of array field
   */
  async arrayAppend(input: ArrayAppendInput): Promise<ArrayOperationResult> {
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
  async arrayPrepend(input: ArrayPrependInput): Promise<ArrayOperationResult> {
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
  async arrayInsertAt(input: ArrayInsertAtInput): Promise<ArrayOperationResult> {
    this.validateArrayField(input.field);
    return this.executeArrayOperation(
      input.planId,
      input.requirementId,
      input.field,
      (currentArray) => {
        if (input.index < 0 || input.index > currentArray.length) {
          throw new Error(`Index ${input.index} is out of bounds for array of length ${currentArray.length}`);
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
  async arrayUpdateAt(input: ArrayUpdateAtInput): Promise<ArrayOperationResult> {
    this.validateArrayField(input.field);
    return this.executeArrayOperation(
      input.planId,
      input.requirementId,
      input.field,
      (currentArray) => {
        if (input.index < 0 || input.index >= currentArray.length) {
          throw new Error(`Index ${input.index} is out of bounds for array of length ${currentArray.length}`);
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
  async arrayRemoveAt(input: ArrayRemoveAtInput): Promise<ArrayOperationResult> {
    this.validateArrayField(input.field);
    return this.executeArrayOperation(
      input.planId,
      input.requirementId,
      input.field,
      (currentArray) => {
        if (input.index < 0 || input.index >= currentArray.length) {
          throw new Error(`Index ${input.index} is out of bounds for array of length ${currentArray.length}`);
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
  async getHistory(input: GetRequirementHistoryInput): Promise<VersionHistory<Requirement>> {
    if (!this.versionHistoryService) {
      throw new Error('Version history service not available');
    }

    const exists = await this.storage.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    return this.versionHistoryService.getHistory({
      planId: input.planId,
      entityId: input.requirementId,
      entityType: 'requirement',
      limit: input.limit,
      offset: input.offset,
    });
  }

  /**
   * Sprint 7: Compare two versions of a requirement
   */
  async diff(input: DiffRequirementInput): Promise<VersionDiff> {
    if (!this.versionHistoryService) {
      throw new Error('Version history service not available');
    }

    const exists = await this.storage.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    // Load current requirement to support diffing with current version
    const requirements = await this.storage.loadEntities<Requirement>(
      input.planId,
      'requirements'
    );
    const currentRequirement = requirements.find((r) => r.id === input.requirementId);

    if (!currentRequirement) {
      throw new Error('Requirement not found');
    }

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
   */
  async bulkUpdateRequirements(
    input: BulkUpdateRequirementsInput
  ): Promise<BulkUpdateRequirementsResult> {
    const atomic = input.atomic ?? false;
    const results: Array<{ requirementId: string; success: boolean; error?: string }> = [];
    let updated = 0;
    let failed = 0;

    // Atomic mode: validate all requirements exist first
    if (atomic) {
      const requirements = await this.storage.loadEntities<Requirement>(
        input.planId,
        'requirements'
      );
      const reqMap = new Map(requirements.map((r) => [r.id, r]));

      for (const update of input.updates) {
        if (!reqMap.has(update.requirementId)) {
          throw new Error(
            `Requirement ${update.requirementId} not found (atomic mode - rolling back)`
          );
        }
      }

      // All validated - perform updates
      for (const update of input.updates) {
        try {
          await this.updateRequirement({
            planId: input.planId,
            requirementId: update.requirementId,
            updates: update.updates,
          });
          results.push({ requirementId: update.requirementId, success: true });
          updated++;
        } catch (error: any) {
          // In atomic mode, if any update fails, rollback and throw
          throw new Error(`Atomic bulk update failed: ${error.message}`);
        }
      }
    } else {
      // Non-atomic mode: process each update independently
      for (const update of input.updates) {
        try {
          await this.updateRequirement({
            planId: input.planId,
            requirementId: update.requirementId,
            updates: update.updates,
          });
          results.push({ requirementId: update.requirementId, success: true });
          updated++;
        } catch (error: any) {
          results.push({
            requirementId: update.requirementId,
            success: false,
            error: error.message,
          });
          failed++;
        }
      }
    }

    return { updated, failed, results };
  }
}

export default RequirementService;
