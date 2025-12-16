import { Module } from '@nestjs/common';
import { SolutionsController } from './solutions.controller.js';
import { CoreModule } from '../core/core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [SolutionsController],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS module pattern
export class SolutionsModule {}
