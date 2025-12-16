/**
 * Query types for search, trace, validate, export operations
 */

import type { EntityType } from './common.model';
import type { Requirement } from './requirement.model';
import type { Solution } from './solution.model';
import type { Phase } from './phase.model';

export type ValidationLevel = 'basic' | 'strict';
export type ExportFormat = 'markdown' | 'json';

/**
 * Search query parameters
 */
export interface SearchQueryParams {
  query: string;
  entityTypes?: EntityType[];
  filters?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  entityType: EntityType;
  entity: Requirement | Solution | Phase;
  score: number;
  highlights?: string[];
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}

/**
 * Trace query - follow requirement implementation path
 */
export interface TraceQueryParams {
  requirementId: string;
  includeVersionHistory?: boolean;
}

export interface TraceResult {
  requirement: Requirement;
  solutions: Solution[];
  phases: Phase[];
  coverage: {
    hasSolution: boolean;
    hasPhase: boolean;
    isImplemented: boolean;
  };
}

/**
 * Validation query - check plan integrity
 */
export interface ValidateQueryParams {
  validationLevel?: ValidationLevel;
  checks?: string[];
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  code: string;
  message: string;
  severity: ValidationSeverity;
  entityType?: EntityType;
  entityId?: string;
  field?: string;
}

export interface ValidateResponse {
  isValid: boolean;
  issues: ValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
}

/**
 * Export query - export plan to different formats
 */
export interface ExportQueryParams {
  format: ExportFormat;
  sections?: string[];
}

export interface ExportResponse {
  format: ExportFormat;
  content: string;
  filename: string;
}

/**
 * Health check
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, {
    status: 'pass' | 'fail';
    message?: string;
  }>;
}
