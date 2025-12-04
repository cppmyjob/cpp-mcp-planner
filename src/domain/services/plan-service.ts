import { v4 as uuidv4 } from 'uuid';
import type { FileStorage } from '../../infrastructure/file-storage.js';
import type {
  PlanManifest,
  Plan,
  PlanStatus,
  Requirement,
  Solution,
  Decision,
  Phase,
  Artifact,
  Link,
} from '../entities/types.js';

// Input types
export interface CreatePlanInput {
  name: string;
  description: string;
  author?: string;
}

export interface ListPlansInput {
  status?: PlanStatus;
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'updated_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface GetPlanInput {
  planId: string;
  includeEntities?: boolean;
  entityTypes?: ('requirement' | 'solution' | 'decision' | 'phase' | 'artifact')[];
}

export interface UpdatePlanInput {
  planId: string;
  updates: {
    name?: string;
    description?: string;
    status?: PlanStatus;
  };
}

export interface ArchivePlanInput {
  planId: string;
  permanent?: boolean;
}

export interface SetActivePlanInput {
  planId: string;
  workspacePath?: string;
}

export interface GetActivePlanInput {
  workspacePath?: string;
}

// Output types
export interface CreatePlanResult {
  planId: string;
}

export interface ListPlansResult {
  plans: Array<{
    id: string;
    name: string;
    description: string;
    status: PlanStatus;
    createdAt: string;
    updatedAt: string;
    statistics: PlanManifest['statistics'];
  }>;
  total: number;
  hasMore: boolean;
}

export interface GetPlanResult {
  plan: {
    manifest: PlanManifest;
    entities?: {
      requirements: Requirement[];
      solutions: Solution[];
      decisions: Decision[];
      phases: Phase[];
      artifacts: Artifact[];
    };
    links?: Link[];
  };
}

export interface UpdatePlanResult {
  success: boolean;
  planId: string;
}

export interface ArchivePlanResult {
  success: boolean;
  message: string;
}

export interface SetActivePlanResult {
  success: boolean;
  activePlan: {
    planId: string;
    planName: string;
    workspacePath: string;
  };
}

export interface GetActivePlanResult {
  activePlan: {
    planId: string;
    plan: PlanManifest;
    lastUpdated: string;
  } | null;
}

export class PlanService {
  constructor(private storage: FileStorage) {}

  async createPlan(input: CreatePlanInput): Promise<CreatePlanResult> {
    const planId = uuidv4();
    const now = new Date().toISOString();

    const manifest: PlanManifest = {
      id: planId,
      name: input.name,
      description: input.description,
      status: 'active',
      author: input.author || 'claude-code',
      createdAt: now,
      updatedAt: now,
      version: 1,
      lockVersion: 1,
      statistics: {
        totalRequirements: 0,
        totalSolutions: 0,
        totalDecisions: 0,
        totalPhases: 0,
        totalArtifacts: 0,
        completionPercentage: 0,
      },
    };

    await this.storage.createPlanDirectory(planId);
    await this.storage.saveManifest(planId, manifest);

    // Initialize empty entity files
    await this.storage.saveEntities(planId, 'requirements', []);
    await this.storage.saveEntities(planId, 'solutions', []);
    await this.storage.saveEntities(planId, 'decisions', []);
    await this.storage.saveEntities(planId, 'phases', []);
    await this.storage.saveEntities(planId, 'artifacts', []);
    await this.storage.saveLinks(planId, []);

    return {
      planId,
    };
  }

  async listPlans(input: ListPlansInput): Promise<ListPlansResult> {
    const planIds = await this.storage.listPlans();
    const manifests: PlanManifest[] = [];

    for (const planId of planIds) {
      try {
        const manifest = await this.storage.loadManifest(planId);
        manifests.push(manifest);
      } catch {
        // Skip invalid plans
      }
    }

    // Filter by status
    let filtered = input.status
      ? manifests.filter((m) => m.status === input.status)
      : manifests;

    // Sort
    const sortBy = input.sortBy || 'updated_at';
    const sortOrder = input.sortOrder || 'desc';

    filtered.sort((a, b) => {
      let valueA: string | number;
      let valueB: string | number;

      if (sortBy === 'name') {
        valueA = a.name.toLowerCase();
        valueB = b.name.toLowerCase();
      } else if (sortBy === 'created_at') {
        valueA = a.createdAt;
        valueB = b.createdAt;
      } else {
        valueA = a.updatedAt;
        valueB = b.updatedAt;
      }

      if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Pagination
    const total = filtered.length;
    const offset = input.offset || 0;
    const limit = input.limit || 50;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      plans: paginated.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        status: m.status,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        statistics: m.statistics,
      })),
      total,
      hasMore: offset + limit < total,
    };
  }

  async getPlan(input: GetPlanInput): Promise<GetPlanResult> {
    const exists = await this.storage.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const manifest = await this.storage.loadManifest(input.planId);

    const result: GetPlanResult = {
      plan: { manifest },
    };

    if (input.includeEntities) {
      result.plan.entities = {
        requirements: await this.storage.loadEntities<Requirement>(
          input.planId,
          'requirements'
        ),
        solutions: await this.storage.loadEntities<Solution>(
          input.planId,
          'solutions'
        ),
        decisions: await this.storage.loadEntities<Decision>(
          input.planId,
          'decisions'
        ),
        phases: await this.storage.loadEntities<Phase>(input.planId, 'phases'),
        artifacts: await this.storage.loadEntities<Artifact>(input.planId, 'artifacts'),
      };
      result.plan.links = await this.storage.loadLinks(input.planId);
    }

    return result;
  }

  async updatePlan(input: UpdatePlanInput): Promise<UpdatePlanResult> {
    const exists = await this.storage.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const manifest = await this.storage.loadManifest(input.planId);
    const now = new Date().toISOString();

    // Apply updates
    if (input.updates.name !== undefined) {
      manifest.name = input.updates.name;
    }
    if (input.updates.description !== undefined) {
      manifest.description = input.updates.description;
    }
    if (input.updates.status !== undefined) {
      manifest.status = input.updates.status;
    }

    manifest.updatedAt = now;
    manifest.version += 1;

    await this.storage.saveManifest(input.planId, manifest);

    return {
      success: true,
      planId: input.planId,
    };
  }

  async archivePlan(input: ArchivePlanInput): Promise<ArchivePlanResult> {
    const exists = await this.storage.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    if (input.permanent) {
      await this.storage.deletePlan(input.planId);
      return {
        success: true,
        message: 'Plan permanently deleted',
      };
    }

    // Soft delete - just change status
    await this.updatePlan({
      planId: input.planId,
      updates: { status: 'archived' },
    });

    return {
      success: true,
      message: 'Plan archived',
    };
  }

  async setActivePlan(input: SetActivePlanInput): Promise<SetActivePlanResult> {
    const exists = await this.storage.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const manifest = await this.storage.loadManifest(input.planId);
    const workspacePath = input.workspacePath || process.cwd();
    const now = new Date().toISOString();

    const activePlans = await this.storage.loadActivePlans();
    activePlans[workspacePath] = {
      planId: input.planId,
      lastUpdated: now,
    };

    await this.storage.saveActivePlans(activePlans);

    return {
      success: true,
      activePlan: {
        planId: input.planId,
        planName: manifest.name,
        workspacePath,
      },
    };
  }

  async getActivePlan(input: GetActivePlanInput): Promise<GetActivePlanResult> {
    const workspacePath = input.workspacePath || process.cwd();
    const activePlans = await this.storage.loadActivePlans();

    const mapping = activePlans[workspacePath];
    if (!mapping) {
      return { activePlan: null };
    }

    try {
      const manifest = await this.storage.loadManifest(mapping.planId);
      return {
        activePlan: {
          planId: mapping.planId,
          plan: manifest,
          lastUpdated: mapping.lastUpdated,
        },
      };
    } catch {
      // Plan was deleted, clear mapping
      delete activePlans[workspacePath];
      await this.storage.saveActivePlans(activePlans);
      return { activePlan: null };
    }
  }

  // Helper to update statistics
  async updateStatistics(planId: string): Promise<void> {
    const manifest = await this.storage.loadManifest(planId);

    const requirements = await this.storage.loadEntities<Requirement>(
      planId,
      'requirements'
    );
    const solutions = await this.storage.loadEntities<Solution>(
      planId,
      'solutions'
    );
    const decisions = await this.storage.loadEntities<Decision>(
      planId,
      'decisions'
    );
    const phases = await this.storage.loadEntities<Phase>(planId, 'phases');
    const artifacts = await this.storage.loadEntities<Artifact>(planId, 'artifacts');

    manifest.statistics.totalRequirements = requirements.length;
    manifest.statistics.totalSolutions = solutions.length;
    manifest.statistics.totalDecisions = decisions.length;
    manifest.statistics.totalPhases = phases.length;
    manifest.statistics.totalArtifacts = artifacts.length;

    // Calculate completion percentage
    if (phases.length > 0) {
      const completedPhases = phases.filter(
        (p) => p.status === 'completed'
      ).length;
      manifest.statistics.completionPercentage = Math.round(
        (completedPhases / phases.length) * 100
      );
    }

    manifest.updatedAt = new Date().toISOString();
    await this.storage.saveManifest(planId, manifest);
  }
}

export default PlanService;
