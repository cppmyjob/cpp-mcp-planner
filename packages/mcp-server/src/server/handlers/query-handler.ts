import type { Services } from '../services.js';
import type {
  SearchEntitiesInput,
  TraceRequirementInput,
  ValidatePlanInput,
  ExportPlanInput,
} from '@mcp-planner/core';
import { ToolError, createSuccessResponse, type ToolResult } from './types.js';

interface QueryArgs {
  action: string;
  [key: string]: unknown;
}

export async function handleQuery(args: QueryArgs, services: Services): Promise<ToolResult> {
  const { queryService, storagePath } = services;
  const { action } = args;

  let result: unknown;

  switch (action) {
    case 'search':
      result = await queryService.searchEntities(args as unknown as SearchEntitiesInput);
      break;
    case 'trace':
      result = await queryService.traceRequirement(args as unknown as TraceRequirementInput);
      break;
    case 'validate':
      result = await queryService.validatePlan(args as unknown as ValidatePlanInput);
      break;
    case 'export':
      result = await queryService.exportPlan(args as unknown as ExportPlanInput);
      break;
    case 'health':
      result = {
        status: 'healthy',
        version: '1.0.0',
        storagePath,
        timestamp: new Date().toISOString(),
      };
      break;
    default:
      throw new ToolError('InvalidAction', `Unknown action for query: ${action}`);
  }

  return createSuccessResponse(result);
}
