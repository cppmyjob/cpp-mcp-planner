import type { Services } from './services.js';
import type {
  CreatePlanInput,
  ListPlansInput,
  GetPlanInput,
  UpdatePlanInput,
  ArchivePlanInput,
  SetActivePlanInput,
  GetActivePlanInput,
  GetSummaryInput,
} from '../domain/services/plan-service.js';
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
} from '../domain/services/requirement-service.js';
import type {
  ProposeSolutionInput,
  GetSolutionInput,
  GetSolutionsInput,
  UpdateSolutionInput,
  ListSolutionsInput,
  CompareSolutionsInput,
  SelectSolutionInput,
  DeleteSolutionInput,
} from '../domain/services/solution-service.js';
import type {
  RecordDecisionInput,
  GetDecisionInput,
  GetDecisionsInput,
  UpdateDecisionInput,
  ListDecisionsInput,
  SupersedeDecisionInput,
} from '../domain/services/decision-service.js';
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
} from '../domain/services/phase-service.js';
import type {
  AddArtifactInput,
  GetArtifactInput,
  UpdateArtifactInput,
  ListArtifactsInput,
  DeleteArtifactInput,
} from '../domain/services/artifact-service.js';
import type {
  LinkEntitiesInput,
  GetEntityLinksInput,
  UnlinkEntitiesInput,
} from '../domain/services/linking-service.js';
import type {
  SearchEntitiesInput,
  TraceRequirementInput,
  ValidatePlanInput,
  ExportPlanInput,
} from '../domain/services/query-service.js';
import type { ExecuteBatchInput } from '../domain/services/batch-service.js';

export class ToolError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  services: Services
): Promise<{ content: [{ type: 'text'; text: string }] }> {
  const {
    storagePath,
    planService,
    requirementService,
    solutionService,
    decisionService,
    phaseService,
    artifactService,
    linkingService,
    queryService,
    batchService,
  } = services;

  const action = args.action as string;

  try {
    let result: unknown;

    switch (name) {
      case 'plan':
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
        break;

      case 'requirement':
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
            result = await requirementService.getHistory(args as unknown as { planId: string; requirementId: string; limit?: number; offset?: number });
            break;
          case 'diff':
            result = await requirementService.diff(args as unknown as { planId: string; requirementId: string; version1: number; version2: number });
            break;
          case 'reset_all_votes':
            result = await requirementService.resetAllVotes(args as unknown as ResetAllVotesInput);
            break;
          default:
            throw new ToolError('InvalidAction', `Unknown action for requirement: ${action}`);
        }
        break;

      case 'solution':
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
            result = await solutionService.getHistory(args as unknown as { planId: string; solutionId: string; limit?: number; offset?: number });
            break;
          case 'diff':
            result = await solutionService.diff(args as unknown as { planId: string; solutionId: string; version1: number; version2: number });
            break;
          default:
            throw new ToolError('InvalidAction', `Unknown action for solution: ${action}`);
        }
        break;

      case 'decision':
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
            result = await decisionService.getHistory(args as unknown as { planId: string; decisionId: string; limit?: number; offset?: number });
            break;
          case 'diff':
            result = await decisionService.diff(args as unknown as { planId: string; decisionId: string; version1: number; version2: number });
            break;
          default:
            throw new ToolError('InvalidAction', `Unknown action for decision: ${action}`);
        }
        break;

      case 'phase':
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
            result = await phaseService.getHistory(args as unknown as { planId: string; phaseId: string; limit?: number; offset?: number });
            break;
          case 'diff':
            result = await phaseService.diff(args as unknown as { planId: string; phaseId: string; version1: number; version2: number });
            break;
          default:
            throw new ToolError('InvalidAction', `Unknown action for phase: ${action}`);
        }
        break;

      case 'artifact':
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
            result = await artifactService.getHistory(args as unknown as { planId: string; artifactId: string; limit?: number; offset?: number });
            break;
          case 'diff':
            result = await artifactService.diff(args as unknown as { planId: string; artifactId: string; version1: number; version2: number });
            break;
          default:
            throw new ToolError('InvalidAction', `Unknown action for artifact: ${action}`);
        }
        break;

      case 'link':
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
        break;

      case 'query':
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
        break;

      case 'batch':
        result = await batchService.executeBatch(args as unknown as ExecuteBatchInput);
        break;

      default:
        throw new ToolError('MethodNotFound', `Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof ToolError) {
      throw error;
    }
    // Handle various error types safely:
    // - Error objects: use message (always defined on Error)
    // - Unknown objects: use safe string conversion
    const message = error instanceof Error
      ? (error.message !== '' ? error.message : 'Error without message')
      : 'Unknown error';
    throw new ToolError('InternalError', message);
  }
}
