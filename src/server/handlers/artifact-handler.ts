import type { Services } from '../services.js';
import type {
  AddArtifactInput,
  GetArtifactInput,
  UpdateArtifactInput,
  ListArtifactsInput,
  DeleteArtifactInput,
} from '../../domain/services/artifact-service.js';
import { ToolError, createSuccessResponse, type ToolResult } from './types.js';

interface ArtifactArgs {
  action: string;
  [key: string]: unknown;
}

interface GetHistoryArgs {
  planId: string;
  artifactId: string;
  limit?: number;
  offset?: number;
}

interface DiffArgs {
  planId: string;
  artifactId: string;
  version1: number;
  version2: number;
}

export async function handleArtifact(args: ArtifactArgs, services: Services): Promise<ToolResult> {
  const { artifactService } = services;
  const { action } = args;

  let result: unknown;

  switch (action) {
    case 'add':
      result = await artifactService.addArtifact(args as unknown as AddArtifactInput);
      break;
    case 'get':
      result = await artifactService.getArtifact(args as unknown as GetArtifactInput);
      break;
    case 'update':
      result = await artifactService.updateArtifact(args as unknown as UpdateArtifactInput);
      break;
    case 'list':
      result = await artifactService.listArtifacts(args as unknown as ListArtifactsInput);
      break;
    case 'delete':
      result = await artifactService.deleteArtifact(args as unknown as DeleteArtifactInput);
      break;
    case 'get_history':
      result = await artifactService.getHistory(args as unknown as GetHistoryArgs);
      break;
    case 'diff':
      result = await artifactService.diff(args as unknown as DiffArgs);
      break;
    default:
      throw new ToolError('InvalidAction', `Unknown action for artifact: ${action}`);
  }

  return createSuccessResponse(result);
}
