import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { RequirementService } from '../../src/domain/services/requirement-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { FileStorage } from '../../src/infrastructure/file-storage.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('RequirementService', () => {
  let service: RequirementService;
  let planService: PlanService;
  let storage: FileStorage;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-req-test-${Date.now()}`);
    storage = new FileStorage(testDir);
    await storage.initialize();
    planService = new PlanService(storage);
    service = new RequirementService(storage, planService);

    // Create a test plan
    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For testing requirements',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('add_requirement', () => {
    it('should add a new requirement', async () => {
      const result = await service.addRequirement({
        planId,
        requirement: {
          title: 'User Login',
          description: 'Users can login with email/password',
          source: { type: 'user-request' },
          acceptanceCriteria: ['Login works', 'JWT returned'],
          priority: 'critical',
          category: 'functional',
        },
      });

      expect(result.requirementId).toBeDefined();
      expect(result.requirement.title).toBe('User Login');
      expect(result.requirement.status).toBe('draft');
    });

    it('should generate UUID for requirement', async () => {
      const result = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test',
          description: 'Test requirement',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'low',
          category: 'functional',
        },
      });

      expect(result.requirementId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should update plan statistics', async () => {
      await service.addRequirement({
        planId,
        requirement: {
          title: 'Req 1',
          description: 'First',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'high',
          category: 'functional',
        },
      });

      const plan = await planService.getPlan({ planId });
      expect(plan.plan.manifest.statistics.totalRequirements).toBe(1);
    });

    it('should support optional fields', async () => {
      const result = await service.addRequirement({
        planId,
        requirement: {
          title: 'Performance',
          description: 'API < 200ms',
          rationale: 'User experience',
          source: { type: 'derived', parentId: 'req-001' },
          acceptanceCriteria: ['Measured'],
          priority: 'high',
          category: 'non-functional',
          impact: {
            scope: ['api'],
            complexityEstimate: 5,
            riskLevel: 'low',
          },
          tags: [{ key: 'area', value: 'performance' }],
        },
      });

      expect(result.requirement.rationale).toBe('User experience');
      expect(result.requirement.impact?.riskLevel).toBe('low');
    });
  });

  describe('get_requirement', () => {
    it('should get requirement by id', async () => {
      const added = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test',
          description: 'Test',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'medium',
          category: 'functional',
        },
      });

      const result = await service.getRequirement({
        planId,
        requirementId: added.requirementId,
      });

      expect(result.requirement.id).toBe(added.requirementId);
      expect(result.requirement.title).toBe('Test');
    });

    it('should throw if requirement not found', async () => {
      await expect(
        service.getRequirement({ planId, requirementId: 'non-existent' })
      ).rejects.toThrow('Requirement not found');
    });
  });

  describe('update_requirement', () => {
    it('should update requirement fields', async () => {
      const added = await service.addRequirement({
        planId,
        requirement: {
          title: 'Original',
          description: 'Original desc',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'low',
          category: 'functional',
        },
      });

      const result = await service.updateRequirement({
        planId,
        requirementId: added.requirementId,
        updates: {
          title: 'Updated',
          priority: 'high',
          status: 'approved',
        },
      });

      expect(result.requirement.title).toBe('Updated');
      expect(result.requirement.priority).toBe('high');
      expect(result.requirement.status).toBe('approved');
    });

    it('should increment version on update', async () => {
      const added = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test',
          description: 'Test',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'medium',
          category: 'functional',
        },
      });

      await service.updateRequirement({
        planId,
        requirementId: added.requirementId,
        updates: { title: 'Updated' },
      });

      const result = await service.getRequirement({
        planId,
        requirementId: added.requirementId,
      });

      expect(result.requirement.version).toBe(2);
    });
  });

  describe('list_requirements', () => {
    beforeEach(async () => {
      await service.addRequirement({
        planId,
        requirement: {
          title: 'Critical Req',
          description: 'Critical',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'critical',
          category: 'functional',
        },
      });
      await service.addRequirement({
        planId,
        requirement: {
          title: 'High Req',
          description: 'High',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'high',
          category: 'non-functional',
        },
      });
      await service.addRequirement({
        planId,
        requirement: {
          title: 'Low Req',
          description: 'Low',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'low',
          category: 'functional',
        },
      });
    });

    it('should list all requirements', async () => {
      const result = await service.listRequirements({ planId });
      expect(result.requirements).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should filter by priority', async () => {
      const result = await service.listRequirements({
        planId,
        filters: { priority: 'critical' },
      });
      expect(result.requirements).toHaveLength(1);
      expect(result.requirements[0].title).toBe('Critical Req');
    });

    it('should filter by category', async () => {
      const result = await service.listRequirements({
        planId,
        filters: { category: 'functional' },
      });
      expect(result.requirements).toHaveLength(2);
    });

    it('should support pagination', async () => {
      const result = await service.listRequirements({
        planId,
        limit: 2,
        offset: 0,
      });
      expect(result.requirements).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('delete_requirement', () => {
    it('should delete requirement', async () => {
      const added = await service.addRequirement({
        planId,
        requirement: {
          title: 'To Delete',
          description: 'Will be deleted',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'low',
          category: 'functional',
        },
      });

      const result = await service.deleteRequirement({
        planId,
        requirementId: added.requirementId,
      });

      expect(result.success).toBe(true);

      const list = await service.listRequirements({ planId });
      expect(list.requirements).toHaveLength(0);
    });

    it('should update plan statistics after delete', async () => {
      const added = await service.addRequirement({
        planId,
        requirement: {
          title: 'To Delete',
          description: 'Test',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'low',
          category: 'functional',
        },
      });

      await service.deleteRequirement({
        planId,
        requirementId: added.requirementId,
      });

      const plan = await planService.getPlan({ planId });
      expect(plan.plan.manifest.statistics.totalRequirements).toBe(0);
    });

    it('should throw if requirement not found', async () => {
      await expect(
        service.deleteRequirement({ planId, requirementId: 'non-existent' })
      ).rejects.toThrow('Requirement not found');
    });
  });
});
