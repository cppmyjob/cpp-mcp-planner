import { Module } from '@nestjs/common';
import { DecisionsController } from './decisions.controller.js';
import { CoreModule } from '../core/core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [DecisionsController],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS module pattern
export class DecisionsModule {}
