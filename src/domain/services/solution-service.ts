import { v4 as uuidv4 } from 'uuid';
import type { FileStorage } from '../../infrastructure/file-storage.js';
import type { PlanService } from './plan-service.js';
import type { Solution, SolutionStatus, Tradeoff, EffortEstimate, Tag } from '../entities/types.js';
import { validateEffortEstimate, validateTags } from './validators.js';
import { filterEntity, filterEntities } from '../utils/field-filter.js';

// Input types
export interface ProposeSolutionInput {
  planId: string;
  solution: {
    title: string;
    description: string;
    approach: string;
    implementationNotes?: string;
    tradeoffs: Tradeoff[];
    addressing: string[];
    evaluation: {
      effortEstimate: EffortEstimate;
      technicalFeasibility: 'high' | 'medium' | 'low';
      riskAssessment: string;
      dependencies?: string[];
      performanceImpact?: string;
    };
    tags?: Tag[];
  };
}

export interface CompareSolutionsInput {
  planId: string;
  solutionIds: string[];
  aspects?: string[];
}

export interface SelectSolutionInput {
  planId: string;
  solutionId: string;
  reason?: string;
}

export interface UpdateSolutionInput {
  planId: string;
  solutionId: string;
  updates: Partial<ProposeSolutionInput['solution']>;
}

export interface ListSolutionsInput {
  planId: string;
  filters?: {
    status?: SolutionStatus;
    addressingRequirement?: string;
    tags?: Tag[];
  };
  limit?: number;
  offset?: number;
  fields?: string[]; // Fields to include: summary (default), ['*'] (all), or custom list
  excludeMetadata?: boolean; // Exclude metadata fields (createdAt, updatedAt, version, metadata)
}

export interface DeleteSolutionInput {
  planId: string;
  solutionId: string;
  force?: boolean;
}

export interface GetSolutionInput {
  planId: string;
  solutionId: string;
  fields?: string[]; // Fields to include: summary (default), ['*'] (all), or custom list
  excludeMetadata?: boolean; // Exclude metadata fields (createdAt, updatedAt, version, metadata)
}

export interface GetSolutionResult {
  solution: Solution;
}

export interface GetSolutionsInput {
  planId: string;
  solutionIds: string[];
  fields?: string[];
  excludeMetadata?: boolean;
}

export interface GetSolutionsResult {
  solutions: Solution[];
  notFound: string[];
}

// Output types
export interface ProposeSolutionResult {
  solutionId: string;
}

export interface CompareSolutionsResult {
  comparison: {
    solutions: Solution[];
    matrix: Array<{
      aspect: string;
      solutions: Array<{
        solutionId: string;
        solutionTitle: string;
        pros: string[];
        cons: string[];
        score?: number;
      }>;
      winner?: string;
    }>;
    summary: {
      bestOverall?: string;
      recommendations: string[];
    };
  };
}

export interface SelectSolutionResult {
  success: boolean;
  solutionId: string;
  deselectedIds?: string[];
}

export interface UpdateSolutionResult {
  success: boolean;
  solutionId: string;
}

export interface ListSolutionsResult {
  solutions: Solution[];
  total: number;
  hasMore: boolean;
}

export interface DeleteSolutionResult {
  success: boolean;
  message: string;
}

export class SolutionService {
  constructor(
    private storage: FileStorage,
    private planService: PlanService
  ) {}

  async getSolution(input: GetSolutionInput): Promise<GetSolutionResult> {
    const solutions = await this.storage.loadEntities<Solution>(input.planId, 'solutions');
    const solution = solutions.find((s) => s.id === input.solutionId);

    if (!solution) {
      throw new Error('Solution not found');
    }

    // Apply field filtering - GET operations default to all fields
    const filtered = filterEntity(
      solution,
      input.fields ?? ['*'],
      'solution',
      input.excludeMetadata,
      false
    ) as Solution;

    return { solution: filtered };
  }

  async getSolutions(input: GetSolutionsInput): Promise<GetSolutionsResult> {
    // Enforce max limit
    if (input.solutionIds.length > 100) {
      throw new Error('Cannot fetch more than 100 solutions at once');
    }

    // Handle empty array
    if (input.solutionIds.length === 0) {
      return { solutions: [], notFound: [] };
    }

    const allSolutions = await this.storage.loadEntities<Solution>(input.planId, 'solutions');
    const foundSolutions: Solution[] = [];
    const notFound: string[] = [];

    // Collect found and not found IDs
    for (const id of input.solutionIds) {
      const solution = allSolutions.find((s) => s.id === id);
      if (solution) {
        // Apply field filtering - solutions default to all fields
        const filtered = filterEntity(
          solution,
          input.fields ?? ['*'],
          'solution',
          input.excludeMetadata,
          false
        ) as Solution;
        foundSolutions.push(filtered);
      } else {
        notFound.push(id);
      }
    }

    return { solutions: foundSolutions, notFound };
  }

  async proposeSolution(input: ProposeSolutionInput): Promise<ProposeSolutionResult> {
    // Validate tradeoffs format
    this.validateTradeoffs(input.solution.tradeoffs);
    // Validate effortEstimate format
    validateEffortEstimate(input.solution.evaluation?.effortEstimate);
    // Validate tags format
    validateTags(input.solution.tags || []);

    const solutionId = uuidv4();
    const now = new Date().toISOString();

    const solution: Solution = {
      id: solutionId,
      type: 'solution',
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {
        createdBy: 'claude-code',
        tags: input.solution.tags || [],
        annotations: [],
      },
      title: input.solution.title,
      description: input.solution.description,
      approach: input.solution.approach,
      implementationNotes: input.solution.implementationNotes,
      tradeoffs: input.solution.tradeoffs,
      addressing: input.solution.addressing,
      evaluation: input.solution.evaluation,
      status: 'proposed',
    };

    const solutions = await this.storage.loadEntities<Solution>(input.planId, 'solutions');
    solutions.push(solution);
    await this.storage.saveEntities(input.planId, 'solutions', solutions);
    await this.planService.updateStatistics(input.planId);

    return { solutionId };
  }

  async compareSolutions(input: CompareSolutionsInput): Promise<CompareSolutionsResult> {
    // Validate solutionIds parameter
    if (!input.solutionIds || !Array.isArray(input.solutionIds) || input.solutionIds.length === 0) {
      throw new Error('solutionIds must be a non-empty array');
    }

    const allSolutions = await this.storage.loadEntities<Solution>(input.planId, 'solutions');
    const solutions = allSolutions.filter((s) => input.solutionIds.includes(s.id));

    // Collect all aspects
    const aspectsSet = new Set<string>();
    solutions.forEach((s) => s.tradeoffs.forEach((t) => aspectsSet.add(t.aspect)));

    let aspects = Array.from(aspectsSet);
    if (input.aspects && input.aspects.length > 0) {
      aspects = aspects.filter((a) => input.aspects!.includes(a));
    }

    // Build comparison matrix
    const matrix = aspects.map((aspect) => {
      const solutionData = solutions.map((s) => {
        const tradeoff = s.tradeoffs.find((t) => t.aspect === aspect);
        return {
          solutionId: s.id,
          solutionTitle: s.title,
          pros: tradeoff?.pros || [],
          cons: tradeoff?.cons || [],
          score: tradeoff?.score,
        };
      });

      // Find winner for this aspect
      const withScores = solutionData.filter((d) => d.score !== undefined);
      let winner: string | undefined;
      if (withScores.length > 0) {
        const best = withScores.reduce((a, b) =>
          (a.score || 0) > (b.score || 0) ? a : b
        );
        winner = best.solutionId;
      }

      return { aspect, solutions: solutionData, winner };
    });

    // Calculate overall best
    const scores: Record<string, number[]> = {};
    solutions.forEach((s) => {
      scores[s.id] = s.tradeoffs.filter((t) => t.score !== undefined).map((t) => t.score!);
    });

    let bestOverall: string | undefined;
    let bestAvg = -1;
    for (const [id, scoreList] of Object.entries(scores)) {
      if (scoreList.length > 0) {
        const avg = scoreList.reduce((a, b) => a + b, 0) / scoreList.length;
        if (avg > bestAvg) {
          bestAvg = avg;
          bestOverall = id;
        }
      }
    }

    return {
      comparison: {
        solutions,
        matrix,
        summary: {
          bestOverall,
          recommendations: bestOverall
            ? [`${solutions.find((s) => s.id === bestOverall)?.title} has the highest average score`]
            : [],
        },
      },
    };
  }

  async selectSolution(input: SelectSolutionInput): Promise<SelectSolutionResult> {
    const solutions = await this.storage.loadEntities<Solution>(input.planId, 'solutions');
    const index = solutions.findIndex((s) => s.id === input.solutionId);

    if (index === -1) {
      throw new Error('Solution not found');
    }

    const solution = solutions[index];
    const now = new Date().toISOString();

    // Deselect other solutions that address the same requirements
    const deselected: Solution[] = [];
    for (const s of solutions) {
      if (
        s.id !== input.solutionId &&
        s.status === 'selected' &&
        s.addressing.some((r) => solution.addressing.includes(r))
      ) {
        s.status = 'rejected';
        s.updatedAt = now;
        s.version += 1;
        deselected.push(s);
      }
    }

    // Select this solution
    solution.status = 'selected';
    solution.selectionReason = input.reason;
    solution.updatedAt = now;
    solution.version += 1;

    solutions[index] = solution;
    await this.storage.saveEntities(input.planId, 'solutions', solutions);

    return {
      success: true,
      solutionId: input.solutionId,
      deselectedIds: deselected.length > 0 ? deselected.map((s) => s.id) : undefined,
    };
  }

  async updateSolution(input: UpdateSolutionInput): Promise<UpdateSolutionResult> {
    const solutions = await this.storage.loadEntities<Solution>(input.planId, 'solutions');
    const index = solutions.findIndex((s) => s.id === input.solutionId);

    if (index === -1) {
      throw new Error('Solution not found');
    }

    const solution = solutions[index];
    const now = new Date().toISOString();

    // Apply updates
    if (input.updates.title !== undefined) solution.title = input.updates.title;
    if (input.updates.description !== undefined) solution.description = input.updates.description;
    if (input.updates.approach !== undefined) solution.approach = input.updates.approach;
    if (input.updates.implementationNotes !== undefined)
      solution.implementationNotes = input.updates.implementationNotes;
    if (input.updates.tradeoffs !== undefined) {
      this.validateTradeoffs(input.updates.tradeoffs);
      solution.tradeoffs = input.updates.tradeoffs;
    }
    if (input.updates.addressing !== undefined) solution.addressing = input.updates.addressing;
    if (input.updates.evaluation !== undefined) {
      validateEffortEstimate(input.updates.evaluation.effortEstimate);
      solution.evaluation = input.updates.evaluation;
    }
    if (input.updates.tags !== undefined) {
      validateTags(input.updates.tags);
      solution.metadata.tags = input.updates.tags;
    }

    solution.updatedAt = now;
    solution.version += 1;

    solutions[index] = solution;
    await this.storage.saveEntities(input.planId, 'solutions', solutions);

    return { success: true, solutionId: input.solutionId };
  }

  async listSolutions(input: ListSolutionsInput): Promise<ListSolutionsResult> {
    let solutions = await this.storage.loadEntities<Solution>(input.planId, 'solutions');

    if (input.filters) {
      if (input.filters.status) {
        solutions = solutions.filter((s) => s.status === input.filters!.status);
      }
      if (input.filters.addressingRequirement) {
        solutions = solutions.filter((s) =>
          s.addressing.includes(input.filters!.addressingRequirement!)
        );
      }
    }

    const total = solutions.length;
    const offset = input.offset || 0;
    const limit = input.limit || 50;
    const paginated = solutions.slice(offset, offset + limit);

    // Apply field filtering
    const filtered = filterEntities(
      paginated,
      input.fields,
      'solution',
      input.excludeMetadata,
      false
    ) as Solution[];

    return {
      solutions: filtered,
      total,
      hasMore: offset + limit < total,
    };
  }

  async deleteSolution(input: DeleteSolutionInput): Promise<DeleteSolutionResult> {
    const solutions = await this.storage.loadEntities<Solution>(input.planId, 'solutions');
    const index = solutions.findIndex((s) => s.id === input.solutionId);

    if (index === -1) {
      throw new Error('Solution not found');
    }

    solutions.splice(index, 1);
    await this.storage.saveEntities(input.planId, 'solutions', solutions);
    await this.planService.updateStatistics(input.planId);

    return { success: true, message: 'Solution deleted' };
  }

  private validateTradeoffs(tradeoffs: unknown[]): void {
    if (!Array.isArray(tradeoffs)) {
      return; // Empty or not array is OK
    }

    for (let i = 0; i < tradeoffs.length; i++) {
      const t = tradeoffs[i] as Record<string, unknown>;

      // Check for invalid { pro, con } format
      if ('pro' in t || 'con' in t) {
        throw new Error(
          `Invalid tradeoff format at index ${i}: found { pro, con } format. ` +
          `Expected { aspect: string, pros: string[], cons: string[] }`
        );
      }

      // Validate required fields
      if (typeof t.aspect !== 'string' || !t.aspect) {
        throw new Error(
          `Invalid tradeoff at index ${i}: 'aspect' must be a non-empty string`
        );
      }

      if (!Array.isArray(t.pros)) {
        throw new Error(
          `Invalid tradeoff at index ${i}: 'pros' must be an array of strings`
        );
      }

      if (!Array.isArray(t.cons)) {
        throw new Error(
          `Invalid tradeoff at index ${i}: 'cons' must be an array of strings`
        );
      }
    }
  }
}

export default SolutionService;
