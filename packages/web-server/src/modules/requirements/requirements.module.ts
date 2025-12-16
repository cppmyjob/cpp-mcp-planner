import { Module } from '@nestjs/common';
import { RequirementsController } from './requirements.controller.js';
import { CoreModule } from '../core/index.js';

@Module({
  imports: [CoreModule],
  controllers: [RequirementsController],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS module pattern
export class RequirementsModule {}
