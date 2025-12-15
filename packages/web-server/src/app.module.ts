import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/index.js';
import { CoreModule } from './modules/core/index.js';
import { PlansModule } from './modules/plans/index.js';

@Module({
  imports: [
    AppConfigModule,
    CoreModule,
    PlansModule,
  ],
  controllers: [],
  providers: [],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS module pattern requires class with decorator
export class AppModule {}
