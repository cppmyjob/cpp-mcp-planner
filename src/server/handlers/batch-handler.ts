import type { Services } from '../services.js';
import type { ExecuteBatchInput } from '../../domain/services/batch-service.js';
import { createSuccessResponse, type ToolResult } from './types.js';

interface BatchArgs {
  planId: string;
  operations: unknown[];
}

export async function handleBatch(args: BatchArgs, services: Services): Promise<ToolResult> {
  const { batchService } = services;

  const result = await batchService.executeBatch(args as unknown as ExecuteBatchInput);

  return createSuccessResponse(result);
}
