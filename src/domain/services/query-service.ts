import type { FileStorage } from '../../infrastructure/file-storage.js';
import type { PlanService } from './plan-service.js';
import type { LinkingService } from './linking-service.js';
import type {
  Entity,
  EntityType,
  Requirement,
  Solution,
  Decision,
  Phase,
  Link,
  Tag,
} from '../entities/types.js';

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
}

export interface ValidatePlanInput {
  planId: string;
  checks?: string[];
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
    implementingPhases: Phase[];
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

    // Find solutions that implement this requirement
    const implementsLinks = links.filter(
      (l) => l.targetId === input.requirementId && l.relationType === 'implements'
    );
    const solutionIds = implementsLinks.map((l) => l.sourceId);
    const allSolutions = entities.solutions.filter((s) => solutionIds.includes(s.id));

    const selectedSolution = allSolutions.find((s) => s.status === 'selected') || null;
    const alternativeSolutions = allSolutions.filter((s) => s.status !== 'selected');

    // Find phases that address this requirement
    const addressesLinks = links.filter(
      (l) => l.targetId === input.requirementId && l.relationType === 'addresses'
    );
    const phaseIds = addressesLinks.map((l) => l.sourceId);
    const implementingPhases = entities.phases.filter((p) => phaseIds.includes(p.id));

    // Find related decisions
    const decisionLinks = links.filter(
      (l) =>
        (l.sourceId === input.requirementId || l.targetId === input.requirementId) &&
        (entities.decisions.some((d) => d.id === l.sourceId) ||
          entities.decisions.some((d) => d.id === l.targetId))
    );
    const decisionIds = new Set(
      decisionLinks.flatMap((l) => [l.sourceId, l.targetId])
    );
    const decisions = entities.decisions.filter((d) => decisionIds.has(d.id));

    // Calculate completion
    const isAddressed = allSolutions.length > 0;
    const isImplemented = implementingPhases.some((p) => p.status === 'completed');
    const completionPercentage =
      implementingPhases.length > 0
        ? Math.round(
            implementingPhases.reduce((sum, p) => sum + p.progress, 0) /
              implementingPhases.length
          )
        : 0;

    return {
      requirement,
      trace: {
        proposedSolutions: allSolutions,
        selectedSolution,
        alternativeSolutions,
        decisions,
        implementingPhases,
        completionStatus: {
          isAddressed,
          isImplemented,
          completionPercentage,
        },
      },
    };
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

    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    const infos = issues.filter((i) => i.severity === 'info').length;

    return {
      isValid: errors === 0,
      issues,
      summary: {
        totalIssues: issues.length,
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
          acceptanceCriteria: req.acceptanceCriteria.join(' '),
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
          objectives: phase.objectives.join(' '),
          deliverables: phase.deliverables.join(' '),
        };
      }
    }
  }

  private generateMarkdown(
    manifest: any,
    entities: {
      requirements: Requirement[];
      solutions: Solution[];
      decisions: Decision[];
      phases: Phase[];
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
        if (req.acceptanceCriteria.length > 0) {
          lines.push('');
          lines.push('**Acceptance Criteria**:');
          for (const ac of req.acceptanceCriteria) {
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
        if (sol.tradeoffs.length > 0) {
          lines.push('**Trade-offs**:');
          for (const t of sol.tradeoffs) {
            lines.push(`- **${t.aspect}**: +${t.pros.join(', ')} / -${t.cons.join(', ')}`);
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

    return lines.join('\n');
  }
}

export default QueryService;
