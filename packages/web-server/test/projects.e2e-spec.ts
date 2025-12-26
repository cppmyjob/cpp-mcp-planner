/**
 * Projects API E2E Tests
 * RED: These tests should fail until ProjectsController is implemented
 */

import request from 'supertest';
import { type INestApplication, HttpStatus } from '@nestjs/common';
import { createTestApp, cleanupTestApp, type TestContext } from './setup.js';
import * as path from 'path';

/**
 * Response body structure from API
 */
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

interface InitProjectData {
  success: boolean;
  projectId: string;
  configPath: string;
}

interface ListProjectsData {
  projects: {
    id: string;
    name?: string;
    path?: string;
    plansCount: number;
    createdAt: string;
    updatedAt: string;
  }[];
  total: number;
  hasMore: boolean;
}

interface DeleteProjectData {
  success: boolean;
}

type TestApp = ReturnType<INestApplication['getHttpServer']>;

describe('Projects API (e2e)', () => {
  let context: TestContext;
  let app: INestApplication;

  beforeAll(async () => {
    context = await createTestApp();
    app = context.app;
  });

  afterAll(async () => {
    await cleanupTestApp(context);
  });

  function getServer(): TestApp {
    return app.getHttpServer();
  }

  describe('POST /api/v1/projects', () => {
    it('RED: should initialize a new project', async () => {
      const workspacePath = path.join(context.storagePath, 'test-workspace-init');

      const response = await request(getServer())
        .post('/api/v1/projects')
        .send({
          projectId: 'test-project-1',
          workspacePath,
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<InitProjectData>;
      expect(body.success).toBe(true);
      expect(body.data?.success).toBe(true);
      expect(body.data?.projectId).toBe('test-project-1');
      expect(body.data?.configPath).toBeDefined();
      expect(body.data?.configPath).toContain('.mcp-config.json');
    });

    it('RED: should return 400 for invalid projectId', async () => {
      const workspacePath = path.join(context.storagePath, 'test-workspace-invalid');

      const response = await request(getServer())
        .post('/api/v1/projects')
        .send({
          projectId: '../invalid',
          workspacePath,
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('RED: should return 400 for invalid workspacePath', async () => {
      const response = await request(getServer())
        .post('/api/v1/projects')
        .send({
          projectId: 'test-project-2',
          workspacePath: '../invalid',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('RED: should allow same projectId in different workspaces (conflict happens at storage level)', async () => {
      const workspacePath1 = path.join(context.storagePath, 'workspace-dup-1');
      const workspacePath2 = path.join(context.storagePath, 'workspace-dup-2');

      // Create first project
      await request(getServer())
        .post('/api/v1/projects')
        .send({
          projectId: 'duplicate-project',
          workspacePath: workspacePath1,
        })
        .expect(HttpStatus.CREATED);

      // Second project with same ID is allowed (no storage conflict yet)
      const response = await request(getServer())
        .post('/api/v1/projects')
        .send({
          projectId: 'duplicate-project',
          workspacePath: workspacePath2,
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<InitProjectData>;
      expect(body.success).toBe(true);
      expect(body.data?.projectId).toBe('duplicate-project');
    });
  });

  describe('GET /api/v1/projects/:projectId', () => {
    it('RED: should get project info (requires plan to exist in storage)', async () => {
      // Note: web-server currently uses hardcoded projectId='default' (core.module.ts:61)
      // So we must use 'default' for project initialization to match
      const projectId = 'default';
      const workspacePath = path.join(context.storagePath, 'workspace-get');

      // Initialize project with 'default' projectId
      await request(getServer())
        .post('/api/v1/projects')
        .send({ projectId, workspacePath })
        .expect(HttpStatus.CREATED);

      // Create a plan to trigger storage directory creation
      await request(getServer())
        .post('/api/v1/plans')
        .send({
          name: 'Test Plan for Project GET',
          description: 'Test',
        })
        .expect(HttpStatus.CREATED);

      // Get project info
      const response = await request(getServer())
        .get(`/api/v1/projects/${projectId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{
        id: string;
        name?: string;
        path?: string;
        plansCount: number;
        createdAt: string;
        updatedAt: string;
      }>;
      expect(body.success).toBe(true);
      expect(body.data?.id).toBe(projectId);
      expect(body.data?.plansCount).toBeGreaterThanOrEqual(1);
      expect(body.data?.createdAt).toBeDefined();
      expect(body.data?.updatedAt).toBeDefined();
    });

    it('RED: should return 404 for non-existent project', async () => {
      const response = await request(getServer())
        .get('/api/v1/projects/nonexistent-project')
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/v1/projects', () => {
    it('RED: should list all projects with storage directories', async () => {
      // Projects appear in list only after creating plans (storage dir exists)
      // Initialize and create plan for project 1
      await request(getServer())
        .post('/api/v1/projects')
        .send({
          projectId: 'list-project-1',
          workspacePath: path.join(context.storagePath, 'list-workspace-1'),
        })
        .expect(HttpStatus.CREATED);

      await request(getServer())
        .post('/api/v1/plans')
        .send({
          name: 'Plan for list-project-1',
          description: 'Test',
        })
        .expect(HttpStatus.CREATED);

      // List all projects
      const response = await request(getServer())
        .get('/api/v1/projects')
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListProjectsData>;
      expect(body.success).toBe(true);
      expect(body.data?.projects).toBeDefined();
      expect(Array.isArray(body.data?.projects)).toBe(true);
      expect(body.data?.projects.length).toBeGreaterThanOrEqual(1);
      expect(body.data?.total).toBeGreaterThanOrEqual(1);
      expect(body.data?.hasMore).toBeDefined();
    });

    it('RED: should support pagination', async () => {
      const response = await request(getServer())
        .get('/api/v1/projects')
        .query({ limit: 1, offset: 0 })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListProjectsData>;
      expect(body.success).toBe(true);
      expect(body.data?.projects.length).toBeLessThanOrEqual(1);
      expect(body.data?.hasMore).toBeDefined();
    });
  });

  describe('DELETE /api/v1/projects/:projectId', () => {
    it('RED: should delete project config', async () => {
      const projectId = 'test-project-delete';
      const workspacePath = path.join(context.storagePath, 'workspace-delete');

      // Initialize project first
      await request(getServer())
        .post('/api/v1/projects')
        .send({ projectId, workspacePath })
        .expect(HttpStatus.CREATED);

      // Delete project
      const response = await request(getServer())
        .delete(`/api/v1/projects/${projectId}`)
        .query({ workspacePath })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<DeleteProjectData>;
      expect(body.success).toBe(true);
      expect(body.data?.success).toBe(true);

      // Verify config is deleted by trying to delete again (should get 404)
      await request(getServer())
        .delete(`/api/v1/projects/${projectId}`)
        .query({ workspacePath })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('RED: should return 404 when deleting non-existent project', async () => {
      const workspacePath = path.join(context.storagePath, 'workspace-delete-nonexistent');

      const response = await request(getServer())
        .delete('/api/v1/projects/nonexistent-delete')
        .query({ workspacePath })
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
      expect(body.error?.code).toMatch(/not.*found/i);
    });
  });
});
