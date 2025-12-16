/**
 * Solution entity types
 */

import type { Entity, EffortEstimate, Feasibility } from './common.model';

export type SolutionStatus = 'proposed' | 'evaluated' | 'selected' | 'rejected' | 'implemented';

export interface Tradeoff {
  aspect: string;
  pros: string[];
  cons: string[];
  score?: number; // 0-10
}

export interface SolutionEvaluation {
  effortEstimate: EffortEstimate;
  technicalFeasibility: Feasibility;
  riskAssessment: string;
  dependencies?: string[];
  performanceImpact?: string;
}

export interface Solution extends Entity {
  type: 'solution';
  title: string;
  description: string;
  approach: string;
  implementationNotes?: string;
  tradeoffs: Tradeoff[];
  addressing: string[]; // Requirement IDs
  evaluation: SolutionEvaluation;
  status: SolutionStatus;
  selectionReason?: string;
}

/**
 * DTOs for API operations
 */
export interface CreateSolutionDto {
  title: string;
  description?: string;
  approach?: string;
  implementationNotes?: string;
  addressing?: string[];
  tradeoffs?: Tradeoff[];
  evaluation?: SolutionEvaluation;
}

export interface UpdateSolutionDto {
  title?: string;
  description?: string;
  approach?: string;
  implementationNotes?: string;
  addressing?: string[];
  tradeoffs?: Tradeoff[];
  evaluation?: SolutionEvaluation;
  status?: SolutionStatus;
}

export interface SelectSolutionDto {
  reason: string;
  createDecisionRecord?: boolean;
}

export interface ListSolutionsParams {
  status?: SolutionStatus;
  fields?: string[];
  excludeMetadata?: boolean;
}

export interface CompareSolutionsParams {
  solutionIds: string[];
  aspects?: string[];
}

export interface SolutionComparison {
  solutions: Solution[];
  comparison: Record<string, {
    aspect: string;
    scores: Record<string, number | undefined>;
    winner?: string;
  }>;
}
