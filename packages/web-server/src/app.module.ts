import { Module } from '@nestjs/common';
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
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS module pattern requires class with decorator
export class AppModule {}
