import { v4 as uuidv4 } from 'uuid';
import type { FileStorage } from '../../infrastructure/file-storage.js';
import type { PlanService } from './plan-service.js';
import type { Phase, PhaseStatus, EffortEstimate, Tag, Milestone, CodeExample } from '../entities/types.js';
import { validateEffortEstimate, validateTags, validateCodeExamples } from './validators.js';

// Input types
export interface AddPhaseInput {
  planId: string;
  phase: {
    title: string;
    description: string;
    objectives: string[];
    deliverables: string[];
    successCriteria: string[];
    parentId?: string | null;
    order?: number;
    estimatedEffort?: EffortEstimate; // Direct field for API convenience
    schedule?: {
      estimatedEffort: EffortEstimate;
    };
    tags?: Tag[];
    implementationNotes?: string;
    codeExamples?: CodeExample[];
  };
}

export interface UpdatePhaseInput {
  planId: string;
  phaseId: string;
  updates: Partial<{
    title: string;
    description: string;
    objectives: string[];
    deliverables: string[];
    successCriteria: string[];
    status: PhaseStatus;
    blockingReason: string;
    progress: number;
    schedule: {
      actualEffort?: number;
      startedAt?: string;
      completedAt?: string;
    };
    milestones: Milestone[];
    tags: Tag[];
    implementationNotes: string;
    codeExamples: CodeExample[];
  }>;
}

export interface MovePhaseInput {
  planId: string;
  phaseId: string;
  newParentId?: string | null;
  newOrder?: number;
}

export interface GetPhaseInput {
  planId: string;
  phaseId: string;
}

export interface GetPhaseResult {
  phase: Phase;
}

export interface GetPhaseTreeInput {
  planId: string;
  rootPhaseId?: string;
  includeCompleted?: boolean;
}

export interface DeletePhaseInput {
  planId: string;
  phaseId: string;
  deleteChildren?: boolean;
}

export interface UpdatePhaseStatusInput {
  planId: string;
  phaseId: string;
  status: PhaseStatus;
  progress?: number;
  actualEffort?: number;
  notes?: string;
}

export interface GetNextActionsInput {
  planId: string;
  limit?: number;
}

export interface NextAction {
  phaseId: string;
  phaseTitle: string;
  phasePath: string;
  action: 'start' | 'continue' | 'unblock' | 'complete';
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

export interface GetNextActionsResult {
  actions: NextAction[];
  summary: {
    totalPending: number;
    totalInProgress: number;
    totalBlocked: number;
  };
}

// Output types
export interface PhaseTreeNode {
  phase: Phase;
  children: PhaseTreeNode[];
  depth: number;
  hasChildren: boolean;
}

export interface AddPhaseResult {
  phaseId: string;
  phase: Phase;
}

export interface UpdatePhaseResult {
  success: boolean;
  phase: Phase;
}

export interface MovePhaseResult {
  success: boolean;
  phase: Phase;
  affectedPhases: Phase[];
}

export interface GetPhaseTreeResult {
  tree: PhaseTreeNode[];
}

export interface DeletePhaseResult {
  success: boolean;
  message: string;
  deletedPhaseIds: string[];
}

export interface UpdatePhaseStatusResult {
  success: boolean;
  phase: Phase;
  autoUpdatedTimestamps: {
    startedAt?: string;
    completedAt?: string;
  };
}

export class PhaseService {
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

  async getPhase(input: GetPhaseInput): Promise<GetPhaseResult> {
    await this.ensurePlanExists(input.planId);

    const phases = await this.storage.loadEntities<Phase>(input.planId, 'phases');
    const phase = phases.find((p) => p.id === input.phaseId);

    if (!phase) {
      throw new Error('Phase not found');
    }

    return { phase };
  }

  async addPhase(input: AddPhaseInput): Promise<AddPhaseResult> {
    // Validate estimatedEffort format (support both direct and schedule.estimatedEffort)
    const effort = input.phase.estimatedEffort ?? input.phase.schedule?.estimatedEffort;
    validateEffortEstimate(effort, 'estimatedEffort');
    // Validate tags format
    validateTags(input.phase.tags || []);
    // Validate codeExamples format
    validateCodeExamples(input.phase.codeExamples || []);

    const phases = await this.storage.loadEntities<Phase>(input.planId, 'phases');
    const phaseId = uuidv4();
    const now = new Date().toISOString();

    // Calculate hierarchy
    const parentId = input.phase.parentId === undefined ? null : input.phase.parentId;
    const siblings = phases.filter((p) => p.parentId === parentId);
    const order = input.phase.order ?? siblings.length + 1;

    let depth = 0;
    let path = String(order);

    if (parentId) {
      const parent = phases.find((p) => p.id === parentId);
      if (!parent) {
        throw new Error('Parent phase not found');
      }
      depth = parent.depth + 1;
      path = `${parent.path}.${order}`;
    }

    const phase: Phase = {
      id: phaseId,
      type: 'phase',
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {
        createdBy: 'claude-code',
        tags: input.phase.tags || [],
        annotations: [],
      },
      title: input.phase.title,
      description: input.phase.description,
      parentId,
      order,
      depth,
      path,
      objectives: input.phase.objectives,
      deliverables: input.phase.deliverables,
      successCriteria: input.phase.successCriteria,
      schedule: {
        estimatedEffort: effort || { value: 0, unit: 'hours', confidence: 'low' },
      },
      status: 'planned',
      progress: 0,
      implementationNotes: input.phase.implementationNotes,
      codeExamples: input.phase.codeExamples,
    };

    phases.push(phase);
    await this.storage.saveEntities(input.planId, 'phases', phases);
    await this.planService.updateStatistics(input.planId);

    return { phaseId, phase };
  }

  async updatePhase(input: UpdatePhaseInput): Promise<UpdatePhaseResult> {
    const phases = await this.storage.loadEntities<Phase>(input.planId, 'phases');
    const index = phases.findIndex((p) => p.id === input.phaseId);

    if (index === -1) {
      throw new Error('Phase not found');
    }

    const phase = phases[index];
    const now = new Date().toISOString();

    if (input.updates.title !== undefined) phase.title = input.updates.title;
    if (input.updates.description !== undefined) phase.description = input.updates.description;
    if (input.updates.objectives !== undefined) phase.objectives = input.updates.objectives;
    if (input.updates.deliverables !== undefined) phase.deliverables = input.updates.deliverables;
    if (input.updates.successCriteria !== undefined)
      phase.successCriteria = input.updates.successCriteria;
    if (input.updates.status !== undefined) phase.status = input.updates.status;
    if (input.updates.progress !== undefined) phase.progress = input.updates.progress;
    if (input.updates.schedule !== undefined) {
      phase.schedule = { ...phase.schedule, ...input.updates.schedule };
    }
    if (input.updates.milestones !== undefined) phase.milestones = input.updates.milestones;
    if (input.updates.tags !== undefined) {
      validateTags(input.updates.tags);
      phase.metadata.tags = input.updates.tags;
    }
    if (input.updates.implementationNotes !== undefined) {
      phase.implementationNotes = input.updates.implementationNotes;
    }
    if (input.updates.codeExamples !== undefined) {
      validateCodeExamples(input.updates.codeExamples);
      phase.codeExamples = input.updates.codeExamples;
    }

    phase.updatedAt = now;
    phase.version += 1;
    phases[index] = phase;

    await this.storage.saveEntities(input.planId, 'phases', phases);

    return { success: true, phase };
  }

  async movePhase(input: MovePhaseInput): Promise<MovePhaseResult> {
    const phases = await this.storage.loadEntities<Phase>(input.planId, 'phases');
    const index = phases.findIndex((p) => p.id === input.phaseId);

    if (index === -1) {
      throw new Error('Phase not found');
    }

    const phase = phases[index];
    const now = new Date().toISOString();
    const affectedPhases: Phase[] = [];

    // Update parent if specified
    if (input.newParentId !== undefined) {
      phase.parentId = input.newParentId;

      if (input.newParentId) {
        const parent = phases.find((p) => p.id === input.newParentId);
        if (!parent) throw new Error('New parent not found');
        phase.depth = parent.depth + 1;
      } else {
        phase.depth = 0;
      }
    }

    // Update order if specified
    if (input.newOrder !== undefined) {
      phase.order = input.newOrder;
    }

    // Recalculate path
    if (phase.parentId) {
      const parent = phases.find((p) => p.id === phase.parentId);
      phase.path = `${parent!.path}.${phase.order}`;
    } else {
      phase.path = String(phase.order);
    }

    // Update children paths recursively
    const updateChildrenPaths = (parentId: string, parentPath: string) => {
      const children = phases.filter((p) => p.parentId === parentId);
      for (const child of children) {
        child.path = `${parentPath}.${child.order}`;
        child.depth = parentPath.split('.').length;
        child.updatedAt = now;
        affectedPhases.push(child);
        updateChildrenPaths(child.id, child.path);
      }
    };

    updateChildrenPaths(phase.id, phase.path);

    phase.updatedAt = now;
    phase.version += 1;
    phases[index] = phase;

    await this.storage.saveEntities(input.planId, 'phases', phases);

    return { success: true, phase, affectedPhases };
  }

  async getPhaseTree(input: GetPhaseTreeInput): Promise<GetPhaseTreeResult> {
    let phases = await this.storage.loadEntities<Phase>(input.planId, 'phases');

    if (input.includeCompleted === false) {
      phases = phases.filter((p) => p.status !== 'completed');
    }

    const buildTree = (parentId: string | null, depth: number): PhaseTreeNode[] => {
      return phases
        .filter((p) => p.parentId === parentId)
        .sort((a, b) => a.order - b.order)
        .map((phase) => {
          const children = buildTree(phase.id, depth + 1);
          return {
            phase,
            children,
            depth,
            hasChildren: children.length > 0,
          };
        });
    };

    const rootId = input.rootPhaseId || null;
    const tree = buildTree(rootId, 0);

    return { tree };
  }

  async deletePhase(input: DeletePhaseInput): Promise<DeletePhaseResult> {
    const phases = await this.storage.loadEntities<Phase>(input.planId, 'phases');
    const deletedIds: string[] = [];

    const collectChildren = (parentId: string) => {
      const children = phases.filter((p) => p.parentId === parentId);
      for (const child of children) {
        deletedIds.push(child.id);
        collectChildren(child.id);
      }
    };

    const index = phases.findIndex((p) => p.id === input.phaseId);
    if (index === -1) {
      throw new Error('Phase not found');
    }

    deletedIds.push(input.phaseId);

    if (input.deleteChildren) {
      collectChildren(input.phaseId);
    }

    const remaining = phases.filter((p) => !deletedIds.includes(p.id));
    await this.storage.saveEntities(input.planId, 'phases', remaining);
    await this.planService.updateStatistics(input.planId);

    return {
      success: true,
      message: `Deleted ${deletedIds.length} phase(s)`,
      deletedPhaseIds: deletedIds,
    };
  }

  async updatePhaseStatus(input: UpdatePhaseStatusInput): Promise<UpdatePhaseStatusResult> {
    const phases = await this.storage.loadEntities<Phase>(input.planId, 'phases');
    const index = phases.findIndex((p) => p.id === input.phaseId);

    if (index === -1) {
      throw new Error('Phase not found');
    }

    const phase = phases[index];
    const now = new Date().toISOString();
    const autoUpdated: { startedAt?: string; completedAt?: string } = {};

    // Auto-set timestamps based on status transition
    if (input.status === 'in_progress' && phase.status === 'planned') {
      phase.startedAt = now;
      autoUpdated.startedAt = now;
    }

    if (input.status === 'completed') {
      phase.completedAt = now;
      phase.progress = 100;
      autoUpdated.completedAt = now;
    }

    if (input.status === 'blocked' && !input.notes) {
      throw new Error('Notes required when setting status to blocked');
    }

    phase.status = input.status;

    if (input.progress !== undefined) {
      phase.progress = input.progress;
    }

    if (input.actualEffort !== undefined) {
      phase.schedule.actualEffort = input.actualEffort;
    }

    if (input.notes) {
      phase.metadata.annotations.push({
        id: uuidv4(),
        text: input.notes,
        author: 'claude-code',
        createdAt: now,
      });
    }

    phase.updatedAt = now;
    phase.version += 1;
    phases[index] = phase;

    await this.storage.saveEntities(input.planId, 'phases', phases);
    await this.planService.updateStatistics(input.planId);

    return {
      success: true,
      phase,
      autoUpdatedTimestamps: autoUpdated,
    };
  }

  async getNextActions(input: GetNextActionsInput): Promise<GetNextActionsResult> {
    const phases = await this.storage.loadEntities<Phase>(input.planId, 'phases');
    const limit = input.limit || 5;
    const actions: NextAction[] = [];

    // Collect stats
    const planned = phases.filter((p) => p.status === 'planned');
    const inProgress = phases.filter((p) => p.status === 'in_progress');
    const blocked = phases.filter((p) => p.status === 'blocked');

    // Priority 1: Blocked phases need attention
    for (const phase of blocked) {
      if (actions.length >= limit) break;
      actions.push({
        phaseId: phase.id,
        phaseTitle: phase.title,
        phasePath: phase.path,
        action: 'unblock',
        reason: 'Phase is blocked and needs resolution',
        priority: 'high',
      });
    }

    // Priority 2: In-progress phases near completion
    for (const phase of inProgress.sort((a, b) => b.progress - a.progress)) {
      if (actions.length >= limit) break;
      if (phase.progress >= 80) {
        actions.push({
          phaseId: phase.id,
          phaseTitle: phase.title,
          phasePath: phase.path,
          action: 'complete',
          reason: `Phase is ${phase.progress}% complete`,
          priority: 'medium',
        });
      } else {
        actions.push({
          phaseId: phase.id,
          phaseTitle: phase.title,
          phasePath: phase.path,
          action: 'continue',
          reason: `Phase is ${phase.progress}% complete`,
          priority: 'medium',
        });
      }
    }

    // Priority 3: Planned phases ready to start (no blocking dependencies)
    const readyToStart = planned
      .filter((p) => {
        // A phase is ready if it has no parent or parent is completed
        if (!p.parentId) return true;
        const parent = phases.find((x) => x.id === p.parentId);
        return !parent || parent.status === 'completed' || parent.status === 'in_progress';
      })
      .sort((a, b) => a.path.localeCompare(b.path));

    for (const phase of readyToStart) {
      if (actions.length >= limit) break;
      actions.push({
        phaseId: phase.id,
        phaseTitle: phase.title,
        phasePath: phase.path,
        action: 'start',
        reason: 'Phase is ready to begin',
        priority: 'low',
      });
    }

    return {
      actions,
      summary: {
        totalPending: planned.length,
        totalInProgress: inProgress.length,
        totalBlocked: blocked.length,
      },
    };
  }
}

export default PhaseService;
