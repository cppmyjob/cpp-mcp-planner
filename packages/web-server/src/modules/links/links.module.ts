import { Module } from '@nestjs/common';
import { LinksController } from './links.controller.js';
import { CoreModule } from '../core/core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [LinksController],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS module pattern
export class LinksModule {}
