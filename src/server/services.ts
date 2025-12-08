import { FileStorage } from '../infrastructure/file-storage.js';
import { PlanService } from '../domain/services/plan-service.js';
import { RequirementService } from '../domain/services/requirement-service.js';
import { SolutionService } from '../domain/services/solution-service.js';
import { DecisionService } from '../domain/services/decision-service.js';
import { PhaseService } from '../domain/services/phase-service.js';
import { ArtifactService } from '../domain/services/artifact-service.js';
import { LinkingService } from '../domain/services/linking-service.js';
import { QueryService } from '../domain/services/query-service.js';
import { BatchService } from '../domain/services/batch-service.js';
import { VersionHistoryService } from '../domain/services/version-history-service.js';

export interface Services {
  storage: FileStorage;
  storagePath: string;
  planService: PlanService;
  requirementService: RequirementService;
  solutionService: SolutionService;
  decisionService: DecisionService;
  phaseService: PhaseService;
  artifactService: ArtifactService;
  linkingService: LinkingService;
  queryService: QueryService;
  batchService: BatchService;
}

export async function createServices(storagePath: string): Promise<Services> {
  const storage = new FileStorage(storagePath);
  await storage.initialize();

  const planService = new PlanService(storage);
  const versionHistoryService = new VersionHistoryService(storage);

  const requirementService = new RequirementService(storage, planService, versionHistoryService);
  const solutionService = new SolutionService(storage, planService, versionHistoryService);
  const decisionService = new DecisionService(storage, planService, versionHistoryService);
  const phaseService = new PhaseService(storage, planService, versionHistoryService);
  const artifactService = new ArtifactService(storage, planService, versionHistoryService);
  const linkingService = new LinkingService(storage);
  const queryService = new QueryService(storage, planService, linkingService);
  const batchService = new BatchService(
    storage,
    planService,
    requirementService,
    solutionService,
    phaseService,
    linkingService,
    decisionService,
    artifactService
  );

  return {
    storage,
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
  };
}
