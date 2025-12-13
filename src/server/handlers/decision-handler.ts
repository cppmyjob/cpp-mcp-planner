import type { Services } from '../services.js';
import type {
  RecordDecisionInput,
  GetDecisionInput,
  GetDecisionsInput,
  UpdateDecisionInput,
  ListDecisionsInput,
  SupersedeDecisionInput,
} from '../../domain/services/decision-service.js';
import { ToolError, createSuccessResponse, type ToolResult } from './types.js';

interface DecisionArgs {
  action: string;
  [key: string]: unknown;
}

interface GetHistoryArgs {
  planId: string;
  decisionId: string;
  limit?: number;
  offset?: number;
}

interface DiffArgs {
  planId: string;
  decisionId: string;
  version1: number;
  version2: number;
}

export async function handleDecision(args: DecisionArgs, services: Services): Promise<ToolResult> {
  const { decisionService } = services;
  const { action } = args;

  let result: unknown;

  switch (action) {
    case 'record':
      result = await decisionService.recordDecision(args as unknown as RecordDecisionInput);
      break;
    case 'get':
      result = await decisionService.getDecision(args as unknown as GetDecisionInput);
      break;
    case 'get_many':
      result = await decisionService.getDecisions(args as unknown as GetDecisionsInput);
      break;
    case 'update':
      result = await decisionService.updateDecision(args as unknown as UpdateDecisionInput);
      break;
    case 'list':
      result = await decisionService.listDecisions(args as unknown as ListDecisionsInput);
      break;
    case 'supersede':
      result = await decisionService.supersedeDecision(args as unknown as SupersedeDecisionInput);
      break;
    case 'get_history':
      result = await decisionService.getHistory(args as unknown as GetHistoryArgs);
      break;
    case 'diff':
      result = await decisionService.diff(args as unknown as DiffArgs);
      break;
    default:
      throw new ToolError('InvalidAction', `Unknown action for decision: ${action}`);
  }

  return createSuccessResponse(result);
}
