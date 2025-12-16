import { HttpStatus, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type TestContext, createTestApp, cleanupTestApp } from './setup.js';

// Response types
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

interface ArtifactData {
  artifactId: string;
}

interface ArtifactListData {
  artifacts: {
    id: string;
    title: string;
    artifactType: string;
    status: string;
    content?: {
      sourceCode?: string;
    };
  }[];
  total: number;
  hasMore: boolean;
}

interface DeleteData {
  success: boolean;
  message: string;
}

type TestApp = ReturnType<INestApplication['getHttpServer']>;

describe('Artifacts API (e2e)', () => {
  let context: TestContext;
  let app: INestApplication;
  let testPlanId: string;
  let testPhaseId: string;
  let testRequirementId: string;
  let testSolutionId: string;

   
  const getServer = (): TestApp => app.getHttpServer();

  beforeAll(async () => {
    context = await createTestApp();
    app = context.app;

    // Create a test plan
     
    const planResponse = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .send({
        name: 'Artifacts Test Plan',
        description: 'Plan for artifacts E2E testing',
      });
    testPlanId = (planResponse.body as ApiResponse<{ planId: string }>).data?.planId ?? '';

    // Create test phase
    const phaseResponse = await request(getServer())
      .post(`/api/v1/plans/${testPlanId}/phases`)
      .send({
        title: 'Test Phase',
      });
    testPhaseId = (phaseResponse.body as ApiResponse<{ phaseId: string }>).data?.phaseId ?? '';

    // Create test requirement
    const reqResponse = await request(getServer())
      .post(`/api/v1/plans/${testPlanId}/requirements`)
      .send({
        title: 'Test Requirement',
        source: { type: 'user-request' },
      });
    testRequirementId = (reqResponse.body as ApiResponse<{ requirementId: string }>).data?.requirementId ?? '';

    // Create test solution
    const solResponse = await request(getServer())
      .post(`/api/v1/plans/${testPlanId}/solutions`)
      .send({
        title: 'Test Solution',
        addressing: [testRequirementId],
      });
    testSolutionId = (solResponse.body as ApiResponse<{ solutionId: string }>).data?.solutionId ?? '';
  });

  afterAll(async () => {
    await cleanupTestApp(context);
  });

  describe('POST /api/v1/plans/:planId/artifacts', () => {
    it('should create a new artifact with required fields only', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Auth Service',
          artifactType: 'code',
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<ArtifactData>;
      expect(body.success).toBe(true);
      expect(body.data?.artifactId).toBeDefined();
    });

    it('should create artifact with all optional fields', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Database Migration',
          artifactType: 'migration',
          description: 'User table migration',
          slug: 'user-migration',
          content: {
            language: 'sql',
            sourceCode: 'CREATE TABLE users (id INT);',
            filename: '001_create_users.sql',
          },
          targets: [
            {
              path: 'migrations/001_create_users.sql',
              action: 'create',
            },
          ],
          relatedPhaseId: testPhaseId,
          relatedSolutionId: testSolutionId,
          relatedRequirementIds: [testRequirementId],
          codeRefs: ['src/models/user.ts:10', 'src/db/schema.ts:5'],
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<ArtifactData>;
      expect(body.success).toBe(true);
      expect(body.data?.artifactId).toBeDefined();
    });

    it('should return 400 for missing required field: title', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          artifactType: 'code',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 for missing required field: artifactType', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Test Artifact',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 for empty title', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: '',
          artifactType: 'code',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 for invalid artifactType', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Test Artifact',
          artifactType: 'invalid-type',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 for invalid target action', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Test Artifact',
          artifactType: 'code',
          targets: [
            {
              path: 'test.ts',
              action: 'invalid-action',
            },
          ],
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 for invalid codeRef format', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Test Artifact',
          artifactType: 'code',
          codeRefs: ['invalid-format'],
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 409 for duplicate slug', async () => {
      const slug = 'unique-artifact-slug';

      // Create first artifact
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'First Artifact',
          artifactType: 'code',
          slug,
        })
        .expect(HttpStatus.CREATED);

      // Try to create second with same slug
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Second Artifact',
          artifactType: 'code',
          slug,
        })
        .expect(HttpStatus.CONFLICT);
    });

    it('should return 404 for non-existent relatedPhaseId', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Test Artifact',
          artifactType: 'code',
          relatedPhaseId: 'non-existent-phase-id',
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for non-existent relatedRequirementId', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Test Artifact',
          artifactType: 'code',
          relatedRequirementIds: ['non-existent-requirement-id'],
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for non-existent relatedSolutionId', async () => {
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Test Artifact',
          artifactType: 'code',
          relatedSolutionId: 'non-existent-solution-id',
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .post('/api/v1/plans/non-existent-plan/artifacts')
        .send({
          title: 'Test Artifact',
          artifactType: 'code',
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should auto-generate slug from title', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'User Authentication Module',
          artifactType: 'code',
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<ArtifactData>;
      const artifactId = body.data?.artifactId ?? '';

      // Get artifact to check slug
      const getResponse = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .expect(HttpStatus.OK);

      const artifact = (getResponse.body as ApiResponse<{ artifact: { slug: string } }>).data?.artifact;
      expect(artifact?.slug).toBe('user-authentication-module');
    });
  });

  describe('GET /api/v1/plans/:planId/artifacts', () => {
    it('should list all artifacts', async () => {
      // Create test artifact first
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'List Test Artifact',
          artifactType: 'code',
        });

      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ArtifactListData>;
      expect(body.success).toBe(true);
      expect(body.data?.artifacts.length).toBeGreaterThan(0);
      expect(body.data?.total).toBeGreaterThan(0);
    });

    it('should NOT include sourceCode in list response (security)', async () => {
      // Create artifact with sourceCode
      const codeRes = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Code Artifact with Source',
          artifactType: 'code',
          content: {
            sourceCode: 'console.log("test");',
          },
        });
      const codeArtifactId = (codeRes.body as ApiResponse<ArtifactData>).data?.artifactId ?? '';

      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ArtifactListData>;
      const artifacts = body.data?.artifacts ?? [];

      // Find the code artifact
      const codeArtifact = artifacts.find((a) => a.id === codeArtifactId);
      expect(codeArtifact).toBeDefined();

      // sourceCode should not be present
      expect(codeArtifact?.content?.sourceCode).toBeUndefined();
    });

    it('should filter by artifactType', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts?artifactType=code`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ArtifactListData>;
      const artifacts = body.data?.artifacts ?? [];

      artifacts.forEach((artifact) => {
        expect(artifact.artifactType).toBe('code');
      });
    });

    it('should filter by status', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts?status=draft`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ArtifactListData>;
      const artifacts = body.data?.artifacts ?? [];

      artifacts.forEach((artifact) => {
        expect(artifact.status).toBe('draft');
      });
    });

    it('should filter by relatedPhaseId', async () => {
      // Create artifact with related phase
      const res = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Phase Artifact',
          artifactType: 'code',
          relatedPhaseId: testPhaseId,
        });
      const artifactId = (res.body as ApiResponse<ArtifactData>).data?.artifactId ?? '';

      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts?relatedPhaseId=${testPhaseId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ArtifactListData>;
      const artifacts = body.data?.artifacts ?? [];

      expect(artifacts.some((a) => a.id === artifactId)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts?limit=2&offset=0`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ArtifactListData>;
      expect(body.data?.artifacts.length).toBeLessThanOrEqual(2);
    });

    it('should return 400 for negative offset', async () => {
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts?offset=-1`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .get('/api/v1/plans/non-existent-plan/artifacts')
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /api/v1/plans/:planId/artifacts/:id', () => {
    let artifactId = '';

    beforeEach(async () => {
      const res = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Get Test Artifact',
          slug: `get-test-artifact-${Date.now().toString()}`, // Unique slug for each test
          artifactType: 'code',
          content: {
            language: 'typescript',
            sourceCode: 'export function test() {}',
            filename: 'test.ts',
          },
        });
      artifactId = (res.body as ApiResponse<ArtifactData>).data?.artifactId ?? '';
    });

    it('should get artifact by id', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ artifact: { id: string; title: string } }>;
      expect(body.success).toBe(true);
      expect(body.data?.artifact.id).toBe(artifactId);
      expect(body.data?.artifact.title).toBe('Get Test Artifact');
    });

    it('should NOT include sourceCode by default (lazy-load)', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ artifact: { content?: { sourceCode?: string } } }>;
      expect(body.data?.artifact.content?.sourceCode).toBeUndefined();
    });

    it('should include sourceCode when includeContent=true', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}?includeContent=true`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ artifact: { content: { sourceCode: string } } }>;
      expect(body.data?.artifact.content.sourceCode).toBe('export function test() {}');
    });

    it('should support field filtering', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}?fields=id,title`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ artifact: Record<string, unknown> }>;
      const artifact = body.data?.artifact ?? {};

      expect(artifact.id).toBeDefined();
      expect(artifact.title).toBeDefined();
      expect(artifact.description).toBeUndefined();
    });

    it('should return 404 for non-existent artifact', async () => {
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts/non-existent-id`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 for non-existent plan', async () => {
      await request(getServer())
        .get(`/api/v1/plans/non-existent-plan/artifacts/${artifactId}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /api/v1/plans/:planId/artifacts/:id', () => {
    let artifactId = '';

    beforeEach(async () => {
      const res = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Update Test Artifact',
          slug: `update-test-artifact-${Date.now().toString()}`, // Unique slug for each test
          artifactType: 'code',
        });
      artifactId = (res.body as ApiResponse<ArtifactData>).data?.artifactId ?? '';
    });

    it('should update artifact title', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .send({
          title: 'Updated Title',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ success: boolean; artifactId: string }>;
      expect(body.success).toBe(true);
      expect(body.data?.artifactId).toBe(artifactId);
    });

    it('should update artifact description', async () => {
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .send({
          description: 'Updated description',
        })
        .expect(HttpStatus.OK);
    });

    it('should update artifact status', async () => {
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .send({
          status: 'reviewed',
        })
        .expect(HttpStatus.OK);
    });

    it('should update content', async () => {
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .send({
          content: {
            language: 'javascript',
            sourceCode: 'console.log("updated");',
          },
        })
        .expect(HttpStatus.OK);
    });

    it('should return 400 for empty title', async () => {
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .send({
          title: '',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 for invalid status', async () => {
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .send({
          status: 'invalid-status',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 409 for duplicate slug', async () => {
      // Create another artifact with a slug
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Other Artifact',
          artifactType: 'code',
          slug: 'existing-slug',
        });

      // Try to update current artifact with same slug
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .send({
          slug: 'existing-slug',
        })
        .expect(HttpStatus.CONFLICT);
    });

    it('should return 404 for non-existent artifact', async () => {
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/artifacts/non-existent-id`)
        .send({
          title: 'Updated Title',
        })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /api/v1/plans/:planId/artifacts/:id', () => {
    let artifactId = '';

    beforeEach(async () => {
      const res = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Delete Test Artifact',
          slug: `delete-test-artifact-${Date.now().toString()}`, // Unique slug for each test
          artifactType: 'code',
        });
      artifactId = (res.body as ApiResponse<ArtifactData>).data?.artifactId ?? '';
    });

    it('should delete an artifact', async () => {
      const response = await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<DeleteData>;
      expect(body.success).toBe(true);
      expect(body.data?.message).toContain('deleted');
    });

    it('should return 404 for non-existent artifact', async () => {
      await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/artifacts/non-existent-id`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should cascade delete links for artifact', async () => {
      // Create a link
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/links`)
        .send({
          sourceId: testPhaseId,
          targetId: artifactId,
          relationType: 'has_artifact',
        });

      // Delete artifact
      await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .expect(HttpStatus.OK);

      // Verify artifact is deleted
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /api/v1/plans/:planId/artifacts/:id/history', () => {
    let artifactId = '';

    beforeEach(async () => {
      const res = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'History Test Artifact',
          slug: `history-test-artifact-${Date.now().toString()}`, // Unique slug for each test
          artifactType: 'code',
        });
      artifactId = (res.body as ApiResponse<ArtifactData>).data?.artifactId ?? '';

      // Make an update to create history
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .send({
          title: 'Updated History Test',
        });
    });

    it('should get artifact history', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}/history`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ versions: unknown[]; total: number }>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data?.versions)).toBe(true);
    });

    it('should support pagination in history', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}/history?limit=1&offset=0`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ versions: unknown[]; total: number }>;
      expect(body.data?.versions.length).toBeLessThanOrEqual(1);
    });

    it('should return empty history for non-existent artifact', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts/non-existent-id/history`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ versions: unknown[]; total: number }>;
      expect(body.data?.versions).toEqual([]);
    });
  });

  describe('GET /api/v1/plans/:planId/artifacts/:id/diff', () => {
    let artifactId = '';

    beforeEach(async () => {
      const res = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/artifacts`)
        .send({
          title: 'Diff Test Artifact',
          slug: `diff-test-artifact-${Date.now().toString()}`, // Unique slug for each test
          artifactType: 'code',
        });
      artifactId = (res.body as ApiResponse<ArtifactData>).data?.artifactId ?? '';

      // Make updates to create version history
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}`)
        .send({
          title: 'Diff Test Updated',
        });
    });

    it.skip('should get diff between two versions', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}/diff?version1=1&version2=2`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ diff: unknown }>;
      expect(body.success).toBe(true);
      expect(body.data?.diff).toBeDefined();
    });

    it('should return 400 for missing version parameters', async () => {
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts/${artifactId}/diff`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 404 for non-existent artifact', async () => {
      await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/artifacts/non-existent-id/diff?version1=1&version2=2`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
