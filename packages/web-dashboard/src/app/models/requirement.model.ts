/**
 * Requirement entity types
 */

import type { Entity, Priority, RiskLevel } from './common.model';

export type RequirementSource = 'user-request' | 'discovered' | 'derived';
export type RequirementPriority = Priority;
export type RequirementCategory = 'functional' | 'non-functional' | 'technical' | 'business';
export type RequirementStatus = 'draft' | 'approved' | 'implemented' | 'deferred' | 'rejected';

export interface RequirementSourceInfo {
  type: RequirementSource;
  context?: string;
  parentId?: string;
}

export interface RequirementImpact {
  scope: string[];
  complexityEstimate: number; // 1-10
  riskLevel: RiskLevel;
}

export interface Requirement extends Entity {
  type: 'requirement';
  title: string;
  description: string;
  rationale?: string;
  source: RequirementSourceInfo;
  acceptanceCriteria: string[];
  priority: RequirementPriority;
  category: RequirementCategory;
  status: RequirementStatus;
  votes: number;
  impact?: RequirementImpact;
}

/**
 * DTOs for API operations
 */
export interface CreateRequirementDto {
  title: string;
  description?: string;
  source: RequirementSourceInfo;
  priority?: RequirementPriority;
  category?: RequirementCategory;
  status?: RequirementStatus;
  acceptanceCriteria?: string[];
  rationale?: string;
}

export interface UpdateRequirementDto {
  title?: string;
  description?: string;
  priority?: RequirementPriority;
  category?: RequirementCategory;
  status?: RequirementStatus;
  acceptanceCriteria?: string[];
  rationale?: string;
}

export interface ListRequirementsParams {
  status?: RequirementStatus;
  priority?: RequirementPriority;
  category?: RequirementCategory;
  fields?: string[];
  excludeMetadata?: boolean;
  includeTraceability?: boolean;
}
