import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller.js';
import { CoreModule } from '../core/index.js';

@Module({
  imports: [CoreModule],
  controllers: [ProjectsController],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS module pattern
export class ProjectsModule {}
