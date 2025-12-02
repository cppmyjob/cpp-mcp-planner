import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PhaseService } from '../../src/domain/services/phase-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { FileStorage } from '../../src/infrastructure/file-storage.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('PhaseService', () => {
  let service: PhaseService;
  let planService: PlanService;
  let storage: FileStorage;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-phase-test-${Date.now()}`);
    storage = new FileStorage(testDir);
    await storage.initialize();
    planService = new PlanService(storage);
    service = new PhaseService(storage, planService);

    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For testing phases',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('add_phase', () => {
    it('should add a root phase', async () => {
      const result = await service.addPhase({
        planId,
        phase: {
          title: 'Phase 1',
          description: 'First phase',
          objectives: ['Build auth'],
          deliverables: ['Login API'],
          successCriteria: ['Tests pass'],
        },
      });

      expect(result.phaseId).toBeDefined();
      expect(result.phase.depth).toBe(0);
      expect(result.phase.path).toBe('1');
      expect(result.phase.status).toBe('planned');
    });

    it('should add a nested phase', async () => {
      const parent = await service.addPhase({
        planId,
        phase: {
          title: 'Parent',
          description: 'Parent phase',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const child = await service.addPhase({
        planId,
        phase: {
          title: 'Child',
          description: 'Child phase',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          parentId: parent.phaseId,
        },
      });

      expect(child.phase.depth).toBe(1);
      expect(child.phase.path).toBe('1.1');
      expect(child.phase.parentId).toBe(parent.phaseId);
    });

    it('should auto-increment order', async () => {
      await service.addPhase({
        planId,
        phase: {
          title: 'Phase 1',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const p2 = await service.addPhase({
        planId,
        phase: {
          title: 'Phase 2',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      expect(p2.phase.order).toBe(2);
      expect(p2.phase.path).toBe('2');
    });
  });

  describe('get_phase_tree', () => {
    beforeEach(async () => {
      const p1 = await service.addPhase({
        planId,
        phase: {
          title: 'Phase 1',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      await service.addPhase({
        planId,
        phase: {
          title: 'Phase 1.1',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          parentId: p1.phaseId,
        },
      });

      await service.addPhase({
        planId,
        phase: {
          title: 'Phase 1.2',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          parentId: p1.phaseId,
        },
      });

      await service.addPhase({
        planId,
        phase: {
          title: 'Phase 2',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });
    });

    it('should return full tree', async () => {
      const result = await service.getPhaseTree({ planId });

      expect(result.tree).toHaveLength(2); // Phase 1 and Phase 2
      expect(result.tree[0].children).toHaveLength(2); // Phase 1.1 and 1.2
      expect(result.tree[0].hasChildren).toBe(true);
    });

    it('should exclude completed if requested', async () => {
      // Mark Phase 2 as completed
      const tree1 = await service.getPhaseTree({ planId });
      const phase2Id = tree1.tree[1].phase.id;

      await service.updatePhaseStatus({
        planId,
        phaseId: phase2Id,
        status: 'completed',
      });

      const result = await service.getPhaseTree({ planId, includeCompleted: false });
      expect(result.tree).toHaveLength(1);
    });
  });

  describe('update_phase_status', () => {
    it('should auto-set startedAt on in_progress', async () => {
      const phase = await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const result = await service.updatePhaseStatus({
        planId,
        phaseId: phase.phaseId,
        status: 'in_progress',
      });

      expect(result.phase.startedAt).toBeDefined();
      expect(result.autoUpdatedTimestamps.startedAt).toBeDefined();
    });

    it('should auto-set completedAt and progress on completed', async () => {
      const phase = await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const result = await service.updatePhaseStatus({
        planId,
        phaseId: phase.phaseId,
        status: 'completed',
      });

      expect(result.phase.completedAt).toBeDefined();
      expect(result.phase.progress).toBe(100);
    });

    it('should require notes for blocked status', async () => {
      const phase = await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      await expect(
        service.updatePhaseStatus({
          planId,
          phaseId: phase.phaseId,
          status: 'blocked',
        })
      ).rejects.toThrow('Notes required');
    });

    it('should accept notes for blocked status', async () => {
      const phase = await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const result = await service.updatePhaseStatus({
        planId,
        phaseId: phase.phaseId,
        status: 'blocked',
        notes: 'Waiting for API access',
      });

      expect(result.phase.status).toBe('blocked');
    });

    it('should track actual effort', async () => {
      const phase = await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const result = await service.updatePhaseStatus({
        planId,
        phaseId: phase.phaseId,
        status: 'completed',
        actualEffort: 4.5,
      });

      expect(result.phase.schedule.actualEffort).toBe(4.5);
    });
  });

  describe('delete_phase', () => {
    it('should delete single phase', async () => {
      const phase = await service.addPhase({
        planId,
        phase: {
          title: 'To Delete',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const result = await service.deletePhase({
        planId,
        phaseId: phase.phaseId,
      });

      expect(result.success).toBe(true);
      expect(result.deletedPhaseIds).toHaveLength(1);
    });

    it('should delete with children', async () => {
      const parent = await service.addPhase({
        planId,
        phase: {
          title: 'Parent',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      await service.addPhase({
        planId,
        phase: {
          title: 'Child',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          parentId: parent.phaseId,
        },
      });

      const result = await service.deletePhase({
        planId,
        phaseId: parent.phaseId,
        deleteChildren: true,
      });

      expect(result.deletedPhaseIds).toHaveLength(2);

      const tree = await service.getPhaseTree({ planId });
      expect(tree.tree).toHaveLength(0);
    });
  });

  describe('move_phase', () => {
    it('should move phase to new parent', async () => {
      const p1 = await service.addPhase({
        planId,
        phase: {
          title: 'Phase 1',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const p2 = await service.addPhase({
        planId,
        phase: {
          title: 'Phase 2',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      // Move Phase 2 under Phase 1
      const result = await service.movePhase({
        planId,
        phaseId: p2.phaseId,
        newParentId: p1.phaseId,
        newOrder: 1,
      });

      expect(result.phase.parentId).toBe(p1.phaseId);
      expect(result.phase.depth).toBe(1);
      expect(result.phase.path).toBe('1.1');
    });
  });
});
