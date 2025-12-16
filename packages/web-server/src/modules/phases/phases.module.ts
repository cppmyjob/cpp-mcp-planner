import { Module } from '@nestjs/common';
import { PhasesController } from './phases.controller.js';
import { CoreModule } from '../core/core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [PhasesController],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS module pattern requires class with decorator
export class PhasesModule {}
