import { Module } from '@nestjs/common';
import { ArtifactsController } from './artifacts.controller.js';
import { CoreModule } from '../core/core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [ArtifactsController],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS module pattern requires class with decorator
export class ArtifactsModule {}
