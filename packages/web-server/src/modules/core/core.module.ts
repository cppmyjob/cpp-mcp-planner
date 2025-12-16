import { Module, type OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FileLockManager,
  FileRepositoryFactory,
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
  type RepositoryFactory,
} from '@mcp-planner/core';

// Token constants for DI
export const LOCK_MANAGER = 'LOCK_MANAGER';
export const REPOSITORY_FACTORY = 'REPOSITORY_FACTORY';
export const PLAN_SERVICE = 'PLAN_SERVICE';

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
    // FileRepositoryFactory - depends on FileLockManager
    {
      provide: REPOSITORY_FACTORY,
      useFactory: async (
        configService: ConfigService,
        lockManager: FileLockManager
      ): Promise<FileRepositoryFactory> => {
        const storagePath = configService.getOrThrow<string>('storagePath');
        const factory = new FileRepositoryFactory({
          type: 'file',
          baseDir: storagePath,
          lockManager,
          cacheOptions: {
            enabled: true,
            ttl: 60000, // 1 minute cache TTL
            maxSize: 1000,
          },
        });

        // Initialize plan repository
        const planRepo = factory.createPlanRepository();
        await planRepo.initialize();

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
      provide: VersionHistoryService,
      useFactory: (repositoryFactory: RepositoryFactory): VersionHistoryService => {
        return new VersionHistoryService(repositoryFactory);
      },
      inject: [REPOSITORY_FACTORY],
    },
    // LinkingService (must be before services that depend on it)
    {
      provide: LinkingService,
      useFactory: (repositoryFactory: RepositoryFactory): LinkingService => {
        return new LinkingService(repositoryFactory);
      },
      inject: [REPOSITORY_FACTORY],
    },
    // RequirementService - with VersionHistoryService and LinkingService for full functionality
    {
      provide: RequirementService,
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
      inject: [REPOSITORY_FACTORY, PlanService, VersionHistoryService, LinkingService],
    },
    // SolutionService - with VersionHistoryService, DecisionService, LinkingService for full functionality
    {
      provide: SolutionService,
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
      inject: [REPOSITORY_FACTORY, PlanService, VersionHistoryService, DecisionService, LinkingService],
    },
    // DecisionService - with VersionHistoryService for history/diff support
    {
      provide: DecisionService,
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
      inject: [REPOSITORY_FACTORY, PlanService, VersionHistoryService, LinkingService],
    },
    // PhaseService
    {
      provide: PhaseService,
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
      inject: [REPOSITORY_FACTORY, PlanService, VersionHistoryService, LinkingService],
    },
    // ArtifactService - with VersionHistoryService and LinkingService for full functionality
    {
      provide: ArtifactService,
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
      inject: [REPOSITORY_FACTORY, PlanService, VersionHistoryService, LinkingService],
    },
    // QueryService
    {
      provide: QueryService,
      useFactory: (
        repositoryFactory: RepositoryFactory,
        planService: PlanService,
        linkingService: LinkingService
      ): QueryService => {
        return new QueryService(repositoryFactory, planService, linkingService);
      },
      inject: [REPOSITORY_FACTORY, PlanService, LinkingService],
    },
    // BatchService
    {
      provide: BatchService,
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
        PlanService,
        RequirementService,
        SolutionService,
        PhaseService,
        LinkingService,
        DecisionService,
        ArtifactService,
      ],
    },
  ],
  exports: [
    LOCK_MANAGER,
    REPOSITORY_FACTORY,
    PLAN_SERVICE,
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
  ],
})
 
export class CoreModule implements OnModuleDestroy {
  private readonly logger = new Logger(CoreModule.name);

  constructor(
    @Inject(LOCK_MANAGER) private readonly lockManager: FileLockManager,
    @Inject(REPOSITORY_FACTORY) private readonly repositoryFactory: FileRepositoryFactory
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
