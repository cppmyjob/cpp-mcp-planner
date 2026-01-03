import { Module, type OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
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
  ProjectService,
  ConfigService as CoreConfigService,
  type RepositoryFactory,
} from '@mcp-planner/core';
import { DynamicRepositoryFactory } from '../../infrastructure/dynamic-repository-factory.js';

// Token constants for DI - string tokens for reliable injection across ESM boundaries
export const LOCK_MANAGER = 'LOCK_MANAGER';
export const REPOSITORY_FACTORY = 'REPOSITORY_FACTORY';
export const PLAN_SERVICE = 'PLAN_SERVICE';
export const REQUIREMENT_SERVICE = 'REQUIREMENT_SERVICE';
export const SOLUTION_SERVICE = 'SOLUTION_SERVICE';
export const DECISION_SERVICE = 'DECISION_SERVICE';
export const PHASE_SERVICE = 'PHASE_SERVICE';
export const ARTIFACT_SERVICE = 'ARTIFACT_SERVICE';
export const LINKING_SERVICE = 'LINKING_SERVICE';
export const QUERY_SERVICE = 'QUERY_SERVICE';
export const BATCH_SERVICE = 'BATCH_SERVICE';
export const VERSION_HISTORY_SERVICE = 'VERSION_HISTORY_SERVICE';
export const PROJECT_SERVICE = 'PROJECT_SERVICE';
export const CONFIG_SERVICE = 'CONFIG_SERVICE';

@Module({
  providers: [
    // FileLockManager - requires async initialization
    {
      provide: LOCK_MANAGER,
      useFactory: async (configService: ConfigService): Promise<FileLockManager> => {
        const storagePath = configService.getOrThrow<string>('storagePath');
        const lockManager = new FileLockManager(storagePath);
        await lockManager.initialize();
        return lockManager;
      },
      inject: [ConfigService],
    },
    // GREEN: Phase 2.4.3 - DynamicRepositoryFactory with multi-project support
    // DynamicRepositoryFactory - depends on FileLockManager
    {
      provide: REPOSITORY_FACTORY,
      useFactory: (
        configService: ConfigService,
        lockManager: FileLockManager
      ): DynamicRepositoryFactory => {
        const storagePath = configService.getOrThrow<string>('storagePath');

        // DynamicRepositoryFactory handles multi-project support using AsyncLocalStorage
        // No hardcoded projectId - uses getProjectId() from project context
        const factory = new DynamicRepositoryFactory(
          storagePath,
          lockManager,
          {
            // IMPORTANT: Cache disabled for web-server to ensure cross-process consistency
            // MCP server and Web server run as separate processes with independent caches
            // Without cache, web-server always reads fresh data from disk
            // NOTE: MCP server keeps cache enabled (TTL=5s) - it's acceptable for CLI sessions
            enabled: false,
            ttl: 0,
            maxSize: 0,
          }
        );

        // No manual initialization needed - DynamicRepositoryFactory handles it lazily
        return factory;
      },
      inject: [ConfigService, LOCK_MANAGER],
    },
    // PlanService - use string token for reliable DI across ESM boundaries
    {
      provide: PLAN_SERVICE,
      useFactory: (repositoryFactory: RepositoryFactory): PlanService => {
        return new PlanService(repositoryFactory);
      },
      inject: [REPOSITORY_FACTORY],
    },
    // Also provide as class for backwards compatibility
    {
      provide: PlanService,
      useExisting: PLAN_SERVICE,
    },
    // VersionHistoryService (must be before services that depend on it)
    {
      provide: VERSION_HISTORY_SERVICE,
      useFactory: (repositoryFactory: RepositoryFactory): VersionHistoryService => {
        return new VersionHistoryService(repositoryFactory);
      },
      inject: [REPOSITORY_FACTORY],
    },
    { provide: VersionHistoryService, useExisting: VERSION_HISTORY_SERVICE },
    // LinkingService (must be before services that depend on it)
    {
      provide: LINKING_SERVICE,
      useFactory: (repositoryFactory: RepositoryFactory): LinkingService => {
        return new LinkingService(repositoryFactory);
      },
      inject: [REPOSITORY_FACTORY],
    },
    { provide: LinkingService, useExisting: LINKING_SERVICE },
    // DecisionService - must be before SolutionService
    {
      provide: DECISION_SERVICE,
      useFactory: (
        repositoryFactory: RepositoryFactory,
        planService: PlanService,
        versionHistoryService: VersionHistoryService,
        linkingService: LinkingService
      ): DecisionService => {
        return new DecisionService(
          repositoryFactory,
          planService,
          versionHistoryService,
          linkingService
        );
      },
      inject: [REPOSITORY_FACTORY, PLAN_SERVICE, VERSION_HISTORY_SERVICE, LINKING_SERVICE],
    },
    { provide: DecisionService, useExisting: DECISION_SERVICE },
    // RequirementService
    {
      provide: REQUIREMENT_SERVICE,
      useFactory: (
        repositoryFactory: RepositoryFactory,
        planService: PlanService,
        versionHistoryService: VersionHistoryService,
        linkingService: LinkingService
      ): RequirementService => {
        return new RequirementService(
          repositoryFactory,
          planService,
          versionHistoryService,
          linkingService
        );
      },
      inject: [REPOSITORY_FACTORY, PLAN_SERVICE, VERSION_HISTORY_SERVICE, LINKING_SERVICE],
    },
    { provide: RequirementService, useExisting: REQUIREMENT_SERVICE },
    // SolutionService
    {
      provide: SOLUTION_SERVICE,
      useFactory: (
        repositoryFactory: RepositoryFactory,
        planService: PlanService,
        versionHistoryService: VersionHistoryService,
        decisionService: DecisionService,
        linkingService: LinkingService
      ): SolutionService => {
        return new SolutionService(
          repositoryFactory,
          planService,
          versionHistoryService,
          decisionService,
          linkingService
        );
      },
      inject: [REPOSITORY_FACTORY, PLAN_SERVICE, VERSION_HISTORY_SERVICE, DECISION_SERVICE, LINKING_SERVICE],
    },
    { provide: SolutionService, useExisting: SOLUTION_SERVICE },
    // PhaseService
    {
      provide: PHASE_SERVICE,
      useFactory: (
        repositoryFactory: RepositoryFactory,
        planService: PlanService,
        versionHistoryService: VersionHistoryService,
        linkingService: LinkingService
      ): PhaseService => {
        return new PhaseService(
          repositoryFactory,
          planService,
          versionHistoryService,
          linkingService
        );
      },
      inject: [REPOSITORY_FACTORY, PLAN_SERVICE, VERSION_HISTORY_SERVICE, LINKING_SERVICE],
    },
    { provide: PhaseService, useExisting: PHASE_SERVICE },
    // ArtifactService
    {
      provide: ARTIFACT_SERVICE,
      useFactory: (
        repositoryFactory: RepositoryFactory,
        planService: PlanService,
        versionHistoryService: VersionHistoryService,
        linkingService: LinkingService
      ): ArtifactService => {
        return new ArtifactService(
          repositoryFactory,
          planService,
          versionHistoryService,
          linkingService
        );
      },
      inject: [REPOSITORY_FACTORY, PLAN_SERVICE, VERSION_HISTORY_SERVICE, LINKING_SERVICE],
    },
    { provide: ArtifactService, useExisting: ARTIFACT_SERVICE },
    // QueryService
    {
      provide: QUERY_SERVICE,
      useFactory: (
        repositoryFactory: RepositoryFactory,
        planService: PlanService,
        linkingService: LinkingService
      ): QueryService => {
        return new QueryService(repositoryFactory, planService, linkingService);
      },
      inject: [REPOSITORY_FACTORY, PLAN_SERVICE, LINKING_SERVICE],
    },
    { provide: QueryService, useExisting: QUERY_SERVICE },
    // BatchService
    {
      provide: BATCH_SERVICE,
      useFactory: (
        repositoryFactory: RepositoryFactory,
        planService: PlanService,
        requirementService: RequirementService,
        solutionService: SolutionService,
        phaseService: PhaseService,
        linkingService: LinkingService,
        decisionService: DecisionService,
        artifactService: ArtifactService
      ): BatchService => {
        return new BatchService(
          repositoryFactory,
          planService,
          requirementService,
          solutionService,
          phaseService,
          linkingService,
          decisionService,
          artifactService
        );
      },
      inject: [
        REPOSITORY_FACTORY,
        PLAN_SERVICE,
        REQUIREMENT_SERVICE,
        SOLUTION_SERVICE,
        PHASE_SERVICE,
        LINKING_SERVICE,
        DECISION_SERVICE,
        ARTIFACT_SERVICE,
      ],
    },
    { provide: BatchService, useExisting: BATCH_SERVICE },
    // ConfigService
    {
      provide: CONFIG_SERVICE,
      useFactory: (repositoryFactory: RepositoryFactory): CoreConfigService => {
        return new CoreConfigService(repositoryFactory);
      },
      inject: [REPOSITORY_FACTORY],
    },
    { provide: CoreConfigService, useExisting: CONFIG_SERVICE },
    // ProjectService
    {
      provide: PROJECT_SERVICE,
      useFactory: (
        configService: CoreConfigService,
        planService: PlanService
      ): ProjectService => {
        return new ProjectService(configService, planService);
      },
      inject: [CONFIG_SERVICE, PLAN_SERVICE],
    },
    { provide: ProjectService, useExisting: PROJECT_SERVICE },
  ],
  exports: [
    LOCK_MANAGER,
    REPOSITORY_FACTORY,
    PLAN_SERVICE,
    REQUIREMENT_SERVICE,
    SOLUTION_SERVICE,
    DECISION_SERVICE,
    PHASE_SERVICE,
    ARTIFACT_SERVICE,
    LINKING_SERVICE,
    QUERY_SERVICE,
    BATCH_SERVICE,
    VERSION_HISTORY_SERVICE,
    PROJECT_SERVICE,
    CONFIG_SERVICE,
    // Also export class tokens for backwards compatibility
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
    ProjectService,
    CoreConfigService,
  ],
})
 
export class CoreModule implements OnModuleDestroy {
  private readonly logger = new Logger(CoreModule.name);

  constructor(
    @Inject(LOCK_MANAGER) private readonly lockManager: FileLockManager,
    @Inject(REPOSITORY_FACTORY) private readonly repositoryFactory: DynamicRepositoryFactory
  ) {}

  public async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down CoreModule...');

    try {
      // Close repository factory first
      await this.repositoryFactory.close();
      this.logger.log('Repository factory closed');

      // Then dispose lock manager
      await this.lockManager.dispose();
      this.logger.log('Lock manager disposed');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error during shutdown: ${errorMessage}`);
    }
  }
}
