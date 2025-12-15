import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller.js';
import { CoreModule } from '../core/index.js';

@Module({
  imports: [CoreModule],
  controllers: [PlansController],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS module pattern
export class PlansModule {}
