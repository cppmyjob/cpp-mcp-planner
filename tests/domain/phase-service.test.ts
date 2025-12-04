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

      expect(result.phase.implementationNotes).toBe(
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

      expect(result.phase.codeExamples).toHaveLength(2);
      expect(result.phase.codeExamples![0].language).toBe('typescript');
      expect(result.phase.codeExamples![0].filename).toBe('service.ts');
      expect(result.phase.codeExamples![1].code).toContain('expect(true)');
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

    it('should update phase with implementationNotes', async () => {
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

      const result = await service.updatePhase({
        planId,
        phaseId: phase.phaseId,
        updates: {
          implementationNotes: '## Updated Notes\n- Step 1\n- Step 2',
        },
      });

      expect(result.phase.implementationNotes).toBe('## Updated Notes\n- Step 1\n- Step 2');
    });

    it('should update phase with codeExamples', async () => {
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

      const result = await service.updatePhase({
        planId,
        phaseId: phase.phaseId,
        updates: {
          codeExamples: [{ language: 'python', code: 'print("hello")' }],
        },
      });

      expect(result.phase.codeExamples).toHaveLength(1);
      expect(result.phase.codeExamples![0].language).toBe('python');
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
      expect((node.phase as any).metadata).toBeUndefined();
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

      const result = await service.getPhaseTree({ planId, fields: ['objectives'] });
      const phase = result.tree[0].phase as any;

      // Summary fields always present
      expect(phase.id).toBeDefined();
      expect(phase.title).toBe('Test');
      expect(phase.status).toBe('planned');
      expect(phase.childCount).toBe(0);

      // objectives added via fields
      expect(phase.objectives).toEqual(['Build API', 'Write tests']);

      // deliverables NOT requested - should not be present
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
        fields: ['objectives', 'deliverables', 'schedule'],
      });
      const phase = result.tree[0].phase as any;

      // Summary fields
      expect(phase.id).toBeDefined();
      expect(phase.title).toBe('Test');

      // Requested fields
      expect(phase.objectives).toEqual(['obj1', 'obj2']);
      expect(phase.deliverables).toEqual(['del1']);
      expect(phase.schedule).toBeDefined();
      expect(phase.schedule.estimatedEffort.value).toBe(2);

      // NOT requested
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
        fields: ['objectives', 'deliverables'],
      });

      expect(result.tree).toHaveLength(1);

      const phase = result.tree[0].phase as any;

      // Summary fields
      expect(phase.id).toBeDefined();
      expect(phase.title).toBe('Parent');
      expect(phase.childCount).toBe(1);

      // Requested fields
      expect(phase.objectives).toEqual(['Build parent']);
      expect(phase.deliverables).toEqual(['Parent code']);

      // NOT requested
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

      // Summary should be at least 3x smaller
      expect(summarySize).toBeLessThan(fullSize / 3);

      console.log(`Summary size: ${summarySize} bytes`);
      console.log(`Full size: ${fullSize} bytes`);
      console.log(`Compression ratio: ${(fullSize / summarySize).toFixed(1)}x`);
    });
  });
});
