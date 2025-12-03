import type { Services } from './services.js';

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
) {
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
  } = services;

  const action = args.action as string;

  try {
    let result: unknown;

    switch (name) {
      case 'plan':
        switch (action) {
          case 'create':
            result = await planService.createPlan(args as any);
            break;
          case 'list':
            result = await planService.listPlans(args as any);
            break;
          case 'get':
            result = await planService.getPlan(args as any);
            break;
          case 'update':
            result = await planService.updatePlan(args as any);
            break;
          case 'archive':
            result = await planService.archivePlan(args as any);
            break;
          case 'set_active':
            result = await planService.setActivePlan(args as any);
            break;
          case 'get_active':
            result = await planService.getActivePlan(args as any);
            break;
          default:
            throw new ToolError('InvalidAction', `Unknown action for plan: ${action}`);
        }
        break;

      case 'requirement':
        switch (action) {
          case 'add':
            result = await requirementService.addRequirement(args as any);
            break;
          case 'get':
            result = await requirementService.getRequirement(args as any);
            break;
          case 'update':
            result = await requirementService.updateRequirement(args as any);
            break;
          case 'list':
            result = await requirementService.listRequirements(args as any);
            break;
          case 'delete':
            result = await requirementService.deleteRequirement(args as any);
            break;
          default:
            throw new ToolError('InvalidAction', `Unknown action for requirement: ${action}`);
        }
        break;

      case 'solution':
        switch (action) {
          case 'propose':
            result = await solutionService.proposeSolution(args as any);
            break;
          case 'get':
            result = await solutionService.getSolution(args as any);
            break;
          case 'update':
            result = await solutionService.updateSolution(args as any);
            break;
          case 'compare':
            result = await solutionService.compareSolutions(args as any);
            break;
          case 'select':
            result = await solutionService.selectSolution(args as any);
            break;
          case 'delete':
            result = await solutionService.deleteSolution(args as any);
            break;
          default:
            throw new ToolError('InvalidAction', `Unknown action for solution: ${action}`);
        }
        break;

      case 'decision':
        switch (action) {
          case 'record':
            result = await decisionService.recordDecision(args as any);
            break;
          case 'get':
            result = await decisionService.getDecision(args as any);
            break;
          case 'list':
            result = await decisionService.listDecisions(args as any);
            break;
          case 'supersede':
            result = await decisionService.supersedeDecision(args as any);
            break;
          default:
            throw new ToolError('InvalidAction', `Unknown action for decision: ${action}`);
        }
        break;

      case 'phase':
        switch (action) {
          case 'add':
            result = await phaseService.addPhase(args as any);
            break;
          case 'get':
            result = await phaseService.getPhase(args as any);
            break;
          case 'get_tree':
            result = await phaseService.getPhaseTree(args as any);
            break;
          case 'update_status':
            result = await phaseService.updatePhaseStatus(args as any);
            break;
          case 'move':
            result = await phaseService.movePhase(args as any);
            break;
          case 'delete':
            result = await phaseService.deletePhase(args as any);
            break;
          case 'get_next_actions':
            result = await phaseService.getNextActions(args as any);
            break;
          default:
            throw new ToolError('InvalidAction', `Unknown action for phase: ${action}`);
        }
        break;

      case 'artifact':
        switch (action) {
          case 'add':
            result = await artifactService.addArtifact(args as any);
            break;
          case 'get':
            result = await artifactService.getArtifact(args as any);
            break;
          case 'update':
            result = await artifactService.updateArtifact(args as any);
            break;
          case 'list':
            result = await artifactService.listArtifacts(args as any);
            break;
          case 'delete':
            result = await artifactService.deleteArtifact(args as any);
            break;
          default:
            throw new ToolError('InvalidAction', `Unknown action for artifact: ${action}`);
        }
        break;

      case 'link':
        switch (action) {
          case 'create':
            result = await linkingService.linkEntities(args as any);
            break;
          case 'get':
            result = await linkingService.getEntityLinks(args as any);
            break;
          case 'delete':
            result = await linkingService.unlinkEntities(args as any);
            break;
          default:
            throw new ToolError('InvalidAction', `Unknown action for link: ${action}`);
        }
        break;

      case 'query':
        switch (action) {
          case 'search':
            result = await queryService.searchEntities(args as any);
            break;
          case 'trace':
            result = await queryService.traceRequirement(args as any);
            break;
          case 'validate':
            result = await queryService.validatePlan(args as any);
            break;
          case 'export':
            result = await queryService.exportPlan(args as any);
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new ToolError('InternalError', message);
  }
}
