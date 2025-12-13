import type { Services } from '../services.js';
import type {
  CreatePlanInput,
  ListPlansInput,
  GetPlanInput,
  UpdatePlanInput,
  ArchivePlanInput,
  SetActivePlanInput,
  GetActivePlanInput,
  GetSummaryInput,
} from '../../domain/services/plan-service.js';
import { ToolError, createSuccessResponse, type ToolResult } from './types.js';

interface PlanArgs {
  action: string;
  [key: string]: unknown;
}

export async function handlePlan(args: PlanArgs, services: Services): Promise<ToolResult> {
  const { planService } = services;
  const { action } = args;

  let result: unknown;

  switch (action) {
    case 'create':
      result = await planService.createPlan(args as unknown as CreatePlanInput);
      break;
    case 'list':
      result = await planService.listPlans(args as unknown as ListPlansInput);
      break;
    case 'get':
      result = await planService.getPlan(args as unknown as GetPlanInput);
      break;
    case 'update':
      result = await planService.updatePlan(args as unknown as UpdatePlanInput);
      break;
    case 'archive':
      result = await planService.archivePlan(args as unknown as ArchivePlanInput);
      break;
    case 'set_active':
      result = await planService.setActivePlan(args as unknown as SetActivePlanInput);
      break;
    case 'get_active':
      result = await planService.getActivePlan(args as unknown as GetActivePlanInput);
      break;
    case 'get_summary':
      result = await planService.getSummary(args as unknown as GetSummaryInput);
      break;
    default:
      throw new ToolError('InvalidAction', `Unknown action for plan: ${action}`);
  }

  return createSuccessResponse(result);
}
