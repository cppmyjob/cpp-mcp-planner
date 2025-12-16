/**
 * Requirements API E2E Tests
 * RED: These tests should fail until RequirementsController is implemented
 *
 * UI Usage:
 * - Kanban Board: list (group by status), update (drag-drop), vote/unvote
 * - Detail Sidebar: get, getHistory
 * - Add Dialog: add
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

interface RequirementData {
  requirementId: string;
}

interface RequirementEntity {
  id: string;
  title: string;
  description?: string;
  priority: string;
  category: string;
  status: string;
  votes: number;
}

interface ListRequirementsData {
  requirements: RequirementEntity[];
  total: number;
  hasMore: boolean;
}

interface GetRequirementData {
  requirement: RequirementEntity;
  traceability?: unknown;
}

interface VoteData {
  success: boolean;
  votes: number;
}

interface DeleteData {
  success: boolean;
  message: string;
}

interface HistoryEntry {
  version: number;
  timestamp: string;
  changes: unknown;
}

interface HistoryData {
  entityId: string;
  entityType: string;
  versions: HistoryEntry[];  // API returns 'versions' per VersionHistory interface
  currentVersion: number;
  total: number;
  hasMore?: boolean;
}

type TestApp = ReturnType<INestApplication['getHttpServer']>;

describe('Requirements API (e2e)', () => {
  let context: TestContext;
  let app: INestApplication;
  let testPlanId: string;

  beforeAll(async () => {
    context = await createTestApp();
    app = context.app;

    // Create a test plan for requirements with history enabled
    const response = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .send({
        name: 'Requirements Test Plan',
        description: 'Plan for requirements E2E testing',
        enableHistory: true,
      });
    const body = response.body as ApiResponse<PlanData>;
    testPlanId = body.data?.planId ?? '';
  });

  afterAll(async () => {
    await cleanupTestApp(context);
  });

  function getServer(): TestApp {
    return app.getHttpServer();
  }

  // ═══════════════════════════════════════════════════════════════
  // POST /api/v1/plans/:planId/requirements - Add requirement
  // ═══════════════════════════════════════════════════════════════
  describe('POST /api/v1/plans/:planId/requirements', () => {
    it('should create a new requirement', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements`)
        .send({
          title: 'Test Requirement',
          description: 'A test requirement for E2E testing',
          priority: 'high',
          category: 'functional',
          source: { type: 'user-request' },
          acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<RequirementData>;
      expect(body.success).toBe(true);
      expect(body.data?.requirementId).toBeDefined();
      expect(typeof body.data?.requirementId).toBe('string');
    });

    it('should return 400 for missing title', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements`)
        .send({
          description: 'Missing title',
          source: { type: 'user-request' },
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('should return 400 for missing source', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements`)
        .send({
          title: 'Test Requirement',
          description: 'Missing source',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .post('/api/v1/plans/non-existent-plan/requirements')
        .send({
          title: 'Test',
          source: { type: 'user-request' },
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should use default values for optional fields', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements`)
        .send({
          title: 'Minimal Requirement',
          source: { type: 'discovered' },
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<RequirementData>;
      expect(body.success).toBe(true);

      // Verify defaults by fetching the requirement
      const requirementId = body.data?.requirementId ?? '';
      const getResponse = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements/${requirementId}`)
        .expect(HttpStatus.OK);

      const getBody = getResponse.body as ApiResponse<GetRequirementData>;
      expect(getBody.data?.requirement.priority).toBe('medium');
      expect(getBody.data?.requirement.category).toBe('functional');
      expect(getBody.data?.requirement.status).toBe('draft');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET /api/v1/plans/:planId/requirements - List requirements
  // ═══════════════════════════════════════════════════════════════
  describe('GET /api/v1/plans/:planId/requirements', () => {
    beforeAll(async () => {
      // Create requirements for testing list
      for (const status of ['draft', 'approved', 'implemented']) {
        await request(getServer())
          .post(`/api/v1/plans/${testPlanId}/requirements`)
          .send({
            title: `List Test ${status}`,
            source: { type: 'user-request' },
            status,
            priority: status === 'draft' ? 'low' : 'high',
          });
      }
    });

    it('should list all requirements', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListRequirementsData>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data?.requirements)).toBe(true);
      expect(body.data?.total).toBeGreaterThanOrEqual(1);
      expect(typeof body.data?.hasMore).toBe('boolean');
    });

    it('should filter by status (for Kanban columns)', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements`)
        .query({ status: 'draft' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListRequirementsData>;
      expect(body.success).toBe(true);
      body.data?.requirements.forEach((req) => {
        expect(req.status).toBe('draft');
      });
    });

    it('should filter by priority', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements`)
        .query({ priority: 'high' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListRequirementsData>;
      expect(body.success).toBe(true);
      body.data?.requirements.forEach((req) => {
        expect(req.priority).toBe('high');
      });
    });

    it('should filter by category', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements`)
        .query({ category: 'functional' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListRequirementsData>;
      expect(body.success).toBe(true);
      body.data?.requirements.forEach((req) => {
        expect(req.category).toBe('functional');
      });
    });

    it('should support pagination', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements`)
        .query({ limit: 2, offset: 0 })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListRequirementsData>;
      expect(body.success).toBe(true);
      expect(body.data?.requirements.length).toBeLessThanOrEqual(2);
    });

    it('should return 400 for negative offset', async () => {
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements`)
        .query({ offset: -1 })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .get('/api/v1/plans/non-existent-plan/requirements')
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET /api/v1/plans/:planId/requirements/:id - Get requirement
  // ═══════════════════════════════════════════════════════════════
  describe('GET /api/v1/plans/:planId/requirements/:id', () => {
    let createdRequirementId: string;

    beforeAll(async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements`)
        .send({
          title: 'Get Test Requirement',
          description: 'For get testing',
          source: { type: 'user-request' },
        });
      const body = response.body as ApiResponse<RequirementData>;
      createdRequirementId = body.data?.requirementId ?? '';
    });

    it('should get a requirement by id', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<GetRequirementData>;
      expect(body.success).toBe(true);
      expect(body.data?.requirement.id).toBe(createdRequirementId);
      expect(body.data?.requirement.title).toBe('Get Test Requirement');
    });

    it('should return 404 for non-existent requirement', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements/non-existent-id`)
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should include traceability when requested', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}`)
        .query({ includeTraceability: 'true' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<GetRequirementData>;
      expect(body.success).toBe(true);
      expect(body.data?.traceability).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PATCH /api/v1/plans/:planId/requirements/:id - Update requirement
  // ═══════════════════════════════════════════════════════════════
  describe('PATCH /api/v1/plans/:planId/requirements/:id', () => {
    let createdRequirementId: string;

    beforeAll(async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements`)
        .send({
          title: 'Update Test Requirement',
          source: { type: 'user-request' },
          status: 'draft',
        });
      const body = response.body as ApiResponse<RequirementData>;
      createdRequirementId = body.data?.requirementId ?? '';
    });

    it('should update requirement title', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}`)
        .send({
          title: 'Updated Title',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ success: boolean; requirementId: string }>;
      expect(body.success).toBe(true);
      expect(body.data?.requirementId).toBe(createdRequirementId);

      // Verify update
      const getResponse = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}`)
        .expect(HttpStatus.OK);

      const getBody = getResponse.body as ApiResponse<GetRequirementData>;
      expect(getBody.data?.requirement.title).toBe('Updated Title');
    });

    it('should update requirement status (Kanban drag-drop)', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}`)
        .send({
          status: 'approved',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(true);

      // Verify status change
      const getResponse = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}`)
        .expect(HttpStatus.OK);

      const getBody = getResponse.body as ApiResponse<GetRequirementData>;
      expect(getBody.data?.requirement.status).toBe('approved');
    });

    it('should update priority', async () => {
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}`)
        .send({
          priority: 'critical',
        })
        .expect(HttpStatus.OK);

      const getResponse = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}`)
        .expect(HttpStatus.OK);

      const getBody = getResponse.body as ApiResponse<GetRequirementData>;
      expect(getBody.data?.requirement.priority).toBe('critical');
    });

    it('should return 404 for non-existent requirement', async () => {
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/requirements/non-existent-id`)
        .send({ title: 'New Title' })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 for invalid status', async () => {
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}`)
        .send({ status: 'invalid-status' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 for invalid priority', async () => {
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}`)
        .send({ priority: 'invalid-priority' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DELETE /api/v1/plans/:planId/requirements/:id - Delete requirement
  // ═══════════════════════════════════════════════════════════════
  describe('DELETE /api/v1/plans/:planId/requirements/:id', () => {
    it('should delete a requirement', async () => {
      // Create requirement to delete
      const createResponse = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements`)
        .send({
          title: 'Delete Test Requirement',
          source: { type: 'user-request' },
        });
      const createBody = createResponse.body as ApiResponse<RequirementData>;
      const requirementId = createBody.data?.requirementId ?? '';

      const response = await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/requirements/${requirementId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<DeleteData>;
      expect(body.success).toBe(true);
      expect(body.data?.success).toBe(true);
      expect(body.data?.message).toBeDefined();

      // Verify deletion
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements/${requirementId}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for non-existent requirement', async () => {
      await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/requirements/non-existent-id`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // POST /api/v1/plans/:planId/requirements/:id/vote - Vote
  // ═══════════════════════════════════════════════════════════════
  describe('POST /api/v1/plans/:planId/requirements/:id/vote', () => {
    let createdRequirementId: string;

    beforeAll(async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements`)
        .send({
          title: 'Vote Test Requirement',
          source: { type: 'user-request' },
        });
      const body = response.body as ApiResponse<RequirementData>;
      createdRequirementId = body.data?.requirementId ?? '';
    });

    it('should increment votes', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}/vote`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<VoteData>;
      expect(body.success).toBe(true);
      expect(body.data?.success).toBe(true);
      expect(body.data?.votes).toBe(1);
    });

    it('should increment votes multiple times', async () => {
      // Vote again
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}/vote`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<VoteData>;
      expect(body.data?.votes).toBe(2);
    });

    it('should return 404 for non-existent requirement', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements/non-existent-id/vote`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // POST /api/v1/plans/:planId/requirements/:id/unvote - Unvote
  // ═══════════════════════════════════════════════════════════════
  describe('POST /api/v1/plans/:planId/requirements/:id/unvote', () => {
    let createdRequirementId: string;

    beforeAll(async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements`)
        .send({
          title: 'Unvote Test Requirement',
          source: { type: 'user-request' },
        });
      const body = response.body as ApiResponse<RequirementData>;
      createdRequirementId = body.data?.requirementId ?? '';

      // Add some votes
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}/vote`);
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}/vote`);
    });

    it('should decrement votes', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}/unvote`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<VoteData>;
      expect(body.success).toBe(true);
      expect(body.data?.success).toBe(true);
      expect(body.data?.votes).toBe(1);
    });

    it('should return 400 when trying to unvote below zero', async () => {
      // Unvote to 0
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}/unvote`);

      // Try to unvote below zero - should return 400 error
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}/unvote`)
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('should return 404 for non-existent requirement', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements/non-existent-id/unvote`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET /api/v1/plans/:planId/requirements/:id/history - Get history
  // ═══════════════════════════════════════════════════════════════
  describe('GET /api/v1/plans/:planId/requirements/:id/history', () => {
    let createdRequirementId: string;

    beforeAll(async () => {
      // Create requirement
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/requirements`)
        .send({
          title: 'History Test Requirement',
          source: { type: 'user-request' },
        });
      const body = response.body as ApiResponse<RequirementData>;
      createdRequirementId = body.data?.requirementId ?? '';

      // Make some updates to create history
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}`)
        .send({ title: 'Updated Title 1' });

      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}`)
        .send({ title: 'Updated Title 2' });
    });

    it('should get requirement history', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}/history`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<HistoryData>;
      expect(body.success).toBe(true);
      expect(body.data?.entityId).toBe(createdRequirementId);
      expect(body.data?.entityType).toBe('requirement');
      expect(Array.isArray(body.data?.versions)).toBe(true);
      expect(body.data?.versions.length).toBeGreaterThanOrEqual(2);
    });

    it('should support pagination in history', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements/${createdRequirementId}/history`)
        .query({ limit: 1 })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<HistoryData>;
      expect(body.success).toBe(true);
      expect(body.data?.versions.length).toBeLessThanOrEqual(1);
    });

    it('should return 404 for non-existent requirement', async () => {
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/requirements/non-existent-id/history`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
