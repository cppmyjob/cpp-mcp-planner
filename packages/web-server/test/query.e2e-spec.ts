/**
 * Query API E2E Tests
 *
 * UI Usage:
 * - Search: Global search bar
 * - Trace: Requirement traceability view
 * - Validate: Plan health dashboard
 * - Export: Export functionality
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

interface SearchResultData {
  results: {
    entityId: string;
    entityType: string;
    entity: unknown;
    relevanceScore: number;
    matchedFields: string[];
  }[];
  total: number;
  hasMore: boolean;
}

interface TraceResultData {
  requirement: unknown;
  trace: {
    proposedSolutions: unknown[];
    selectedSolution: unknown;
    alternativeSolutions: unknown[];
    decisions: unknown[];
    implementingPhases?: unknown[];
    artifacts?: unknown[];
    completionStatus: {
      isAddressed: boolean;
      isImplemented: boolean;
      completionPercentage: number;
    };
  };
}

interface ValidationResultData {
  isValid: boolean;
  issues: {
    severity: string;
    type: string;
    message: string;
  }[];
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  checksPerformed: string[];
}

interface ExportResultData {
  format: string;
  content: string;
  sizeBytes: number;
}

type TestApp = ReturnType<INestApplication['getHttpServer']>;

describe('Query API (e2e)', () => {
  let app: INestApplication;
  let context: TestContext;
  let testPlanId: string;
  let testRequirementId: string;

  function getServer(): TestApp {
    return app.getHttpServer();
  }

  beforeAll(async () => {
    context = await createTestApp();
    app = context.app;

    // Create a test plan
    const planResponse = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .send({
        name: 'Query Test Plan',
        description: 'Plan for query E2E testing',
      });
    testPlanId = (planResponse.body as ApiResponse<PlanData>).data?.planId ?? '';

    // Create test requirement
    const reqResponse = await request(app.getHttpServer())
      .post(`/api/v1/plans/${testPlanId}/requirements`)
      .send({
        title: 'Test Requirement for Query',
        description: 'Requirement with searchable content',
        priority: 'high',
        category: 'functional',
        source: { type: 'user-request' },
      });
    testRequirementId = (reqResponse.body as ApiResponse<RequirementData>).data?.requirementId ?? '';

    // Create test solution (not used in tests but part of setup)
    await request(app.getHttpServer())
      .post(`/api/v1/plans/${testPlanId}/solutions`)
      .send({
        title: 'Test Solution for Query',
        description: 'Solution addressing the requirement',
        addressing: [testRequirementId],
      });

    // Create test phase (not used in tests but part of setup)
    await request(app.getHttpServer())
      .post(`/api/v1/plans/${testPlanId}/phases`)
      .send({
        title: 'Test Phase for Query',
        description: 'Phase implementing the solution',
      });
  });

  afterAll(async () => {
    await cleanupTestApp(context);
  });

  describe('GET /api/v1/plans/:planId/query/search', () => {
    it('should search entities by query string', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/search`)
        .query({ query: 'Test Requirement' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<SearchResultData>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data?.results)).toBe(true);
      expect(body.data?.total).toBeGreaterThanOrEqual(0);
      expect(typeof body.data?.hasMore).toBe('boolean');
    });

    it('should filter search by entity types', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/search`)
        .query({ query: 'Test', entityTypes: ['requirement', 'solution'] })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<SearchResultData>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data?.results)).toBe(true);
    });

    it('should support pagination with limit and offset', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/search`)
        .query({ query: 'Test', limit: 10, offset: 0 })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<SearchResultData>;
      expect(body.success).toBe(true);
    });

    it('should return 400 for missing query parameter', async () => {
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/search`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .get('/api/v1/plans/non-existent-plan/query/search')
        .query({ query: 'Test' })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /api/v1/plans/:planId/query/trace/:requirementId', () => {
    it('should trace requirement implementation path', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/trace/${testRequirementId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<TraceResultData>;
      expect(body.success).toBe(true);
      expect(body.data?.requirement).toBeDefined();
      expect(body.data?.trace).toBeDefined();
      expect(Array.isArray(body.data?.trace.proposedSolutions)).toBe(true);
      expect(body.data?.trace.completionStatus).toBeDefined();
      expect(typeof body.data?.trace.completionStatus.isAddressed).toBe('boolean');
      expect(typeof body.data?.trace.completionStatus.completionPercentage).toBe('number');
    });

    it('should support depth parameter', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/trace/${testRequirementId}`)
        .query({ depth: 2 })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<TraceResultData>;
      expect(body.success).toBe(true);
    });

    it('should support includePhases parameter', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/trace/${testRequirementId}`)
        .query({ includePhases: true })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<TraceResultData>;
      expect(body.success).toBe(true);
    });

    it('should support includeArtifacts parameter', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/trace/${testRequirementId}`)
        .query({ includeArtifacts: true })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<TraceResultData>;
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent requirement', async () => {
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/trace/non-existent-id`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .get(`/api/v1/plans/non-existent-plan/query/trace/${testRequirementId}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /api/v1/plans/:planId/query/validate', () => {
    it('should validate plan integrity', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/validate`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ValidationResultData>;
      expect(body.success).toBe(true);
      expect(typeof body.data?.isValid).toBe('boolean');
      expect(Array.isArray(body.data?.issues)).toBe(true);
      expect(body.data?.summary).toBeDefined();
      expect(typeof body.data?.summary.totalIssues).toBe('number');
      expect(Array.isArray(body.data?.checksPerformed)).toBe(true);
    });

    it('should support validationLevel parameter (basic)', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/validate`)
        .query({ validationLevel: 'basic' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ValidationResultData>;
      expect(body.success).toBe(true);
    });

    it('should support validationLevel parameter (strict)', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/validate`)
        .query({ validationLevel: 'strict' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ValidationResultData>;
      expect(body.success).toBe(true);
    });

    it('should support checks parameter', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/validate`)
        .query({ checks: ['uncovered-requirements', 'orphan-solutions'] })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ValidationResultData>;
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .get('/api/v1/plans/non-existent-plan/query/validate')
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /api/v1/plans/:planId/query/export', () => {
    it('should export plan to markdown', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/export`)
        .query({ format: 'markdown' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ExportResultData>;
      expect(body.success).toBe(true);
      expect(body.data?.format).toBe('markdown');
      expect(typeof body.data?.content).toBe('string');
      expect(body.data?.content.length).toBeGreaterThan(0);
      expect(typeof body.data?.sizeBytes).toBe('number');
    });

    it('should export plan to JSON', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/export`)
        .query({ format: 'json' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ExportResultData>;
      expect(body.success).toBe(true);
      expect(body.data?.format).toBe('json');
      expect(typeof body.data?.content).toBe('string');
      expect(body.data?.sizeBytes).toBeGreaterThan(0);
    });

    it('should support sections parameter', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/export`)
        .query({ format: 'markdown', sections: ['requirements', 'solutions'] })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ExportResultData>;
      expect(body.success).toBe(true);
    });

    it('should support includeVersionHistory parameter', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/export`)
        .query({ format: 'markdown', includeVersionHistory: true })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ExportResultData>;
      expect(body.success).toBe(true);
    });

    it('should return 400 for missing format parameter', async () => {
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/query/export`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .get('/api/v1/plans/non-existent-plan/query/export')
        .query({ format: 'markdown' })
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
