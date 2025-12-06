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

      // Verify via getRequirement
      const { requirement } = await service.getRequirement({ planId, requirementId: result.requirementId });
      expect(requirement.title).toBe('User Login');
      expect(requirement.status).toBe('draft');
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

      // Verify via getRequirement
      const { requirement } = await service.getRequirement({ planId, requirementId: result.requirementId, fields: ['*'] });
      expect(requirement.rationale).toBe('User experience');
      expect(requirement.impact?.riskLevel).toBe('low');
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

      // Verify via getRequirement
      const { requirement } = await service.getRequirement({ planId, requirementId: added.requirementId });
      expect(requirement.title).toBe('Updated');
      expect(requirement.priority).toBe('high');
      expect(requirement.status).toBe('approved');
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
        fields: ['*'],
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

  describe('minimal return values (Sprint 6)', () => {
    describe('addRequirement should return only requirementId', () => {
      it('should not include full requirement object in result', async () => {
        const result = await service.addRequirement({
          planId,
          requirement: {
            title: 'Test Req',
            description: 'Test',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'medium',
            category: 'functional',
          },
        });

        expect(result.requirementId).toBeDefined();
        expect(result).not.toHaveProperty('requirement');
      });
    });

    describe('updateRequirement should return only success and requirementId', () => {
      it('should not include full requirement object in result', async () => {
        const added = await service.addRequirement({
          planId,
          requirement: {
            title: 'Test Req',
            description: 'Test',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'medium',
            category: 'functional',
          },
        });

        const result = await service.updateRequirement({
          planId,
          requirementId: added.requirementId,
          updates: { title: 'Updated' },
        });

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('requirement');
      });
    });
  });

  // TDD RED Phase: Voting System Tests (будут failing до реализации)
  describe('vote_for_requirement', () => {
    it('should initialize votes to 0 by default', async () => {
      const added = await service.addRequirement({
        planId,
        requirement: {
          title: 'New Requirement',
          description: 'Test votes initialization',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'medium',
          category: 'functional',
        },
      });

      const { requirement } = await service.getRequirement({
        planId,
        requirementId: added.requirementId,
      });

      expect(requirement.votes).toBe(0);
    });

    it('should increase votes by 1', async () => {
      const added = await service.addRequirement({
        planId,
        requirement: {
          title: 'Votable Req',
          description: 'Can be voted',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'high',
          category: 'functional',
        },
      });

      const result = await service.voteForRequirement({
        planId,
        requirementId: added.requirementId,
      });

      expect(result.success).toBe(true);
      expect(result.votes).toBe(1);

      // Verify via getRequirement
      const { requirement } = await service.getRequirement({
        planId,
        requirementId: added.requirementId,
      });
      expect(requirement.votes).toBe(1);
    });

    it('should support multiple votes', async () => {
      const added = await service.addRequirement({
        planId,
        requirement: {
          title: 'Popular Req',
          description: 'Many votes',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'critical',
          category: 'functional',
        },
      });

      await service.voteForRequirement({ planId, requirementId: added.requirementId });
      await service.voteForRequirement({ planId, requirementId: added.requirementId });
      const result = await service.voteForRequirement({ planId, requirementId: added.requirementId });

      expect(result.votes).toBe(3);
    });

    it('should throw if requirement not found', async () => {
      await expect(
        service.voteForRequirement({ planId, requirementId: 'non-existent' })
      ).rejects.toThrow('Requirement not found');
    });
  });

  describe('unvote_requirement', () => {
    it('should decrease votes by 1', async () => {
      const added = await service.addRequirement({
        planId,
        requirement: {
          title: 'Voted Req',
          description: 'Has votes',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'medium',
          category: 'functional',
        },
      });

      // Vote first
      await service.voteForRequirement({ planId, requirementId: added.requirementId });
      await service.voteForRequirement({ planId, requirementId: added.requirementId });

      // Then unvote
      const result = await service.unvoteRequirement({
        planId,
        requirementId: added.requirementId,
      });

      expect(result.success).toBe(true);
      expect(result.votes).toBe(1);

      // Verify via getRequirement
      const { requirement } = await service.getRequirement({
        planId,
        requirementId: added.requirementId,
      });
      expect(requirement.votes).toBe(1);
    });

    it('should not allow negative votes', async () => {
      const added = await service.addRequirement({
        planId,
        requirement: {
          title: 'Zero Votes',
          description: 'Has no votes',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'low',
          category: 'functional',
        },
      });

      await expect(
        service.unvoteRequirement({ planId, requirementId: added.requirementId })
      ).rejects.toThrow('Cannot unvote: votes cannot be negative');
    });

    it('should throw if requirement not found', async () => {
      await expect(
        service.unvoteRequirement({ planId, requirementId: 'non-existent' })
      ).rejects.toThrow('Requirement not found');
    });
  });

  describe('fields parameter support', () => {
    let requirementId: string;

    beforeEach(async () => {
      const result = await service.addRequirement({
        planId,
        requirement: {
          title: 'Complete Requirement',
          description: 'Full description with all fields',
          rationale: 'Important business need',
          source: { type: 'user-request', context: 'User feedback' },
          acceptanceCriteria: ['Criterion 1', 'Criterion 2', 'Criterion 3'],
          priority: 'high',
          category: 'functional',
          impact: {
            scope: ['auth', 'api'],
            complexityEstimate: 7,
            riskLevel: 'medium',
          },
        },
      });
      requirementId = result.requirementId;
    });

    describe('getRequirement with fields', () => {
      it('should return only minimal fields when fields=["id","title"]', async () => {
        const result = await service.getRequirement({
          planId,
          requirementId,
          fields: ['id', 'title'],
        });

        const req = result.requirement as unknown as Record<string, unknown>;
        expect(req.id).toBe(requirementId);
        expect(req.title).toBe('Complete Requirement');

        // Should NOT include other fields
        expect(req.description).toBeUndefined();
        expect(req.rationale).toBeUndefined();
        expect(req.acceptanceCriteria).toBeUndefined();
      });

      it('should return ALL fields by default (no fields parameter)', async () => {
        const result = await service.getRequirement({
          planId,
          requirementId,
        });

        const req = result.requirement;
        // GET operations should return all fields by default
        expect(req.id).toBeDefined();
        expect(req.title).toBeDefined();
        expect(req.description).toBeDefined();
        expect(req.priority).toBeDefined();
        expect(req.category).toBeDefined();
        expect(req.status).toBeDefined();
        expect(req.votes).toBeDefined();

        // All fields should be included in GET by default
        expect(req.rationale).toBeDefined();
        expect(req.acceptanceCriteria).toBeDefined();
        expect(req.impact).toBeDefined();
      });

      it('should return all fields when fields=["*"]', async () => {
        const result = await service.getRequirement({
          planId,
          requirementId,
          fields: ['*'],
        });

        const req = result.requirement;
        expect(req.id).toBeDefined();
        expect(req.title).toBe('Complete Requirement');
        expect(req.description).toBe('Full description with all fields');
        expect(req.rationale).toBe('Important business need');
        expect(req.acceptanceCriteria).toEqual(['Criterion 1', 'Criterion 2', 'Criterion 3']);
        expect(req.impact).toEqual({
          scope: ['auth', 'api'],
          complexityEstimate: 7,
          riskLevel: 'medium',
        });
      });

      it('should return ONLY requested fields (no summary addition)', async () => {
        const result = await service.getRequirement({
          planId,
          requirementId,
          fields: ['id', 'title', 'rationale', 'impact'],
        });

        const req = result.requirement as unknown as Record<string, unknown>;
        // ONLY requested fields
        expect(req.id).toBe(requirementId);
        expect(req.title).toBe('Complete Requirement');
        expect(req.rationale).toBe('Important business need');
        expect(req.impact).toBeDefined();

        // Should NOT include non-requested fields (even summary ones)
        expect(req.description).toBeUndefined();
        expect(req.acceptanceCriteria).toBeUndefined();
      });
    });

    describe('listRequirements with fields', () => {
      beforeEach(async () => {
        // Add more requirements
        await service.addRequirement({
          planId,
          requirement: {
            title: 'Req 2',
            description: 'Second requirement',
            source: { type: 'discovered' },
            acceptanceCriteria: ['AC1'],
            priority: 'medium',
            category: 'technical',
          },
        });
      });

      it('should return only minimal fields for all items when fields=["id","title"]', async () => {
        const result = await service.listRequirements({
          planId,
          fields: ['id', 'title'],
        });

        expect(result.requirements.length).toBeGreaterThan(0);
        const req = result.requirements[0] as unknown as Record<string, unknown>;
        expect(req.id).toBeDefined();
        expect(req.title).toBeDefined();
        expect(req.description).toBeUndefined();
      });

      it('should return summary fields by default for list', async () => {
        const result = await service.listRequirements({
          planId,
        });

        expect(result.requirements.length).toBeGreaterThan(0);
        const req = result.requirements[0];

        // Summary fields present
        expect(req.id).toBeDefined();
        expect(req.title).toBeDefined();
        expect(req.description).toBeDefined();
        expect(req.priority).toBeDefined();

        // Heavy fields NOT present
        expect(req.acceptanceCriteria).toBeUndefined();
        expect(req.impact).toBeUndefined();
      });

      it('should return all fields when fields=["*"]', async () => {
        const result = await service.listRequirements({
          planId,
          fields: ['*'],
        });

        const fullReq = result.requirements.find((r) => r.title === 'Complete Requirement');
        expect(fullReq).toBeDefined();
        expect(fullReq!.acceptanceCriteria).toBeDefined();
        expect(fullReq!.impact).toBeDefined();
      });

      it('should combine fields with filters', async () => {
        const result = await service.listRequirements({
          planId,
          filters: { priority: 'high' },
          fields: ['id', 'title', 'priority'],
        });

        expect(result.requirements.length).toBe(1);
        const req = result.requirements[0] as unknown as Record<string, unknown>;
        expect(req.title).toBe('Complete Requirement');
        expect(req.priority).toBe('high');
        expect(req.description).toBeUndefined();
      });
    });
  });

  describe('excludeMetadata parameter support (Sprint 2)', () => {
    let requirementId: string;

    beforeEach(async () => {
      const result = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement with Metadata',
          description: 'Testing metadata exclusion',
          source: { type: 'user-request' },
          acceptanceCriteria: ['Test criterion'],
          priority: 'medium',
          category: 'functional',
        },
      });
      requirementId = result.requirementId;
    });

    describe('getRequirement with excludeMetadata', () => {
      it('should exclude metadata fields when excludeMetadata=true', async () => {
        const result = await service.getRequirement({
          planId,
          requirementId,
          excludeMetadata: true,
        });

        const req = result.requirement as unknown as Record<string, unknown>;

        // Business fields should be present
        expect(req.id).toBeDefined();
        expect(req.title).toBe('Test Requirement with Metadata');
        expect(req.description).toBe('Testing metadata exclusion');

        // Metadata fields should NOT be present
        expect(req.createdAt).toBeUndefined();
        expect(req.updatedAt).toBeUndefined();
        expect(req.version).toBeUndefined();
        expect(req.metadata).toBeUndefined();
      });

      it('should include metadata fields by default (excludeMetadata=false)', async () => {
        const result = await service.getRequirement({
          planId,
          requirementId,
          fields: ['*'],
        });

        const req = result.requirement;

        // Metadata fields should be present by default
        expect(req.createdAt).toBeDefined();
        expect(req.updatedAt).toBeDefined();
        expect(req.version).toBeDefined();
        expect(req.metadata).toBeDefined();
      });

      it('should work together with fields parameter', async () => {
        const result = await service.getRequirement({
          planId,
          requirementId,
          fields: ['id', 'title', 'description', 'createdAt', 'version'],
          excludeMetadata: true,
        });

        const req = result.requirement as unknown as Record<string, unknown>;

        // Requested non-metadata fields should be present
        expect(req.id).toBeDefined();
        expect(req.title).toBeDefined();
        expect(req.description).toBeDefined();

        // Metadata fields should be excluded even though requested in fields
        expect(req.createdAt).toBeUndefined();
        expect(req.version).toBeUndefined();
        expect(req.metadata).toBeUndefined();
      });
    });

    describe('listRequirements with excludeMetadata', () => {
      beforeEach(async () => {
        // Add another requirement
        await service.addRequirement({
          planId,
          requirement: {
            title: 'Second Requirement',
            description: 'Another test',
            source: { type: 'discovered' },
            acceptanceCriteria: [],
            priority: 'low',
            category: 'technical',
          },
        });
      });

      it('should exclude metadata from all items when excludeMetadata=true', async () => {
        const result = await service.listRequirements({
          planId,
          excludeMetadata: true,
        });

        expect(result.requirements.length).toBeGreaterThan(0);

        for (const req of result.requirements) {
          const r = req as unknown as Record<string, unknown>;
          expect(r.createdAt).toBeUndefined();
          expect(r.updatedAt).toBeUndefined();
          expect(r.version).toBeUndefined();
          expect(r.metadata).toBeUndefined();

          // Business fields should still be present
          expect(r.id).toBeDefined();
          expect(r.title).toBeDefined();
        }
      });

      it('should combine excludeMetadata with fields and filters', async () => {
        const result = await service.listRequirements({
          planId,
          fields: ['id', 'title', 'priority', 'version'],
          filters: { priority: 'medium' },
          excludeMetadata: true,
        });

        expect(result.requirements.length).toBe(1);
        const req = result.requirements[0] as unknown as Record<string, unknown>;

        // Only requested non-metadata fields
        expect(req.id).toBeDefined();
        expect(req.title).toBe('Test Requirement with Metadata');
        expect(req.priority).toBe('medium');

        // Metadata excluded despite being in fields
        expect(req.version).toBeUndefined();
        expect(req.createdAt).toBeUndefined();
      });
    });
  });
});
