import { RepositoryFactory } from '../infrastructure/factory/repository-factory.js';
import { FileLockManager } from '../infrastructure/repositories/file/file-lock-manager.js';
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
  repositoryFactory: RepositoryFactory;
  lockManager: FileLockManager;
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
  // Create shared FileLockManager
  const lockManager = new FileLockManager(storagePath);
  await lockManager.initialize();

  // Create RepositoryFactory
  const repositoryFactory = new RepositoryFactory({
    type: 'file',
    baseDir: storagePath,
    lockManager,
    cacheOptions: { enabled: true, ttl: 5000, maxSize: 1000 }
  });

  // Initialize PlanRepository
  const planRepo = repositoryFactory.createPlanRepository();
  await planRepo.initialize();

  const planService = new PlanService(repositoryFactory);
  const versionHistoryService = new VersionHistoryService(repositoryFactory);
  const linkingService = new LinkingService(repositoryFactory);

  const requirementService = new RequirementService(repositoryFactory, planService, versionHistoryService, linkingService);
  const decisionService = new DecisionService(repositoryFactory, planService, versionHistoryService, linkingService);
  const solutionService = new SolutionService(repositoryFactory, planService, versionHistoryService, decisionService, linkingService);
  const phaseService = new PhaseService(repositoryFactory, planService, versionHistoryService, linkingService);
  const artifactService = new ArtifactService(repositoryFactory, planService, versionHistoryService, linkingService);
  const queryService = new QueryService(repositoryFactory, planService, linkingService);
  const batchService = new BatchService(
    repositoryFactory,
    planService,
    requirementService,
    solutionService,
    phaseService,
    linkingService,
    decisionService,
    artifactService
  );

  return {
    repositoryFactory,
    lockManager,
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
