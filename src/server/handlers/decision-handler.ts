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
import {
  VALID_DECISION_FIELDS,
  METADATA_FIELDS,
  SUMMARY_FIELDS,
} from '../../domain/utils/field-filter.js';

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
    case 'list': {
      // BUG-004 FIX: Map MCP API (status in root) to Service API (status in filters)
      const { status, tags, planId, limit, offset, fields, excludeMetadata } = args as unknown as {
        status?: string;
        tags?: unknown[];
        planId: string;
        limit?: number;
        offset?: number;
        fields?: string[];
        excludeMetadata?: boolean;
      };

      const listInput: ListDecisionsInput = {
        planId,
        limit,
        offset,
        fields,
        excludeMetadata,
      };

      // Map status and tags to filters object if present
      if (status !== undefined || (tags !== undefined && tags.length > 0)) {
        listInput.filters = {};
        if (status !== undefined) {
          listInput.filters.status = status as 'active' | 'superseded' | 'reversed';
        }
        if (tags !== undefined && tags.length > 0) {
          listInput.filters.tags = tags as { key: string; value: string }[];
        }
      }

      result = await decisionService.listDecisions(listInput);
      break;
    }
    case 'supersede':
      result = await decisionService.supersedeDecision(args as unknown as SupersedeDecisionInput);
      break;
    case 'get_history':
      result = await decisionService.getHistory(args as unknown as GetHistoryArgs);
      break;
    case 'diff':
      result = await decisionService.diff(args as unknown as DiffArgs);
      break;
    case 'list_fields':
      // Introspection: return field metadata for decision entity
      result = {
        entity: 'decision',
        summary: SUMMARY_FIELDS.decision,
        all: Array.from(VALID_DECISION_FIELDS),
        metadata: METADATA_FIELDS,
        computed: [],
      };
      break;
    default:
      throw new ToolError('InvalidAction', `Unknown action for decision: ${action}`);
  }

  return createSuccessResponse(result);
}
