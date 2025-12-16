/**
 * Decision entity types (ADR pattern)
 */

import type { Entity } from './common.model';

export type DecisionStatus = 'active' | 'superseded' | 'reversed';

export interface AlternativeConsidered {
  option: string;
  reasoning: string;
  whyNotChosen?: string;
}

export interface Decision extends Entity {
  type: 'decision';
  title: string;
  question: string;
  context: string;
  decision: string;
  alternativesConsidered: AlternativeConsidered[];
  consequences?: string;
  impactScope?: string[];
  status: DecisionStatus;
  supersededBy?: string; // Decision ID
  supersedes?: string;   // Decision ID
}

/**
 * DTOs for API operations
 */
export interface CreateDecisionDto {
  title: string;
  question: string;
  context?: string;
  decision: string;
  alternativesConsidered?: AlternativeConsidered[];
  consequences?: string;
}

export interface UpdateDecisionDto {
  title?: string;
  context?: string;
  decision?: string;
  consequences?: string;
}

export interface SupersedeDecisionDto {
  newDecision: CreateDecisionDto;
  reason: string;
}

export interface ListDecisionsParams {
  status?: DecisionStatus;
  fields?: string[];
  excludeMetadata?: boolean;
}
