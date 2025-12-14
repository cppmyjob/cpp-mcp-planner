import type { Services } from '../services.js';
import type {
  AddPhaseInput,
  GetPhaseInput,
  GetPhasesInput,
  GetPhaseTreeInput,
  UpdatePhaseInput,
  UpdatePhaseStatusInput,
  MovePhaseInput,
  DeletePhaseInput,
  GetNextActionsInput,
  CompleteAndAdvanceInput,
} from '../../domain/services/phase-service.js';
import { ToolError, createSuccessResponse, type ToolResult } from './types.js';
import {
  VALID_PHASE_FIELDS,
  METADATA_FIELDS,
  SUMMARY_FIELDS,
  COMPUTED_FIELDS,
} from '../../domain/utils/field-filter.js';

interface PhaseArgs {
  action: string;
  [key: string]: unknown;
}

interface GetHistoryArgs {
  planId: string;
  phaseId: string;
  limit?: number;
  offset?: number;
}

interface DiffArgs {
  planId: string;
  phaseId: string;
  version1: number;
  version2: number;
}

export async function handlePhase(args: PhaseArgs, services: Services): Promise<ToolResult> {
  const { phaseService } = services;
  const { action } = args;

  let result: unknown;

  switch (action) {
    case 'add':
      result = await phaseService.addPhase(args as unknown as AddPhaseInput);
      break;
    case 'get':
      result = await phaseService.getPhase(args as unknown as GetPhaseInput);
      break;
    case 'get_many':
      result = await phaseService.getPhases(args as unknown as GetPhasesInput);
      break;
    case 'get_tree':
      result = await phaseService.getPhaseTree(args as unknown as GetPhaseTreeInput);
      break;
    case 'update':
      result = await phaseService.updatePhase(args as unknown as UpdatePhaseInput);
      break;
    case 'update_status':
      result = await phaseService.updatePhaseStatus(args as unknown as UpdatePhaseStatusInput);
      break;
    case 'move':
      result = await phaseService.movePhase(args as unknown as MovePhaseInput);
      break;
    case 'delete':
      result = await phaseService.deletePhase(args as unknown as DeletePhaseInput);
      break;
    case 'get_next_actions':
      result = await phaseService.getNextActions(args as unknown as GetNextActionsInput);
      break;
    case 'complete_and_advance':
      result = await phaseService.completeAndAdvance(args as unknown as CompleteAndAdvanceInput);
      break;
    case 'get_history':
      result = await phaseService.getHistory(args as unknown as GetHistoryArgs);
      break;
    case 'diff':
      result = await phaseService.diff(args as unknown as DiffArgs);
      break;
    case 'list_fields':
      // Introspection: return field metadata for phase entity
      result = {
        entity: 'phase',
        summary: SUMMARY_FIELDS.phase,
        all: Array.from(VALID_PHASE_FIELDS),
        metadata: METADATA_FIELDS,
        computed: COMPUTED_FIELDS, // Phases have computed fields: depth, path, childCount
      };
      break;
    default:
      throw new ToolError('InvalidAction', `Unknown action for phase: ${action}`);
  }

  return createSuccessResponse(result);
}
