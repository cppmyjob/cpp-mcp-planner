import type { Services } from '../services.js';
import type {
  LinkEntitiesInput,
  GetEntityLinksInput,
  UnlinkEntitiesInput,
} from '../../domain/services/linking-service.js';
import { ToolError, createSuccessResponse, type ToolResult } from './types.js';

interface LinkArgs {
  action: string;
  [key: string]: unknown;
}

export async function handleLink(args: LinkArgs, services: Services): Promise<ToolResult> {
  const { linkingService } = services;
  const { action } = args;

  let result: unknown;

  switch (action) {
    case 'create':
      result = await linkingService.linkEntities(args as unknown as LinkEntitiesInput);
      break;
    case 'get':
      result = await linkingService.getEntityLinks(args as unknown as GetEntityLinksInput);
      break;
    case 'delete':
      result = await linkingService.unlinkEntities(args as unknown as UnlinkEntitiesInput);
      break;
    default:
      throw new ToolError('InvalidAction', `Unknown action for link: ${action}`);
  }

  return createSuccessResponse(result);
}
