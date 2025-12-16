/**
 * Link entity types for entity relationships
 */

export type RelationType =
  | 'implements'      // Solution -> Requirement
  | 'addresses'       // Phase -> Requirement
  | 'depends_on'      // Phase -> Phase
  | 'blocks'          // Phase -> Phase
  | 'alternative_to'  // Solution -> Solution
  | 'supersedes'      // Decision -> Decision
  | 'references'      // Any -> ContextReference
  | 'derived_from'    // Requirement -> Requirement
  | 'has_artifact';   // Phase/Solution -> Artifact

export interface Link {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  metadata?: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
}

/**
 * DTOs for API operations
 */
export interface CreateLinkDto {
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  metadata?: Record<string, unknown>;
}

export interface GetLinksParams {
  entityId: string;
  direction?: 'outgoing' | 'incoming' | 'both';
  relationType?: RelationType;
}

export interface DeleteLinkParams {
  linkId: string;
}
