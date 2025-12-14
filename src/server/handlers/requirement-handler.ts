import type { Services } from '../services.js';
import type {
  AddRequirementInput,
  GetRequirementInput,
  GetRequirementsInput,
  UpdateRequirementInput,
  ListRequirementsInput,
  DeleteRequirementInput,
  VoteForRequirementInput,
  UnvoteRequirementInput,
  ResetAllVotesInput,
} from '../../domain/services/requirement-service.js';
import { ToolError, createSuccessResponse, type ToolResult } from './types.js';
import {
  VALID_REQUIREMENT_FIELDS,
  METADATA_FIELDS,
  SUMMARY_FIELDS,
} from '../../domain/utils/field-filter.js';

interface RequirementArgs {
  action: string;
  [key: string]: unknown;
}

interface GetHistoryArgs {
  planId: string;
  requirementId: string;
  limit?: number;
  offset?: number;
}

interface DiffArgs {
  planId: string;
  requirementId: string;
  version1: number;
  version2: number;
}

export async function handleRequirement(args: RequirementArgs, services: Services): Promise<ToolResult> {
  const { requirementService } = services;
  const { action } = args;

  let result: unknown;

  switch (action) {
    case 'add':
      result = await requirementService.addRequirement(args as unknown as AddRequirementInput);
      break;
    case 'get':
      result = await requirementService.getRequirement(args as unknown as GetRequirementInput);
      break;
    case 'get_many':
      result = await requirementService.getRequirements(args as unknown as GetRequirementsInput);
      break;
    case 'update':
      result = await requirementService.updateRequirement(args as unknown as UpdateRequirementInput);
      break;
    case 'list':
      result = await requirementService.listRequirements(args as unknown as ListRequirementsInput);
      break;
    case 'delete':
      result = await requirementService.deleteRequirement(args as unknown as DeleteRequirementInput);
      break;
    case 'vote':
      result = await requirementService.voteForRequirement(args as unknown as VoteForRequirementInput);
      break;
    case 'unvote':
      result = await requirementService.unvoteRequirement(args as unknown as UnvoteRequirementInput);
      break;
    case 'get_history':
      result = await requirementService.getHistory(args as unknown as GetHistoryArgs);
      break;
    case 'diff':
      result = await requirementService.diff(args as unknown as DiffArgs);
      break;
    case 'reset_all_votes':
      result = await requirementService.resetAllVotes(args as unknown as ResetAllVotesInput);
      break;
    case 'list_fields':
      // Introspection: return field metadata for requirement entity
      result = {
        entity: 'requirement',
        summary: SUMMARY_FIELDS.requirement,
        all: Array.from(VALID_REQUIREMENT_FIELDS),
        metadata: METADATA_FIELDS,
        computed: [], // Requirements have no computed fields
      };
      break;
    default:
      throw new ToolError('InvalidAction', `Unknown action for requirement: ${action}`);
  }

  return createSuccessResponse(result);
}
