import { Module } from '@nestjs/common';
import { QueryController } from './query.controller.js';
import { CoreModule } from '../core/core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [QueryController],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS module pattern requires class with decorator
export class QueryModule {}
