/**
 * Solutions API E2E Tests
 * RED: These tests should fail until SolutionsController is implemented
 *
 * UI Usage:
 * - Solutions Compare: list (filtered by requirement), compare (side-by-side), select
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

interface RequirementData {
  requirementId: string;
}

interface SolutionData {
  solutionId: string;
}

interface SolutionEntity {
  id: string;
  title: string;
  description?: string;
  approach?: string;
  status: string;
  addressing: string[];
  tradeoffs?: TradeoffEntity[];
  evaluation?: EvaluationEntity;
}

interface TradeoffEntity {
  aspect: string;
  pros: string[];
  cons: string[];
  score?: number;
}

interface EvaluationEntity {
  effortEstimate: {
    value: number;
    unit: string;
    confidence: string;
  };
  technicalFeasibility: string;
  riskAssessment: string;
}

interface ListSolutionsData {
  solutions: SolutionEntity[];
  total: number;
  hasMore: boolean;
}

interface GetSolutionData {
  solution: SolutionEntity;
}

interface SelectSolutionData {
  success: boolean;
  solutionId: string;
  deselectedIds?: string[];
  decisionId?: string;
}

interface CompareSolutionsData {
  comparison: {
    solutions: SolutionEntity[];
    matrix: {
      aspect: string;
      solutions: {
        solutionId: string;
        solutionTitle: string;
        pros: string[];
        cons: string[];
        score?: number;
      }[];
      winner?: string;
    }[];
    summary: {
      bestOverall?: string;
      recommendations: string[];
    };
  };
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
  versions: HistoryEntry[];
  currentVersion: number;
  total: number;
  hasMore?: boolean;
}

type TestApp = ReturnType<INestApplication['getHttpServer']>;

describe('Solutions API (e2e)', () => {
  let context: TestContext;
  let app: INestApplication;
  let testPlanId: string;
  let testRequirementId: string;

  beforeAll(async () => {
    context = await createTestApp();
    app = context.app;

    // Create a test plan for solutions with history enabled
    const planResponse = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .send({
        name: 'Solutions Test Plan',
        description: 'Plan for solutions E2E testing',
        enableHistory: true,
      });
    const planBody = planResponse.body as ApiResponse<PlanData>;
    testPlanId = planBody.data?.planId ?? '';

    // Create a test requirement for solutions to address
    const reqResponse = await request(app.getHttpServer())
      .post(`/api/v1/plans/${testPlanId}/requirements`)
      .send({
        title: 'Test Requirement for Solutions',
        description: 'A requirement that solutions will address',
        priority: 'high',
        category: 'functional',
        source: { type: 'user-request' },
      });
    const reqBody = reqResponse.body as ApiResponse<RequirementData>;
    testRequirementId = reqBody.data?.requirementId ?? '';
  });

  afterAll(async () => {
    await cleanupTestApp(context);
  });

  function getServer(): TestApp {
    return app.getHttpServer();
  }

  // ═══════════════════════════════════════════════════════════════
  // POST /api/v1/plans/:planId/solutions - Propose solution
  // ═══════════════════════════════════════════════════════════════
  describe('POST /api/v1/plans/:planId/solutions', () => {
    it('should create a new solution', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: 'Test Solution',
          description: 'A test solution for E2E testing',
          approach: 'Use modern patterns',
          addressing: [testRequirementId],
          tradeoffs: [
            {
              aspect: 'Performance',
              pros: ['Fast execution'],
              cons: ['Memory usage'],
              score: 8,
            },
          ],
          evaluation: {
            effortEstimate: { value: 5, unit: 'days', confidence: 'medium' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low risk approach',
          },
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<SolutionData>;
      expect(body.success).toBe(true);
      expect(body.data?.solutionId).toBeDefined();
      expect(typeof body.data?.solutionId).toBe('string');
    });

    it('should create solution with minimal fields', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: 'Minimal Solution',
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<SolutionData>;
      expect(body.success).toBe(true);
      expect(body.data?.solutionId).toBeDefined();
    });

    it('should return 400 for missing title', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          description: 'Missing title',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('should return 400 for invalid tradeoff format', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: 'Invalid Tradeoff Solution',
          tradeoffs: [{ pro: 'Fast', con: 'Complex' }], // Wrong format
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent addressing requirement', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: 'Solution with bad addressing',
          addressing: ['non-existent-requirement-id'],
        })
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .post('/api/v1/plans/non-existent-plan/solutions')
        .send({
          title: 'Solution for missing plan',
        })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET /api/v1/plans/:planId/solutions - List solutions
  // ═══════════════════════════════════════════════════════════════
  describe('GET /api/v1/plans/:planId/solutions', () => {
    it('should list all solutions', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/solutions`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListSolutionsData>;
      expect(body.success).toBe(true);
      expect(body.data?.solutions).toBeDefined();
      expect(Array.isArray(body.data?.solutions)).toBe(true);
      expect(body.data?.total).toBeGreaterThanOrEqual(0);
      expect(typeof body.data?.hasMore).toBe('boolean');
    });

    it('should filter by status', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/solutions?status=proposed`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListSolutionsData>;
      expect(body.success).toBe(true);
      expect(body.data?.solutions).toBeDefined();
    });

    it('should filter by addressingRequirement', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/solutions?addressingRequirement=${testRequirementId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListSolutionsData>;
      expect(body.success).toBe(true);
      expect(body.data?.solutions).toBeDefined();
    });

    it('should support pagination', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/solutions?limit=1&offset=0`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListSolutionsData>;
      expect(body.success).toBe(true);
      expect(body.data?.solutions.length).toBeLessThanOrEqual(1);
    });

    it('should support field filtering', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/solutions?fields=id,title,status`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListSolutionsData>;
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .get('/api/v1/plans/non-existent-plan/solutions')
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET /api/v1/plans/:planId/solutions/:id - Get solution
  // ═══════════════════════════════════════════════════════════════
  describe('GET /api/v1/plans/:planId/solutions/:id', () => {
    let createdSolutionId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: 'Get Test Solution',
          description: 'Solution for get test',
          approach: 'Test approach',
        });
      const body = response.body as ApiResponse<SolutionData>;
      createdSolutionId = body.data?.solutionId ?? '';
    });

    it('should get solution by ID', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/solutions/${createdSolutionId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<GetSolutionData>;
      expect(body.success).toBe(true);
      expect(body.data?.solution).toBeDefined();
      expect(body.data?.solution.id).toBe(createdSolutionId);
      expect(body.data?.solution.title).toBe('Get Test Solution');
    });

    it('should support field filtering', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/solutions/${createdSolutionId}?fields=id,title`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<GetSolutionData>;
      expect(body.success).toBe(true);
      expect(body.data?.solution.id).toBeDefined();
      expect(body.data?.solution.title).toBeDefined();
    });

    it('should return 404 for non-existent solution', async () => {
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/solutions/non-existent-id`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .get(`/api/v1/plans/non-existent-plan/solutions/${createdSolutionId}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PATCH /api/v1/plans/:planId/solutions/:id - Update solution
  // ═══════════════════════════════════════════════════════════════
  describe('PATCH /api/v1/plans/:planId/solutions/:id', () => {
    let updateSolutionId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: 'Update Test Solution',
          description: 'Original description',
        });
      const body = response.body as ApiResponse<SolutionData>;
      updateSolutionId = body.data?.solutionId ?? '';
    });

    it('should update solution title', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/solutions/${updateSolutionId}`)
        .send({
          title: 'Updated Solution Title',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ success: boolean; solutionId: string }>;
      expect(body.success).toBe(true);
      expect(body.data?.success).toBe(true);
    });

    it('should update solution description', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/solutions/${updateSolutionId}`)
        .send({
          description: 'Updated description',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ success: boolean; solutionId: string }>;
      expect(body.success).toBe(true);
    });

    it('should update solution approach', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/solutions/${updateSolutionId}`)
        .send({
          approach: 'New approach methodology',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ success: boolean; solutionId: string }>;
      expect(body.success).toBe(true);
    });

    it('should update tradeoffs', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/solutions/${updateSolutionId}`)
        .send({
          tradeoffs: [
            { aspect: 'Maintainability', pros: ['Clean code'], cons: ['More files'], score: 7 },
          ],
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ success: boolean; solutionId: string }>;
      expect(body.success).toBe(true);
    });

    it('should return 400 for empty title', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/solutions/${updateSolutionId}`)
        .send({
          title: '',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent solution', async () => {
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/solutions/non-existent-id`)
        .send({
          title: 'New Title',
        })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DELETE /api/v1/plans/:planId/solutions/:id - Delete solution
  // ═══════════════════════════════════════════════════════════════
  describe('DELETE /api/v1/plans/:planId/solutions/:id', () => {
    it('should delete a solution', async () => {
      // Create solution to delete
      const createResponse = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: 'Solution to Delete',
        });
      const createBody = createResponse.body as ApiResponse<SolutionData>;
      const solutionId = createBody.data?.solutionId ?? '';

      // Delete it
      const response = await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/solutions/${solutionId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<DeleteData>;
      expect(body.success).toBe(true);
      expect(body.data?.success).toBe(true);

      // Verify deleted
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/solutions/${solutionId}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for non-existent solution', async () => {
      await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/solutions/non-existent-id`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // POST /api/v1/plans/:planId/solutions/compare - Compare solutions
  // ═══════════════════════════════════════════════════════════════
  describe('POST /api/v1/plans/:planId/solutions/compare', () => {
    let solution1Id: string;
    let solution2Id: string;

    beforeAll(async () => {
      // Create two solutions to compare
      const res1 = await request(app.getHttpServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: 'Compare Solution 1',
          tradeoffs: [
            { aspect: 'Speed', pros: ['Very fast'], cons: ['Complex'], score: 9 },
            { aspect: 'Cost', pros: ['Low cost'], cons: ['Limited features'], score: 7 },
          ],
        });
      const body1 = res1.body as ApiResponse<SolutionData>;
      solution1Id = body1.data?.solutionId ?? '';

      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: 'Compare Solution 2',
          tradeoffs: [
            { aspect: 'Speed', pros: ['Fast enough'], cons: ['None'], score: 7 },
            { aspect: 'Cost', pros: ['Free'], cons: ['None'], score: 10 },
          ],
        });
      const body2 = res2.body as ApiResponse<SolutionData>;
      solution2Id = body2.data?.solutionId ?? '';
    });

    it('should compare two solutions', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions/compare`)
        .send({
          solutionIds: [solution1Id, solution2Id],
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<CompareSolutionsData>;
      expect(body.success).toBe(true);
      expect(body.data?.comparison).toBeDefined();
      expect(body.data?.comparison.solutions).toBeDefined();
      expect(body.data?.comparison.matrix).toBeDefined();
      expect(body.data?.comparison.summary).toBeDefined();
    });

    it('should filter by aspects', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions/compare`)
        .send({
          solutionIds: [solution1Id, solution2Id],
          aspects: ['Speed'],
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<CompareSolutionsData>;
      expect(body.success).toBe(true);
      expect(body.data?.comparison.matrix.length).toBeLessThanOrEqual(1);
    });

    it('should return 400 for empty solutionIds', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions/compare`)
        .send({
          solutionIds: [],
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 400 for single solution', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions/compare`)
        .send({
          solutionIds: [solution1Id],
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // POST /api/v1/plans/:planId/solutions/:id/select - Select solution
  // ═══════════════════════════════════════════════════════════════
  describe('POST /api/v1/plans/:planId/solutions/:id/select', () => {
    let selectSolutionId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: 'Select Test Solution',
          addressing: [testRequirementId],
        });
      const body = response.body as ApiResponse<SolutionData>;
      selectSolutionId = body.data?.solutionId ?? '';
    });

    it('should select a solution', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions/${selectSolutionId}/select`)
        .send({
          reason: 'Best performance characteristics',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<SelectSolutionData>;
      expect(body.success).toBe(true);
      expect(body.data?.success).toBe(true);
      expect(body.data?.solutionId).toBe(selectSolutionId);
    });

    it('should select with createDecisionRecord', async () => {
      // Create new solution for this test
      const createRes = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: 'Decision Record Solution',
          addressing: [testRequirementId],
          approach: 'Modern approach',
          evaluation: {
            effortEstimate: { value: 3, unit: 'days', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low risk',
          },
        });
      const createBody = createRes.body as ApiResponse<SolutionData>;
      const newSolutionId = createBody.data?.solutionId ?? '';

      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions/${newSolutionId}/select`)
        .send({
          reason: 'Selected with ADR',
          createDecisionRecord: true,
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<SelectSolutionData>;
      expect(body.success).toBe(true);
      expect(body.data?.decisionId).toBeDefined();
    });

    it('should return 404 for non-existent solution', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions/non-existent-id/select`)
        .send({})
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET /api/v1/plans/:planId/solutions/:id/history - Get history
  // ═══════════════════════════════════════════════════════════════
  describe('GET /api/v1/plans/:planId/solutions/:id/history', () => {
    let historySolutionId: string;

    beforeAll(async () => {
      // Create and update solution to generate history
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: 'History Test Solution',
        });
      const createBody = createRes.body as ApiResponse<SolutionData>;
      historySolutionId = createBody.data?.solutionId ?? '';

      // Update to create history entry
      await request(app.getHttpServer())
        .patch(`/api/v1/plans/${testPlanId}/solutions/${historySolutionId}`)
        .send({
          title: 'History Test Solution v2',
        });
    });

    it('should get solution history', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/solutions/${historySolutionId}/history`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<HistoryData>;
      expect(body.success).toBe(true);
      expect(body.data?.entityId).toBe(historySolutionId);
      expect(body.data?.entityType).toBe('solution');
      expect(body.data?.versions).toBeDefined();
      expect(body.data?.currentVersion).toBeGreaterThanOrEqual(1);
    });

    it('should support pagination', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/solutions/${historySolutionId}/history?limit=1&offset=0`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<HistoryData>;
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent solution', async () => {
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/solutions/non-existent-id/history`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .get(`/api/v1/plans/non-existent-plan/solutions/${historySolutionId}/history`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
