/**
 * Phase entity types
 */

import type { Entity, EffortEstimate, Priority } from './common.model';

export type PhaseStatus = 'planned' | 'in_progress' | 'completed' | 'blocked' | 'skipped';
export type PhasePriority = Priority;

export interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;
}

export interface Blocker {
  description: string;
  reportedAt: string;
  resolvedAt?: string;
}

export interface PhaseSchedule {
  estimatedEffort: EffortEstimate;
  actualEffort?: number; // In hours
  startDate?: string;
  endDate?: string;
  dueDate?: string;
}

export interface Phase extends Entity {
  type: 'phase';
  title: string;
  description: string;

  // Hierarchy
  parentId: string | null;
  order: number;
  depth: number;
  path: string; // "1.2.3" format

  // Planning
  objectives: string[];
  deliverables: string[];
  successCriteria: string[];

  // Schedule
  schedule: PhaseSchedule;

  // Execution Status
  status: PhaseStatus;
  progress: number; // 0-100
  startedAt?: string;
  completedAt?: string;

  // Progress Tracking
  milestones?: Milestone[];
  blockers?: Blocker[];

  // Implementation details
  implementationNotes?: string;
  priority?: PhasePriority;
  blockingReason?: string;
}

/**
 * Phase tree node for hierarchical display
 */
export interface PhaseTreeNode {
  phase: Phase;
  children: PhaseTreeNode[];
  depth: number;
  hasChildren: boolean;
}

/**
 * DTOs for API operations
 */
export interface AddPhaseDto {
  title: string;
  description?: string;
  objectives?: string[];
  deliverables?: string[];
  successCriteria?: string[];
  parentId?: string | null;
  priority?: PhasePriority;
  implementationNotes?: string;
}

export interface UpdatePhaseDto {
  title?: string;
  description?: string;
  objectives?: string[];
  deliverables?: string[];
  successCriteria?: string[];
  implementationNotes?: string;
  priority?: PhasePriority;
  progress?: number;
  status?: PhaseStatus;
  blockingReason?: string;
}

export interface MovePhaseDto {
  newParentId?: string | null;
  newOrder?: number;
}

export interface UpdatePhaseStatusDto {
  status: PhaseStatus;
  progress?: number;
  notes?: string;
  actualEffort?: number;
}

export interface GetPhaseTreeParams {
  maxDepth?: number;
  includeCompleted?: boolean;
  fields?: string[];
  excludeMetadata?: boolean;
  excludeComputed?: boolean;
}

export interface ListPhasesParams {
  status?: PhaseStatus;
  parentId?: string;
  fields?: string[];
  excludeMetadata?: boolean;
  excludeComputed?: boolean;
}

export interface GetNextActionsParams {
  limit?: number;
  includeBlocked?: boolean;
}

export interface NextAction {
  phase: Phase;
  reason: string;
  blockedBy?: string[];
}
