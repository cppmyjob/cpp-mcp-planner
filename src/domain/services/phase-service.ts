import { v4 as uuidv4 } from 'uuid';
import type { RepositoryFactory } from '../../infrastructure/factory/repository-factory.js';
import type { PlanService } from './plan-service.js';
import type { VersionHistoryService } from './version-history-service.js';
import type { Phase, PhaseStatus, EffortEstimate, Tag, Milestone, PhasePriority, VersionHistory, VersionDiff } from '../entities/types.js';
import { validateEffortEstimate, validateTags, validatePriority, validateRequiredString, validateRequiredEnum } from './validators.js';
import { filterPhase } from '../utils/field-filter.js';
import { bulkUpdateEntities } from '../utils/bulk-operations.js';

// Constants
const MAX_PHASES_BATCH_SIZE = 100;
const PROGRESS_COMPLETE = 100;
const PROGRESS_NEAR_COMPLETE = 80; // 80% progress threshold for "almost done"
const DEFAULT_NEXT_ACTIONS_LIMIT = 5;
const PRIORITY_CRITICAL = 0;
const PRIORITY_HIGH = 1;
const PRIORITY_MEDIUM = 2;
const PRIORITY_LOW = 3;

/**
 * Calculate the next valid order for a phase.
 *
 * - If explicitOrder is provided, validates it doesn't conflict with existing siblings
 * - Otherwise, calculates next order based on max existing sibling order (not count!)
 *   This prevents duplicate paths when phases are deleted creating gaps in the sequence.
 *
 * @param siblings - Array of existing sibling phases (same parentId)
 * @param explicitOrder - Optional explicit order value provided by user
 * @returns The validated order value to use
 * @throws Error if explicit order conflicts with existing sibling
 */
function calculateNextOrder(siblings: Phase[], explicitOrder?: number): number {
  const maxSiblingOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) : 0;

  if (explicitOrder !== undefined) {
    const conflicting = siblings.find((s) => s.order === explicitOrder);
    if (conflicting) {
      throw new Error(
        `Order ${String(explicitOrder)} already exists for sibling phase "${conflicting.title}". ` +
          `Use a different order value or omit to auto-generate.`
      );
    }
    return explicitOrder;
  }

  return maxSiblingOrder + 1;
}

// Input types
export interface AddPhaseInput {
  planId: string;
  phase: {
    title: string;  // REQUIRED
    description?: string;  // Optional - default: ''
    objectives?: string[];  // Optional - default: []
    deliverables?: string[];  // Optional - default: []
    successCriteria?: string[];  // Optional - default: []
    parentId?: string | null;  // Optional - default: null (root phase)
    order?: number;
    estimatedEffort?: EffortEstimate;  // Optional - default: {value:0, unit:'hours', confidence:'low'}
    schedule?: {
      estimatedEffort: EffortEstimate;
    };
    tags?: Tag[];  // Optional - default: []
    implementationNotes?: string;  // undefined OK
    priority?: PhasePriority;  // Optional - default: 'medium'
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
    priority: PhasePriority;
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
  fields?: string[]; // Fields to include: summary (default), ['*'] (all), or custom list
  excludeMetadata?: boolean; // Exclude metadata fields (createdAt, updatedAt, version, metadata)
  excludeComputed?: boolean; // Exclude computed fields (depth, path, childCount)
}

export interface GetPhaseResult {
  phase: Phase;
}

export interface GetPhasesInput {
  planId: string;
  phaseIds: string[];
  fields?: string[]; // Fields to include: summary (default), ['*'] (all), or custom list
  excludeMetadata?: boolean; // Exclude metadata fields
  excludeComputed?: boolean; // Exclude computed fields
}

export interface GetPhasesResult {
  phases: Phase[];
  notFound: string[]; // IDs that were not found
}

export interface GetPhaseTreeInput {
  planId: string;
  rootPhaseId?: string;
  includeCompleted?: boolean;
  fields?: string[];  // Summary by default; ['*'] for all, or specific fields
  maxDepth?: number;  // Limit tree depth (0 = root only)
  excludeMetadata?: boolean; // Exclude metadata fields (createdAt, updatedAt, version, metadata)
  excludeComputed?: boolean; // Exclude computed fields (depth, path, childCount)
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

export interface CompleteAndAdvanceInput {
  planId: string;
  phaseId: string;
  actualEffort?: number;
  notes?: string;
}

export interface CompleteAndAdvanceResult {
  completedPhaseId: string;
  nextPhaseId: string | null;
  success: true;
}

// Sprint 5: Array Field Operations interfaces
export type PhaseArrayField = 'objectives' | 'deliverables' | 'successCriteria';

export interface ArrayAppendInput {
  planId: string;
  phaseId: string;
  field: PhaseArrayField;
  value: string;
}

export interface ArrayPrependInput {
  planId: string;
  phaseId: string;
  field: PhaseArrayField;
  value: string;
}

export interface ArrayInsertAtInput {
  planId: string;
  phaseId: string;
  field: PhaseArrayField;
  index: number;
  value: string;
}

export interface ArrayUpdateAtInput {
  planId: string;
  phaseId: string;
  field: PhaseArrayField;
  index: number;
  value: string;
}

export interface ArrayRemoveAtInput {
  planId: string;
  phaseId: string;
  field: PhaseArrayField;
  index: number;
}

export interface BulkUpdatePhasesInput {
  planId: string;
  updates: {
    phaseId: string;
    updates: Partial<{
      title: string;
      description: string;
      objectives: string[];
      deliverables: string[];
      successCriteria: string[];
      implementationNotes: string;
      estimatedEffort: {
        value: number;
        unit: 'hours' | 'days' | 'weeks' | 'story-points' | 'minutes';
        confidence: 'low' | 'medium' | 'high';
      };
      actualEffort: {
        value: number;
        unit: 'hours' | 'days' | 'weeks' | 'story-points' | 'minutes';
      };
      schedule: {
        startDate: string;
        endDate: string;
        milestones: { date: string; description: string }[];
      };
      status: string;
      progress: number;
      priority: 'critical' | 'high' | 'medium' | 'low';
      blockers: { description: string; severity: 'high' | 'medium' | 'low' }[];
    }>;
  }[];
  atomic?: boolean;
}

export interface BulkUpdatePhasesResult {
  updated: number;
  failed: number;
  results: {
    phaseId: string;
    success: boolean;
    error?: string;
  }[];
}

export interface ArrayOperationResult {
  success: true;
  field: PhaseArrayField;
  newLength: number;
}

// Summary phase contains only essential fields for tree navigation
export interface PhaseSummary {
  id: string;
  title: string;
  status: string;
  progress: number;
  path: string;
  childCount: number;
  // Additional fields when requested via fields parameter
  [key: string]: unknown;
}

// Output types
export interface PhaseTreeNode {
  phase: Phase | PhaseSummary;
  children: PhaseTreeNode[];
  depth: number;
  hasChildren: boolean;
}

export interface AddPhaseResult {
  phaseId: string;
}

export interface UpdatePhaseResult {
  success: boolean;
  phaseId: string;
}

export interface MovePhaseResult {
  success: boolean;
  phaseId: string;
  affectedPhaseIds?: string[];
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
  phaseId: string;
}

export class PhaseService {
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

  public async getPhase(input: GetPhaseInput): Promise<GetPhaseResult> {
    await this.ensurePlanExists(input.planId);

    const repo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);
    const phases = await repo.findAll();
    const phase = phases.find((p) => p.id === input.phaseId);

    if (!phase) {
      throw new Error('Phase not found');
    }

    // Apply field filtering with Lazy-Load support
    const filtered = filterPhase(
      phase,
      input.fields,
      input.excludeMetadata,
      input.excludeComputed
    ) as Phase;

    return { phase: filtered };
  }

  public async getPhases(input: GetPhasesInput): Promise<GetPhasesResult> {
    await this.ensurePlanExists(input.planId);

    // Enforce max limit
    if (input.phaseIds.length > MAX_PHASES_BATCH_SIZE) {
      throw new Error(`Cannot fetch more than ${String(MAX_PHASES_BATCH_SIZE)} phases at once`);
    }

    // Handle empty array
    if (input.phaseIds.length === 0) {
      return { phases: [], notFound: [] };
    }

    const repo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);
    const allPhases = await repo.findAll();
    const foundPhases: Phase[] = [];
    const notFound: string[] = [];

    // Collect found and not found IDs
    for (const id of input.phaseIds) {
      const phase = allPhases.find((p) => p.id === id);
      if (phase) {
        // Apply field filtering with Lazy-Load
        const filtered = filterPhase(
          phase,
          input.fields,
          input.excludeMetadata,
          input.excludeComputed
        ) as Phase;
        foundPhases.push(filtered);
      } else {
        notFound.push(id);
      }
    }

    return { phases: foundPhases, notFound };
  }

  public async addPhase(input: AddPhaseInput): Promise<AddPhaseResult> {
    // Validate REQUIRED fields
    validateRequiredString(input.phase.title, 'title');

    // Validate estimatedEffort format (support both direct and schedule.estimatedEffort)
    const effort = input.phase.estimatedEffort ?? input.phase.schedule?.estimatedEffort;
    validateEffortEstimate(effort, 'estimatedEffort');
    // Validate tags format
    validateTags(input.phase.tags ?? []);
    // Validate priority if provided
    if (input.phase.priority !== undefined) {
      validatePriority(input.phase.priority);
    }

    const repo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);
    const phases = await repo.findAll();
    const phaseId = uuidv4();
    const now = new Date().toISOString();

    // Calculate hierarchy
    const parentId = input.phase.parentId === undefined ? null : input.phase.parentId;
    const siblings = phases.filter((p) => p.parentId === parentId);
    const order = calculateNextOrder(siblings, input.phase.order);

    let depth = 0;
    let path = String(order);

    if (parentId !== null && parentId !== '') {
      const parent = phases.find((p) => p.id === parentId);
      if (!parent) {
        throw new Error('Parent phase not found');
      }
      depth = parent.depth + 1;
      path = `${parent.path}.${String(order)}`;
    }

    const phase: Phase = {
      id: phaseId,
      type: 'phase',
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {
        createdBy: 'claude-code',
        tags: input.phase.tags ?? [],
        annotations: [],
      },
      title: input.phase.title,  // REQUIRED
      description: input.phase.description ?? '',  // DEFAULT: empty string
      parentId,
      order,
      depth,
      path,
      objectives: input.phase.objectives ?? [],  // DEFAULT: empty array
      deliverables: input.phase.deliverables ?? [],  // DEFAULT: empty array
      successCriteria: input.phase.successCriteria ?? [],  // DEFAULT: empty array
      schedule: {
        estimatedEffort: effort ?? { value: 0, unit: 'hours', confidence: 'low' },
      },
      status: 'planned',
      progress: 0,
      implementationNotes: input.phase.implementationNotes,
      priority: input.phase.priority ?? 'medium',
    };

    await repo.create(phase);
    await this.planService.updateStatistics(input.planId);

    return { phaseId };
  }

  public async updatePhase(input: UpdatePhaseInput): Promise<UpdatePhaseResult> {
    const repo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);
    const phases = await repo.findAll();
    const index = phases.findIndex((p) => p.id === input.phaseId);

    if (index === -1) {
      throw new Error('Phase not found');
    }

    const phase = phases[index];

    // Sprint 7: Save current version to history BEFORE updating
    if (this.versionHistoryService) {
      const currentSnapshot = JSON.parse(JSON.stringify(phase)) as Phase;
      await this.versionHistoryService.saveVersion(
        input.planId,
        input.phaseId,
        'phase',
        currentSnapshot,
        phase.version,
        'claude-code',
        'Auto-saved before update'
      );
    }

    // BUG #18: Validate title if provided in updates
    if (input.updates.title !== undefined) {
      validateRequiredString(input.updates.title, 'title');
      phase.title = input.updates.title;
    }
    if (input.updates.description !== undefined) phase.description = input.updates.description;
    if (input.updates.objectives !== undefined) phase.objectives = input.updates.objectives;
    if (input.updates.deliverables !== undefined) phase.deliverables = input.updates.deliverables;
    if (input.updates.successCriteria !== undefined)
      phase.successCriteria = input.updates.successCriteria;
    // BUGS #16, #17, #19: Validate status if provided in updates
    if (input.updates.status !== undefined) {
      validateRequiredEnum(
        input.updates.status,
        'status',
        ['planned', 'in_progress', 'completed', 'blocked', 'skipped']
      );
      phase.status = input.updates.status;
    }
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
    if (input.updates.priority !== undefined) {
      validatePriority(input.updates.priority);
      phase.priority = input.updates.priority;
    }

    // FIX #12: Don't manually increment version - FileRepository.update() does it automatically
    await repo.update(phase.id, phase);

    return { success: true, phaseId: input.phaseId };
  }

  public async movePhase(input: MovePhaseInput): Promise<MovePhaseResult> {
    const repo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);
    const phases = await repo.findAll();
    const phase = phases.find((p) => p.id === input.phaseId);

    if (!phase) {
      throw new Error('Phase not found');
    }

    const affectedPhases: Phase[] = [];

    // Update parent if specified
    if (input.newParentId !== undefined) {
      phase.parentId = input.newParentId;

      if (input.newParentId !== null && input.newParentId !== '') {
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
    if (phase.parentId !== null && phase.parentId !== '') {
      const parent = phases.find((p) => p.id === phase.parentId);
      if (!parent) {
        throw new Error(`Parent phase not found: ${phase.parentId}`);
      }
      phase.path = `${parent.path}.${String(phase.order)}`;
    } else {
      phase.path = String(phase.order);
    }

    // Update children paths recursively
    const collectAffectedChildren = (parentId: string, parentPath: string): void => {
      const children = phases.filter((p) => p.parentId === parentId);
      for (const child of children) {
        child.path = `${parentPath}.${String(child.order)}`;
        child.depth = parentPath.split('.').length;
        affectedPhases.push(child);
        collectAffectedChildren(child.id, child.path);
      }
    };

    collectAffectedChildren(phase.id, phase.path);

    // FIX #12: Don't manually increment version - FileRepository.update() does it automatically
    // Update main phase
    await repo.update(phase.id, phase);

    // Update all affected children
    for (const child of affectedPhases) {
      await repo.update(child.id, child);
    }

    return {
      success: true,
      phaseId: input.phaseId,
      affectedPhaseIds: affectedPhases.length > 0 ? affectedPhases.map((p) => p.id) : undefined,
    };
  }

  public async getPhaseTree(input: GetPhaseTreeInput): Promise<GetPhaseTreeResult> {
    const repo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);
    let phases = await repo.findAll();

    if (input.includeCompleted === false) {
      phases = phases.filter((p) => p.status !== 'completed');
    }

    // Pre-calculate child counts for all phases
    const childCounts = new Map<string | null, number>();
    for (const p of phases) {
      const parentKey = p.parentId ?? null;
      childCounts.set(parentKey, (childCounts.get(parentKey) ?? 0) + 1);
    }

    // Build phase data based on fields parameter
    const buildPhaseData = (phase: Phase): Phase | PhaseSummary => {
      // Add childCount to phase (computed field)
      const phaseWithChildCount = {
        ...phase,
        childCount: childCounts.get(phase.id) ?? 0,
      };

      // Apply field filtering with Lazy-Load support
      const filtered = filterPhase(
        phaseWithChildCount,
        input.fields,
        input.excludeMetadata,
        input.excludeComputed
      ) as Phase | PhaseSummary;

      return filtered;
    };

    const buildTree = (parentId: string | null, currentDepth: number): PhaseTreeNode[] => {
      return phases
        .filter((p) => p.parentId === parentId)
        .sort((a, b) => a.order - b.order)
        .map((phase) => {
          const hasChildPhases = (childCounts.get(phase.id) ?? 0) > 0;

          // Respect maxDepth: truncate children if we've reached the limit
          const shouldTruncate = input.maxDepth !== undefined && currentDepth >= input.maxDepth;
          const children = shouldTruncate ? [] : buildTree(phase.id, currentDepth + 1);

          return {
            phase: buildPhaseData(phase),
            children,
            depth: currentDepth,
            hasChildren: hasChildPhases,  // True even if children truncated by maxDepth
          };
        });
    };

    const rootId = input.rootPhaseId ?? null;
    const tree = buildTree(rootId, 0);

    return { tree };
  }

  public async deletePhase(input: DeletePhaseInput): Promise<DeletePhaseResult> {
    const repo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);
    const phases = await repo.findAll();
    const deletedIds: string[] = [];

    const collectChildren = (parentId: string): void => {
      const children = phases.filter((p) => p.parentId === parentId);
      for (const child of children) {
        deletedIds.push(child.id);
        collectChildren(child.id);
      }
    };

    const phase = phases.find((p) => p.id === input.phaseId);
    if (!phase) {
      throw new Error('Phase not found');
    }

    deletedIds.push(input.phaseId);

    if (input.deleteChildren === true) {
      collectChildren(input.phaseId);
    }

    // Delete all collected phases
    for (const id of deletedIds) {
      await repo.delete(id);
    }
    await this.planService.updateStatistics(input.planId);

    return {
      success: true,
      message: `Deleted ${String(deletedIds.length)} phase(s)`,
      deletedPhaseIds: deletedIds,
    };
  }

  public async updatePhaseStatus(input: UpdatePhaseStatusInput): Promise<UpdatePhaseStatusResult> {
    const repo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);
    const phases = await repo.findAll();
    const phase = phases.find((p) => p.id === input.phaseId);

    if (!phase) {
      throw new Error('Phase not found');
    }

    const now = new Date().toISOString();
    const autoUpdated: { startedAt?: string; completedAt?: string } = {};

    // Auto-set timestamps based on status transition
    if (input.status === 'in_progress' && phase.status === 'planned') {
      phase.startedAt = now;
      autoUpdated.startedAt = now;
    }

    if (input.status === 'completed') {
      phase.completedAt = now;
      phase.progress = PROGRESS_COMPLETE;
      autoUpdated.completedAt = now;
    }

    // BUGS #16, #17, #19: Validate status
    validateRequiredEnum(
      input.status,
      'status',
      ['planned', 'in_progress', 'completed', 'blocked', 'skipped']
    );

    if (input.status === 'blocked' && (input.notes === undefined || input.notes === '')) {
      throw new Error('Notes required when setting status to blocked');
    }

    phase.status = input.status;

    if (input.progress !== undefined) {
      phase.progress = input.progress;
    }

    if (input.actualEffort !== undefined) {
      phase.schedule.actualEffort = input.actualEffort;
    }

    if (input.notes !== undefined && input.notes !== '') {
      phase.metadata.annotations.push({
        id: uuidv4(),
        text: input.notes,
        author: 'claude-code',
        createdAt: now,
      });
    }

    // FIX #12: Don't manually increment version - FileRepository.update() does it automatically
    await repo.update(phase.id, phase);
    await this.planService.updateStatistics(input.planId);

    return {
      success: true,
      phaseId: input.phaseId,
    };
  }

  private comparePriority(a: Phase, b: Phase): number {
    const priorityOrder: Record<PhasePriority, number> = {
      critical: PRIORITY_CRITICAL,
      high: PRIORITY_HIGH,
      medium: PRIORITY_MEDIUM,
      low: PRIORITY_LOW,
    };
    const aPrio = a.priority ?? 'medium';
    const bPrio = b.priority ?? 'medium';
    return priorityOrder[aPrio] - priorityOrder[bPrio];
  }

  public async getNextActions(input: GetNextActionsInput): Promise<GetNextActionsResult> {
    const repo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);
    const phases = await repo.findAll();
    const limit = input.limit ?? DEFAULT_NEXT_ACTIONS_LIMIT;
    const actions: NextAction[] = [];

    // Collect stats
    const planned = phases.filter((p) => p.status === 'planned');
    const inProgress = phases.filter((p) => p.status === 'in_progress');
    const blocked = phases.filter((p) => p.status === 'blocked');

    // Priority 1: Blocked phases need attention
    for (const phase of blocked.sort((a, b) => this.comparePriority(a, b))) {
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
    for (const phase of inProgress.sort((a, b) => {
      const progressDiff = b.progress - a.progress;
      if (progressDiff !== 0) return progressDiff;
      return this.comparePriority(a, b);
    })) {
      if (actions.length >= limit) break;
      if (phase.progress >= PROGRESS_NEAR_COMPLETE) {
        actions.push({
          phaseId: phase.id,
          phaseTitle: phase.title,
          phasePath: phase.path,
          action: 'complete',
          reason: `Phase is ${String(phase.progress)}% complete`,
          priority: 'medium',
        });
      } else {
        actions.push({
          phaseId: phase.id,
          phaseTitle: phase.title,
          phasePath: phase.path,
          action: 'continue',
          reason: `Phase is ${String(phase.progress)}% complete`,
          priority: 'medium',
        });
      }
    }

    // Priority 3: Planned phases ready to start (no blocking dependencies)
    const readyToStart = planned
      .filter((p) => {
        // A phase is ready if it has no parent or parent is completed
        if (p.parentId === null || p.parentId === '') return true;
        const parent = phases.find((x) => x.id === p.parentId);
        return !parent || parent.status === 'completed' || parent.status === 'in_progress';
      })
      .sort((a, b) => {
        const prioDiff = this.comparePriority(a, b);
        if (prioDiff !== 0) return prioDiff;
        return a.path.localeCompare(b.path);
      });

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

  public async completeAndAdvance(input: CompleteAndAdvanceInput): Promise<CompleteAndAdvanceResult> {
    await this.ensurePlanExists(input.planId);

    const repo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);
    const phases = await repo.findAll();
    const currentPhase = phases.find((p) => p.id === input.phaseId);

    if (!currentPhase) {
      throw new Error('Phase not found');
    }

    const now = new Date().toISOString();

    // Validate current phase status
    if (currentPhase.status === 'completed') {
      throw new Error('Phase is already completed');
    }

    if (currentPhase.status === 'skipped') {
      throw new Error('Cannot complete skipped phase');
    }

    if (currentPhase.status === 'blocked') {
      throw new Error('Cannot complete blocked phase. Unblock it first.');
    }

    // Complete current phase
    currentPhase.status = 'completed';
    currentPhase.progress = PROGRESS_COMPLETE;
    currentPhase.completedAt = now;

    if (input.actualEffort !== undefined) {
      currentPhase.schedule.actualEffort = input.actualEffort;
    }

    if (input.notes !== undefined && input.notes !== '') {
      currentPhase.metadata.annotations.push({
        id: uuidv4(),
        text: input.notes,
        author: 'claude-code',
        createdAt: now,
      });
    }

    // Find and start next planned phase
    const nextPhase = this.findNextPlannedPhase(currentPhase, phases);

    if (nextPhase) {
      nextPhase.status = 'in_progress';
      nextPhase.startedAt = now;
    }

    // FIX #12: Don't manually increment version - FileRepository.update() does it automatically
    await repo.update(currentPhase.id, currentPhase);
    if (nextPhase) {
      await repo.update(nextPhase.id, nextPhase);
    }
    await this.planService.updateStatistics(input.planId);

    return {
      completedPhaseId: currentPhase.id,
      nextPhaseId: nextPhase?.id ?? null,
      success: true as const,
    };
  }

  /**
   * Finds the next planned phase following hierarchical traversal:
   * 1. Check for planned children (depth-first)
   * 2. Check for next planned sibling
   * 3. Recursively check parent's next sibling (move up)
   */
  private findNextPlannedPhase(currentPhase: Phase, allPhases: Phase[]): Phase | null {
    // 1. Check for planned children (depth-first)
    const children = allPhases
      .filter((p) => p.parentId === currentPhase.id && p.status === 'planned')
      .sort((a, b) => a.order - b.order);

    if (children.length > 0) {
      return children[0];
    }

    // 2. Check for next planned sibling
    const siblings = allPhases
      .filter(
        (p) =>
          p.parentId === currentPhase.parentId && p.order > currentPhase.order && p.status === 'planned'
      )
      .sort((a, b) => a.order - b.order);

    if (siblings.length > 0) {
      return siblings[0];
    }

    // 3. Move up to parent and recursively find its next sibling
    if (currentPhase.parentId !== null && currentPhase.parentId !== '') {
      const parent = allPhases.find((p) => p.id === currentPhase.parentId);
      if (parent) {
        return this.findNextPlannedPhase(parent, allPhases);
      }
    }

    // 4. No next phase found
    return null;
  }

  /**
   * Sprint 5: Array Field Operations
   * Validate that field is a valid array field for Phase
   */
  private validateArrayField(field: string): asserts field is PhaseArrayField {
    const validFields: PhaseArrayField[] = ['objectives', 'deliverables', 'successCriteria'];
    if (!validFields.includes(field as PhaseArrayField)) {
      throw new Error(`Field ${field} is not a valid array field. Valid fields: ${validFields.join(', ')}`);
    }
  }

  /**
   * Execute an array operation with common load/save logic
   * @param planId - Plan identifier
   * @param phaseId - Phase identifier
   * @param field - Array field to modify
   * @param operation - Function that transforms the current array to new array
   * @returns Operation result with success status and new array length
   */
  private async executeArrayOperation(
    planId: string,
    phaseId: string,
    field: PhaseArrayField,
    operation: (currentArray: string[]) => string[]
  ): Promise<ArrayOperationResult> {
    await this.ensurePlanExists(planId);

    const repo = this.repositoryFactory.createRepository<Phase>('phase', planId);
    const phases = await repo.findAll();
    const phase = phases.find((p) => p.id === phaseId);
    if (!phase) {
      throw new Error('Phase not found');
    }

    const currentArray = phase[field];
    const newArray = operation(currentArray);

    phase[field] = newArray;

    // FIX #12: Don't manually increment version - FileRepository.update() does it automatically
    await repo.update(phase.id, phase);

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
      input.phaseId,
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
      input.phaseId,
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
      input.phaseId,
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
      input.phaseId,
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
      input.phaseId,
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
   * Sprint 7: Get version history
   */
  public async getHistory(input: { planId: string; phaseId: string; limit?: number; offset?: number }): Promise<VersionHistory<Phase>> {
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
      entityId: input.phaseId,
      entityType: 'phase',
      limit: input.limit,
      offset: input.offset,
    });
    return history as VersionHistory<Phase>;
  }

  /**
   * Sprint 7: Compare two versions
   */
  public async diff(input: { planId: string; phaseId: string; version1: number; version2: number }): Promise<VersionDiff> {
    if (!this.versionHistoryService) {
      throw new Error('Version history service not available');
    }

    const planRepo = this.repositoryFactory.createPlanRepository();
    const exists = await planRepo.planExists(input.planId);
    if (!exists) {
      throw new Error('Plan not found');
    }

    const repo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);
    const current = await repo.findById(input.phaseId);

    return this.versionHistoryService.diff({
      planId: input.planId,
      entityId: input.phaseId,
      entityType: 'phase',
      version1: input.version1,
      version2: input.version2,
      currentEntityData: current,
      currentVersion: current.version,
    });
  }

  /**
   * Sprint 9: Bulk update multiple phases in one call
   * REFACTOR: Uses common bulkUpdateEntities utility
   */
  public async bulkUpdatePhases(input: BulkUpdatePhasesInput): Promise<BulkUpdatePhasesResult> {
    const repo = this.repositoryFactory.createRepository<Phase>('phase', input.planId);

    // Create storage adapter for bulkUpdateEntities utility
    const storageAdapter = {
      loadEntities: (_planId: string, _entityType: string): Promise<Record<string, unknown>[]> => {
        return repo.findAll() as unknown as Promise<Record<string, unknown>[]>;
      },
      saveEntities: async (_planId: string, _entityType: string, entities: Record<string, unknown>[]): Promise<void> => {
        const phases = entities as unknown as Phase[];
        // For atomic rollback, we need to restore all entities
        // Clear and recreate - this is the rollback scenario
        const current = await repo.findAll();
        const currentIds = new Set(current.map(e => e.id));
        const newIds = new Set(phases.map(e => e.id));

        // Delete entities that no longer exist
        for (const id of currentIds) {
          if (!newIds.has(id)) {
            await repo.delete(id);
          }
        }

        // Update/create entities
        for (const phase of phases) {
          if (currentIds.has(phase.id)) {
            // Direct save to bypass version check during rollback
            await repo.update(phase.id, phase);
          } else {
            await repo.create(phase);
          }
        }
      },
    };

    return bulkUpdateEntities<'phaseId'>({
      entityType: 'phases',
      entityIdField: 'phaseId',
      updateFn: (phaseId, updates) =>
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- return void from updateFn
        this.updatePhase({ planId: input.planId, phaseId, updates }).then(() => {}),
      planId: input.planId,
      updates: input.updates,
      atomic: input.atomic,
      storage: storageAdapter,
    });
  }

}
