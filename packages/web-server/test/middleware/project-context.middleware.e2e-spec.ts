/**
 * RED: Phase 2.11.2 - Tests for ProjectContextMiddleware
 *
 * These tests verify:
 * - Extracts X-Project-Id header from request
 * - Calls runWithProjectContext() with projectId
 * - Returns 400 Bad Request if header is missing
 * - Propagates context through async chain
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, type MiddlewareConsumer } from '@nestjs/common';
import { Controller, Get, Module } from '@nestjs/common';
import request from 'supertest';
import { getProjectId } from '@mcp-planner/core';
import { ProjectContextMiddleware } from '../../src/middleware/project-context.middleware.js';

// Test controller that reads projectId from context
@Controller('test')
class TestController {
  @Get()
  public getProjectId(): { projectId: string | undefined } {
    return { projectId: getProjectId() };
  }
}

@Module({
  controllers: [TestController],
})
class TestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ProjectContextMiddleware).forRoutes('*');
  }
}

describe('ProjectContextMiddleware', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should extract X-Project-Id header and set context', async () => {
    // RED: This will fail until middleware is implemented
    const response = await request(app.getHttpServer())
      .get('/test')
      .set('X-Project-Id', 'test-project-123')
      .expect(200);

    expect(response.body.projectId).toBe('test-project-123');
  });

  it('should return 400 Bad Request if X-Project-Id header is missing', async () => {
    // RED: This will fail until middleware validation is implemented
    await request(app.getHttpServer())
      .get('/test')
      .expect(400);
  });

  it('should return 400 Bad Request if X-Project-Id header is empty', async () => {
    // RED: This will fail until middleware validation is implemented
    await request(app.getHttpServer())
      .get('/test')
      .set('X-Project-Id', '')
      .expect(400);
  });

  it('should propagate context through async operations', async () => {
    // RED: This verifies AsyncLocalStorage context propagation
    @Controller('async-test')
    class AsyncTestController {
      @Get()
      public async getProjectIdAsync(): Promise<{ projectId: string | undefined }> {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { projectId: getProjectId() };
      }
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AsyncTestController],
    }).compile();

    const testApp = moduleFixture.createNestApplication();
    testApp.use(new ProjectContextMiddleware().use.bind(new ProjectContextMiddleware()));
    await testApp.init();

    const response = await request(testApp.getHttpServer())
      .get('/async-test')
      .set('X-Project-Id', 'async-project')
      .expect(200);

    expect(response.body.projectId).toBe('async-project');

    await testApp.close();
  });
});
