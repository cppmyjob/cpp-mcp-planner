/**
 * Plans API E2E Tests
 * RED: These tests should fail until PlansController is implemented
 */

import request from 'supertest';
import { type INestApplication, HttpStatus } from '@nestjs/common';
import { createTestApp, cleanupTestApp, type TestContext } from './setup.js';

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

interface PlanData {
  planId: string;
}

interface ListPlansData {
  plans: { status: string; id: string }[];
  total: number;
  hasMore: boolean;
}

interface GetPlanData {
  plan: {
    manifest: {
      id: string;
      name: string;
    };
    entities?: {
      requirements: unknown[];
    };
  };
}

interface ActivatePlanData {
  activePlan: {
    planId: string;
    workspacePath: string;
    plan?: unknown;
    usageGuide?: string;
  };
}

interface ArchiveData {
  message: string;
}

interface SummaryData {
  plan: {
    id: string;
  };
  phases: unknown[];
  statistics: unknown;
}

type TestApp = ReturnType<INestApplication['getHttpServer']>;

describe('Plans API (e2e)', () => {
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

  describe('POST /api/v1/plans', () => {
    it('should create a new plan', async () => {
      const response = await request(getServer())
        .post('/api/v1/plans')
        .send({
          name: 'Test Plan',
          description: 'A test plan for E2E testing',
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<PlanData>;
      expect(body.success).toBe(true);
      expect(body.data?.planId).toBeDefined();
      expect(typeof body.data?.planId).toBe('string');
    });

    it('should return 400 for missing name', async () => {
      const response = await request(getServer())
        .post('/api/v1/plans')
        .send({
          description: 'Missing name',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('should return 400 for empty name', async () => {
      const response = await request(getServer())
        .post('/api/v1/plans')
        .send({
          name: '',
          description: 'Empty name',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/v1/plans', () => {
    beforeAll(async () => {
      // Create a plan for testing
      await request(getServer())
        .post('/api/v1/plans')
        .send({
          name: 'List Test Plan',
          description: 'For list testing',
        });
    });

    it('should list all plans', async () => {
      const response = await request(getServer())
        .get('/api/v1/plans')
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListPlansData>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data?.plans)).toBe(true);
      expect(body.data?.total).toBeGreaterThanOrEqual(1);
      expect(typeof body.data?.hasMore).toBe('boolean');
    });

    it('should filter plans by status', async () => {
      const response = await request(getServer())
        .get('/api/v1/plans')
        .query({ status: 'active' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListPlansData>;
      expect(body.success).toBe(true);
      body.data?.plans.forEach((plan) => {
        expect(plan.status).toBe('active');
      });
    });

    it('should support pagination', async () => {
      const response = await request(getServer())
        .get('/api/v1/plans')
        .query({ limit: 1, offset: 0 })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListPlansData>;
      expect(body.success).toBe(true);
      expect(body.data?.plans.length).toBeLessThanOrEqual(1);
    });

    it('should return 400 for negative offset', async () => {
      await request(getServer())
        .get('/api/v1/plans')
        .query({ offset: -1 })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /api/v1/plans/:id', () => {
    let createdPlanId: string;

    beforeAll(async () => {
      const response = await request(getServer())
        .post('/api/v1/plans')
        .send({
          name: 'Get Test Plan',
          description: 'For get testing',
        });
      const body = response.body as ApiResponse<PlanData>;
      createdPlanId = body.data?.planId ?? '';
    });

    it('should get a plan by id', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${createdPlanId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<GetPlanData>;
      expect(body.success).toBe(true);
      expect(body.data?.plan.manifest.id).toBe(createdPlanId);
      expect(body.data?.plan.manifest.name).toBe('Get Test Plan');
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(getServer())
        .get('/api/v1/plans/non-existent-id')
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should include entities when requested', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${createdPlanId}`)
        .query({ includeEntities: true })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<GetPlanData>;
      expect(body.success).toBe(true);
      expect(body.data?.plan.entities).toBeDefined();
      expect(Array.isArray(body.data?.plan.entities?.requirements)).toBe(true);
    });
  });

  describe('PATCH /api/v1/plans/:id', () => {
    let createdPlanId: string;

    beforeAll(async () => {
      const response = await request(getServer())
        .post('/api/v1/plans')
        .send({
          name: 'Update Test Plan',
          description: 'For update testing',
        });
      const body = response.body as ApiResponse<PlanData>;
      createdPlanId = body.data?.planId ?? '';
    });

    it('should update plan name', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${createdPlanId}`)
        .send({
          name: 'Updated Plan Name',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<PlanData>;
      expect(body.success).toBe(true);
      expect(body.data?.planId).toBe(createdPlanId);

      // Verify update
      const getResponse = await request(getServer())
        .get(`/api/v1/plans/${createdPlanId}`)
        .expect(HttpStatus.OK);

      const getBody = getResponse.body as ApiResponse<GetPlanData>;
      expect(getBody.data?.plan.manifest.name).toBe('Updated Plan Name');
    });

    it('should update plan status', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${createdPlanId}`)
        .send({
          status: 'completed',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .patch('/api/v1/plans/non-existent-id')
        .send({ name: 'New Name' })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 for invalid status', async () => {
      await request(getServer())
        .patch(`/api/v1/plans/${createdPlanId}`)
        .send({ status: 'invalid-status' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('DELETE /api/v1/plans/:id', () => {
    it('should archive a plan (soft delete)', async () => {
      // Create plan to delete
      const createResponse = await request(getServer())
        .post('/api/v1/plans')
        .send({
          name: 'Delete Test Plan',
          description: 'For delete testing',
        });
      const createBody = createResponse.body as ApiResponse<PlanData>;
      const planId = createBody.data?.planId ?? '';

      const response = await request(getServer())
        .delete(`/api/v1/plans/${planId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ArchiveData>;
      expect(body.success).toBe(true);
      expect(body.data?.message).toContain('archived');
    });

    it('should permanently delete when permanent=true', async () => {
      // Create plan to delete permanently
      const createResponse = await request(getServer())
        .post('/api/v1/plans')
        .send({
          name: 'Permanent Delete Plan',
          description: 'For permanent delete testing',
        });
      const createBody = createResponse.body as ApiResponse<PlanData>;
      const planId = createBody.data?.planId ?? '';

      const response = await request(getServer())
        .delete(`/api/v1/plans/${planId}`)
        .query({ permanent: true })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ArchiveData>;
      expect(body.success).toBe(true);
      expect(body.data?.message).toContain('permanently');

      // Verify deletion
      await request(getServer())
        .get(`/api/v1/plans/${planId}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .delete('/api/v1/plans/non-existent-id')
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('POST /api/v1/plans/:id/activate', () => {
    let createdPlanId: string;

    beforeAll(async () => {
      const response = await request(getServer())
        .post('/api/v1/plans')
        .send({
          name: 'Activate Test Plan',
          description: 'For activate testing',
        });
      const body = response.body as ApiResponse<PlanData>;
      createdPlanId = body.data?.planId ?? '';
    });

    it('should set plan as active', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${createdPlanId}/activate`)
        .send({
          workspacePath: '/test/workspace',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ActivatePlanData>;
      expect(body.success).toBe(true);
      expect(body.data?.activePlan.planId).toBe(createdPlanId);
      expect(body.data?.activePlan.workspacePath).toBe('/test/workspace');
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .post('/api/v1/plans/non-existent-id/activate')
        .send({})
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /api/v1/plans/active', () => {
    beforeAll(async () => {
      // Create and activate a plan
      const createResponse = await request(getServer())
        .post('/api/v1/plans')
        .send({
          name: 'Active Plan Test',
          description: 'For active plan testing',
        });
      const createBody = createResponse.body as ApiResponse<PlanData>;
      const planId = createBody.data?.planId ?? '';

      await request(getServer())
        .post(`/api/v1/plans/${planId}/activate`)
        .send({ workspacePath: '/active/workspace' });
    });

    it('should get the active plan', async () => {
      const response = await request(getServer())
        .get('/api/v1/plans/active')
        .query({ workspacePath: '/active/workspace' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ActivatePlanData>;
      expect(body.success).toBe(true);
      // May be null if no active plan for this workspace
      if (body.data?.activePlan) {
        expect(body.data.activePlan.planId).toBeDefined();
        expect(body.data.activePlan.plan).toBeDefined();
      }
    });

    it('should include usage guide when requested', async () => {
      const response = await request(getServer())
        .get('/api/v1/plans/active')
        .query({ workspacePath: '/active/workspace', includeGuide: true })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ActivatePlanData>;
      expect(body.success).toBe(true);
      if (body.data?.activePlan) {
        expect(body.data.activePlan.usageGuide).toBeDefined();
      }
    });
  });

  describe('GET /api/v1/plans/:id/summary', () => {
    let createdPlanId: string;

    beforeAll(async () => {
      const response = await request(getServer())
        .post('/api/v1/plans')
        .send({
          name: 'Summary Test Plan',
          description: 'For summary testing',
        });
      const body = response.body as ApiResponse<PlanData>;
      createdPlanId = body.data?.planId ?? '';
    });

    it('should get plan summary', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${createdPlanId}/summary`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<SummaryData>;
      expect(body.success).toBe(true);
      expect(body.data?.plan).toBeDefined();
      expect(body.data?.plan.id).toBe(createdPlanId);
      expect(body.data?.phases).toBeDefined();
      expect(Array.isArray(body.data?.phases)).toBe(true);
      expect(body.data?.statistics).toBeDefined();
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .get('/api/v1/plans/non-existent-id/summary')
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
