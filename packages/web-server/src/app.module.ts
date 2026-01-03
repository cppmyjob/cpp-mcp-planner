import { Module, type MiddlewareConsumer } from '@nestjs/common';
import { AppConfigModule } from './config/index.js';
import { CoreModule } from './modules/core/index.js';
import { ProjectsModule } from './modules/projects/index.js';
import { PlansModule } from './modules/plans/index.js';
import { RequirementsModule } from './modules/requirements/index.js';
import { SolutionsModule } from './modules/solutions/index.js';
import { DecisionsModule } from './modules/decisions/index.js';
import { PhasesModule } from './modules/phases/index.js';
import { ArtifactsModule } from './modules/artifacts/index.js';
import { LinksModule } from './modules/links/index.js';
import { QueryModule } from './modules/query/index.js';
import { ProjectContextMiddleware } from './middleware/project-context.middleware.js';

@Module({
  imports: [
    AppConfigModule,
    CoreModule,
    ProjectsModule,
    PlansModule,
    RequirementsModule,
    SolutionsModule,
    DecisionsModule,
    PhasesModule,
    ArtifactsModule,
    LinksModule,
    QueryModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {
  /**
   * GREEN: Phase 2.12.1 - Configure ProjectContextMiddleware for all routes
   * Extracts X-Project-Id header and sets AsyncLocalStorage context
   */
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ProjectContextMiddleware).forRoutes('*');
  }
}
