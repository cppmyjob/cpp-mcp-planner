import { v4 as uuidv4 } from 'uuid';
import type { RepositoryFactory } from '../repositories/interfaces.js';
import type { PlanService } from './plan-service.js';
import type { VersionHistoryService } from './version-history-service.js';
import type {
  Artifact,
  ArtifactType,
  ArtifactStatus,
  ArtifactTarget,
  Tag,
  VersionHistory,
  VersionDiff,
  Phase,
} from '../entities/types.js';
import { validateTags, validateTargets, validateCodeRefs, validateRequiredString, validateRequiredEnum } from './validators.js';
import { filterArtifact } from '../utils/field-filter.js';

// Constants
const MAX_SLUG_LENGTH = 100;
const DEFAULT_ARTIFACTS_PAGE_LIMIT = 50;

/**
 * Converts a title string into a URL-friendly slug
 * @param title - The artifact title to slugify
 * @param artifactId - Fallback ID if slug generation produces empty string
 * @returns A URL-friendly slug (lowercase, alphanumeric + dashes, max 100 chars)
 */
function slugify(title: string, artifactId: string): string {
  let slug = title
    .toLowerCase()
    .normalize('NFD')                    // Decompose Unicode characters
    .replace(/[\u0300-\u036f]/g, '')    // Remove diacritics (accents)
    .replace(/[^a-z0-9\s-]/g, '')       // Keep only alphanumeric, spaces, dashes
    .trim()                              // Remove leading/trailing whitespace
    .replace(/\s+/g, '-')               // Replace spaces with dashes
    .replace(/-+/g, '-')                // Collapse multiple dashes into one
    .replace(/^-|-$/g, '');             // Trim leading/trailing dashes

  // Fallback for empty slugs: use artifact ID for guaranteed uniqueness
  if (slug === '') {
    slug = `artifact-${artifactId}`;
  }

  // Enforce max length
  return slug.substring(0, MAX_SLUG_LENGTH);
}

// Input types
export interface AddArtifactInput {
  planId: string;
  artifact: {
    title: string;  // REQUIRED
    artifactType: ArtifactType;  // REQUIRED
    description?: string;  // Optional - default: ''
    slug?: string;  // Optional - auto-generated from title
    content?: {  // Optional - default: undefined
      language?: string;
      sourceCode?: string;
      filename?: string;
    };
    targets?: ArtifactTarget[];  // Optional - undefined OK
    relatedPhaseId?: string;  // Optional - undefined OK
    relatedSolutionId?: string;  // Optional - undefined OK
    relatedRequirementIds?: string[];  // Optional - undefined OK
    codeRefs?: string[];  // Optional - undefined OK
    tags?: Tag[];  // Optional - default: []
  };
}

export interface GetArtifactInput {
  planId: string;
  artifactId: string;
  fields?: string[]; // Fields to include: summary (default), ['*'] (all), or custom list
  excludeMetadata?: boolean; // Exclude metadata fields (createdAt, updatedAt, version, metadata)
  includeContent?: boolean; // Include heavy sourceCode field (default: false for Lazy-Load)
}

export interface UpdateArtifactInput {
  planId: string;
  artifactId: string;
  updates: Partial<{
    title: string;
    description: string;
    slug: string;
    status: ArtifactStatus;
    content: {
      language?: string;
      sourceCode?: string;
      filename?: string;
    };
    targets: ArtifactTarget[];
    relatedPhaseId: string;
    relatedSolutionId: string;
    relatedRequirementIds: string[];
    codeRefs: string[];
    tags: Tag[];
  }>;
}

export interface ListArtifactsInput {
  planId: string;
  filters?: {
    artifactType?: ArtifactType;
    status?: ArtifactStatus;
    relatedPhaseId?: string;
  };
  limit?: number;
  offset?: number;
  fields?: string[]; // Fields to include: summary (default), ['*'] (all), or custom list
  excludeMetadata?: boolean; // Exclude metadata fields (createdAt, updatedAt, version, metadata)
  includeContent?: boolean; // IGNORED in list operations (sourceCode never returned in lists for security)
}

export interface DeleteArtifactInput {
  planId: string;
  artifactId: string;
}

// Output types
export interface AddArtifactResult {
  artifactId: string;
}

export interface GetArtifactResult {
  artifact: Artifact;
}

export interface UpdateArtifactResult {
  success: boolean;
  artifactId: string;
}

export interface ListArtifactsResult {
  artifacts: Artifact[];
  total: number;
  hasMore: boolean;
}

export interface DeleteArtifactResult {
  success: boolean;
  message: string;
}

export class ArtifactService {
  constructor(
    private readonly repositoryFactory: RepositoryFactory,
    private readonly planService: PlanService,
    private readonly versionHistoryService?: VersionHistoryService
  ) {}

  private async ensurePlanExists(planId: string): Promise<void> {
    const planRepo = this.repositoryFactory.createPlanRepository();
    const exists = await planRepo.planExists(planId);
    if (!exists) {
      throw new Error('Plan not found');
    }
  }

  /**
   * BUG #12 FIX: Validate that relatedPhaseId references an existing phase
   */
  private async validatePhaseReference(planId: string, phaseId: string): Promise<void> {
    const phaseRepo = this.repositoryFactory.createRepository<Phase>('phase', planId);
    try {
      await phaseRepo.findById(phaseId);
    } catch {
      throw new Error(`Phase '${phaseId}' not found`);
    }
  }

  /**
   * Validates that a slug is unique within the plan
   * @param artifacts - Existing artifacts in the plan
   * @param slug - The slug to validate
   * @param excludeId - Optional artifact ID to exclude from uniqueness check (for updates)
   * @throws Error if slug already exists
   */
  private validateSlugUniqueness(
    artifacts: Artifact[],
    slug: string,
    excludeId?: string
  ): void {
    const existing = artifacts.find((a) => a.slug === slug && a.id !== excludeId);

    if (existing) {
      throw new Error(
        `Artifact with slug "${slug}" already exists in this plan (ID: ${existing.id})`
      );
    }
  }

  public async addArtifact(input: AddArtifactInput): Promise<AddArtifactResult> {
    await this.ensurePlanExists(input.planId);

    // Validate REQUIRED fields
    validateRequiredString(input.artifact.title, 'title');
    validateRequiredEnum(
      input.artifact.artifactType,
      'artifactType',
      ['code', 'config', 'migration', 'documentation', 'test', 'script', 'other']
    );

    // Validate optional fields
    validateTags(input.artifact.tags ?? []);
    if (input.artifact.targets) {
      validateTargets(input.artifact.targets);
    }
    // Validate codeRefs format
    validateCodeRefs(input.artifact.codeRefs ?? []);

    // BUG #12 FIX: Validate relatedPhaseId reference exists
    if (input.artifact.relatedPhaseId !== undefined && input.artifact.relatedPhaseId !== '') {
      await this.validatePhaseReference(input.planId, input.artifact.relatedPhaseId);
    }

    const repo = this.repositoryFactory.createRepository<Artifact>('artifact', input.planId);
    const artifacts = await repo.findAll();

    const artifactId = uuidv4();
    const slug = input.artifact.slug ?? slugify(input.artifact.title, artifactId);

    // Validate slug uniqueness
    this.validateSlugUniqueness(artifacts, slug);

    const now = new Date().toISOString();

    const artifact: Artifact = {
      id: artifactId,
      type: 'artifact',
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {
        createdBy: 'claude-code',
        tags: input.artifact.tags ?? [],
        annotations: [],
      },
      title: input.artifact.title,  // REQUIRED
      description: input.artifact.description ?? '',  // DEFAULT: empty string
      slug,
      artifactType: input.artifact.artifactType,  // REQUIRED
      status: 'draft',
      content: input.artifact.content
        ? {
            language: input.artifact.content.language,
            sourceCode: input.artifact.content.sourceCode,
            filename: input.artifact.content.filename,
          }
        : {},
      targets: input.artifact.targets,
      relatedPhaseId: input.artifact.relatedPhaseId,
      relatedSolutionId: input.artifact.relatedSolutionId,
      relatedRequirementIds: input.artifact.relatedRequirementIds,
      codeRefs: input.artifact.codeRefs,
    };

    await repo.create(artifact);
    await this.planService.updateStatistics(input.planId);

    return { artifactId };
  }

  public async getArtifact(input: GetArtifactInput): Promise<GetArtifactResult> {
    await this.ensurePlanExists(input.planId);

    const repo = this.repositoryFactory.createRepository<Artifact>('artifact', input.planId);
    const artifact = await repo.findById(input.artifactId);

    // Auto-migrate fileTable to targets if needed
    // If artifact has fileTable but no targets, convert fileTable to targets
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    if (artifact.fileTable !== undefined && artifact.targets === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      artifact.targets = artifact.fileTable.map((entry) => ({
        path: entry.path,
        action: entry.action,
        description: entry.description,
      }));
    }

    // Apply field filtering with Lazy-Load support
    const filtered = filterArtifact(
      artifact,
      input.fields,
      false, // isListOperation
      input.excludeMetadata,
      input.includeContent ?? false // default: false (Lazy-Load)
    ) as Artifact;

    return { artifact: filtered };
  }

  public async updateArtifact(input: UpdateArtifactInput): Promise<UpdateArtifactResult> {
    await this.ensurePlanExists(input.planId);

    // Validate inputs if provided
    if (input.updates.tags !== undefined) {
      validateTags(input.updates.tags);
    }
    if (input.updates.targets !== undefined) {
      validateTargets(input.updates.targets);
    }
    if (input.updates.codeRefs !== undefined) {
      validateCodeRefs(input.updates.codeRefs);
    }

    const repo = this.repositoryFactory.createRepository<Artifact>('artifact', input.planId);
    const artifact = await repo.findById(input.artifactId);

    // Sprint 7: Save current version to history BEFORE updating
    if (this.versionHistoryService) {
      const currentSnapshot = JSON.parse(JSON.stringify(artifact)) as Artifact;
      await this.versionHistoryService.saveVersion(
        input.planId,
        input.artifactId,
        'artifact',
        currentSnapshot,
        artifact.version,
        'claude-code',
        'Auto-saved before update'
      );
    }

    // BUG #18: Validate title if provided in updates
    if (input.updates.title !== undefined) {
      validateRequiredString(input.updates.title, 'title');
      artifact.title = input.updates.title;
    }
    if (input.updates.description !== undefined) artifact.description = input.updates.description;
    if (input.updates.slug !== undefined) {
      // Validate slug uniqueness (exclude current artifact) - need all artifacts for this
      const allArtifacts = await repo.findAll();
      this.validateSlugUniqueness(allArtifacts, input.updates.slug, input.artifactId);
      artifact.slug = input.updates.slug;
    }
    if (input.updates.status !== undefined) artifact.status = input.updates.status;
    if (input.updates.content !== undefined) {
      artifact.content = { ...artifact.content, ...input.updates.content };
    }
    if (input.updates.targets !== undefined) artifact.targets = input.updates.targets;
    if (input.updates.relatedPhaseId !== undefined) artifact.relatedPhaseId = input.updates.relatedPhaseId;
    if (input.updates.relatedSolutionId !== undefined) artifact.relatedSolutionId = input.updates.relatedSolutionId;
    if (input.updates.relatedRequirementIds !== undefined) artifact.relatedRequirementIds = input.updates.relatedRequirementIds;
    if (input.updates.codeRefs !== undefined) artifact.codeRefs = input.updates.codeRefs;
    if (input.updates.tags !== undefined) artifact.metadata.tags = input.updates.tags;

    // repo.update() will auto-increment version and set updatedAt
    await repo.update(artifact.id, artifact);

    return { success: true, artifactId: input.artifactId };
  }

  public async listArtifacts(input: ListArtifactsInput): Promise<ListArtifactsResult> {
    await this.ensurePlanExists(input.planId);

    const repo = this.repositoryFactory.createRepository<Artifact>('artifact', input.planId);
    let artifacts = await repo.findAll();

    // Apply filters
    if (input.filters) {
      const filters = input.filters;
      if (filters.artifactType !== undefined) {
        artifacts = artifacts.filter((a) => a.artifactType === filters.artifactType);
      }
      if (filters.status !== undefined) {
        artifacts = artifacts.filter((a) => a.status === filters.status);
      }
      if (filters.relatedPhaseId !== undefined && filters.relatedPhaseId !== '') {
        artifacts = artifacts.filter((a) => a.relatedPhaseId === filters.relatedPhaseId);
      }
    }

    const total = artifacts.length;
    const limit = input.limit ?? DEFAULT_ARTIFACTS_PAGE_LIMIT;
    const offset = input.offset ?? 0;

    artifacts = artifacts.slice(offset, offset + limit);

    // Apply field filtering with Lazy-Load (list operations NEVER return sourceCode)
    const filtered = artifacts.map((artifact) =>
      filterArtifact(
        artifact,
        input.fields,
        true, // isListOperation
        input.excludeMetadata,
        false // includeContent IGNORED for list operations (security)
      )
    ) as Artifact[];

    return {
      artifacts: filtered,
      total,
      hasMore: offset + artifacts.length < total,
    };
  }

  public async deleteArtifact(input: DeleteArtifactInput): Promise<DeleteArtifactResult> {
    await this.ensurePlanExists(input.planId);

    const repo = this.repositoryFactory.createRepository<Artifact>('artifact', input.planId);
    await repo.delete(input.artifactId);
    await this.planService.updateStatistics(input.planId);

    return {
      success: true,
      message: 'Artifact deleted successfully',
    };
  }

  /**
   * Sprint 7: Get version history for an artifact
   * Note: Can retrieve history even for deleted artifacts
   */
  public async getHistory(input: { planId: string; artifactId: string; limit?: number; offset?: number }): Promise<VersionHistory<Artifact>> {
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
      entityId: input.artifactId,
      entityType: 'artifact',
      limit: input.limit,
      offset: input.offset,
    });
    return history as VersionHistory<Artifact>;
  }

  /**
   * Sprint 7: Compare two versions of an artifact
   */
  public async diff(input: { planId: string; artifactId: string; version1: number; version2: number }): Promise<VersionDiff> {
    if (!this.versionHistoryService) {
      throw new Error('Version history service not available');
    }

    const planRepo = this.repositoryFactory.createPlanRepository();
    const exists = await planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    // Load current artifact to support diffing with current version
    const repo = this.repositoryFactory.createRepository<Artifact>('artifact', input.planId);
    const currentArtifact = await repo.findById(input.artifactId);

    return this.versionHistoryService.diff({
      planId: input.planId,
      entityId: input.artifactId,
      entityType: 'artifact',
      version1: input.version1,
      version2: input.version2,
      currentEntityData: currentArtifact,
      currentVersion: currentArtifact.version,
    });
  }
}
