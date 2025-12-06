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

  describe('get_phase', () => {
    it('should get phase by id', async () => {
      const added = await service.addPhase({
        planId,
        phase: {
          title: 'Test Phase',
          description: 'A test phase',
          objectives: ['Test objective'],
          deliverables: ['Test deliverable'],
          successCriteria: ['Test passes'],
        },
      });

      const result = await service.getPhase({
        planId,
        phaseId: added.phaseId,
        fields: ['*'],
      });

      expect(result.phase).toBeDefined();
      expect(result.phase.id).toBe(added.phaseId);
      expect(result.phase.title).toBe('Test Phase');
      expect(result.phase.description).toBe('A test phase');
    });

    it('should throw error for non-existent phase', async () => {
      await expect(
        service.getPhase({
          planId,
          phaseId: 'non-existent-id',
        })
      ).rejects.toThrow('Phase not found');
    });

    it('should throw error for non-existent plan', async () => {
      await expect(
        service.getPhase({
          planId: 'non-existent-plan',
          phaseId: 'some-id',
        })
      ).rejects.toThrow();
    });
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

      // Verify via getPhase
      const { phase } = await service.getPhase({ planId, phaseId: result.phaseId });
      expect(phase.depth).toBe(0);
      expect(phase.path).toBe('1');
      expect(phase.status).toBe('planned');
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

      // Verify via getPhase
      const { phase } = await service.getPhase({ planId, phaseId: child.phaseId });
      expect(phase.depth).toBe(1);
      expect(phase.path).toBe('1.1');
      expect(phase.parentId).toBe(parent.phaseId);
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

      // Verify via getPhase
      const { phase } = await service.getPhase({ planId, phaseId: p2.phaseId });
      expect(phase.order).toBe(2);
      expect(phase.path).toBe('2');
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

  describe('priority field', () => {
    it('should save priority=critical when provided', async () => {
      const result = await service.addPhase({
        planId,
        phase: {
          title: 'Critical Phase',
          description: 'High priority work',
          objectives: ['Critical objective'],
          deliverables: ['Critical deliverable'],
          successCriteria: ['Tests pass'],
          priority: 'critical',
        },
      });

      const { phase } = await service.getPhase({ planId, phaseId: result.phaseId });
      expect(phase.priority).toBe('critical');
    });

    it('should save each priority value correctly', async () => {
      const priorities: Array<'critical' | 'high' | 'medium' | 'low'> =
        ['critical', 'high', 'medium', 'low'];

      for (const prio of priorities) {
        const result = await service.addPhase({
          planId,
          phase: {
            title: `${prio} Priority`,
            description: 'Test',
            objectives: ['T'],
            deliverables: ['T'],
            successCriteria: ['T'],
            priority: prio,
          },
        });
        const { phase } = await service.getPhase({ planId, phaseId: result.phaseId });
        expect(phase.priority).toBe(prio);
      }
    });

    it('should default to medium when priority not provided', async () => {
      const result = await service.addPhase({
        planId,
        phase: {
          title: 'No Priority',
          description: 'Test',
          objectives: ['T'],
          deliverables: ['T'],
          successCriteria: ['T'],
        },
      });
      const { phase } = await service.getPhase({ planId, phaseId: result.phaseId });
      expect(phase.priority).toBe('medium');
    });

    it('should reject invalid priority value', async () => {
      await expect(
        service.addPhase({
          planId,
          phase: {
            title: 'Invalid',
            description: 'Test',
            objectives: ['T'],
            deliverables: ['T'],
            successCriteria: ['T'],
            priority: 'urgent' as any,
          },
        })
      ).rejects.toThrow(/Invalid priority/);
    });

    it('should update priority from low to critical', async () => {
      const added = await service.addPhase({
        planId,
        phase: {
          title: 'Test Phase',
          description: 'Test',
          objectives: ['T'],
          deliverables: ['T'],
          successCriteria: ['T'],
          priority: 'low',
        },
      });

      const updated = await service.updatePhase({
        planId,
        phaseId: added.phaseId,
        updates: { priority: 'critical' },
      });

      const { phase } = await service.getPhase({ planId, phaseId: added.phaseId });
      expect(phase.priority).toBe('critical');
    });

    it('should preserve priority when updating status', async () => {
      const added = await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: 'Test',
          objectives: ['T'],
          deliverables: ['T'],
          successCriteria: ['T'],
          priority: 'high',
        },
      });

      await service.updatePhaseStatus({
        planId,
        phaseId: added.phaseId,
        status: 'in_progress',
      });

      const { phase } = await service.getPhase({ planId, phaseId: added.phaseId });
      expect(phase.priority).toBe('high');
    });
  });

  describe('update_phase_status', () => {
    it('should auto-set startedAt on in_progress', async () => {
      const added = await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      await service.updatePhaseStatus({
        planId,
        phaseId: added.phaseId,
        status: 'in_progress',
      });

      // Verify via getPhase
      const { phase } = await service.getPhase({ planId, phaseId: added.phaseId });
      expect(phase.startedAt).toBeDefined();
    });

    it('should auto-set completedAt and progress on completed', async () => {
      const added = await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      await service.updatePhaseStatus({
        planId,
        phaseId: added.phaseId,
        status: 'completed',
      });

      // Verify via getPhase
      const { phase } = await service.getPhase({ planId, phaseId: added.phaseId });
      expect(phase.completedAt).toBeDefined();
      expect(phase.progress).toBe(100);
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
      const added = await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      await service.updatePhaseStatus({
        planId,
        phaseId: added.phaseId,
        status: 'blocked',
        notes: 'Waiting for API access',
      });

      // Verify via getPhase
      const { phase } = await service.getPhase({ planId, phaseId: added.phaseId });
      expect(phase.status).toBe('blocked');
    });

    it('should track actual effort', async () => {
      const added = await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      await service.updatePhaseStatus({
        planId,
        phaseId: added.phaseId,
        status: 'completed',
        actualEffort: 4.5,
      });

      // Verify via getPhase
      const { phase } = await service.getPhase({
        planId,
        phaseId: added.phaseId,
        fields: ['*'],
      });
      expect(phase.schedule.actualEffort).toBe(4.5);
    });
  });

  describe('get_next_actions with priority', () => {
    it('should sort planned phases by priority: critical > high > medium > low', async () => {
      const low = await service.addPhase({
        planId,
        phase: {
          title: 'Low',
          description: 'Test',
          objectives: ['T'],
          deliverables: ['T'],
          successCriteria: ['T'],
          priority: 'low',
        },
      });

      const critical = await service.addPhase({
        planId,
        phase: {
          title: 'Critical',
          description: 'Test',
          objectives: ['T'],
          deliverables: ['T'],
          successCriteria: ['T'],
          priority: 'critical',
        },
      });

      const medium = await service.addPhase({
        planId,
        phase: {
          title: 'Medium',
          description: 'Test',
          objectives: ['T'],
          deliverables: ['T'],
          successCriteria: ['T'],
          priority: 'medium',
        },
      });

      const high = await service.addPhase({
        planId,
        phase: {
          title: 'High',
          description: 'Test',
          objectives: ['T'],
          deliverables: ['T'],
          successCriteria: ['T'],
          priority: 'high',
        },
      });

      const result = await service.getNextActions({ planId, limit: 10 });

      const plannedActions = result.actions.filter(a => a.action === 'start');
      expect(plannedActions[0].phaseId).toBe(critical.phaseId);
      expect(plannedActions[1].phaseId).toBe(high.phaseId);
      expect(plannedActions[2].phaseId).toBe(medium.phaseId);
      expect(plannedActions[3].phaseId).toBe(low.phaseId);
    });

    it('should prioritize status over priority (blocked-low before in_progress-critical)', async () => {
      const blocked = await service.addPhase({
        planId,
        phase: {
          title: 'Blocked Low',
          description: 'Test',
          objectives: ['T'],
          deliverables: ['T'],
          successCriteria: ['T'],
          priority: 'low',
        },
      });
      await service.updatePhaseStatus({
        planId,
        phaseId: blocked.phaseId,
        status: 'blocked',
        notes: 'Waiting',
      });

      const inProgress = await service.addPhase({
        planId,
        phase: {
          title: 'InProgress Critical',
          description: 'Test',
          objectives: ['T'],
          deliverables: ['T'],
          successCriteria: ['T'],
          priority: 'critical',
        },
      });
      await service.updatePhaseStatus({
        planId,
        phaseId: inProgress.phaseId,
        status: 'in_progress',
      });

      const result = await service.getNextActions({ planId, limit: 10 });

      // Status priority: blocked > in_progress
      expect(result.actions[0].phaseId).toBe(blocked.phaseId);
      expect(result.actions[1].phaseId).toBe(inProgress.phaseId);
    });

    it('should sort blocked phases by priority', async () => {
      const blockedLow = await service.addPhase({
        planId,
        phase: {
          title: 'Blocked Low',
          description: 'Test',
          objectives: ['T'],
          deliverables: ['T'],
          successCriteria: ['T'],
          priority: 'low',
        },
      });
      await service.updatePhaseStatus({
        planId,
        phaseId: blockedLow.phaseId,
        status: 'blocked',
        notes: 'Waiting',
      });

      const blockedCritical = await service.addPhase({
        planId,
        phase: {
          title: 'Blocked Critical',
          description: 'Test',
          objectives: ['T'],
          deliverables: ['T'],
          successCriteria: ['T'],
          priority: 'critical',
        },
      });
      await service.updatePhaseStatus({
        planId,
        phaseId: blockedCritical.phaseId,
        status: 'blocked',
        notes: 'Waiting',
      });

      const result = await service.getNextActions({ planId, limit: 10 });

      const blockedActions = result.actions.filter(a => a.action === 'unblock');
      expect(blockedActions[0].phaseId).toBe(blockedCritical.phaseId);
      expect(blockedActions[1].phaseId).toBe(blockedLow.phaseId);
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
      await service.movePhase({
        planId,
        phaseId: p2.phaseId,
        newParentId: p1.phaseId,
        newOrder: 1,
      });

      // Verify via getPhase
      const { phase } = await service.getPhase({ planId, phaseId: p2.phaseId });
      expect(phase.parentId).toBe(p1.phaseId);
      expect(phase.depth).toBe(1);
      expect(phase.path).toBe('1.1');
    });
  });

  describe('phase with implementation details', () => {
    it('should add phase with implementationNotes', async () => {
      const result = await service.addPhase({
        planId,
        phase: {
          title: 'Implementation Phase',
          description: 'Phase with notes',
          objectives: ['Build feature'],
          deliverables: ['Code'],
          successCriteria: ['Tests pass'],
          implementationNotes: '## TDD Steps\n1. Write failing test\n2. Implement\n3. Refactor',
        },
      });

      // Verify via getPhase
      const { phase } = await service.getPhase({ planId, phaseId: result.phaseId, fields: ['*'] });
      expect(phase.implementationNotes).toBe(
        '## TDD Steps\n1. Write failing test\n2. Implement\n3. Refactor'
      );
    });

    it('should add phase with codeExamples', async () => {
      const result = await service.addPhase({
        planId,
        phase: {
          title: 'Code Phase',
          description: 'Phase with code examples',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          codeExamples: [
            {
              language: 'typescript',
              filename: 'service.ts',
              code: 'export class MyService {}',
              description: 'Service skeleton',
            },
            {
              language: 'typescript',
              code: 'it("should work", () => expect(true).toBe(true));',
            },
          ],
        },
      });

      // Verify via getPhase
      const { phase } = await service.getPhase({
        planId,
        phaseId: result.phaseId,
        fields: ['*'],
      });
      expect(phase.codeExamples).toHaveLength(2);
      expect(phase.codeExamples![0].language).toBe('typescript');
      expect(phase.codeExamples![0].filename).toBe('service.ts');
      expect(phase.codeExamples![1].code).toContain('expect(true)');
    });

    it('should validate codeExamples structure', async () => {
      await expect(
        service.addPhase({
          planId,
          phase: {
            title: 'Invalid',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
            codeExamples: [{ lang: 'ts', src: 'code' } as any],
          },
        })
      ).rejects.toThrow(/language/i);
    });

    it('should add phase with codeRefs', async () => {
      const result = await service.addPhase({
        planId,
        phase: {
          title: 'Phase with refs',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          codeRefs: [
            'src/services/phase-service.ts:42',
            'tests/domain/phase-service.test.ts:100',
          ],
        },
      });

      // Verify via getPhase
      const { phase } = await service.getPhase({
        planId,
        phaseId: result.phaseId,
        fields: ['*'],
      });
      expect(phase.codeRefs).toHaveLength(2);
      expect(phase.codeRefs![0]).toBe('src/services/phase-service.ts:42');
      expect(phase.codeRefs![1]).toBe('tests/domain/phase-service.test.ts:100');
    });

    it('should validate codeRefs structure', async () => {
      await expect(
        service.addPhase({
          planId,
          phase: {
            title: 'Invalid refs',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
            codeRefs: ['invalid-no-line-number'],
          },
        })
      ).rejects.toThrow(/must be in format/i);
    });

    it('should validate codeRefs line number', async () => {
      await expect(
        service.addPhase({
          planId,
          phase: {
            title: 'Invalid line',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
            codeRefs: ['src/file.ts:0'],
          },
        })
      ).rejects.toThrow(/line number must be a positive integer/i);
    });

    it('should update phase with implementationNotes', async () => {
      const added = await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      await service.updatePhase({
        planId,
        phaseId: added.phaseId,
        updates: {
          implementationNotes: '## Updated Notes\n- Step 1\n- Step 2',
        },
      });

      // Verify via getPhase
      const { phase } = await service.getPhase({
        planId,
        phaseId: added.phaseId,
        fields: ['*'],
      });
      expect(phase.implementationNotes).toBe('## Updated Notes\n- Step 1\n- Step 2');
    });

    it('should update phase with codeExamples', async () => {
      const added = await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      await service.updatePhase({
        planId,
        phaseId: added.phaseId,
        updates: {
          codeExamples: [{ language: 'python', code: 'print("hello")' }],
        },
      });

      // Verify via getPhase
      const { phase } = await service.getPhase({
        planId,
        phaseId: added.phaseId,
        fields: ['*'],
      });
      expect(phase.codeExamples).toHaveLength(1);
      expect(phase.codeExamples![0].language).toBe('python');
    });

    it('should validate codeExamples on update', async () => {
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
        service.updatePhase({
          planId,
          phaseId: phase.phaseId,
          updates: {
            codeExamples: [{ language: '', code: 'x' }],
          },
        })
      ).rejects.toThrow(/language/i);
    });

    it('should update phase with codeRefs', async () => {
      const added = await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      await service.updatePhase({
        planId,
        phaseId: added.phaseId,
        updates: {
          codeRefs: ['src/new-file.ts:10', 'tests/new-test.ts:20'],
        },
      });

      // Verify via getPhase
      const { phase } = await service.getPhase({
        planId,
        phaseId: added.phaseId,
        fields: ['*'],
      });
      expect(phase.codeRefs).toHaveLength(2);
      expect(phase.codeRefs![0]).toBe('src/new-file.ts:10');
      expect(phase.codeRefs![1]).toBe('tests/new-test.ts:20');
    });

    it('should validate codeRefs on update', async () => {
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
        service.updatePhase({
          planId,
          phaseId: phase.phaseId,
          updates: {
            codeRefs: ['no-line-number'],
          },
        })
      ).rejects.toThrow(/must be in format/i);
    });
  });

  describe('get_tree summary mode (Phase 1.9)', () => {
    it('should return only summary fields by default', async () => {
      const added = await service.addPhase({
        planId,
        phase: {
          title: 'Test Phase',
          description: 'Full description',
          objectives: ['Build API', 'Write tests'],
          deliverables: ['API code'],
          successCriteria: ['Tests pass'],
          implementationNotes: 'Some implementation notes',
        },
      });

      const result = await service.getPhaseTree({ planId });
      const node = result.tree[0];

      // Summary fields must be present
      expect(node.phase.id).toBe(added.phaseId);
      expect(node.phase.title).toBe('Test Phase');
      expect(node.phase.status).toBe('planned');
      expect(node.phase.progress).toBe(0);
      expect(node.phase.path).toBe('1');
      expect(node.hasChildren).toBe(false);

      // childCount must be added to summary
      expect((node.phase as any).childCount).toBe(0);

      // These fields should NOT be present in summary mode
      expect((node.phase as any).objectives).toBeUndefined();
      expect((node.phase as any).deliverables).toBeUndefined();
      expect((node.phase as any).description).toBeUndefined();
      expect((node.phase as any).successCriteria).toBeUndefined();
      expect((node.phase as any).implementationNotes).toBeUndefined();
      expect((node.phase as any).schedule).toBeUndefined();

      // Metadata IS included in summary mode (use excludeMetadata to remove it)
      expect((node.phase as any).metadata).toBeDefined();
    });

    it('should include objectives when requested via fields', async () => {
      await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: 'Desc',
          objectives: ['Build API', 'Write tests'],
          deliverables: ['Code'],
          successCriteria: ['Pass'],
        },
      });

      const result = await service.getPhaseTree({
        planId,
        fields: ['id', 'title', 'status', 'childCount', 'objectives'],
      });
      const phase = result.tree[0].phase as any;

      // Requested fields should be present
      expect(phase.id).toBeDefined();
      expect(phase.title).toBe('Test');
      expect(phase.status).toBe('planned');
      expect(phase.childCount).toBe(0);
      expect(phase.objectives).toEqual(['Build API', 'Write tests']);

      // NOT requested - should not be present
      expect(phase.deliverables).toBeUndefined();
      expect(phase.description).toBeUndefined();
    });

    it('should include multiple fields when requested', async () => {
      await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: 'Full description',
          objectives: ['obj1', 'obj2'],
          deliverables: ['del1'],
          successCriteria: ['sc1'],
          estimatedEffort: { value: 2, unit: 'hours', confidence: 'high' },
        },
      });

      const result = await service.getPhaseTree({
        planId,
        fields: ['id', 'title', 'objectives', 'deliverables', 'schedule'],
      });
      const phase = result.tree[0].phase as any;

      // Requested fields should be present
      expect(phase.id).toBeDefined();
      expect(phase.title).toBe('Test');
      expect(phase.objectives).toEqual(['obj1', 'obj2']);
      expect(phase.deliverables).toEqual(['del1']);
      expect(phase.schedule).toBeDefined();
      expect(phase.schedule.estimatedEffort.value).toBe(2);

      // NOT requested - should not be present
      expect(phase.successCriteria).toBeUndefined();
      expect(phase.description).toBeUndefined();
    });

    it('should return full phase when fields=["*"]', async () => {
      await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: 'Full description',
          objectives: ['obj1'],
          deliverables: ['del1'],
          successCriteria: ['sc1'],
          implementationNotes: 'Some notes',
          estimatedEffort: { value: 3, unit: 'hours', confidence: 'medium' },
        },
      });

      const result = await service.getPhaseTree({ planId, fields: ['*'] });
      const phase = result.tree[0].phase as any;

      // ALL fields must be present
      expect(phase.id).toBeDefined();
      expect(phase.title).toBe('Test');
      expect(phase.description).toBe('Full description');
      expect(phase.objectives).toEqual(['obj1']);
      expect(phase.deliverables).toEqual(['del1']);
      expect(phase.successCriteria).toEqual(['sc1']);
      expect(phase.implementationNotes).toBe('Some notes');
      expect(phase.metadata).toBeDefined();
      expect(phase.schedule).toBeDefined();
      expect(phase.childCount).toBe(0);
    });

    it('should ignore unknown fields without error', async () => {
      await service.addPhase({
        planId,
        phase: {
          title: 'Test',
          description: 'Desc',
          objectives: ['obj1'],
          deliverables: [],
          successCriteria: [],
        },
      });

      // Should not throw
      const result = await service.getPhaseTree({
        planId,
        fields: ['objectives', 'unknownField123', 'anotherBadField'],
      });
      const phase = result.tree[0].phase as any;

      expect(phase.objectives).toEqual(['obj1']);
      expect(phase.unknownField123).toBeUndefined();
      expect(result.tree).toHaveLength(1);
    });

    it('should respect maxDepth=0 to return only root phases', async () => {
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

      const child = await service.addPhase({
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

      // Add grandchild
      await service.addPhase({
        planId,
        phase: {
          title: 'Grandchild',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          parentId: child.phaseId,
        },
      });

      const result = await service.getPhaseTree({ planId, maxDepth: 0 });

      expect(result.tree).toHaveLength(1);
      expect(result.tree[0].phase.title).toBe('Parent');
      expect(result.tree[0].children).toEqual([]); // children truncated
      expect(result.tree[0].hasChildren).toBe(true); // but flag set
      expect((result.tree[0].phase as any).childCount).toBe(1); // direct children count
    });

    it('should respect maxDepth=1 to include one level of children', async () => {
      const p1 = await service.addPhase({
        planId,
        phase: {
          title: 'P1',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const p11 = await service.addPhase({
        planId,
        phase: {
          title: 'P1.1',
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
          title: 'P1.1.1',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          parentId: p11.phaseId,
        },
      });

      const result = await service.getPhaseTree({ planId, maxDepth: 1 });

      // Root level
      expect(result.tree).toHaveLength(1);
      expect(result.tree[0].phase.title).toBe('P1');
      expect((result.tree[0].phase as any).childCount).toBe(1);

      // First level children included
      expect(result.tree[0].children).toHaveLength(1);
      expect(result.tree[0].children[0].phase.title).toBe('P1.1');
      expect((result.tree[0].children[0].phase as any).childCount).toBe(1);

      // Second level children truncated
      expect(result.tree[0].children[0].children).toEqual([]);
      expect(result.tree[0].children[0].hasChildren).toBe(true);
    });

    it('should calculate childCount correctly for direct children only', async () => {
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

      const c1 = await service.addPhase({
        planId,
        phase: {
          title: 'Child1',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          parentId: parent.phaseId,
        },
      });

      await service.addPhase({
        planId,
        phase: {
          title: 'Child2',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          parentId: parent.phaseId,
        },
      });

      await service.addPhase({
        planId,
        phase: {
          title: 'Child3',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          parentId: parent.phaseId,
        },
      });

      // Add grandchildren - should NOT count in parent's childCount
      await service.addPhase({
        planId,
        phase: {
          title: 'GC1',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          parentId: c1.phaseId,
        },
      });

      await service.addPhase({
        planId,
        phase: {
          title: 'GC2',
          description: '',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          parentId: c1.phaseId,
        },
      });

      const result = await service.getPhaseTree({ planId });

      expect((result.tree[0].phase as any).childCount).toBe(3); // only direct children
      expect(result.tree[0].hasChildren).toBe(true);

      expect((result.tree[0].children[0].phase as any).childCount).toBe(2); // Child1 has 2 grandchildren
      expect((result.tree[0].children[1].phase as any).childCount).toBe(0); // Child2 has no children
    });

    it('should combine maxDepth and fields parameters', async () => {
      const parent = await service.addPhase({
        planId,
        phase: {
          title: 'Parent',
          description: 'Parent desc',
          objectives: ['Build parent'],
          deliverables: ['Parent code'],
          successCriteria: ['Parent works'],
        },
      });

      await service.addPhase({
        planId,
        phase: {
          title: 'Child',
          description: 'Child desc',
          objectives: ['Test child'],
          deliverables: ['Child tests'],
          successCriteria: ['Tests pass'],
          parentId: parent.phaseId,
        },
      });

      const result = await service.getPhaseTree({
        planId,
        maxDepth: 0,
        fields: ['id', 'title', 'childCount', 'objectives', 'deliverables'],
      });

      expect(result.tree).toHaveLength(1);

      const phase = result.tree[0].phase as any;

      // Requested fields should be present
      expect(phase.id).toBeDefined();
      expect(phase.title).toBe('Parent');
      expect(phase.childCount).toBe(1);
      expect(phase.objectives).toEqual(['Build parent']);
      expect(phase.deliverables).toEqual(['Parent code']);

      // NOT requested - should not be present
      expect(phase.description).toBeUndefined();
      expect(phase.successCriteria).toBeUndefined();

      // maxDepth worked
      expect(result.tree[0].children).toEqual([]);
      expect(result.tree[0].hasChildren).toBe(true);
    });

    it('should return significantly smaller response in summary mode', async () => {
      // Create 5 phases with full data
      for (let i = 1; i <= 5; i++) {
        await service.addPhase({
          planId,
          phase: {
            title: `Phase ${i}`,
            description:
              'A very long description with lots of details that would make the response large.',
            objectives: ['Objective 1', 'Objective 2', 'Objective 3'],
            deliverables: ['Deliverable 1', 'Deliverable 2'],
            successCriteria: ['Criteria 1', 'Criteria 2'],
            implementationNotes: 'Detailed implementation notes here.',
            estimatedEffort: { value: 8, unit: 'hours', confidence: 'medium' },
          },
        });
      }

      const summaryResult = await service.getPhaseTree({ planId });
      const fullResult = await service.getPhaseTree({ planId, fields: ['*'] });

      const summarySize = JSON.stringify(summaryResult).length;
      const fullSize = JSON.stringify(fullResult).length;

      // Summary should be smaller than full (includes metadata by default, still excludes heavy fields)
      expect(summarySize).toBeLessThan(fullSize);

      console.log(`Summary size: ${summarySize} bytes`);
      console.log(`Full size: ${fullSize} bytes`);
      console.log(`Compression ratio: ${(fullSize / summarySize).toFixed(1)}x`);
    });
  });

  describe('order/path calculation (Sprint 5 - Bug Fix)', () => {
    describe('auto-generated order', () => {
      it('should set order=1 for first root phase', async () => {
        const result = await service.addPhase({
          planId,
          phase: {
            title: 'First',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
          },
        });
        const { phase } = await service.getPhase({ planId, phaseId: result.phaseId });
        expect(phase.order).toBe(1);
        expect(phase.path).toBe('1');
      });

      it('should set order=2 for second root phase', async () => {
        await service.addPhase({
          planId,
          phase: {
            title: 'First',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
          },
        });
        const result = await service.addPhase({
          planId,
          phase: {
            title: 'Second',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
          },
        });
        const { phase } = await service.getPhase({ planId, phaseId: result.phaseId });
        expect(phase.order).toBe(2);
        expect(phase.path).toBe('2');
      });

      it('should calculate order based on max sibling order, not count', async () => {
        // Create phases with orders 2, 3, 4 (skipping 1)
        await service.addPhase({
          planId,
          phase: { title: 'P2', description: '', objectives: [], deliverables: [], successCriteria: [], order: 2 },
        });
        await service.addPhase({
          planId,
          phase: { title: 'P3', description: '', objectives: [], deliverables: [], successCriteria: [], order: 3 },
        });
        await service.addPhase({
          planId,
          phase: { title: 'P4', description: '', objectives: [], deliverables: [], successCriteria: [], order: 4 },
        });

        // Add new phase without explicit order
        const result = await service.addPhase({
          planId,
          phase: { title: 'New', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });

        // Should be 5, not 4 (siblings.length + 1)
        const { phase } = await service.getPhase({ planId, phaseId: result.phaseId });
        expect(phase.order).toBe(5);
        expect(phase.path).toBe('5');
      });

      it('should handle gaps in order sequence', async () => {
        // Create phases with orders 1, 5, 10
        await service.addPhase({
          planId,
          phase: { title: 'P1', description: '', objectives: [], deliverables: [], successCriteria: [], order: 1 },
        });
        await service.addPhase({
          planId,
          phase: { title: 'P5', description: '', objectives: [], deliverables: [], successCriteria: [], order: 5 },
        });
        await service.addPhase({
          planId,
          phase: { title: 'P10', description: '', objectives: [], deliverables: [], successCriteria: [], order: 10 },
        });

        // Add new phase
        const result = await service.addPhase({
          planId,
          phase: { title: 'New', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });

        // Should be 11, not 4
        const { phase } = await service.getPhase({ planId, phaseId: result.phaseId });
        expect(phase.order).toBe(11);
        expect(phase.path).toBe('11');
      });

      it('should set order=1 for first child phase', async () => {
        const parent = await service.addPhase({
          planId,
          phase: { title: 'Parent', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        const child = await service.addPhase({
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

        const { phase } = await service.getPhase({ planId, phaseId: child.phaseId });
        expect(phase.order).toBe(1);
        expect(phase.path).toBe('1.1');
      });

      it('should calculate child order based on max sibling order', async () => {
        const parent = await service.addPhase({
          planId,
          phase: { title: 'Parent', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });

        // Create children with orders 2, 5, 8
        await service.addPhase({
          planId,
          phase: {
            title: 'C2',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
            parentId: parent.phaseId,
            order: 2,
          },
        });
        await service.addPhase({
          planId,
          phase: {
            title: 'C5',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
            parentId: parent.phaseId,
            order: 5,
          },
        });
        await service.addPhase({
          planId,
          phase: {
            title: 'C8',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
            parentId: parent.phaseId,
            order: 8,
          },
        });

        // Add new child without order
        const result = await service.addPhase({
          planId,
          phase: {
            title: 'New Child',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
            parentId: parent.phaseId,
          },
        });

        // Should be 9, not 4
        const { phase } = await service.getPhase({ planId, phaseId: result.phaseId });
        expect(phase.order).toBe(9);
        expect(phase.path).toBe('1.9');
      });
    });

    describe('explicit order', () => {
      it('should use explicit order when provided', async () => {
        await service.addPhase({
          planId,
          phase: { title: 'First', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        const result = await service.addPhase({
          planId,
          phase: { title: 'Explicit', description: '', objectives: [], deliverables: [], successCriteria: [], order: 99 },
        });

        const { phase } = await service.getPhase({ planId, phaseId: result.phaseId });
        expect(phase.order).toBe(99);
        expect(phase.path).toBe('99');
      });

      it('should throw error when explicit order conflicts with existing', async () => {
        await service.addPhase({
          planId,
          phase: { title: 'First', description: '', objectives: [], deliverables: [], successCriteria: [], order: 5 },
        });

        await expect(
          service.addPhase({
            planId,
            phase: { title: 'Conflict', description: '', objectives: [], deliverables: [], successCriteria: [], order: 5 },
          })
        ).rejects.toThrow(/order.*already exists|duplicate.*order/i);
      });

      it('should allow same order for different parents', async () => {
        const parent1 = await service.addPhase({
          planId,
          phase: { title: 'P1', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        const parent2 = await service.addPhase({
          planId,
          phase: { title: 'P2', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });

        const child1 = await service.addPhase({
          planId,
          phase: {
            title: 'C1',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
            parentId: parent1.phaseId,
            order: 1,
          },
        });
        const child2 = await service.addPhase({
          planId,
          phase: {
            title: 'C2',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
            parentId: parent2.phaseId,
            order: 1,
          },
        });

        const { phase: c1Phase } = await service.getPhase({ planId, phaseId: child1.phaseId });
        const { phase: c2Phase } = await service.getPhase({ planId, phaseId: child2.phaseId });
        expect(c1Phase.order).toBe(1);
        expect(c2Phase.order).toBe(1);
        expect(c1Phase.path).toBe('1.1');
        expect(c2Phase.path).toBe('2.1');
      });
    });

    describe('path uniqueness', () => {
      it('should generate unique paths for all siblings', async () => {
        const phaseIds = [];
        for (let i = 0; i < 15; i++) {
          const result = await service.addPhase({
            planId,
            phase: { title: `Phase ${i}`, description: '', objectives: [], deliverables: [], successCriteria: [] },
          });
          phaseIds.push(result.phaseId);
        }

        const paths = [];
        for (const phaseId of phaseIds) {
          const { phase } = await service.getPhase({ planId, phaseId });
          paths.push(phase.path);
        }
        const uniquePaths = new Set(paths);

        expect(uniquePaths.size).toBe(15);
      });

      it('should maintain path consistency after delete and add', async () => {
        await service.addPhase({
          planId,
          phase: { title: 'P1', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        const p2 = await service.addPhase({
          planId,
          phase: { title: 'P2', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        await service.addPhase({
          planId,
          phase: { title: 'P3', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });

        // Delete middle phase
        await service.deletePhase({ planId, phaseId: p2.phaseId });

        // Add new phase
        const p4 = await service.addPhase({
          planId,
          phase: { title: 'P4', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });

        // Should get order 4, not 3 (even though only 2 siblings now)
        const { phase } = await service.getPhase({ planId, phaseId: p4.phaseId });
        expect(phase.order).toBe(4);
        expect(phase.path).toBe('4');
      });
    });
  });

  describe('minimal return values (Sprint 6)', () => {
    describe('addPhase should return only phaseId', () => {
      it('should not include full phase object in result', async () => {
        const result = await service.addPhase({
          planId,
          phase: {
            title: 'Test Phase',
            description: 'Test',
            objectives: [],
            deliverables: [],
            successCriteria: [],
          },
        });

        expect(result.phaseId).toBeDefined();
        expect(result).not.toHaveProperty('phase');
      });
    });

    describe('updatePhase should return only success and phaseId', () => {
      it('should not include full phase object in result', async () => {
        const added = await service.addPhase({
          planId,
          phase: {
            title: 'Test',
            description: 'Test',
            objectives: [],
            deliverables: [],
            successCriteria: [],
          },
        });

        const result = await service.updatePhase({
          planId,
          phaseId: added.phaseId,
          updates: { title: 'Updated' },
        });

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('phase');
      });
    });

    describe('updatePhaseStatus should return only success and phaseId', () => {
      it('should not include full phase object in result', async () => {
        const added = await service.addPhase({
          planId,
          phase: {
            title: 'Test',
            description: 'Test',
            objectives: [],
            deliverables: [],
            successCriteria: [],
          },
        });

        const result = await service.updatePhaseStatus({
          planId,
          phaseId: added.phaseId,
          status: 'in_progress',
        });

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('phase');
      });
    });

    describe('movePhase should return only success and IDs', () => {
      it('should not include full phase objects in result', async () => {
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
            title: 'Phase 2',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
          },
        });

        const result = await service.movePhase({
          planId,
          phaseId: p1.phaseId,
          newOrder: 2,
        });

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('phase');
        expect(result).not.toHaveProperty('affectedPhases');
      });
    });
  });

  // ============================================================
  // CYCLE 1-9: complete_and_advance (Task 1.6)
  // ============================================================
  describe('completeAndAdvance', () => {
    // CYCLE 2: Basic Complete Functionality
    describe('Basic Completion', () => {
      it('should mark current phase as completed with progress 100', async () => {
        const p1 = await service.addPhase({
          planId,
          phase: {
            title: 'Task 1',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
          },
        });

        await service.updatePhaseStatus({ planId, phaseId: p1.phaseId, status: 'in_progress' });

        const result = await service.completeAndAdvance({ planId, phaseId: p1.phaseId });

        // Minimal return: only IDs
        expect(result.success).toBe(true);
        expect(result.completedPhaseId).toBe(p1.phaseId);
        expect(result.nextPhaseId).toBeNull(); // no siblings

        // Verify via get
        const completed = await service.getPhase({ planId, phaseId: p1.phaseId });
        expect(completed.phase.status).toBe('completed');
        expect(completed.phase.progress).toBe(100);
        expect(completed.phase.completedAt).toBeDefined();
      });

      it('should set completedAt timestamp on completed phase', async () => {
        const p1 = await service.addPhase({
          planId,
          phase: { title: 'Task', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        await service.updatePhaseStatus({ planId, phaseId: p1.phaseId, status: 'in_progress' });

        const before = new Date();
        await service.completeAndAdvance({ planId, phaseId: p1.phaseId });
        const after = new Date();

        const completed = await service.getPhase({ planId, phaseId: p1.phaseId });
        const timestamp = new Date(completed.phase.completedAt!);
        expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      });

      it('should save actualEffort in completed phase schedule', async () => {
        const p1 = await service.addPhase({
          planId,
          phase: { title: 'Task', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        await service.updatePhaseStatus({ planId, phaseId: p1.phaseId, status: 'in_progress' });

        await service.completeAndAdvance({
          planId,
          phaseId: p1.phaseId,
          actualEffort: 3.5,
        });

        const completed = await service.getPhase({
          planId,
          phaseId: p1.phaseId,
          fields: ['*'],
        });
        expect(completed.phase.schedule.actualEffort).toBe(3.5);
      });

      it('should add annotation with notes to completed phase', async () => {
        const p1 = await service.addPhase({
          planId,
          phase: { title: 'Task', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        await service.updatePhaseStatus({ planId, phaseId: p1.phaseId, status: 'in_progress' });

        await service.completeAndAdvance({
          planId,
          phaseId: p1.phaseId,
          notes: 'All tests passed',
        });

        const completed = await service.getPhase({
          planId,
          phaseId: p1.phaseId,
          fields: ['*'],
        });
        expect(completed.phase.metadata.annotations).toContainEqual(
          expect.objectContaining({
            text: 'All tests passed',
            author: 'claude-code',
          })
        );
      });

      it('should increment version of completed phase', async () => {
        const p1 = await service.addPhase({
          planId,
          phase: { title: 'Task', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        await service.updatePhaseStatus({ planId, phaseId: p1.phaseId, status: 'in_progress' });

        const beforeVersion = (
          await service.getPhase({ planId, phaseId: p1.phaseId, fields: ['*'] })
        ).phase.version;
        await service.completeAndAdvance({ planId, phaseId: p1.phaseId });

        const completed = await service.getPhase({
          planId,
          phaseId: p1.phaseId,
          fields: ['*'],
        });
        expect(completed.phase.version).toBe(beforeVersion + 1);
      });
    });

    // CYCLE 3: Status Validation
    describe('Status Validation', () => {
      it('should throw error when phase already completed', async () => {
        const p1 = await service.addPhase({
          planId,
          phase: { title: 'Done', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        await service.updatePhaseStatus({ planId, phaseId: p1.phaseId, status: 'completed' });

        await expect(service.completeAndAdvance({ planId, phaseId: p1.phaseId })).rejects.toThrow(
          /already completed/i
        );
      });

      it('should throw error when trying to complete skipped phase', async () => {
        const p1 = await service.addPhase({
          planId,
          phase: { title: 'Skipped', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        await service.updatePhaseStatus({ planId, phaseId: p1.phaseId, status: 'skipped', notes: 'Not needed' });

        await expect(service.completeAndAdvance({ planId, phaseId: p1.phaseId })).rejects.toThrow(
          /cannot complete skipped/i
        );
      });

      it('should allow completing phase that is in_progress', async () => {
        const p1 = await service.addPhase({
          planId,
          phase: { title: 'Active', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        await service.updatePhaseStatus({ planId, phaseId: p1.phaseId, status: 'in_progress' });

        const result = await service.completeAndAdvance({ planId, phaseId: p1.phaseId });

        expect(result.success).toBe(true);
        const completed = await service.getPhase({ planId, phaseId: p1.phaseId });
        expect(completed.phase.status).toBe('completed');
      });

      it('should allow completing phase that is still planned', async () => {
        const p1 = await service.addPhase({
          planId,
          phase: { title: 'Planned', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        // status is 'planned' by default

        const result = await service.completeAndAdvance({ planId, phaseId: p1.phaseId });

        expect(result.success).toBe(true);
        const completed = await service.getPhase({ planId, phaseId: p1.phaseId });
        expect(completed.phase.status).toBe('completed');
      });

      it('should throw error when trying to complete blocked phase', async () => {
        const p1 = await service.addPhase({
          planId,
          phase: { title: 'Blocked', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        await service.updatePhaseStatus({ planId, phaseId: p1.phaseId, status: 'blocked', notes: 'Dependency issue' });

        await expect(service.completeAndAdvance({ planId, phaseId: p1.phaseId })).rejects.toThrow(
          /cannot complete blocked/i
        );
      });
    });

    // CYCLE 4-6: Find Next Phase Logic
    describe('Find Next Phase', () => {
      it('should find and start next planned sibling phase', async () => {
        const p1 = await service.addPhase({
          planId,
          phase: { title: 'Phase 1', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        const p2 = await service.addPhase({
          planId,
          phase: { title: 'Phase 2', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });

        await service.updatePhaseStatus({ planId, phaseId: p1.phaseId, status: 'in_progress' });

        const result = await service.completeAndAdvance({ planId, phaseId: p1.phaseId });

        expect(result.nextPhaseId).toBe(p2.phaseId);

        // Verify next phase was started
        const nextPhase = await service.getPhase({ planId, phaseId: p2.phaseId });
        expect(nextPhase.phase.status).toBe('in_progress');
        expect(nextPhase.phase.startedAt).toBeDefined();
      });

      it('should advance to first planned child when current phase has children', async () => {
        const parent = await service.addPhase({
          planId,
          phase: { title: 'Parent', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        const child1 = await service.addPhase({
          planId,
          phase: {
            title: 'Child 1',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
            parentId: parent.phaseId,
          },
        });
        await service.addPhase({
          planId,
          phase: {
            title: 'Child 2',
            description: '',
            objectives: [],
            deliverables: [],
            successCriteria: [],
            parentId: parent.phaseId,
          },
        });

        await service.updatePhaseStatus({ planId, phaseId: parent.phaseId, status: 'in_progress' });

        const result = await service.completeAndAdvance({ planId, phaseId: parent.phaseId });

        expect(result.nextPhaseId).toBe(child1.phaseId);

        const nextPhase = await service.getPhase({ planId, phaseId: child1.phaseId });
        expect(nextPhase.phase.status).toBe('in_progress');
      });

      it('should skip blocked phases and find next planned', async () => {
        const p1 = await service.addPhase({
          planId,
          phase: { title: 'P1', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        const p2 = await service.addPhase({
          planId,
          phase: { title: 'P2', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });
        const p3 = await service.addPhase({
          planId,
          phase: { title: 'P3', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });

        await service.updatePhaseStatus({ planId, phaseId: p2.phaseId, status: 'blocked', notes: 'Issue' });
        await service.updatePhaseStatus({ planId, phaseId: p1.phaseId, status: 'in_progress' });

        const result = await service.completeAndAdvance({ planId, phaseId: p1.phaseId });

        expect(result.nextPhaseId).toBe(p3.phaseId);
      });

      it('should return null when no more planned phases', async () => {
        const p1 = await service.addPhase({
          planId,
          phase: { title: 'Only Phase', description: '', objectives: [], deliverables: [], successCriteria: [] },
        });

        await service.updatePhaseStatus({ planId, phaseId: p1.phaseId, status: 'in_progress' });

        const result = await service.completeAndAdvance({ planId, phaseId: p1.phaseId });

        expect(result.nextPhaseId).toBeNull();
      });
    });
  });

  describe('fields parameter support', () => {
    let phaseId: string;

    beforeEach(async () => {
      const result = await service.addPhase({
        planId,
        phase: {
          title: 'Complete Phase',
          description: 'Full description',
          objectives: ['Obj 1', 'Obj 2'],
          deliverables: ['Del 1', 'Del 2'],
          successCriteria: ['SC 1', 'SC 2'],
          implementationNotes: 'Important notes',
          codeExamples: [
            { language: 'typescript', code: 'const x = 1;', description: 'Example' },
          ],
          codeRefs: ['src/test.ts:42'],
          priority: 'high',
        },
      });
      phaseId = result.phaseId;
    });

    describe('getPhase with fields', () => {
      it('should return only minimal fields when fields=["id","title"]', async () => {
        const result = await service.getPhase({
          planId,
          phaseId,
          fields: ['id', 'title'],
        });

        const phase = result.phase as unknown as Record<string, unknown>;
        expect(phase.id).toBe(phaseId);
        expect(phase.title).toBe('Complete Phase');
        expect(phase.description).toBeUndefined();
        expect(phase.objectives).toBeUndefined();
      });

      it('should return summary fields by default WITHOUT heavy fields (Lazy-Load)', async () => {
        const result = await service.getPhase({
          planId,
          phaseId,
        });

        const phase = result.phase;
        // GET operations return summary by default (without heavy codeExamples, objectives, etc)
        expect(phase.id).toBeDefined();
        expect(phase.title).toBeDefined();
        expect(phase.status).toBeDefined();
        expect(phase.progress).toBeDefined();
        expect(phase.path).toBeDefined();

        // Lazy-Load: heavy fields NOT included (use fields=['*'] to get them)
        expect(phase.objectives).toBeUndefined();
        expect(phase.codeExamples).toBeUndefined();
        expect(phase.implementationNotes).toBeUndefined();
      });

      it('should return all fields when fields=["*"]', async () => {
        const result = await service.getPhase({
          planId,
          phaseId,
          fields: ['*'],
        });

        const phase = result.phase;
        expect(phase.title).toBe('Complete Phase');
        expect(phase.objectives).toEqual(['Obj 1', 'Obj 2']);
        expect(phase.codeExamples).toBeDefined();
        expect(phase.implementationNotes).toBe('Important notes');
      });
    });
  });

  describe('excludeMetadata and excludeComputed parameters (Sprint 2)', () => {
    let phaseId: string;

    beforeEach(async () => {
      const result = await service.addPhase({
        planId,
        phase: {
          title: 'Test Phase with Metadata',
          description: 'Testing metadata and computed exclusion',
          objectives: ['Test objective'],
          deliverables: ['Test deliverable'],
          successCriteria: ['Test criterion'],
        },
      });
      phaseId = result.phaseId;
    });

    describe('getPhase with excludeMetadata', () => {
      it('should exclude metadata fields when excludeMetadata=true', async () => {
        const result = await service.getPhase({
          planId,
          phaseId,
          fields: ['*'],
          excludeMetadata: true,
        });

        const phase = result.phase as unknown as Record<string, unknown>;

        // Business fields should be present
        expect(phase.id).toBeDefined();
        expect(phase.title).toBe('Test Phase with Metadata');
        expect(phase.description).toBe('Testing metadata and computed exclusion');

        // Metadata fields should NOT be present
        expect(phase.createdAt).toBeUndefined();
        expect(phase.updatedAt).toBeUndefined();
        expect(phase.version).toBeUndefined();
        expect(phase.metadata).toBeUndefined();
      });

      it('should include metadata fields by default', async () => {
        const result = await service.getPhase({
          planId,
          phaseId,
          fields: ['*'],
        });

        const phase = result.phase;

        // Metadata fields should be present by default
        expect(phase.createdAt).toBeDefined();
        expect(phase.updatedAt).toBeDefined();
        expect(phase.version).toBeDefined();
        expect(phase.metadata).toBeDefined();
      });
    });

    describe('getPhase with excludeComputed', () => {
      it('should exclude computed fields when excludeComputed=true', async () => {
        const result = await service.getPhase({
          planId,
          phaseId,
          excludeComputed: true,
        });

        const phase = result.phase as unknown as Record<string, unknown>;

        // Business fields should be present
        expect(phase.id).toBeDefined();
        expect(phase.title).toBe('Test Phase with Metadata');
        expect(phase.status).toBeDefined();

        // Computed fields should NOT be present
        expect(phase.depth).toBeUndefined();
        expect(phase.path).toBeUndefined();
        // Note: childCount is not available in getPhase, only in get_tree
      });

      it('should include computed fields by default', async () => {
        const result = await service.getPhase({
          planId,
          phaseId,
        });

        const phase = result.phase;

        // Computed fields should be present by default
        expect(phase.depth).toBeDefined();
        expect(phase.path).toBeDefined();
      });
    });

    describe('getPhase with both excludeMetadata and excludeComputed', () => {
      it('should exclude both metadata and computed fields', async () => {
        const result = await service.getPhase({
          planId,
          phaseId,
          fields: ['*'],
          excludeMetadata: true,
          excludeComputed: true,
        });

        const phase = result.phase as unknown as Record<string, unknown>;

        // Business fields present
        expect(phase.id).toBeDefined();
        expect(phase.title).toBeDefined();
        expect(phase.objectives).toBeDefined();

        // Metadata fields excluded
        expect(phase.createdAt).toBeUndefined();
        expect(phase.version).toBeUndefined();

        // Computed fields excluded
        expect(phase.depth).toBeUndefined();
        expect(phase.path).toBeUndefined();
      });

      it('should work together with fields parameter', async () => {
        const result = await service.getPhase({
          planId,
          phaseId,
          fields: ['id', 'title', 'description', 'path', 'version'],
          excludeMetadata: true,
          excludeComputed: true,
        });

        const phase = result.phase as unknown as Record<string, unknown>;

        // Requested non-metadata/non-computed fields should be present
        expect(phase.id).toBeDefined();
        expect(phase.title).toBeDefined();
        expect(phase.description).toBeDefined();

        // Metadata and computed fields excluded even if requested
        expect(phase.version).toBeUndefined();
        expect(phase.path).toBeUndefined();
      });
    });

    describe('getPhaseTree with excludeComputed', () => {
      beforeEach(async () => {
        // Add child phase
        await service.addPhase({
          planId,
          phase: {
            title: 'Child Phase',
            description: 'Child',
            parentId: phaseId,
            objectives: ['Child objective'],
            deliverables: ['Child deliverable'],
            successCriteria: ['Child criterion'],
          },
        });
      });

      it('should exclude computed fields from tree when excludeComputed=true', async () => {
        const result = await service.getPhaseTree({
          planId,
          excludeComputed: true,
        });

        expect(result.tree.length).toBeGreaterThan(0);
        const phaseNode = result.tree[0].phase as unknown as Record<string, unknown>;

        // Business fields present
        expect(phaseNode.id).toBeDefined();
        expect(phaseNode.title).toBeDefined();

        // Computed fields excluded
        expect(phaseNode.depth).toBeUndefined();
        expect(phaseNode.path).toBeUndefined();
        expect(phaseNode.childCount).toBeUndefined();
      });

      it('should include computed fields in tree by default', async () => {
        const result = await service.getPhaseTree({
          planId,
        });

        const phaseNode = result.tree[0].phase;

        // Computed fields should be present
        expect(phaseNode.path).toBeDefined();
        expect((phaseNode as unknown as Record<string, unknown>).childCount).toBeDefined();
      });
    });
  });
});
