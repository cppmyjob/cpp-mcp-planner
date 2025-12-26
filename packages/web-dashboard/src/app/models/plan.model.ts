/**
 * Plan entity types
 */

import type { Requirement } from './requirement.model';
import type { Solution } from './solution.model';
import type { Decision } from './decision.model';
import type { Phase } from './phase.model';
import type { Artifact } from './artifact.model';
import type { Link } from './link.model';

export type PlanStatus = 'active' | 'archived' | 'completed';

export interface PlanStatistics {
  totalRequirements: number;
  totalSolutions: number;
  totalDecisions: number;
  totalPhases: number;
  totalArtifacts: number;
  completionPercentage: number;
}

export interface PlanManifest {
  id: string;
  projectId: string;
  projectPath?: string;
  name: string;
  description: string;
  status: PlanStatus;
  author: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  lockVersion: number;
  enableHistory?: boolean;
  maxHistoryDepth?: number;
  statistics: PlanStatistics;
}

export interface Plan {
  manifest: PlanManifest;
  entities: {
    requirements: Requirement[];
    solutions: Solution[];
    decisions: Decision[];
    phases: Phase[];
    artifacts: Artifact[];
  };
  links: Link[];
}

export interface ActivePlanMapping {
  planId: string;
  projectId: string;
  lastUpdated: string;
}

/**
 * DTOs for API operations
 */
export interface CreatePlanDto {
  name: string;
  description: string;
  author?: string;
  enableHistory?: boolean;
  maxHistoryDepth?: number;
}

export interface UpdatePlanDto {
  name?: string;
  description?: string;
  status?: PlanStatus;
}

export interface ListPlansParams {
  projectId?: string;
  status?: PlanStatus;
  limit?: number;
  offset?: number;
}

export interface ActivatePlanDto {
  workspacePath: string;
}

export interface GetActivePlanParams {
  workspacePath: string;
  includeEntities?: boolean;
}

export interface PlanSummary {
  plan: PlanManifest;
  phaseTree?: PhaseTreeSummary[];
  statistics: PlanStatistics;
}

export interface PhaseTreeSummary {
  id: string;
  title: string;
  status: string;
  progress: number;
  path: string;
  childCount: number;
}
