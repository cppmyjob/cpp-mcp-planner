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
    linkingService,
    queryService,
  } = services;

  try {
    let result: unknown;

    switch (name) {
      // Plan Management
      case 'create_plan':
        result = await planService.createPlan(args as any);
        break;
      case 'list_plans':
        result = await planService.listPlans(args as any);
        break;
      case 'get_plan':
        result = await planService.getPlan(args as any);
        break;
      case 'update_plan':
        result = await planService.updatePlan(args as any);
        break;
      case 'archive_plan':
        result = await planService.archivePlan(args as any);
        break;
      case 'set_active_plan':
        result = await planService.setActivePlan(args as any);
        break;
      case 'get_active_plan':
        result = await planService.getActivePlan(args as any);
        break;

      // Requirements
      case 'add_requirement':
        result = await requirementService.addRequirement(args as any);
        break;
      case 'get_requirement':
        result = await requirementService.getRequirement(args as any);
        break;
      case 'update_requirement':
        result = await requirementService.updateRequirement(args as any);
        break;
      case 'list_requirements':
        result = await requirementService.listRequirements(args as any);
        break;
      case 'delete_requirement':
        result = await requirementService.deleteRequirement(args as any);
        break;

      // Solutions
      case 'propose_solution':
        result = await solutionService.proposeSolution(args as any);
        break;
      case 'get_solution':
        result = await solutionService.getSolution(args as any);
        break;
      case 'update_solution':
        result = await solutionService.updateSolution(args as any);
        break;
      case 'compare_solutions':
        result = await solutionService.compareSolutions(args as any);
        break;
      case 'select_solution':
        result = await solutionService.selectSolution(args as any);
        break;
      case 'delete_solution':
        result = await solutionService.deleteSolution(args as any);
        break;

      // Decisions
      case 'record_decision':
        result = await decisionService.recordDecision(args as any);
        break;
      case 'get_decision':
        result = await decisionService.getDecision(args as any);
        break;
      case 'list_decisions':
        result = await decisionService.listDecisions(args as any);
        break;
      case 'supersede_decision':
        result = await decisionService.supersedeDecision(args as any);
        break;

      // Phases
      case 'add_phase':
        result = await phaseService.addPhase(args as any);
        break;
      case 'get_phase_tree':
        result = await phaseService.getPhaseTree(args as any);
        break;
      case 'update_phase_status':
        result = await phaseService.updatePhaseStatus(args as any);
        break;
      case 'move_phase':
        result = await phaseService.movePhase(args as any);
        break;
      case 'delete_phase':
        result = await phaseService.deletePhase(args as any);
        break;
      case 'get_next_actions':
        result = await phaseService.getNextActions(args as any);
        break;

      // Linking
      case 'link_entities':
        result = await linkingService.linkEntities(args as any);
        break;
      case 'get_entity_links':
        result = await linkingService.getEntityLinks(args as any);
        break;
      case 'unlink_entities':
        result = await linkingService.unlinkEntities(args as any);
        break;

      // Query & Analysis
      case 'search_entities':
        result = await queryService.searchEntities(args as any);
        break;
      case 'trace_requirement':
        result = await queryService.traceRequirement(args as any);
        break;
      case 'validate_plan':
        result = await queryService.validatePlan(args as any);
        break;
      case 'export_plan':
        result = await queryService.exportPlan(args as any);
        break;

      // System
      case 'planning_health_check':
        result = {
          status: 'healthy',
          version: '1.0.0',
          storagePath,
          timestamp: new Date().toISOString(),
        };
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
