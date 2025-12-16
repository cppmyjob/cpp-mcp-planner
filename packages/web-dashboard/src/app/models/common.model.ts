/**
 * Common types shared across all entities
 * Based on @mcp-planner/core types
 */

export type EntityType = 'requirement' | 'solution' | 'decision' | 'phase' | 'artifact';

export interface Tag {
  key: string;
  value: string;
}

export interface Annotation {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

export interface EntityMetadata {
  createdBy: string;
  tags: Tag[];
  annotations: Annotation[];
}

export interface Entity {
  id: string;
  type: EntityType;
  createdAt: string;
  updatedAt: string;
  version: number;
  metadata: EntityMetadata;
}

export interface EffortEstimate {
  value: number;
  unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'story-points';
  confidence: 'low' | 'medium' | 'high';
}

export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Feasibility = 'high' | 'medium' | 'low';
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * API Response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  timestamp: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Version history types
 */
export interface VersionSnapshot<T extends Entity = Entity> {
  version: number;
  data: T;
  timestamp: string;
  author?: string;
  changeNote?: string;
}

export interface VersionHistory<T extends Entity = Entity> {
  entityId: string;
  entityType: EntityType;
  currentVersion: number;
  versions: VersionSnapshot<T>[];
  total: number;
  hasMore?: boolean;
}

export interface VersionDiff {
  entityId: string;
  entityType: EntityType;
  version1: {
    version: number;
    timestamp: string;
  };
  version2: {
    version: number;
    timestamp: string;
  };
  changes: Record<string, {
    from: unknown;
    to: unknown;
    changed: boolean;
  }>;
}
