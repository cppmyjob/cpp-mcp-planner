/**
 * E2E Test Setup for web-server
 * Provides utilities for creating test applications and managing test storage
 */

import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CoreModule } from '../src/modules/core/core.module.js';
import { PlansModule } from '../src/modules/plans/plans.module.js';
import { RequirementsModule } from '../src/modules/requirements/requirements.module.js';
import { SolutionsModule } from '../src/modules/solutions/solutions.module.js';
import { DecisionsModule } from '../src/modules/decisions/decisions.module.js';
import {
  GlobalExceptionFilter,
  TransformInterceptor,
  LoggingInterceptor,
} from '../src/common/index.js';

export interface TestContext {
  app: INestApplication;
  storagePath: string;
}

/**
 * Creates a NestJS application configured for E2E testing
 * Uses a unique temporary directory for storage isolation
 */
export async function createTestApp(): Promise<TestContext> {
  // Create unique temp directory for test isolation
  const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-planner-test-'));

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [
          () => ({
            port: 3000,
            nodeEnv: 'test',
            storagePath,
          }),
        ],
      }),
      CoreModule,
      PlansModule,
      RequirementsModule,
      SolutionsModule,
      DecisionsModule,
    ],
  }).compile();

  const app = moduleFixture.createNestApplication();

  // Apply same global configuration as production
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());
  app.setGlobalPrefix('api/v1');

  await app.init();

  return { app, storagePath };
}

/**
 * Cleans up test resources after tests complete
 */
export async function cleanupTestApp(context: TestContext): Promise<void> {
  await context.app.close();

  // Remove temp storage directory
  if (fs.existsSync(context.storagePath)) {
    fs.rmSync(context.storagePath, { recursive: true, force: true });
  }
}

/**
 * Response wrapper type matching TransformInterceptor output
 */
export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;
