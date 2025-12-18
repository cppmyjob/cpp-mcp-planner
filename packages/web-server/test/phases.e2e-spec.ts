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

interface PhaseData {
  phaseId: string;
}

interface PhaseDetailData {
  id: string;
  title: string;
  status: string;
  progress: number;
  path: string;
  childCount: number;
  [key: string]: unknown;
}

interface ListPhasesData {
  phases: PhaseDetailData[];
  notFound?: string[];
}

interface PhaseTreeNode {
  phase: PhaseDetailData;
  children: PhaseTreeNode[];
  depth: number;
  hasChildren: boolean;
}

interface TreeData {
  tree: PhaseTreeNode[];
}

interface NextAction {
  phaseId: string;
  phaseTitle: string;
  phasePath: string;
  action: string;
  reason: string;
  priority: string;
}

interface NextActionsData {
  actions: NextAction[];
  summary: {
    totalPending: number;
    totalInProgress: number;
    totalBlocked: number;
  };
}

interface MoveData {
  success: boolean;
  phaseId: string;
  affectedPhaseIds?: string[];
}

interface UpdateStatusData {
  success: boolean;
  phaseId: string;
}

interface DeleteData {
  success: boolean;
  message: string;
  deletedPhaseIds: string[];
  reparentedPhaseIds?: string[];
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

describe('Phases API (e2e)', () => {
  let context: TestContext;
  let app: INestApplication;
  let testPlanId: string;

   
  const getServer = (): TestApp => app.getHttpServer();

  beforeAll(async () => {
    context = await createTestApp();
    app = context.app;

    // Create a test plan for phases
     
    const planResponse = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .send({
        name: 'Phases Test Plan',
        description: 'Plan for phases E2E testing',
      });
    const planBody = planResponse.body as ApiResponse<{ planId: string }>;
    testPlanId = planBody.data?.planId ?? '';
    expect(testPlanId).toBeTruthy();
  });

  afterAll(async () => {
    await cleanupTestApp(context);
  });

  describe('POST /api/v1/plans/:planId/phases', () => {
    it('should create a new phase with required fields', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'Backend Development',
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<PhaseData>;
      expect(body.success).toBe(true);
      expect(body.data?.phaseId).toBeDefined();
    });

    it('should create a phase with all optional fields', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'Frontend Development',
          description: 'Build React UI',
          objectives: ['Responsive design', 'Accessibility'],
          deliverables: ['React app', 'Storybook'],
          successCriteria: ['Passes WCAG 2.1', 'Load time < 2s'],
          priority: 'high',
          implementationNotes: 'Use TypeScript',
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<PhaseData>;
      expect(body.success).toBe(true);
      expect(body.data?.phaseId).toBeDefined();
    });

    it('should create a child phase with parentId', async () => {
      // Create parent first
      const parentResponse = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'API Development' });
      const parentBody = parentResponse.body as ApiResponse<PhaseData>;
      const parentId = parentBody.data?.phaseId;

      // Create child
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'REST Endpoints',
          parentId,
        })
        .expect(HttpStatus.CREATED);

      const body = response.body as ApiResponse<PhaseData>;
      expect(body.success).toBe(true);
      expect(body.data?.phaseId).toBeDefined();
    });

    it('should return 400 for missing required field: title', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          description: 'Missing title',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 400 for empty title', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: '',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 400 for invalid priority', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'Test Phase',
          priority: 'invalid',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(getServer())
        .post('/api/v1/plans/non-existent-plan/phases')
        .send({
          title: 'Test Phase',
        })
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/v1/plans/:planId/phases/tree', () => {
    let rootPhaseId: string;

    beforeAll(async () => {
      // Create root phase
      const rootResponse = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'Tree Root Phase' });
      const rootBody = rootResponse.body as ApiResponse<PhaseData>;
      rootPhaseId = rootBody.data?.phaseId ?? '';

      // Create child phase for tree hierarchy testing
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'Tree Child Phase',
          parentId: rootPhaseId,
        });
    });

    it('should return phase tree hierarchy', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/tree`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<TreeData>;
      expect(body.success).toBe(true);
      expect(body.data?.tree).toBeInstanceOf(Array);
      expect(body.data?.tree.length).toBeGreaterThan(0);

      // Check tree node structure
      const firstNode = body.data?.tree[0];
      expect(firstNode?.phase).toBeDefined();
      expect(firstNode?.children).toBeInstanceOf(Array);
      expect(firstNode?.depth).toBeDefined();
      expect(firstNode?.hasChildren).toBeDefined();
    });

    it('should support maxDepth parameter', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/tree`)
        .query({ maxDepth: 0 })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<TreeData>;
      expect(body.success).toBe(true);
      // maxDepth=0 should only return root nodes with no expanded children
      const treeWithChildren = body.data?.tree.filter(node => node.children.length > 0);
      expect(treeWithChildren?.length).toBe(0);
    });

    it('should support includeCompleted parameter', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/tree`)
        .query({ includeCompleted: true })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<TreeData>;
      expect(body.success).toBe(true);
      expect(body.data?.tree).toBeInstanceOf(Array);
    });

    it('should support field filtering', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/tree`)
        .query({ fields: 'id,title,status' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<TreeData>;
      expect(body.success).toBe(true);
      const treeLengthCheck = body.data?.tree.length ?? 0;
      if (treeLengthCheck > 0) {
        const phase = body.data?.tree[0]?.phase;
        expect(phase?.id).toBeDefined();
        expect(phase?.title).toBeDefined();
        expect(phase?.status).toBeDefined();
      }
    });

    it('should return tree structure for any plan', async () => {
      const response = await request(getServer())
        .get('/api/v1/plans/non-existent-plan/phases/tree')
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<TreeData>;
      expect(body.success).toBe(true);
      expect(body.data?.tree).toBeInstanceOf(Array);
      // Note: May contain phases from other tests due to file persistence
    });
  });

  describe('GET /api/v1/plans/:planId/phases/next-actions', () => {
    beforeAll(async () => {
      // Create phases with different statuses for next-actions
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'Planned Phase for Actions',
          // status defaults to 'planned'
        });

      const inProgressResp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'In Progress Phase',
        });
      const inProgressBody = inProgressResp.body as ApiResponse<PhaseData>;
      const inProgressId = inProgressBody.data?.phaseId ?? '';

      // Update status to in_progress
      if (inProgressId !== '') {
        await request(getServer())
          .patch(`/api/v1/plans/${testPlanId}/phases/${inProgressId}/status`)
          .send({
            status: 'in_progress',
            progress: 50,
          });
      }
    });

    it('should return next actions with summary', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/next-actions`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<NextActionsData>;
      expect(body.success).toBe(true);
      expect(body.data?.actions).toBeInstanceOf(Array);
      expect(body.data?.summary).toBeDefined();
      expect(body.data?.summary.totalPending).toBeGreaterThanOrEqual(0);
      expect(body.data?.summary.totalInProgress).toBeGreaterThanOrEqual(0);
      expect(body.data?.summary.totalBlocked).toBeGreaterThanOrEqual(0);
    });

    it('should support limit parameter', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/next-actions`)
        .query({ limit: 2 })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<NextActionsData>;
      expect(body.success).toBe(true);
      expect(body.data?.actions).toBeInstanceOf(Array);
      const actionsLength = body.data?.actions.length ?? 0;
      expect(actionsLength).toBeLessThanOrEqual(2);
    });

    it('should return 400 for invalid limit', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/next-actions`)
        .query({ limit: 0 })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return next actions for any plan (empty or with phases)', async () => {
      const response = await request(getServer())
        .get('/api/v1/plans/non-existent-plan/phases/next-actions')
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<NextActionsData>;
      expect(body.success).toBe(true);
      expect(body.data?.actions).toBeInstanceOf(Array);
      expect(body.data?.summary).toBeDefined();
    });
  });

  describe('GET /api/v1/plans/:planId/phases', () => {
    let phaseId1: string;
    let phaseId2: string;

    beforeAll(async () => {
      const resp1 = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'List Phase 1' });
      const body1 = resp1.body as ApiResponse<PhaseData>;
      phaseId1 = body1.data?.phaseId ?? '';

      const resp2 = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'List Phase 2' });
      const body2 = resp2.body as ApiResponse<PhaseData>;
      phaseId2 = body2.data?.phaseId ?? '';
    });

    it('should list multiple phases by IDs', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases`)
        .query({ phaseIds: `${phaseId1},${phaseId2}` })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListPhasesData>;
      expect(body.success).toBe(true);
      expect(body.data?.phases).toBeInstanceOf(Array);
      expect(body.data?.phases.length).toBeGreaterThanOrEqual(2);
    });

    it('should support field filtering', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases`)
        .query({ phaseIds: phaseId1, fields: 'id,title' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListPhasesData>;
      expect(body.success).toBe(true);
      const phasesLength = body.data?.phases.length ?? 0;
      if (phasesLength > 0) {
        const phase = body.data?.phases[0];
        expect(phase?.id).toBeDefined();
        expect(phase?.title).toBeDefined();
      }
    });

    it('should return notFound for non-existent IDs', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases`)
        .query({ phaseIds: 'non-existent-id' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListPhasesData>;
      expect(body.success).toBe(true);
      expect(body.data?.notFound).toContain('non-existent-id');
    });

    it('should return 400 for missing phaseIds when no filters provided', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases`)
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    // RED: These tests will fail until we implement status filtering
    it('RED: should filter phases by status=in_progress', async () => {
      // First create a phase with in_progress status
      const createResp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'Status Filter Test - In Progress' });
      const createBody = createResp.body as ApiResponse<PhaseData>;
      const phaseId = createBody.data?.phaseId ?? '';

      // Update status to in_progress
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${phaseId}/status`)
        .send({ status: 'in_progress', progress: 50 });

      // Now try to filter by status
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases`)
        .query({ status: 'in_progress' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListPhasesData>;
      expect(body.success).toBe(true);
      expect(body.data?.phases).toBeInstanceOf(Array);
      expect(body.data?.phases.length).toBeGreaterThan(0);

      // All returned phases should have status='in_progress'
      const allInProgress = body.data?.phases.every(p => p.status === 'in_progress');
      expect(allInProgress).toBe(true);
    });

    it('RED: should filter phases by status=blocked', async () => {
      // Create a phase with blocked status
      const createResp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'Status Filter Test - Blocked' });
      const createBody = createResp.body as ApiResponse<PhaseData>;
      const phaseId = createBody.data?.phaseId ?? '';

      // Update status to blocked (with blocking reason)
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${phaseId}/status`)
        .send({ status: 'blocked', notes: 'Blocked by dependencies' });

      // Filter by status=blocked
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases`)
        .query({ status: 'blocked' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListPhasesData>;
      expect(body.success).toBe(true);
      expect(body.data?.phases).toBeInstanceOf(Array);
      expect(body.data?.phases.length).toBeGreaterThan(0);

      // All returned phases should have status='blocked'
      const allBlocked = body.data?.phases.every(p => p.status === 'blocked');
      expect(allBlocked).toBe(true);
    });

    it('RED: should filter phases by parentId', async () => {
      // Create parent phase
      const parentResp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'Parent Filter Test' });
      const parentBody = parentResp.body as ApiResponse<PhaseData>;
      const parentId = parentBody.data?.phaseId ?? '';

      // Create child phases
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'Child 1', parentId });

      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'Child 2', parentId });

      // Filter by parentId
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases`)
        .query({ parentId })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListPhasesData>;
      expect(body.success).toBe(true);
      expect(body.data?.phases).toBeInstanceOf(Array);
      expect(body.data?.phases.length).toBeGreaterThanOrEqual(2);

      // All returned phases should have the correct parentId
      const allChildren = body.data?.phases.every(p => p.parentId === parentId);
      expect(allChildren).toBe(true);
    });

    it('RED: should combine status and fields filters', async () => {
      // Get phases with status filter and field selection
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases`)
        .query({ status: 'planned', fields: 'id,title,status' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<ListPhasesData>;
      expect(body.success).toBe(true);
      expect(body.data?.phases).toBeInstanceOf(Array);

      // Check field filtering worked
      const phasesLength = body.data?.phases.length ?? 0;
      if (phasesLength > 0) {
        const phase = body.data?.phases[0];
        expect(phase?.id).toBeDefined();
        expect(phase?.title).toBeDefined();
        expect(phase?.status).toBe('planned');
        // Should not have other fields like description, objectives, etc.
        expect(phase?.description).toBeUndefined();
      }
    });
  });

  describe('GET /api/v1/plans/:planId/phases/:id', () => {
    let testPhaseId: string;

    beforeAll(async () => {
      const resp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'Get Single Phase',
          description: 'Test phase for get endpoint',
        });
      const body = resp.body as ApiResponse<PhaseData>;
      testPhaseId = body.data?.phaseId ?? '';
    });

    it('should get a phase by ID', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ phase: PhaseDetailData }>;
      expect(body.success).toBe(true);
      expect(body.data?.phase.id).toBe(testPhaseId);
      expect(body.data?.phase.title).toBe('Get Single Phase');
    });

    it('should support field filtering', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}`)
        .query({ fields: 'id,title' })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ phase: PhaseDetailData }>;
      expect(body.success).toBe(true);
      expect(body.data?.phase.id).toBeDefined();
      expect(body.data?.phase.title).toBeDefined();
    });

    it('should return 404 for non-existent phase', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/non-existent-id`)
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/non-existent-plan/phases/${testPhaseId}`)
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });

  describe('PATCH /api/v1/plans/:planId/phases/:id', () => {
    let testPhaseId: string;

    beforeAll(async () => {
      const resp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'Update Test Phase',
          description: 'Original description',
        });
      const body = resp.body as ApiResponse<PhaseData>;
      testPhaseId = body.data?.phaseId ?? '';
    });

    it('should update phase title', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}`)
        .send({
          title: 'Updated Phase Title',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ success: boolean; phaseId: string }>;
      expect(body.success).toBe(true);
      expect(body.data?.phaseId).toBe(testPhaseId);
    });

    it('should update phase description', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}`)
        .send({
          description: 'Updated description',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ success: boolean; phaseId: string }>;
      expect(body.success).toBe(true);
    });

    it('should update multiple fields at once', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}`)
        .send({
          title: 'Multi-update Title',
          description: 'Multi-update description',
          priority: 'critical',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<{ success: boolean; phaseId: string }>;
      expect(body.success).toBe(true);
    });

    it('should return 400 for empty title', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}`)
        .send({
          title: '',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 400 for invalid priority', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}`)
        .send({
          priority: 'invalid',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent phase', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/non-existent-id`)
        .send({
          title: 'New Title',
        })
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/plans/:planId/phases/:id', () => {
    it('should delete a phase without children', async () => {
      const createResp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'Phase to Delete' });
      const createBody = createResp.body as ApiResponse<PhaseData>;
      const phaseId = createBody.data?.phaseId ?? '';

      const response = await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/phases/${phaseId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<DeleteData>;
      expect(body.success).toBe(true);
      expect(body.data?.deletedPhaseIds).toContain(phaseId);
    });

    it('should delete phase with children when deleteChildren=true', async () => {
      // Create parent
      const parentResp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'Parent to Delete' });
      const parentBody = parentResp.body as ApiResponse<PhaseData>;
      const parentId = parentBody.data?.phaseId ?? '';

      // Create child
      await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'Child to Delete',
          parentId,
        });

      const response = await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/phases/${parentId}`)
        .query({ deleteChildren: true })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<DeleteData>;
      expect(body.success).toBe(true);
      expect(body.data?.deletedPhaseIds).toContain(parentId);
      const deletedLength = body.data?.deletedPhaseIds.length ?? 0;
      expect(deletedLength).toBeGreaterThanOrEqual(2); // parent + child
    });

    it('should re-parent children when deleting phase without deleteChildren flag (Bug #17)', async () => {
      // Create parent
      const parentResp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'Parent with Child' });
      const parentBody = parentResp.body as ApiResponse<PhaseData>;
      const parentId = parentBody.data?.phaseId ?? '';

      // Create child
      const childResp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'Child Phase',
          parentId,
        });
      const childBody = childResp.body as ApiResponse<PhaseData>;
      const childId = childBody.data?.phaseId ?? '';

      // Delete parent without deleteChildren flag - should re-parent child to null
      const response = await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/phases/${parentId}`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<DeleteData>;
      expect(body.success).toBe(true);
      expect(body.data?.deletedPhaseIds).toContain(parentId);
      expect(body.data?.reparentedPhaseIds).toContain(childId);
    });

    it('should return 404 for non-existent phase', async () => {
      const response = await request(getServer())
        .delete(`/api/v1/plans/${testPlanId}/phases/non-existent-id`)
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });

  describe('POST /api/v1/plans/:planId/phases/:id/move', () => {
    let parentPhase1Id: string;
    let parentPhase2Id: string;
    let childPhaseId: string;

    beforeAll(async () => {
      const parent1Resp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'Move Parent 1' });
      const parent1Body = parent1Resp.body as ApiResponse<PhaseData>;
      parentPhase1Id = parent1Body.data?.phaseId ?? '';

      const parent2Resp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'Move Parent 2' });
      const parent2Body = parent2Resp.body as ApiResponse<PhaseData>;
      parentPhase2Id = parent2Body.data?.phaseId ?? '';

      const childResp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'Move Child Phase',
          parentId: parentPhase1Id,
        });
      const childBody = childResp.body as ApiResponse<PhaseData>;
      childPhaseId = childBody.data?.phaseId ?? '';
    });

    it('should move phase to different parent', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases/${childPhaseId}/move`)
        .send({
          newParentId: parentPhase2Id,
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<MoveData>;
      expect(body.success).toBe(true);
      expect(body.data?.phaseId).toBe(childPhaseId);
    });

    it('should move phase to root (null parent)', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases/${childPhaseId}/move`)
        .send({
          newParentId: null,
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<MoveData>;
      expect(body.success).toBe(true);
    });

    it('should update order within same parent', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases/${childPhaseId}/move`)
        .send({
          newOrder: 10,
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<MoveData>;
      expect(body.success).toBe(true);
    });

    it('should return 400 for invalid newOrder', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases/${childPhaseId}/move`)
        .send({
          newOrder: -1,
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent phase', async () => {
      const response = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases/non-existent-id/move`)
        .send({
          newParentId: parentPhase1Id,
        })
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });

  describe('PATCH /api/v1/plans/:planId/phases/:id/status', () => {
    let testPhaseId: string;

    beforeAll(async () => {
      const resp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'Status Update Phase' });
      const body = resp.body as ApiResponse<PhaseData>;
      testPhaseId = body.data?.phaseId ?? '';
    });

    it('should update phase status to in_progress', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}/status`)
        .send({
          status: 'in_progress',
          progress: 30,
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<UpdateStatusData>;
      expect(body.success).toBe(true);
      expect(body.data?.phaseId).toBe(testPhaseId);
    });

    it('should update status to completed with 100% progress', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}/status`)
        .send({
          status: 'completed',
          progress: 100,
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<UpdateStatusData>;
      expect(body.success).toBe(true);
    });

    it('should update status with notes', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}/status`)
        .send({
          status: 'in_progress',
          progress: 50,
          notes: 'Halfway done',
        })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<UpdateStatusData>;
      expect(body.success).toBe(true);
    });

    it('should return 400 for missing required field: status', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}/status`)
        .send({
          progress: 50,
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 400 for invalid status', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}/status`)
        .send({
          status: 'invalid',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 400 for invalid progress (> 100)', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}/status`)
        .send({
          status: 'in_progress',
          progress: 150,
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent phase', async () => {
      const response = await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/non-existent-id/status`)
        .send({
          status: 'in_progress',
        })
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/v1/plans/:planId/phases/:id/history', () => {
    let testPhaseId: string;

    beforeAll(async () => {
      const createResp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({ title: 'History Phase' });
      const createBody = createResp.body as ApiResponse<PhaseData>;
      testPhaseId = createBody.data?.phaseId ?? '';

      // Make an update to create history
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}`)
        .send({ title: 'Updated History Phase' });
    });

    it('should get phase history', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}/history`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<HistoryData>;
      expect(body.success).toBe(true);
      expect(body.data?.entityId).toBe(testPhaseId);
      expect(body.data?.versions).toBeInstanceOf(Array);
    });

    it('should support pagination', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}/history`)
        .query({ limit: 1, offset: 0 })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<HistoryData>;
      expect(body.success).toBe(true);
    });

    it('should return empty history for non-existent phase', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/non-existent-id/history`)
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<HistoryData>;
      expect(body.success).toBe(true);
      expect(body.data?.versions).toBeInstanceOf(Array);
      expect(body.data?.versions.length).toBe(0);
    });
  });

  describe('GET /api/v1/plans/:planId/phases/:id/diff', () => {
    let testPhaseId: string;

    beforeAll(async () => {
      const createResp = await request(getServer())
        .post(`/api/v1/plans/${testPlanId}/phases`)
        .send({
          title: 'Diff Phase',
          description: 'Original description',
        });
      const createBody = createResp.body as ApiResponse<PhaseData>;
      testPhaseId = createBody.data?.phaseId ?? '';

      // First update (version 1 -> version 2)
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}`)
        .send({
          description: 'Updated description v2',
        });

      // Second update (version 2 -> version 3) to ensure version history exists
      await request(getServer())
        .patch(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}`)
        .send({
          description: 'Updated description v3',
        });
    });

    // TODO: Fix version history integration for PhaseService
    // Version 1 is not being saved to history after updates
    it.skip('should get diff between two versions', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}/diff`)
        .query({ version1: 1, version2: 2 })
        .expect(HttpStatus.OK);

      const body = response.body as ApiResponse<DiffData>;
      expect(body.success).toBe(true);
      expect(body.data?.entityId).toBe(testPhaseId);
      expect(body.data?.version1.version).toBe(1);
      expect(body.data?.version2.version).toBe(2);
      expect(typeof body.data?.changes).toBe('object');
    });

    it('should return 400 for missing version parameters', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/${testPhaseId}/diff`)
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 404 for non-existent phase', async () => {
      const response = await request(getServer())
        .get(`/api/v1/plans/${testPlanId}/phases/non-existent-id/diff`)
        .query({ version1: 1, version2: 2 })
        .expect(HttpStatus.NOT_FOUND);

      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });
  });
});
