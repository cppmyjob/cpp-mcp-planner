// Base types for all entities

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

export interface Entity {
  id: string;
  type: EntityType;
  createdAt: string;
  updatedAt: string;
  version: number;
  metadata: {
    createdBy: string;
    tags: Tag[];
    annotations: Annotation[];
  };
}

// Requirement types
export type RequirementSource = 'user-request' | 'discovered' | 'derived';
export type RequirementPriority = 'critical' | 'high' | 'medium' | 'low';
export type RequirementCategory = 'functional' | 'non-functional' | 'technical' | 'business';
export type RequirementStatus = 'draft' | 'approved' | 'implemented' | 'deferred' | 'rejected';

export interface Requirement extends Entity {
  type: 'requirement';
  title: string;  // REQUIRED: Validated in addRequirement
  description: string;
  rationale?: string;
  source: {
    type: RequirementSource;  // REQUIRED: Validated in addRequirement
    context?: string;
    parentId?: string;
  };
  acceptanceCriteria: string[];
  priority: RequirementPriority;
  category: RequirementCategory;
  status: RequirementStatus;
  votes: number; // Vote count for prioritization (default: 0)
  impact?: {
    scope: string[];
    complexityEstimate: number; // 1-10
    riskLevel: 'low' | 'medium' | 'high';
  };
}

// Solution types
export type SolutionStatus = 'proposed' | 'evaluated' | 'selected' | 'rejected' | 'implemented';

export interface Tradeoff {
  aspect: string;
  pros: string[];
  cons: string[];
  score?: number; // 1-10
}

export interface EffortEstimate {
  value: number;
  unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'story-points';
  confidence: 'low' | 'medium' | 'high';
}

export interface Solution extends Entity {
  type: 'solution';
  title: string;  // REQUIRED: Validated in proposeSolution
  description: string;
  approach: string;
  implementationNotes?: string;
  tradeoffs: Tradeoff[];
  addressing: string[]; // Requirement IDs
  evaluation: {
    effortEstimate: EffortEstimate;
    technicalFeasibility: 'high' | 'medium' | 'low';
    riskAssessment: string;
    dependencies?: string[];
    performanceImpact?: string;
  };
  status: SolutionStatus;
  selectionReason?: string;
}

// Decision types
export type DecisionStatus = 'active' | 'superseded' | 'reversed';

export interface AlternativeConsidered {
  option: string;
  reasoning: string;
  whyNotChosen?: string;
}

export interface Decision extends Entity {
  type: 'decision';
  title: string;  // REQUIRED: Validated in recordDecision
  question: string;  // REQUIRED: Validated in recordDecision
  context: string;
  decision: string;  // REQUIRED: Validated in recordDecision
  alternativesConsidered: AlternativeConsidered[];
  consequences?: string;
  impactScope?: string[];
  status: DecisionStatus;
  supersededBy?: string; // Decision ID
  supersedes?: string;   // Decision ID
}

// Phase types
export type PhaseStatus = 'planned' | 'in_progress' | 'completed' | 'blocked' | 'skipped';
export type PhasePriority = 'critical' | 'high' | 'medium' | 'low';

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

export interface Phase extends Entity {
  type: 'phase';
  title: string;  // REQUIRED: Validated in addPhase
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
  schedule: {
    estimatedEffort: EffortEstimate;
    actualEffort?: number; // In hours
    startDate?: string;
    endDate?: string;
    dueDate?: string;
  };

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
  blockingReason?: string;  // Quick status text when status='blocked'
}

// Artifact types - for storing generated content (code, configs, docs)
export type ArtifactType =
  | 'code'           // Generated source code
  | 'config'         // Configuration files (JSON, YAML, etc.)
  | 'migration'      // Database migrations (SQL, etc.)
  | 'documentation'  // Generated documentation (markdown, etc.)
  | 'test'           // Test files and test data
  | 'script'         // Build scripts, automation scripts
  | 'other';         // Any other generated content

export type ArtifactStatus = 'draft' | 'reviewed' | 'approved' | 'implemented' | 'outdated';

/**
 * Target file for artifact - replaces FileEntry with additional precision fields
 */
export interface ArtifactTarget {
  path: string;                    // File path (relative or absolute)
  action: 'create' | 'modify' | 'delete';  // What to do with the file
  lineNumber?: number;             // Specific line to target (1-indexed)
  lineEnd?: number;                // End line for range (inclusive, requires lineNumber)
  searchPattern?: string;          // Regex to find location (conflicts with lineNumber)
  description?: string;            // Human-readable description
}

/**
 * @deprecated Use ArtifactTarget instead. This type is kept for backward compatibility.
 */
export interface FileEntry {
  path: string;
  action: 'create' | 'modify' | 'delete';
  description?: string;
}

export interface Artifact extends Entity {
  type: 'artifact';
  title: string;  // REQUIRED: Validated in addArtifact
  description: string;
  slug?: string;                 // URL-friendly identifier (auto-generated from title if not provided)
  artifactType: ArtifactType;  // REQUIRED: Validated in addArtifact
  status: ArtifactStatus;

  // Content - structured storage for generated content
  content: {
    language?: string;         // Programming language or format (typescript, sql, yaml, etc.)
    sourceCode?: string;       // The actual generated code/content
    filename?: string;         // Suggested filename
  };

  // File targets - list of files to be created/modified with precision
  targets?: ArtifactTarget[];      // NEW: replaces fileTable

  /**
   * @deprecated Use targets instead. This field is kept for reading legacy data only.
   */
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  fileTable?: FileEntry[];         // DEPRECATED: auto-migrated to targets on read

  // Context - what this artifact relates to
  relatedPhaseId?: string;     // The phase this artifact belongs to
  relatedSolutionId?: string;  // The solution this artifact implements
  relatedRequirementIds?: string[]; // Requirements this artifact addresses

  // Code references in format "file_path:line_number"
  codeRefs?: string[];
}

// Link types
export type RelationType =
  | 'implements'      // Solution → Requirement
  | 'addresses'       // Phase → Requirement
  | 'depends_on'      // Phase → Phase
  | 'blocks'          // Phase → Phase
  | 'alternative_to'  // Solution → Solution
  | 'supersedes'      // Decision → Decision
  | 'references'      // Any → ContextReference (future)
  | 'derived_from'    // Requirement → Requirement
  | 'has_artifact';   // Phase/Solution → Artifact

export interface Link {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  metadata?: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
}

// Plan types
export type PlanStatus = 'active' | 'archived' | 'completed';

export interface PlanManifest {
  id: string;
  name: string;  // REQUIRED: Validated in createPlan
  description: string;
  status: PlanStatus;
  author: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  lockVersion: number; // For optimistic locking
  enableHistory?: boolean; // Sprint 7: Enable version history tracking
  maxHistoryDepth?: number; // Sprint 7: Maximum versions to keep (0-10), 0 means unlimited
  statistics: {
    totalRequirements: number;
    totalSolutions: number;
    totalDecisions: number;
    totalPhases: number;
    totalArtifacts: number;
    completionPercentage: number;
  };
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

// Active plan mapping
export interface ActivePlanMapping {
  planId: string;
  lastUpdated: string;
}

export type ActivePlansIndex = Record<string, ActivePlanMapping>;

// Sprint 7: Version History types
export interface VersionSnapshot<T extends Entity = Entity> {
  version: number;
  data: T;
  timestamp: string;
  author?: string;
  changeNote?: string;
}

export interface VersionHistory<T extends Entity = Entity> {
  entityId: string;
  entityType: 'requirement' | 'solution' | 'decision' | 'phase' | 'artifact';
  currentVersion: number;
  versions: VersionSnapshot<T>[];
  total: number;
  hasMore?: boolean; // Indicates if there are more versions beyond the current page
}

export interface VersionDiff {
  entityId: string;
  entityType: 'requirement' | 'solution' | 'decision' | 'phase' | 'artifact';
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
