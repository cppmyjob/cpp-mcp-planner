/**
 * Artifact entity types - for storing generated content
 */

import type { Entity } from './common.model';

export type ArtifactType =
  | 'code'
  | 'config'
  | 'migration'
  | 'documentation'
  | 'test'
  | 'script'
  | 'other';

export type ArtifactStatus = 'draft' | 'reviewed' | 'approved' | 'implemented' | 'outdated';

export interface ArtifactTarget {
  path: string;
  action: 'create' | 'modify' | 'delete';
  lineNumber?: number;
  lineEnd?: number;
  searchPattern?: string;
  description?: string;
}

export interface ArtifactContent {
  language?: string;
  sourceCode?: string;
  filename?: string;
}

export interface Artifact extends Entity {
  type: 'artifact';
  title: string;
  description: string;
  slug?: string;
  artifactType: ArtifactType;
  status: ArtifactStatus;
  content: ArtifactContent;
  targets?: ArtifactTarget[];
  relatedPhaseId?: string;
  relatedSolutionId?: string;
  relatedRequirementIds?: string[];
  codeRefs?: string[];
}

/**
 * DTOs for API operations
 */
export interface AddArtifactDto {
  title: string;
  description?: string;
  slug?: string;
  artifactType: ArtifactType;
  content?: ArtifactContent;
  targets?: ArtifactTarget[];
  relatedPhaseId?: string;
  relatedSolutionId?: string;
  relatedRequirementIds?: string[];
  codeRefs?: string[];
}

export interface UpdateArtifactDto {
  title?: string;
  description?: string;
  slug?: string;
  status?: ArtifactStatus;
  content?: ArtifactContent;
  targets?: ArtifactTarget[];
  relatedPhaseId?: string;
  relatedSolutionId?: string;
  relatedRequirementIds?: string[];
  codeRefs?: string[];
}

export interface ListArtifactsParams {
  artifactType?: ArtifactType;
  status?: ArtifactStatus;
  relatedPhaseId?: string;
  fields?: string[];
  excludeMetadata?: boolean;
  includeContent?: boolean;
}
