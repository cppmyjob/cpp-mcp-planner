import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/index.js';
import { CoreModule } from './modules/core/index.js';
import { PlansModule } from './modules/plans/index.js';
import { RequirementsModule } from './modules/requirements/index.js';
import { SolutionsModule } from './modules/solutions/index.js';
import { DecisionsModule } from './modules/decisions/index.js';

@Module({
  imports: [
    AppConfigModule,
    CoreModule,
    PlansModule,
    RequirementsModule,
    SolutionsModule,
    DecisionsModule,
  ],
  controllers: [],
  providers: [],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS module pattern requires class with decorator
export class AppModule {}
