import {
  FileRepositoryFactory,
  FileLockManager,
  PlanService,
  RequirementService,
  SolutionService,
  DecisionService,
  PhaseService,
  ArtifactService,
  LinkingService,
  QueryService,
  BatchService,
  VersionHistoryService,
  ConfigService,
  ProjectService,
  type RepositoryFactory,
} from '@mcp-planner/core';

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
  // GREEN: Phase 4.14 - Add project services
  configService: ConfigService;
  projectService: ProjectService;
}

export async function createServices(storagePath: string, projectId: string): Promise<Services> {
  // Create shared FileLockManager
  const lockManager = new FileLockManager(storagePath);
  await lockManager.initialize();

  // Create FileRepositoryFactory
  // GREEN: Phase 1.1 - projectId loaded from .mcp-config.json at startup (no default fallback)
  const repositoryFactory = new FileRepositoryFactory({
    type: 'file',
    baseDir: storagePath,
    projectId,
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

  // GREEN: Phase 4.14 - Instantiate project services
  const configService = new ConfigService(repositoryFactory);
  const projectService = new ProjectService(configService, planService, { baseDir: storagePath });

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
    configService,
    projectService,
  };
}
