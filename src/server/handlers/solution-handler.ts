import type { Services } from '../services.js';
import type {
  ProposeSolutionInput,
  GetSolutionInput,
  GetSolutionsInput,
  UpdateSolutionInput,
  ListSolutionsInput,
  CompareSolutionsInput,
  SelectSolutionInput,
  DeleteSolutionInput,
} from '../../domain/services/solution-service.js';
import { ToolError, createSuccessResponse, type ToolResult } from './types.js';
import {
  VALID_SOLUTION_FIELDS,
  METADATA_FIELDS,
  SUMMARY_FIELDS,
} from '../../domain/utils/field-filter.js';

interface SolutionArgs {
  action: string;
  [key: string]: unknown;
}

interface GetHistoryArgs {
  planId: string;
  solutionId: string;
  limit?: number;
  offset?: number;
}

interface DiffArgs {
  planId: string;
  solutionId: string;
  version1: number;
  version2: number;
}

export async function handleSolution(args: SolutionArgs, services: Services): Promise<ToolResult> {
  const { solutionService } = services;
  const { action } = args;

  let result: unknown;

  switch (action) {
    case 'propose':
      result = await solutionService.proposeSolution(args as unknown as ProposeSolutionInput);
      break;
    case 'get':
      result = await solutionService.getSolution(args as unknown as GetSolutionInput);
      break;
    case 'get_many':
      result = await solutionService.getSolutions(args as unknown as GetSolutionsInput);
      break;
    case 'update':
      result = await solutionService.updateSolution(args as unknown as UpdateSolutionInput);
      break;
    case 'list':
      result = await solutionService.listSolutions(args as unknown as ListSolutionsInput);
      break;
    case 'compare':
      result = await solutionService.compareSolutions(args as unknown as CompareSolutionsInput);
      break;
    case 'select':
      result = await solutionService.selectSolution(args as unknown as SelectSolutionInput);
      break;
    case 'delete':
      result = await solutionService.deleteSolution(args as unknown as DeleteSolutionInput);
      break;
    case 'get_history':
      result = await solutionService.getHistory(args as unknown as GetHistoryArgs);
      break;
    case 'diff':
      result = await solutionService.diff(args as unknown as DiffArgs);
      break;
    case 'list_fields':
      // Introspection: return field metadata for solution entity
      result = {
        entity: 'solution',
        summary: SUMMARY_FIELDS.solution,
        all: Array.from(VALID_SOLUTION_FIELDS),
        metadata: METADATA_FIELDS,
        computed: [],
      };
      break;
    default:
      throw new ToolError('InvalidAction', `Unknown action for solution: ${action}`);
  }

  return createSuccessResponse(result);
}
