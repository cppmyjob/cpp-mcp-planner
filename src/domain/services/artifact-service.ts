import { v4 as uuidv4 } from 'uuid';
import type { FileStorage } from '../../infrastructure/file-storage.js';
import type { PlanService } from './plan-service.js';
import type {
  Artifact,
  ArtifactType,
  ArtifactStatus,
  FileEntry,
  ArtifactTarget,
  Tag,
} from '../entities/types.js';
import { validateTags, validateArtifactType, validateFileTable, validateTargets, validateCodeRefs } from './validators.js';
import { filterArtifact } from '../utils/field-filter.js';

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
  if (!slug) {
    slug = `artifact-${artifactId}`;
  }

  // Enforce max length
  return slug.substring(0, 100);
}

// Input types
export interface AddArtifactInput {
  planId: string;
  artifact: {
    title: string;
    description: string;
    slug?: string;
    artifactType: ArtifactType;
    content?: {
      language?: string;
      sourceCode?: string;
      filename?: string;
    };
    fileTable?: FileEntry[];
    targets?: ArtifactTarget[];
    relatedPhaseId?: string;
    relatedSolutionId?: string;
    relatedRequirementIds?: string[];
    codeRefs?: string[];
    tags?: Tag[];
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
    fileTable: FileEntry[];
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
    private storage: FileStorage,
    private planService: PlanService
  ) {}

  private async ensurePlanExists(planId: string): Promise<void> {
    const exists = await this.storage.planExists(planId);
    if (!exists) {
      throw new Error('Plan not found');
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

  async addArtifact(input: AddArtifactInput): Promise<AddArtifactResult> {
    await this.ensurePlanExists(input.planId);

    // Validate inputs
    validateArtifactType(input.artifact.artifactType);
    validateTags(input.artifact.tags || []);
    if (input.artifact.fileTable) {
      validateFileTable(input.artifact.fileTable);
    }
    if (input.artifact.targets) {
      validateTargets(input.artifact.targets);
    }
    // Validate codeRefs format
    validateCodeRefs(input.artifact.codeRefs || []);

    const artifacts = await this.storage.loadEntities<Artifact>(input.planId, 'artifacts');
    const artifactId = uuidv4();
    const slug = input.artifact.slug || slugify(input.artifact.title, artifactId);

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
        tags: input.artifact.tags || [],
        annotations: [],
      },
      title: input.artifact.title,
      description: input.artifact.description,
      slug,
      artifactType: input.artifact.artifactType,
      status: 'draft',
      content: input.artifact.content
        ? {
            language: input.artifact.content.language,
            sourceCode: input.artifact.content.sourceCode,
            filename: input.artifact.content.filename,
          }
        : {},
      fileTable: input.artifact.fileTable,
      targets: input.artifact.targets,
      relatedPhaseId: input.artifact.relatedPhaseId,
      relatedSolutionId: input.artifact.relatedSolutionId,
      relatedRequirementIds: input.artifact.relatedRequirementIds,
      codeRefs: input.artifact.codeRefs,
    };

    artifacts.push(artifact);
    await this.storage.saveEntities(input.planId, 'artifacts', artifacts);
    await this.planService.updateStatistics(input.planId);

    return { artifactId };
  }

  async getArtifact(input: GetArtifactInput): Promise<GetArtifactResult> {
    await this.ensurePlanExists(input.planId);

    const artifacts = await this.storage.loadEntities<Artifact>(input.planId, 'artifacts');
    const artifact = artifacts.find((a) => a.id === input.artifactId);

    if (!artifact) {
      throw new Error('Artifact not found');
    }

    // Auto-migrate fileTable to targets if needed
    // If artifact has fileTable but no targets, convert fileTable to targets
    if (artifact.fileTable && !artifact.targets) {
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

  async updateArtifact(input: UpdateArtifactInput): Promise<UpdateArtifactResult> {
    await this.ensurePlanExists(input.planId);

    // Validate inputs if provided
    if (input.updates.tags !== undefined) {
      validateTags(input.updates.tags);
    }
    if (input.updates.fileTable !== undefined) {
      validateFileTable(input.updates.fileTable);
    }
    if (input.updates.targets !== undefined) {
      validateTargets(input.updates.targets);
    }
    if (input.updates.codeRefs !== undefined) {
      validateCodeRefs(input.updates.codeRefs);
    }

    const artifacts = await this.storage.loadEntities<Artifact>(input.planId, 'artifacts');
    const index = artifacts.findIndex((a) => a.id === input.artifactId);

    if (index === -1) {
      throw new Error('Artifact not found');
    }

    const artifact = artifacts[index];
    const now = new Date().toISOString();

    if (input.updates.title !== undefined) artifact.title = input.updates.title;
    if (input.updates.description !== undefined) artifact.description = input.updates.description;
    if (input.updates.slug !== undefined) {
      // Validate slug uniqueness (exclude current artifact)
      this.validateSlugUniqueness(artifacts, input.updates.slug, input.artifactId);
      artifact.slug = input.updates.slug;
    }
    if (input.updates.status !== undefined) artifact.status = input.updates.status;
    if (input.updates.content !== undefined) {
      artifact.content = { ...artifact.content, ...input.updates.content };
    }
    if (input.updates.fileTable !== undefined) artifact.fileTable = input.updates.fileTable;
    if (input.updates.targets !== undefined) artifact.targets = input.updates.targets;
    if (input.updates.relatedPhaseId !== undefined) artifact.relatedPhaseId = input.updates.relatedPhaseId;
    if (input.updates.relatedSolutionId !== undefined) artifact.relatedSolutionId = input.updates.relatedSolutionId;
    if (input.updates.relatedRequirementIds !== undefined) artifact.relatedRequirementIds = input.updates.relatedRequirementIds;
    if (input.updates.codeRefs !== undefined) artifact.codeRefs = input.updates.codeRefs;
    if (input.updates.tags !== undefined) artifact.metadata.tags = input.updates.tags;

    artifact.updatedAt = now;
    artifact.version += 1;
    artifacts[index] = artifact;

    await this.storage.saveEntities(input.planId, 'artifacts', artifacts);

    return { success: true, artifactId: input.artifactId };
  }

  async listArtifacts(input: ListArtifactsInput): Promise<ListArtifactsResult> {
    await this.ensurePlanExists(input.planId);

    let artifacts = await this.storage.loadEntities<Artifact>(input.planId, 'artifacts');

    // Apply filters
    if (input.filters) {
      if (input.filters.artifactType) {
        artifacts = artifacts.filter((a) => a.artifactType === input.filters!.artifactType);
      }
      if (input.filters.status) {
        artifacts = artifacts.filter((a) => a.status === input.filters!.status);
      }
      if (input.filters.relatedPhaseId) {
        artifacts = artifacts.filter((a) => a.relatedPhaseId === input.filters!.relatedPhaseId);
      }
    }

    const total = artifacts.length;
    const limit = input.limit || 50;
    const offset = input.offset || 0;

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

  async deleteArtifact(input: DeleteArtifactInput): Promise<DeleteArtifactResult> {
    await this.ensurePlanExists(input.planId);

    const artifacts = await this.storage.loadEntities<Artifact>(input.planId, 'artifacts');
    const index = artifacts.findIndex((a) => a.id === input.artifactId);

    if (index === -1) {
      throw new Error('Artifact not found');
    }

    artifacts.splice(index, 1);
    await this.storage.saveEntities(input.planId, 'artifacts', artifacts);
    await this.planService.updateStatistics(input.planId);

    return {
      success: true,
      message: 'Artifact deleted successfully',
    };
  }
}

export default ArtifactService;
