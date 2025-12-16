/**
 * Links API E2E Tests
 *
 * UI Usage:
 * - Entity Graph: GET links (all edges)
 * - Detail Sidebar: GET links (traceability section)
 * - Create Link Dialog: POST link
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

interface PhaseData {
  phaseId: string;
}

interface LinkData {
  linkId: string;
}

interface LinkEntity {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
}

interface GetLinksData {
  entityId: string;
  links: LinkEntity[];
  outgoing: LinkEntity[];
  incoming: LinkEntity[];
}

interface UnlinkData {
  success: boolean;
  deletedLinkIds: string[];
}

type TestApp = ReturnType<INestApplication['getHttpServer']>;

describe('Links API (e2e)', () => {
  let app: INestApplication;
  let context: TestContext;
  let testPlanId: string;
  let testRequirementId: string;
  let testSolutionId: string;
  let testPhaseId: string;

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
        name: 'Links Test Plan',
        description: 'Plan for links E2E testing',
      });
    testPlanId = (planResponse.body as ApiResponse<PlanData>).data?.planId ?? '';

    // Create test requirement
    const reqResponse = await request(app.getHttpServer())
      .post(`/api/v1/plans/${testPlanId}/requirements`)
      .send({
        title: 'Test Requirement',
        description: 'Requirement for links testing',
        priority: 'high',
        category: 'functional',
        source: { type: 'user-request' },
      });
    testRequirementId = (reqResponse.body as ApiResponse<RequirementData>).data?.requirementId ?? '';

    // Create test solution
    const solResponse = await request(app.getHttpServer())
      .post(`/api/v1/plans/${testPlanId}/solutions`)
      .send({
        title: 'Test Solution',
        description: 'Solution for links testing',
        addressing: [testRequirementId],
      });
    testSolutionId = (solResponse.body as ApiResponse<SolutionData>).data?.solutionId ?? '';

    // Create test phase
    const phaseResponse = await request(app.getHttpServer())
      .post(`/api/v1/plans/${testPlanId}/phases`)
      .send({
        title: 'Test Phase',
        description: 'Phase for links testing',
      });
    testPhaseId = (phaseResponse.body as ApiResponse<PhaseData>).data?.phaseId ?? '';
  });

  afterAll(async () => {
    await cleanupTestApp(context);
  });

  describe('POST /api/v1/plans/:planId/links', () => {
    it('should create a link between solution and requirement (implements)', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/links`)
        .send({
          sourceId: testSolutionId,
          targetId: testRequirementId,
          relationType: 'implements',
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<LinkData>;
      expect(body.success).toBe(true);
      expect(body.data?.linkId).toBeDefined();
      expect(typeof body.data?.linkId).toBe('string');
    });

    it('should create a link between phase and requirement (addresses)', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/links`)
        .send({
          sourceId: testPhaseId,
          targetId: testRequirementId,
          relationType: 'addresses',
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<LinkData>;
      expect(body.success).toBe(true);
      expect(body.data?.linkId).toBeDefined();
    });

    it('should create a link with metadata', async () => {
      // Create a second solution for testing
      const sol2Response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: 'Alternative Solution',
          addressing: [testRequirementId],
        });
      const solution2Id = (sol2Response.body as ApiResponse<SolutionData>).data?.solutionId ?? '';

      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/links`)
        .send({
          sourceId: testSolutionId,
          targetId: solution2Id,
          relationType: 'alternative_to',
          metadata: {
            reason: 'Different implementation approach',
            priority: 'low',
          },
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<LinkData>;
      expect(body.success).toBe(true);
      expect(body.data?.linkId).toBeDefined();
    });

    it('should return 400 for self-referencing link', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/links`)
        .send({
          sourceId: testSolutionId,
          targetId: testSolutionId,
          relationType: 'alternative_to',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 409 for duplicate link', async () => {
      // Create first link
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/links`)
        .send({
          sourceId: testSolutionId,
          targetId: testRequirementId,
          relationType: 'references',
        })
        .expect(HttpStatus.CREATED);

      // Attempt to create duplicate
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/links`)
        .send({
          sourceId: testSolutionId,
          targetId: testRequirementId,
          relationType: 'references',
        })
        .expect(HttpStatus.CONFLICT);
    });

    it('should return 404 for non-existent source entity', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/links`)
        .send({
          sourceId: 'non-existent-id',
          targetId: testRequirementId,
          relationType: 'implements',
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for non-existent target entity', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/links`)
        .send({
          sourceId: testSolutionId,
          targetId: 'non-existent-id',
          relationType: 'implements',
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 for circular dependency (depends_on)', async () => {
      // Create phase1 -> phase2 dependency
      const phase2Response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'Phase 2',
        });
      const phase2Id = (phase2Response.body as ApiResponse<PhaseData>).data?.phaseId ?? '';

      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/links`)
        .send({
          sourceId: testPhaseId,
          targetId: phase2Id,
          relationType: 'depends_on',
        })
        .expect(HttpStatus.CREATED);

      // Attempt to create phase2 -> phase1 (circular)
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/links`)
        .send({
          sourceId: phase2Id,
          targetId: testPhaseId,
          relationType: 'depends_on',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /api/v1/plans/:planId/links', () => {
    beforeEach(async () => {
      // Create a fresh link for each test
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/links`)
        .send({
          sourceId: testSolutionId,
          targetId: testRequirementId,
          relationType: 'has_artifact',
        });
    });

    it('should get links for an entity', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/links`)
        .query({ entityId: testSolutionId })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<GetLinksData>;
      expect(body.success).toBe(true);
      expect(body.data?.entityId).toBe(testSolutionId);
      expect(Array.isArray(body.data?.links)).toBe(true);
      expect(Array.isArray(body.data?.outgoing)).toBe(true);
      expect(Array.isArray(body.data?.incoming)).toBe(true);
      expect(body.data?.outgoing.length).toBeGreaterThan(0);
    });

    it('should filter by relationType', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/links`)
        .query({ entityId: testSolutionId, relationType: 'has_artifact' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<GetLinksData>;
      expect(body.success).toBe(true);
      const allLinks = [...(body.data?.outgoing ?? []), ...(body.data?.incoming ?? [])];
      allLinks.forEach(link => {
        expect(link.relationType).toBe('has_artifact');
      });
    });

    it('should filter by direction (outgoing)', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/links`)
        .query({ entityId: testSolutionId, direction: 'outgoing' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<GetLinksData>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data?.outgoing)).toBe(true);
      expect(body.data?.incoming.length).toBe(0);
    });

    it('should filter by direction (incoming)', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/links`)
        .query({ entityId: testRequirementId, direction: 'incoming' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<GetLinksData>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data?.incoming)).toBe(true);
      expect(body.data?.outgoing.length).toBe(0);
      expect(body.data?.incoming.length).toBeGreaterThan(0);
    });

    it('should return 400 when entityId is missing', async () => {
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/links`)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('DELETE /api/v1/plans/:planId/links/:id', () => {
    let linkId: string;
    let testSolution2Id: string;

    beforeEach(async () => {
      // Create a unique solution for each DELETE test to avoid conflicts
      const solRes = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/solutions`)
        .send({
          title: `Delete Test Solution ${Date.now().toString()}`,
          addressing: [testRequirementId],
        });
      testSolution2Id = (solRes.body as ApiResponse<SolutionData>).data?.solutionId ?? '';

      // Create a fresh link for each test using the new solution
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/links`)
        .send({
          sourceId: testSolution2Id,
          targetId: testRequirementId,
          relationType: 'implements',
        });
      linkId = (response.body as ApiResponse<LinkData>).data?.linkId ?? '';
    });

    it('should delete a link', async () => {
      const response = await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/links/${linkId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<UnlinkData>;
      expect(body.success).toBe(true);
      expect(body.data?.success).toBe(true);
      expect(body.data?.deletedLinkIds).toContain(linkId);
    });

    it('should return 404 for non-existent link', async () => {
      await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/links/non-existent-link-id`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should verify link is deleted', async () => {
      // Delete the link
      await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/links/${linkId}`)
        .expect(HttpStatus.OK);

      // Verify it's no longer in entity links
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/links`)
        .query({ entityId: testSolution2Id })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<GetLinksData>;
      const allLinks = [...(body.data?.outgoing ?? []), ...(body.data?.incoming ?? [])];
      const foundLink = allLinks.find(link => link.id === linkId);
      expect(foundLink).toBeUndefined();
    });
  });
});
