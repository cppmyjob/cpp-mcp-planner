/**
 * Decisions API E2E Tests
 * RED: These tests should fail until DecisionsController is implemented
 *
 * UI Usage:
 * - Decisions Timeline: list (sorted by date), supersede (link between cards)
 * - Detail Sidebar: get
 * - Entity Graph: list (for nodes)
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

interface DecisionData {
  decisionId: string;
}

interface DecisionEntity {
  id: string;
  title: string;
  question: string;
  decision: string;
  context?: string;
  status: string;
  alternativesConsidered?: AlternativeEntity[];
  consequences?: string;
  supersedes?: string;
  supersededBy?: string;
}

interface AlternativeEntity {
  option: string;
  reasoning: string;
  whyNotChosen?: string;
}

interface ListDecisionsData {
  decisions: DecisionEntity[];
  total: number;
  hasMore: boolean;
}

interface GetDecisionData {
  decision: DecisionEntity;
}

interface UpdateDecisionData {
  success: boolean;
  decisionId: string;
}

interface SupersedeDecisionData {
  success: boolean;
  newDecisionId: string;
  supersededDecisionId: string;
}

interface HistoryEntry {
  version: number;
  timestamp: string;
  changes: unknown;
}

interface HistoryData {
  entityId: string;
  entityType: string;
  versions: HistoryEntry[];
  currentVersion: number;
  total: number;
  hasMore?: boolean;
}

interface DiffData {
  entityId: string;
  entityType: string;
  version1: {
    version: number;
    timestamp: string;
  };
  version2: {
    version: number;
    timestamp: string;
  };
  changes: Record<string, {
    from: unknown;
    to: unknown;
    changed: boolean;
  }>;
}

type TestApp = ReturnType<INestApplication['getHttpServer']>;

describe('Decisions API (e2e)', () => {
  let context: TestContext;
  let app: INestApplication;
  let testPlanId: string;

  const getServer = (): TestApp => app.getHttpServer();

  beforeAll(async () => {
    context = await createTestApp();
    app = context.app;

    // Create a test plan for decisions with history enabled
    const planResponse = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .send({
        name: 'Decisions Test Plan',
        description: 'Plan for decisions E2E testing',
        enableHistory: true,
      });
    const planBody = planResponse.body as ApiResponse<PlanData>;
    testPlanId = planBody.data?.planId ?? '';
  });

  afterAll(async () => {
    await cleanupTestApp(context);
  });

  // ==================== POST /decisions ====================
  describe('POST /api/v1/plans/:planId/decisions', () => {
    it('should create a new decision with required fields', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions`)
        .send({
          title: 'Use PostgreSQL for persistence',
          question: 'Which database should we use for data persistence?',
          decision: 'We will use PostgreSQL for its reliability and ACID compliance',
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<DecisionData>;
      expect(body.success).toBe(true);
      expect(body.data?.decisionId).toBeDefined();
    });

    it('should create a decision with all optional fields', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions`)
        .send({
          title: 'Use REST over GraphQL',
          question: 'Which API paradigm should we use?',
          decision: 'We will use REST for simplicity and caching support',
          context: 'We need to decide on API design before implementation',
          consequences: 'Team needs to learn REST best practices',
          alternativesConsidered: [
            {
              option: 'GraphQL',
              reasoning: 'Flexible queries, single endpoint',
              whyNotChosen: 'Steeper learning curve, complexity overhead',
            },
            {
              option: 'gRPC',
              reasoning: 'High performance, type safety',
              whyNotChosen: 'Limited browser support',
            },
          ],
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<DecisionData>;
      expect(body.success).toBe(true);
      expect(body.data?.decisionId).toBeDefined();
    });

    it('should return 400 for missing required field: title', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions`)
        .send({
          question: 'Some question?',
          decision: 'Some decision',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 400 for missing required field: question', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions`)
        .send({
          title: 'Some title',
          decision: 'Some decision',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 400 for missing required field: decision', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions`)
        .send({
          title: 'Some title',
          question: 'Some question?',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 400 for empty title', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions`)
        .send({
          title: '',
          question: 'Some question?',
          decision: 'Some decision',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 400 for invalid alternativesConsidered format', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions`)
        .send({
          title: 'Some title',
          question: 'Some question?',
          decision: 'Some decision',
          alternativesConsidered: [
            { option: 'Missing reasoning field' },
          ],
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(getServer())
        .post('/api/v1/plans/non-existent-plan/decisions')
        .send({
          title: 'Some title',
          question: 'Some question?',
          decision: 'Some decision',
        })
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });

  // ==================== GET /decisions ====================
  describe('GET /api/v1/plans/:planId/decisions', () => {
    let createdDecisionIds: string[];

    beforeAll(async () => {
      createdDecisionIds = [];
      // Create several decisions for listing tests
      const decisions = [
        {
          title: 'Decision A',
          question: 'Question A?',
          decision: 'Answer A',
        },
        {
          title: 'Decision B',
          question: 'Question B?',
          decision: 'Answer B',
        },
        {
          title: 'Decision C',
          question: 'Question C?',
          decision: 'Answer C',
        },
      ];

      for (const dec of decisions) {
        const response = await request(getServer())
          .post(`/api/v1/plans/${testPlanId}/decisions`)
          .send(dec);
        const body = response.body as ApiResponse<DecisionData>;
        const decisionId = body.data?.decisionId;
        if (decisionId !== undefined) {
          createdDecisionIds.push(decisionId);
        }
      }
    });

    it('should list all decisions for a plan', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListDecisionsData>;
      expect(body.success).toBe(true);
      expect(body.data?.decisions).toBeInstanceOf(Array);
      expect(body.data?.total).toBeGreaterThanOrEqual(3);
    });

    it('should filter decisions by status', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions`)
        .query({ status: 'active' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListDecisionsData>;
      expect(body.success).toBe(true);
      body.data?.decisions.forEach((dec) => {
        expect(dec.status).toBe('active');
      });
    });

    it('should support pagination with limit and offset', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions`)
        .query({ limit: 2, offset: 0 })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListDecisionsData>;
      expect(body.success).toBe(true);
      expect(body.data?.decisions.length).toBeLessThanOrEqual(2);
    });

    it('should support field filtering', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions`)
        .query({ fields: 'id,title,status' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListDecisionsData>;
      expect(body.success).toBe(true);
      const decisionsLength = body.data?.decisions.length ?? 0;
      if (decisionsLength > 0) {
        const decision = body.data?.decisions[0];
        expect(decision?.id).toBeDefined();
        expect(decision?.title).toBeDefined();
        expect(decision?.status).toBeDefined();
      }
    });

    // Note: listDecisions returns OK for non-existent plan (doesn't validate plan existence)
    // It returns empty or whatever is in that plan's storage location
    it('should return OK for non-existent plan', async () => {
      const response = await request(getServer())
        .get('/api/v1/plans/truly-non-existent-uuid-plan-id-12345/decisions')
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListDecisionsData>;
      expect(body.success).toBe(true);
      // Service returns empty array for non-existent plan
      expect(body.data?.decisions).toEqual([]);
    });
  });

  // ==================== GET /decisions/:id ====================
  describe('GET /api/v1/plans/:planId/decisions/:id', () => {
    let testDecisionId: string;

    beforeAll(async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions`)
        .send({
          title: 'Test Decision for GET',
          question: 'What is this for?',
          decision: 'For testing GET endpoint',
          context: 'Testing context',
          consequences: 'No real consequences',
        });
      const body = response.body as ApiResponse<DecisionData>;
      testDecisionId = body.data?.decisionId ?? '';
    });

    it('should get a decision by id', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<GetDecisionData>;
      expect(body.success).toBe(true);
      expect(body.data?.decision.id).toBe(testDecisionId);
      expect(body.data?.decision.title).toBe('Test Decision for GET');
      expect(body.data?.decision.question).toBe('What is this for?');
      expect(body.data?.decision.decision).toBe('For testing GET endpoint');
    });

    it('should support field filtering on get', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}`)
        .query({ fields: 'id,title' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<GetDecisionData>;
      expect(body.success).toBe(true);
      expect(body.data?.decision.id).toBeDefined();
      expect(body.data?.decision.title).toBeDefined();
    });

    it('should return 404 for non-existent decision', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions/non-existent-id`)
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/non-existent-plan/decisions/${testDecisionId}`)
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });

  // ==================== PATCH /decisions/:id ====================
  describe('PATCH /api/v1/plans/:planId/decisions/:id', () => {
    let testDecisionId: string;

    beforeAll(async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions`)
        .send({
          title: 'Decision to Update',
          question: 'Should we update?',
          decision: 'Original decision text',
        });
      const body = response.body as ApiResponse<DecisionData>;
      testDecisionId = body.data?.decisionId ?? '';
    });

    it('should update a decision title', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}`)
        .send({
          title: 'Updated Decision Title',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<UpdateDecisionData>;
      expect(body.success).toBe(true);
      expect(body.data?.decisionId).toBe(testDecisionId);

      // Verify the update
      const getResponse = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}`);
      const getBody = getResponse.body as ApiResponse<GetDecisionData>;
      expect(getBody.data?.decision.title).toBe('Updated Decision Title');
    });

    it('should update multiple fields at once', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}`)
        .send({
          context: 'Updated context',
          consequences: 'Updated consequences',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<UpdateDecisionData>;
      expect(body.success).toBe(true);
    });

    it('should return 400 for empty title update', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}`)
        .send({
          title: '',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent decision', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/decisions/non-existent-id`)
        .send({
          title: 'New title',
        })
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });

  // ==================== POST /decisions/:id/supersede ====================
  describe('POST /api/v1/plans/:planId/decisions/:id/supersede', () => {
    let testDecisionId: string;

    beforeEach(async () => {
      // Create a fresh decision for each supersede test
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions`)
        .send({
          title: 'Decision to Supersede',
          question: 'What to do?',
          decision: 'Original approach',
        });
      const body = response.body as ApiResponse<DecisionData>;
      testDecisionId = body.data?.decisionId ?? '';
    });

    it('should supersede a decision with new decision text', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}/supersede`)
        .send({
          newDecision: {
            decision: 'New and improved approach',
          },
          reason: 'Requirements changed',
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<SupersedeDecisionData>;
      expect(body.success).toBe(true);
      expect(body.data?.newDecisionId).toBeDefined();
      expect(body.data?.supersededDecisionId).toBe(testDecisionId);

      // Verify old decision is superseded
      const oldDecision = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}`);
      const oldBody = oldDecision.body as ApiResponse<GetDecisionData>;
      expect(oldBody.data?.decision.status).toBe('superseded');
      expect(oldBody.data?.decision.supersededBy).toBe(body.data?.newDecisionId);
    });

    it('should supersede with context and consequences', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}/supersede`)
        .send({
          newDecision: {
            decision: 'Better approach after review',
            context: 'After stakeholder review',
            consequences: 'Longer timeline but better outcome',
          },
          reason: 'Stakeholder feedback',
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<SupersedeDecisionData>;
      expect(body.success).toBe(true);
    });

    it('should return 400 for missing decision in newDecision', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}/supersede`)
        .send({
          newDecision: {
            context: 'Some context but no decision',
          },
          reason: 'Bad request',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 400 for missing reason', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}/supersede`)
        .send({
          newDecision: {
            decision: 'New decision',
          },
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 400 for already superseded decision', async () => {
      // First supersede
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}/supersede`)
        .send({
          newDecision: { decision: 'First supersede' },
          reason: 'First change',
        });

      // Try to supersede again
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}/supersede`)
        .send({
          newDecision: { decision: 'Second supersede attempt' },
          reason: 'Should fail',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent decision', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions/non-existent-id/supersede`)
        .send({
          newDecision: { decision: 'New decision' },
          reason: 'Should fail',
        })
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });

  // Note: DELETE /decisions/:id is not implemented as Decisions are typically
  // superseded rather than deleted to maintain audit trail

  // ==================== GET /decisions/:id/history ====================
  describe('GET /api/v1/plans/:planId/decisions/:id/history', () => {
    let testDecisionId: string;

    beforeAll(async () => {
      // Create a decision and update it to generate history
      const createResponse = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions`)
        .send({
          title: 'Decision with History',
          question: 'Will this have history?',
          decision: 'Initial decision',
        });
      const createBody = createResponse.body as ApiResponse<DecisionData>;
      testDecisionId = createBody.data?.decisionId ?? '';

      // Update to create version history
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}`)
        .send({ decision: 'Updated decision v2' });

      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}`)
        .send({ decision: 'Updated decision v3' });
    });

    it('should get decision history', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}/history`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<HistoryData>;
      expect(body.success).toBe(true);
      expect(body.data?.entityId).toBe(testDecisionId);
      expect(body.data?.entityType).toBe('decision');
      expect(body.data?.versions).toBeInstanceOf(Array);
    });

    // Note: getHistory returns empty history for non-existent decision
    it('should return empty history for non-existent decision', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions/non-existent-id/history`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<HistoryData>;
      expect(body.success).toBe(true);
      expect(body.data?.entityId).toBe('non-existent-id');
      expect(body.data?.versions).toEqual([]);
    });
  });

  // ==================== GET /decisions/:id/diff ====================
  describe('GET /api/v1/plans/:planId/decisions/:id/diff', () => {
    let testDecisionId: string;

    beforeAll(async () => {
      // Create and update decision for diff testing
      const createResponse = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/decisions`)
        .send({
          title: 'Decision for Diff',
          question: 'Diff test?',
          decision: 'Original value',
        });
      const createBody = createResponse.body as ApiResponse<DecisionData>;
      testDecisionId = createBody.data?.decisionId ?? '';

      // Update to create different versions
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}`)
        .send({ decision: 'Changed value' });
    });

    it('should get diff between two versions', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}/diff`)
        .query({ version1: 1, version2: 2 })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<DiffData>;
      expect(body.success).toBe(true);
      expect(body.data?.entityId).toBe(testDecisionId);
      expect(body.data?.version1.version).toBe(1);
      expect(body.data?.version2.version).toBe(2);
      expect(typeof body.data?.changes).toBe('object');
      // Check that decision field shows the change
      const decisionChange = body.data?.changes.decision;
      expect(decisionChange?.changed).toBe(true);
    });

    it('should return 400 for missing version parameters', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions/${testDecisionId}/diff`)
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent decision', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/decisions/non-existent-id/diff`)
        .query({ version1: 1, version2: 2 })
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });
});
