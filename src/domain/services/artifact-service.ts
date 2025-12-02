import { v4 as uuidv4 } from 'uuid';
import type { FileStorage } from '../../infrastructure/file-storage.js';
import type { PlanService } from './plan-service.js';
import type {
  Artifact,
  ArtifactType,
  ArtifactStatus,
  FileEntry,
  Tag,
} from '../entities/types.js';
import { validateTags, validateArtifactType, validateFileTable } from './validators.js';

// Input types
export interface AddArtifactInput {
  planId: string;
  artifact: {
    title: string;
    description: string;
    artifactType: ArtifactType;
    content: {
      language?: string;
      sourceCode?: string;
      filename?: string;
    };
    fileTable?: FileEntry[];
    relatedPhaseId?: string;
    relatedSolutionId?: string;
    relatedRequirementIds?: string[];
    tags?: Tag[];
  };
}

export interface GetArtifactInput {
  planId: string;
  artifactId: string;
}

export interface UpdateArtifactInput {
  planId: string;
  artifactId: string;
  updates: Partial<{
    title: string;
    description: string;
    status: ArtifactStatus;
    content: {
      language?: string;
      sourceCode?: string;
      filename?: string;
    };
    fileTable: FileEntry[];
    relatedPhaseId: string;
    relatedSolutionId: string;
    relatedRequirementIds: string[];
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
}

export interface DeleteArtifactInput {
  planId: string;
  artifactId: string;
}

// Output types
export interface AddArtifactResult {
  artifactId: string;
  artifact: Artifact;
}

export interface GetArtifactResult {
  artifact: Artifact;
}

export interface UpdateArtifactResult {
  success: boolean;
  artifact: Artifact;
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

  async addArtifact(input: AddArtifactInput): Promise<AddArtifactResult> {
    await this.ensurePlanExists(input.planId);

    // Validate inputs
    validateArtifactType(input.artifact.artifactType);
    validateTags(input.artifact.tags || []);
    if (input.artifact.fileTable) {
      validateFileTable(input.artifact.fileTable);
    }

    const artifacts = await this.storage.loadEntities<Artifact>(input.planId, 'artifacts');
    const artifactId = uuidv4();
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
      artifactType: input.artifact.artifactType,
      status: 'draft',
      content: {
        language: input.artifact.content.language,
        sourceCode: input.artifact.content.sourceCode,
        filename: input.artifact.content.filename,
      },
      fileTable: input.artifact.fileTable,
      relatedPhaseId: input.artifact.relatedPhaseId,
      relatedSolutionId: input.artifact.relatedSolutionId,
      relatedRequirementIds: input.artifact.relatedRequirementIds,
    };

    artifacts.push(artifact);
    await this.storage.saveEntities(input.planId, 'artifacts', artifacts);
    await this.planService.updateStatistics(input.planId);

    return { artifactId, artifact };
  }

  async getArtifact(input: GetArtifactInput): Promise<GetArtifactResult> {
    await this.ensurePlanExists(input.planId);

    const artifacts = await this.storage.loadEntities<Artifact>(input.planId, 'artifacts');
    const artifact = artifacts.find((a) => a.id === input.artifactId);

    if (!artifact) {
      throw new Error('Artifact not found');
    }

    return { artifact };
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

    const artifacts = await this.storage.loadEntities<Artifact>(input.planId, 'artifacts');
    const index = artifacts.findIndex((a) => a.id === input.artifactId);

    if (index === -1) {
      throw new Error('Artifact not found');
    }

    const artifact = artifacts[index];
    const now = new Date().toISOString();

    if (input.updates.title !== undefined) artifact.title = input.updates.title;
    if (input.updates.description !== undefined) artifact.description = input.updates.description;
    if (input.updates.status !== undefined) artifact.status = input.updates.status;
    if (input.updates.content !== undefined) {
      artifact.content = { ...artifact.content, ...input.updates.content };
    }
    if (input.updates.fileTable !== undefined) artifact.fileTable = input.updates.fileTable;
    if (input.updates.relatedPhaseId !== undefined) artifact.relatedPhaseId = input.updates.relatedPhaseId;
    if (input.updates.relatedSolutionId !== undefined) artifact.relatedSolutionId = input.updates.relatedSolutionId;
    if (input.updates.relatedRequirementIds !== undefined) artifact.relatedRequirementIds = input.updates.relatedRequirementIds;
    if (input.updates.tags !== undefined) artifact.metadata.tags = input.updates.tags;

    artifact.updatedAt = now;
    artifact.version += 1;
    artifacts[index] = artifact;

    await this.storage.saveEntities(input.planId, 'artifacts', artifacts);

    return { success: true, artifact };
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

    return {
      artifacts,
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
