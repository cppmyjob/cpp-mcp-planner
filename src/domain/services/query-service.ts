import type { FileStorage } from '../../infrastructure/file-storage.js';
import type { PlanService } from './plan-service.js';
import type { LinkingService } from './linking-service.js';
import * as fs from 'fs/promises';
import type {
  Entity,
  EntityType,
  Requirement,
  Solution,
  Decision,
  Phase,
  Artifact,
  Link,
  Tag,
} from '../entities/types.js';

// ============================================================================
// Sprint 8: Trace Depth Constants
// ============================================================================

/**
 * Trace depth levels for hierarchical requirement tracing:
 * - SOLUTIONS (1): requirement → solutions only
 * - PHASES (2): requirement → solutions → phases
 * - ARTIFACTS (3): requirement → solutions → phases → artifacts (full trace)
 */
const TRACE_DEPTH = {
  SOLUTIONS: 1,
  PHASES: 2,
  ARTIFACTS: 3,
  MIN: 1,
  MAX: 3,
  DEFAULT: 3,
} as const;

// Input types
export interface SearchEntitiesInput {
  planId: string;
  query: string;
  entityTypes?: EntityType[];
  filters?: {
    tags?: Tag[];
    status?: string;
  };
  limit?: number;
  offset?: number;
}

export interface TraceRequirementInput {
  planId: string;
  requirementId: string;
  depth?: number;
  includePhases?: boolean;
  includeArtifacts?: boolean;
  limit?: number;
  fields?: string[];
  solutionFields?: string[];
  phaseFields?: string[];
  excludeMetadata?: boolean;
}

export interface ValidatePlanInput {
  planId: string;
  checks?: string[];
  validationLevel?: 'basic' | 'strict';
}

export interface ExportPlanInput {
  planId: string;
  format: 'markdown' | 'json';
  sections?: string[];
  includeVersionHistory?: boolean;
}

// Output types
export interface SearchResult {
  entityId: string;
  entityType: EntityType;
  entity: Entity;
  relevanceScore: number;
  matchedFields: string[];
}

export interface SearchEntitiesResult {
  results: SearchResult[];
  total: number;
  hasMore: boolean;
}

export interface TraceRequirementResult {
  requirement: Requirement;
  trace: {
    proposedSolutions: Solution[];
    selectedSolution: Solution | null;
    alternativeSolutions: Solution[];
    decisions: Decision[];
    implementingPhases?: Phase[];
    artifacts?: Artifact[];
    completionStatus: {
      isAddressed: boolean;
      isImplemented: boolean;
      completionPercentage: number;
    };
  };
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  type: string;
  entityId?: string;
  entityType?: EntityType;
  message: string;
  suggestion?: string;
  filePath?: string;
}

export interface ValidatePlanResult {
  isValid: boolean;
  issues: ValidationIssue[];
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  checksPerformed: string[];
}

export interface ExportPlanResult {
  format: string;
  content: string;
  filePath?: string;
  sizeBytes: number;
}

export class QueryService {
  constructor(
    private storage: FileStorage,
    private planService: PlanService,
    private linkingService: LinkingService
  ) {}

  async searchEntities(input: SearchEntitiesInput): Promise<SearchEntitiesResult> {
    const planData = await this.planService.getPlan({
      planId: input.planId,
      includeEntities: true,
    });

    const entities = planData.plan.entities!;
    const allEntities: Entity[] = [
      ...entities.requirements,
      ...entities.solutions,
      ...entities.decisions,
      ...entities.phases,
      ...entities.artifacts,
    ];

    const query = input.query.toLowerCase();
    let results: SearchResult[] = [];

    for (const entity of allEntities) {
      // Filter by entity type
      if (input.entityTypes && !input.entityTypes.includes(entity.type)) {
        continue;
      }

      // Search in entity fields
      const matchedFields: string[] = [];
      let score = 0;

      const searchableText = this.getSearchableText(entity);
      for (const [field, text] of Object.entries(searchableText)) {
        if (text.toLowerCase().includes(query)) {
          matchedFields.push(field);
          score += 1;
        }
      }

      if (matchedFields.length > 0) {
        results.push({
          entityId: entity.id,
          entityType: entity.type,
          entity,
          relevanceScore: score / Object.keys(searchableText).length,
          matchedFields,
        });
      }
    }

    // Sort by relevance
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Pagination
    const total = results.length;
    const offset = input.offset || 0;
    const limit = input.limit || 50;
    const paginated = results.slice(offset, offset + limit);

    return {
      results: paginated,
      total,
      hasMore: offset + limit < total,
    };
  }

  async traceRequirement(input: TraceRequirementInput): Promise<TraceRequirementResult> {
    // ========================================================================
    // Sprint 8: Parameter Validation
    // ========================================================================

    // Validate depth parameter
    if (input.depth !== undefined) {
      if (typeof input.depth !== 'number') {
        throw new Error('depth must be a number');
      }
      if (!Number.isInteger(input.depth)) {
        throw new Error('depth must be an integer');
      }
      if (input.depth < TRACE_DEPTH.MIN || input.depth > TRACE_DEPTH.MAX) {
        throw new Error(`depth must be between ${TRACE_DEPTH.MIN} and ${TRACE_DEPTH.MAX}`);
      }
    }

    // Validate limit parameter
    if (input.limit !== undefined) {
      if (typeof input.limit !== 'number') {
        throw new Error('limit must be a number');
      }
      if (!Number.isInteger(input.limit)) {
        throw new Error('limit must be an integer');
      }
      if (input.limit <= 0) {
        throw new Error('limit must be greater than 0');
      }
    }

    // Validate includePhases parameter
    if (input.includePhases !== undefined && typeof input.includePhases !== 'boolean') {
      throw new Error('includePhases must be a boolean');
    }

    // Validate includeArtifacts parameter (null is allowed and treated as default true)
    if (input.includeArtifacts !== undefined && input.includeArtifacts !== null && typeof input.includeArtifacts !== 'boolean') {
      throw new Error('includeArtifacts must be a boolean');
    }

    // ========================================================================
    // Load Plan Data
    // ========================================================================

    const planData = await this.planService.getPlan({
      planId: input.planId,
      includeEntities: true,
    });

    const entities = planData.plan.entities!;
    const links = planData.plan.links!;

    const requirement = entities.requirements.find((r) => r.id === input.requirementId);
    if (!requirement) {
      throw new Error('Requirement not found');
    }

    // ========================================================================
    // Sprint 8: Depth and Include Flags (default behavior)
    // ========================================================================

    const depth = input.depth ?? TRACE_DEPTH.DEFAULT;
    const includePhases = input.includePhases ?? true;
    const includeArtifacts = (input.includeArtifacts !== undefined && input.includeArtifacts !== null)
      ? input.includeArtifacts
      : true;
    const { limit, excludeMetadata } = input;

    // ========================================================================
    // Level 1: Find Solutions (always included at any depth)
    // ========================================================================

    const implementsLinks = links.filter(
      (l) => l.targetId === input.requirementId && l.relationType === 'implements'
    );
    const solutionIds = new Set(implementsLinks.map((l) => l.sourceId));
    const rawSolutions = entities.solutions.filter((s) => solutionIds.has(s.id));

    // Apply filters (limit, fields, excludeMetadata)
    const allSolutions = this.applyEntityFilters(rawSolutions, {
      limit,
      fields: input.solutionFields || input.fields,
      excludeMetadata,
    });

    const selectedSolution = allSolutions.find((s) => s.status === 'selected') || null;
    const alternativeSolutions = allSolutions.filter((s) => s.status !== 'selected');

    // ========================================================================
    // Level 2: Find Phases (depth >= PHASES and includePhases)
    // ========================================================================

    let implementingPhases: Phase[] = [];

    if (depth >= TRACE_DEPTH.PHASES && includePhases) {
      const addressesLinks = links.filter(
        (l) => l.targetId === input.requirementId && l.relationType === 'addresses'
      );
      const phaseIds = new Set(addressesLinks.map((l) => l.sourceId));
      const rawPhases = entities.phases.filter((p) => phaseIds.has(p.id));

      // Apply filters (limit, fields, excludeMetadata)
      implementingPhases = this.applyEntityFilters(rawPhases, {
        limit,
        fields: input.phaseFields || input.fields,
        excludeMetadata,
      });
    }

    // ========================================================================
    // Level 3: Find Artifacts (depth >= ARTIFACTS and includeArtifacts)
    // ========================================================================

    let artifacts: Artifact[] = [];

    if (depth >= TRACE_DEPTH.ARTIFACTS && includeArtifacts) {
      // Create Set of phase IDs for O(1) lookup performance
      const implementingPhaseIds = new Set(implementingPhases.map((p) => p.id));

      // Find artifacts related to this requirement or its phases
      const rawArtifacts = entities.artifacts.filter((a) => {
        // Artifact directly related to requirement
        if (a.relatedRequirementIds?.includes(input.requirementId)) {
          return true;
        }
        // Artifact related to implementing phases (O(1) lookup via Set)
        if (a.relatedPhaseId && implementingPhaseIds.has(a.relatedPhaseId)) {
          return true;
        }
        return false;
      });

      // Apply filters (limit, fields, excludeMetadata)
      artifacts = this.applyEntityFilters(rawArtifacts, {
        limit,
        fields: input.fields,
        excludeMetadata,
      });
    }

    // ========================================================================
    // Find Related Decisions (always included)
    // ========================================================================

    // Create Set of decision IDs for O(1) lookup
    const decisionIdSet = new Set(entities.decisions.map((d) => d.id));

    const decisionLinks = links.filter(
      (l) =>
        (l.sourceId === input.requirementId || l.targetId === input.requirementId) &&
        (decisionIdSet.has(l.sourceId) || decisionIdSet.has(l.targetId))
    );
    const relatedDecisionIds = new Set(
      decisionLinks.flatMap((l) => [l.sourceId, l.targetId])
    );
    const decisions = entities.decisions.filter((d) => relatedDecisionIds.has(d.id));

    // ========================================================================
    // Calculate Completion Status
    // ========================================================================

    const isAddressed = allSolutions.length > 0;
    const isImplemented = implementingPhases.some((p) => p.status === 'completed');
    const completionPercentage = this.calculateAverageProgress(implementingPhases);

    // ========================================================================
    // Build Result (conditionally include fields based on depth and flags)
    // ========================================================================

    const trace: any = {
      proposedSolutions: allSolutions,
      selectedSolution,
      alternativeSolutions,
      decisions,
      completionStatus: {
        isAddressed,
        isImplemented,
        completionPercentage,
      },
    };

    // Include implementingPhases if depth >= PHASES AND includePhases is true
    if (depth >= TRACE_DEPTH.PHASES && includePhases) {
      trace.implementingPhases = implementingPhases;
    }

    // Include artifacts if depth >= ARTIFACTS AND includeArtifacts is true
    if (depth >= TRACE_DEPTH.ARTIFACTS && includeArtifacts) {
      trace.artifacts = artifacts;
    }

    return { requirement, trace };
  }

  /**
   * Calculate average progress percentage from phases
   * @param phases - Array of phases with progress values
   * @returns Average progress percentage (0-100), or 0 if no phases
   */
  private calculateAverageProgress(phases: Phase[]): number {
    if (phases.length === 0) return 0;
    const totalProgress = phases.reduce((sum, p) => sum + (p.progress || 0), 0);
    return Math.round(totalProgress / phases.length);
  }

  async validatePlan(input: ValidatePlanInput): Promise<ValidatePlanResult> {
    const planData = await this.planService.getPlan({
      planId: input.planId,
      includeEntities: true,
    });

    const entities = planData.plan.entities!;
    const links = planData.plan.links!;
    const issues: ValidationIssue[] = [];
    const checksPerformed: string[] = [];

    // Check: Uncovered requirements
    checksPerformed.push('uncovered_requirements');
    for (const req of entities.requirements) {
      const hasImplementation = links.some(
        (l) => l.targetId === req.id && l.relationType === 'implements'
      );
      if (!hasImplementation) {
        issues.push({
          severity: 'error',
          type: 'uncovered_requirement',
          entityId: req.id,
          entityType: 'requirement',
          message: `Requirement '${req.title}' has no proposed solutions`,
          suggestion: 'Use propose_solution to address this requirement',
        });
      }
    }

    // Check: Orphan solutions
    checksPerformed.push('orphan_solutions');
    for (const sol of entities.solutions) {
      const hasLinks = links.some(
        (l) => l.sourceId === sol.id && l.relationType === 'implements'
      );
      if (!hasLinks && sol.addressing.length === 0) {
        issues.push({
          severity: 'warning',
          type: 'orphan_solution',
          entityId: sol.id,
          entityType: 'solution',
          message: `Solution '${sol.title}' is not linked to any requirement`,
          suggestion: 'Link to requirement or delete if not needed',
        });
      }
    }

    // Check: Missing decisions
    checksPerformed.push('missing_decisions');
    const reqsWithMultipleSolutions = new Map<string, Solution[]>();
    for (const sol of entities.solutions) {
      for (const reqId of sol.addressing) {
        if (!reqsWithMultipleSolutions.has(reqId)) {
          reqsWithMultipleSolutions.set(reqId, []);
        }
        reqsWithMultipleSolutions.get(reqId)!.push(sol);
      }
    }
    for (const [reqId, solutions] of reqsWithMultipleSolutions) {
      if (solutions.length > 1) {
        const hasSelected = solutions.some((s) => s.status === 'selected');
        if (!hasSelected) {
          issues.push({
            severity: 'info',
            type: 'no_decision_recorded',
            entityId: reqId,
            entityType: 'requirement',
            message: `Multiple solutions for requirement but none selected`,
            suggestion: 'Use select_solution to choose one',
          });
        }
      }
    }

    // Check: Broken links
    checksPerformed.push('broken_links');
    const allIds = new Set([
      ...entities.requirements.map((r) => r.id),
      ...entities.solutions.map((s) => s.id),
      ...entities.decisions.map((d) => d.id),
      ...entities.phases.map((p) => p.id),
      ...entities.artifacts.map((a) => a.id),
    ]);
    for (const link of links) {
      if (!allIds.has(link.sourceId)) {
        issues.push({
          severity: 'error',
          type: 'broken_link',
          message: `Link references non-existent source: ${link.sourceId}`,
        });
      }
      if (!allIds.has(link.targetId)) {
        issues.push({
          severity: 'error',
          type: 'broken_link',
          message: `Link references non-existent target: ${link.targetId}`,
        });
      }
    }

    // Check: Phase status logic
    checksPerformed.push('phase_status_logic');
    const phaseMap = new Map(entities.phases.map((p) => [p.id, p]));
    for (const phase of entities.phases) {
      // Check child-parent status consistency
      if (phase.parentId) {
        const parent = phaseMap.get(phase.parentId);
        if (parent && parent.status === 'planned') {
          if (phase.status === 'completed') {
            issues.push({
              severity: 'error',
              type: 'invalid_phase_status',
              entityId: phase.id,
              entityType: 'phase',
              message: `Phase '${phase.title}' has status 'completed' but parent '${parent.title}' is still 'planned'`,
              suggestion: 'Update parent phase status before completing children',
            });
          } else if (phase.status === 'in_progress') {
            issues.push({
              severity: 'warning',
              type: 'invalid_phase_status',
              entityId: phase.id,
              entityType: 'phase',
              message: `Phase '${phase.title}' is in progress but parent '${parent.title}' is still planned`,
              suggestion: 'Consider updating parent phase status',
            });
          }
        }
      }

      // Check if all children are completed but parent is not
      if (phase.status !== 'completed') {
        const children = entities.phases.filter((p) => p.parentId === phase.id);
        if (children.length > 0 && children.every((c) => c.status === 'completed')) {
          issues.push({
            severity: 'info',
            type: 'parent_should_complete',
            entityId: phase.id,
            entityType: 'phase',
            message: `Phase '${phase.title}' has all children completed but is not marked as completed`,
            suggestion: 'Consider completing this phase',
          });
        }
      }
    }

    // Check: File existence
    checksPerformed.push('file_existence');
    for (const artifact of entities.artifacts) {
      if (artifact.fileTable && artifact.fileTable.length > 0) {
        for (const file of artifact.fileTable) {
          // Skip files that are being created
          if (file.action === 'create') {
            continue;
          }

          // Check if file exists
          try {
            await fs.access(file.path);
          } catch {
            issues.push({
              severity: 'warning',
              type: 'missing_file',
              entityId: artifact.id,
              entityType: 'artifact',
              filePath: file.path,
              message: `File '${file.path}' referenced in artifact '${artifact.title}' (action: ${file.action}) does not exist`,
              suggestion: 'Verify file path or update artifact',
            });
          }
        }
      }
    }

    // Check: Solution implementation
    checksPerformed.push('solution_implementation');
    const selectedSolutions = entities.solutions.filter((s) => s.status === 'selected');
    for (const solution of selectedSolutions) {
      // Find requirements implemented by this solution
      const implementedReqIds = solution.addressing;

      // Find phases that address these requirements
      const addressesLinks = links.filter(
        (l) =>
          l.relationType === 'addresses' &&
          implementedReqIds.includes(l.targetId) &&
          entities.phases.some((p) => p.id === l.sourceId)
      );

      if (addressesLinks.length === 0) {
        issues.push({
          severity: 'warning',
          type: 'unimplemented_solution',
          entityId: solution.id,
          entityType: 'solution',
          message: `Selected solution '${solution.title}' has no implementing phases`,
          suggestion: 'Create phases that address the requirements or link existing phases',
        });
      }
    }

    // Apply validation level filtering (default: basic)
    let filteredIssues = issues;
    if (input.validationLevel !== 'strict') {
      filteredIssues = issues.filter((i) => i.severity === 'error');
    }

    const errors = filteredIssues.filter((i) => i.severity === 'error').length;
    const warnings = filteredIssues.filter((i) => i.severity === 'warning').length;
    const infos = filteredIssues.filter((i) => i.severity === 'info').length;

    return {
      isValid: errors === 0,
      issues: filteredIssues,
      summary: {
        totalIssues: filteredIssues.length,
        errors,
        warnings,
        infos,
      },
      checksPerformed,
    };
  }

  async exportPlan(input: ExportPlanInput): Promise<ExportPlanResult> {
    const planData = await this.planService.getPlan({
      planId: input.planId,
      includeEntities: true,
    });

    let content: string;

    if (input.format === 'json') {
      content = JSON.stringify(planData.plan, null, 2);
    } else {
      content = this.generateMarkdown(planData.plan.manifest, planData.plan.entities!);
    }

    const sizeBytes = Buffer.byteLength(content, 'utf-8');

    // Save export file
    const filename =
      input.format === 'json' ? 'plan-export.json' : 'plan-export.md';
    const filePath = await this.storage.saveExport(input.planId, filename, content);

    return {
      format: input.format,
      content,
      filePath,
      sizeBytes,
    };
  }

  private getSearchableText(entity: Entity): Record<string, string> {
    const base: Record<string, string> = {
      id: entity.id,
      tags: entity.metadata.tags.map((t) => `${t.key}:${t.value}`).join(' '),
    };

    switch (entity.type) {
      case 'requirement': {
        const req = entity as Requirement;
        return {
          ...base,
          title: req.title,
          description: req.description,
          rationale: req.rationale || '',
          acceptanceCriteria: (req.acceptanceCriteria ?? []).join(' '),
        };
      }
      case 'solution': {
        const sol = entity as Solution;
        return {
          ...base,
          title: sol.title,
          description: sol.description,
          approach: sol.approach,
        };
      }
      case 'decision': {
        const dec = entity as Decision;
        return {
          ...base,
          title: dec.title,
          question: dec.question,
          decision: dec.decision,
          context: dec.context,
        };
      }
      case 'phase': {
        const phase = entity as Phase;
        return {
          ...base,
          title: phase.title,
          description: phase.description,
          objectives: (phase.objectives ?? []).join(' '),
          deliverables: (phase.deliverables ?? []).join(' '),
        };
      }
      case 'artifact': {
        const art = entity as Artifact;
        return {
          ...base,
          title: art.title,
          description: art.description,
          content: art.content.sourceCode || '',
          filename: art.content.filename || '',
        };
      }
      default:
        return base;
    }
  }

  private generateMarkdown(
    manifest: any,
    entities: {
      requirements: Requirement[];
      solutions: Solution[];
      decisions: Decision[];
      phases: Phase[];
      artifacts: Artifact[];
    }
  ): string {
    const lines: string[] = [];

    lines.push(`# ${manifest.name}`);
    lines.push('');
    lines.push(manifest.description);
    lines.push('');
    lines.push(`**Status**: ${manifest.status}`);
    lines.push(`**Progress**: ${manifest.statistics.completionPercentage}%`);
    lines.push('');

    // Requirements
    if (entities.requirements.length > 0) {
      lines.push('## Requirements');
      lines.push('');
      for (const req of entities.requirements) {
        lines.push(`### ${req.title}`);
        lines.push('');
        lines.push(req.description);
        lines.push('');
        lines.push(`**Priority**: ${req.priority} | **Category**: ${req.category}`);
        const acceptanceCriteria = req.acceptanceCriteria ?? [];
        if (acceptanceCriteria.length > 0) {
          lines.push('');
          lines.push('**Acceptance Criteria**:');
          for (const ac of acceptanceCriteria) {
            lines.push(`- ${ac}`);
          }
        }
        lines.push('');
      }
    }

    // Solutions
    if (entities.solutions.length > 0) {
      lines.push('## Solutions');
      lines.push('');
      for (const sol of entities.solutions) {
        const badge = sol.status === 'selected' ? ' [SELECTED]' : '';
        lines.push(`### ${sol.title}${badge}`);
        lines.push('');
        lines.push(sol.description);
        lines.push('');
        const tradeoffs = sol.tradeoffs || [];
        if (tradeoffs.length > 0) {
          lines.push('**Trade-offs**:');
          for (const t of tradeoffs) {
            const pros = (t.pros ?? []).join(', ');
            const cons = (t.cons ?? []).join(', ');
            lines.push(`- **${t.aspect}**: +${pros} / -${cons}`);
          }
        }
        lines.push('');
      }
    }

    // Phases
    if (entities.phases.length > 0) {
      lines.push('## Phases');
      lines.push('');
      const sortedPhases = [...entities.phases].sort((a, b) =>
        a.path.localeCompare(b.path)
      );
      for (const phase of sortedPhases) {
        const indent = '  '.repeat(phase.depth);
        const status = phase.status === 'completed' ? ' [DONE]' : '';
        lines.push(`${indent}- **${phase.path}. ${phase.title}**${status}`);
        if (phase.progress > 0 && phase.progress < 100) {
          lines.push(`${indent}  Progress: ${phase.progress}%`);
        }
      }
      lines.push('');
    }

    // Artifacts
    if (entities.artifacts.length > 0) {
      lines.push('## Artifacts');
      lines.push('');
      for (const artifact of entities.artifacts) {
        const statusBadge = artifact.status !== 'draft' ? ` [${artifact.status.toUpperCase()}]` : '';
        lines.push(`### ${artifact.title}${statusBadge}`);
        lines.push('');
        lines.push(artifact.description);
        lines.push('');
        lines.push(`**Type**: ${artifact.artifactType}`);
        if (artifact.content.language) {
          lines.push(` | **Language**: ${artifact.content.language}`);
        }
        if (artifact.content.filename) {
          lines.push(` | **File**: ${artifact.content.filename}`);
        }
        lines.push('');

        // File table
        if (artifact.fileTable && artifact.fileTable.length > 0) {
          lines.push('**Files**:');
          for (const file of artifact.fileTable) {
            const desc = file.description ? ` - ${file.description}` : '';
            lines.push(`- \`${file.path}\` [${file.action}]${desc}`);
          }
          lines.push('');
        }

        // Source code (truncated if too long)
        if (artifact.content.sourceCode) {
          const maxLength = 500;
          const code = artifact.content.sourceCode.length > maxLength
            ? artifact.content.sourceCode.substring(0, maxLength) + '\n... (truncated)'
            : artifact.content.sourceCode;
          lines.push('```' + (artifact.content.language || ''));
          lines.push(code);
          lines.push('```');
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  // ========================================================================
  // Sprint 8: Helper Methods for Fields Filtering and Metadata Removal
  // ========================================================================

  /**
   * Apply limit, fields filtering, and excludeMetadata to an array of entities
   * Consolidates repeated filtering logic into a single reusable method
   * @param entities - Array of entities to filter
   * @param options - Filtering options (limit, fields, excludeMetadata)
   * @returns Filtered array of entities
   */
  private applyEntityFilters<T extends Entity>(
    entities: T[],
    options: {
      limit?: number;
      fields?: string[];
      excludeMetadata?: boolean;
    }
  ): T[] {
    let result = entities;

    // Apply limit
    if (options.limit !== undefined) {
      result = result.slice(0, options.limit);
    }

    // Apply fields filtering
    if (options.fields && options.fields.length > 0) {
      result = result.map((e) => this.filterFields(e, options.fields));
    }

    // Apply excludeMetadata
    if (options.excludeMetadata) {
      result = result.map((e) => this.removeMetadataFields(e));
    }

    return result;
  }

  /**
   * Filter entity fields based on provided field list
   * @param entity - Entity to filter
   * @param fields - Array of field names to include (empty array or undefined returns all fields)
   * @returns Filtered entity with only specified fields
   */
  private filterFields<T extends Entity>(entity: T, fields?: string[]): T {
    if (!fields || fields.length === 0) {
      return entity; // No filtering, return all fields
    }

    const filtered: any = {};
    for (const field of fields) {
      if (field in entity) {
        filtered[field] = (entity as any)[field];
      }
      // Silently ignore non-existent fields
    }

    return filtered as T;
  }

  /**
   * Remove metadata fields from entity
   * Removes: metadata, createdAt, updatedAt, version
   * @param entity - Entity to process
   * @returns Entity without metadata fields
   */
  private removeMetadataFields<T extends Entity>(entity: T): T {
    const { metadata, createdAt, updatedAt, version, ...rest } = entity as any;
    return rest as T;
  }
}

export default QueryService;
