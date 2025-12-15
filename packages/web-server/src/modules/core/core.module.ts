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
    // PlanService
    {
      provide: PlanService,
      useFactory: (repositoryFactory: RepositoryFactory): PlanService => {
        return new PlanService(repositoryFactory);
      },
      inject: [REPOSITORY_FACTORY],
    },
    // RequirementService
    {
      provide: RequirementService,
      useFactory: (
        repositoryFactory: RepositoryFactory,
        planService: PlanService
      ): RequirementService => {
        return new RequirementService(repositoryFactory, planService);
      },
      inject: [REPOSITORY_FACTORY, PlanService],
    },
    // SolutionService
    {
      provide: SolutionService,
      useFactory: (
        repositoryFactory: RepositoryFactory,
        planService: PlanService
      ): SolutionService => {
        return new SolutionService(repositoryFactory, planService);
      },
      inject: [REPOSITORY_FACTORY, PlanService],
    },
    // DecisionService
    {
      provide: DecisionService,
      useFactory: (
        repositoryFactory: RepositoryFactory,
        planService: PlanService
      ): DecisionService => {
        return new DecisionService(repositoryFactory, planService);
      },
      inject: [REPOSITORY_FACTORY, PlanService],
    },
    // PhaseService
    {
      provide: PhaseService,
      useFactory: (
        repositoryFactory: RepositoryFactory,
        planService: PlanService
      ): PhaseService => {
        return new PhaseService(repositoryFactory, planService);
      },
      inject: [REPOSITORY_FACTORY, PlanService],
    },
    // ArtifactService
    {
      provide: ArtifactService,
      useFactory: (
        repositoryFactory: RepositoryFactory,
        planService: PlanService
      ): ArtifactService => {
        return new ArtifactService(repositoryFactory, planService);
      },
      inject: [REPOSITORY_FACTORY, PlanService],
    },
    // LinkingService
    {
      provide: LinkingService,
      useFactory: (repositoryFactory: RepositoryFactory): LinkingService => {
        return new LinkingService(repositoryFactory);
      },
      inject: [REPOSITORY_FACTORY],
    },
    // VersionHistoryService
    {
      provide: VersionHistoryService,
      useFactory: (repositoryFactory: RepositoryFactory): VersionHistoryService => {
        return new VersionHistoryService(repositoryFactory);
      },
      inject: [REPOSITORY_FACTORY],
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
