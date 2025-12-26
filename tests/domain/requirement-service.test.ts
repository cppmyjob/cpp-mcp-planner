import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  RequirementService,
  PlanService,
  SolutionService,
  LinkingService,
  type Requirement,
} from '@mcp-planner/core';
import { FileRepositoryFactory, FileLockManager, type RepositoryFactory } from '@mcp-planner/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('RequirementService', () => {
  let service: RequirementService;
  let planService: PlanService;
  let linkingService: LinkingService;
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-req-test-${Date.now().toString()}`);

    lockManager = new FileLockManager(testDir);
    await lockManager.initialize();

    repositoryFactory = new FileRepositoryFactory({
      type: 'file',
      baseDir: testDir,
      projectId: 'test-project',
      lockManager,
      cacheOptions: { enabled: true, ttl: 5000, maxSize: 1000 }
    });

    const planRepo = repositoryFactory.createPlanRepository();
    await planRepo.initialize();

    planService = new PlanService(repositoryFactory);
    linkingService = new LinkingService(repositoryFactory);
    service = new RequirementService(repositoryFactory, planService, undefined, linkingService);

    // Create a test plan
    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For testing requirements',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await repositoryFactory.close();
    await lockManager.dispose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('add_requirement', () => {
    // RED: Validation tests for REQUIRED fields
    describe('title validation (REQUIRED field)', () => {
      it('RED: should reject missing title (undefined)', async () => {
        await expect(service.addRequirement({
          planId,
          requirement: {
            // @ts-expect-error - Testing invalid input
            title: undefined,
            description: 'Test',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        })).rejects.toThrow('title is required');
      });

      it('RED: should reject empty title', async () => {
        await expect(service.addRequirement({
          planId,
          requirement: {
            title: '',
            description: 'Test',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        })).rejects.toThrow('title must be a non-empty string');
      });

      it('RED: should reject whitespace-only title', async () => {
        await expect(service.addRequirement({
          planId,
          requirement: {
            title: '   ',
            description: 'Test',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        })).rejects.toThrow('title must be a non-empty string');
      });
    });

    describe('source.type validation (REQUIRED field)', () => {
      it('RED: should reject missing source', async () => {
        await expect(service.addRequirement({
          planId,
          requirement: {
            title: 'Test',
            description: 'Test',
            source: undefined,
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        })).rejects.toThrow('source is required');
      });

      it('RED: should reject missing source.type', async () => {
        await expect(service.addRequirement({
          planId,
          requirement: {
            title: 'Test',
            description: 'Test',
            // @ts-expect-error - Testing invalid input
            source: {},
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        })).rejects.toThrow('source.type is required');
      });

      it('RED: should reject invalid source.type', async () => {
        await expect(service.addRequirement({
          planId,
          requirement: {
            title: 'Test',
            description: 'Test',
            // @ts-expect-error - Testing invalid input
            source: { type: 'invalid-type' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        })).rejects.toThrow('source.type must be one of: user-request, discovered, derived');
      });
    });

    // GREEN: Tests for minimal requirement with defaults
    describe('minimal requirement with defaults', () => {
      it('GREEN: should accept minimal requirement (title + source.type only)', async () => {
        const result = await service.addRequirement({
          planId,
          requirement: {
            title: 'User Authentication',
            source: { type: 'user-request' },
          },
        });

        expect(result.requirementId).toBeDefined();

        // Verify defaults were applied
        const { requirement } = await service.getRequirement({ planId, requirementId: result.requirementId });
        expect(requirement.title).toBe('User Authentication');
        expect(requirement.description).toBe('');  // default
        expect(requirement.acceptanceCriteria).toEqual([]);  // default
        expect(requirement.priority).toBe('medium');  // default
        expect(requirement.category).toBe('functional');  // default
        expect(requirement.status).toBe('draft');
      });
    });

    describe('BUGS #2, #3: priority and category enum validation (TDD - RED phase)', () => {
      describe('priority validation', () => {
        it('RED: should reject invalid priority', async () => {
          await expect(service.addRequirement({
            planId,
            requirement: {
              title: 'Test',
              source: { type: 'user-request' },
              // @ts-expect-error - Testing invalid input
              priority: 'super-high',
            },
          })).rejects.toThrow('priority must be one of: critical, high, medium, low');
        });

        it('GREEN: should accept valid priority values', async () => {
          const priorities = ['critical', 'high', 'medium', 'low'] as const;

          for (const priority of priorities) {
            const result = await service.addRequirement({
              planId,
              requirement: {
                title: `Test ${priority}`,
                source: { type: 'user-request' },
                priority,
              },
            });
            expect(result.requirementId).toBeDefined();
          }
        });
      });

      describe('category validation', () => {
        it('RED: should reject invalid category', async () => {
          await expect(service.addRequirement({
            planId,
            requirement: {
              title: 'Test',
              source: { type: 'user-request' },
              // @ts-expect-error - Testing invalid input
              category: 'super-functional',
            },
          })).rejects.toThrow('category must be one of: functional, non-functional, technical, business');
        });

        it('GREEN: should accept valid category values', async () => {
          const categories = ['functional', 'non-functional', 'technical', 'business'] as const;

          for (const category of categories) {
            const result = await service.addRequirement({
              planId,
              requirement: {
                title: `Test ${category}`,
                source: { type: 'user-request' },
                category,
              },
            });
            expect(result.requirementId).toBeDefined();
          }
        });
      });
    });

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
          source: { type: 'discovered', context: 'Performance testing' },
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
      ).rejects.toThrow(/requirement.*not found/i);
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

      await service.updateRequirement({
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
      ).rejects.toThrow(/requirement.*not found/i);
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

    describe('BUG #18: Title validation in updateRequirement (TDD - RED phase)', () => {
      let requirementId: string;

      beforeEach(async () => {
        const result = await service.addRequirement({
          planId,
          requirement: {
            title: 'Original Title',
            source: { type: 'user-request' },
          },
        });
        requirementId = result.requirementId;
      });

      it('RED: should reject empty title', async () => {
        await expect(service.updateRequirement({
          planId,
          requirementId,
          updates: { title: '' },
        })).rejects.toThrow('title must be a non-empty string');
      });

      it('RED: should reject whitespace-only title', async () => {
        await expect(service.updateRequirement({
          planId,
          requirementId,
          updates: { title: '   ' },
        })).rejects.toThrow('title must be a non-empty string');
      });

      it('GREEN: should allow valid title update', async () => {
        const result = await service.updateRequirement({
          planId,
          requirementId,
          updates: { title: 'New Valid Title' },
        });
        expect(result.success).toBe(true);

        const updated = await service.getRequirement({
          planId,
          requirementId,
        });
        expect(updated.requirement.title).toBe('New Valid Title');
      });
    });

    describe('BUG #10: priority and category enum validation in updateRequirement (TDD - RED phase)', () => {
      let requirementId: string;

      beforeEach(async () => {
        const result = await service.addRequirement({
          planId,
          requirement: {
            title: 'Test Requirement',
            source: { type: 'user-request' },
          },
        });
        requirementId = result.requirementId;
      });

      describe('priority validation', () => {
        it('RED: should reject invalid priority', async () => {
          await expect(service.updateRequirement({
            planId,
            requirementId,
            // @ts-expect-error - Testing invalid input
            updates: { priority: 'super-high' },
          })).rejects.toThrow('priority must be one of: critical, high, medium, low');
        });

        it('GREEN: should accept valid priority values', async () => {
          const priorities = ['critical', 'high', 'medium', 'low'] as const;

          for (const priority of priorities) {
            const result = await service.updateRequirement({
              planId,
              requirementId,
              updates: { priority },
            });
            expect(result.success).toBe(true);
          }
        });
      });

      describe('category validation', () => {
        it('RED: should reject invalid category', async () => {
          await expect(service.updateRequirement({
            planId,
            requirementId,
            // @ts-expect-error - Testing invalid input
            updates: { category: 'super-functional' },
          })).rejects.toThrow('category must be one of: functional, non-functional, technical, business');
        });

        it('GREEN: should accept valid category values', async () => {
          const categories = ['functional', 'non-functional', 'technical', 'business'] as const;

          for (const category of categories) {
            const result = await service.updateRequirement({
              planId,
              requirementId,
              updates: { category },
            });
            expect(result.success).toBe(true);
          }
        });
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
      ).rejects.toThrow(/requirement.*not found/i);
    });

    it('should handle undefined votes (backward compatibility)', async () => {
      const added = await service.addRequirement({
        planId,
        requirement: {
          title: 'Legacy Req',
          description: 'Created before votes feature',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'medium',
          category: 'functional',
        },
      });

      // Simulate legacy requirement by setting votes to undefined
      const repo = repositoryFactory.createRepository<Requirement>('requirement', planId);
      const requirement = await repo.findById(added.requirementId);
      delete (requirement as Partial<Requirement>).votes; // Remove votes field
      await repo.update(requirement.id, requirement);

      // Now vote should initialize to 0 and increment to 1
      const result = await service.voteForRequirement({
        planId,
        requirementId: added.requirementId,
      });

      expect(result.success).toBe(true);
      expect(result.votes).toBe(1); // Should be 1, not NaN or null

      // Verify persistence
      const { requirement: updated } = await service.getRequirement({
        planId,
        requirementId: added.requirementId,
      });
      expect(updated.votes).toBe(1);
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
      ).rejects.toThrow(/requirement.*not found/i);
    });

    it('should handle undefined votes (backward compatibility)', async () => {
      const added = await service.addRequirement({
        planId,
        requirement: {
          title: 'Legacy Req Unvote',
          description: 'Created before votes feature',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'medium',
          category: 'functional',
        },
      });

      // Simulate legacy requirement by setting votes to undefined
      const repo = repositoryFactory.createRepository<Requirement>('requirement', planId);
      const requirement = await repo.findById(added.requirementId);
      delete (requirement as Partial<Requirement>).votes; // Remove votes field
      await repo.update(requirement.id, requirement);

      // Should initialize to 0 and throw error (cannot go below 0)
      await expect(
        service.unvoteRequirement({ planId, requirementId: added.requirementId })
      ).rejects.toThrow('Cannot unvote: votes cannot be negative');
    });
  });

  describe('reset_all_votes', () => {
    it('should reset all votes to 0', async () => {
      // Create requirements with votes
      const req1 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Req 1',
          description: 'First requirement',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'high',
          category: 'functional',
        },
      });

      const req2 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Req 2',
          description: 'Second requirement',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'medium',
          category: 'functional',
        },
      });

      // Add votes
      await service.voteForRequirement({ planId, requirementId: req1.requirementId });
      await service.voteForRequirement({ planId, requirementId: req1.requirementId });
      await service.voteForRequirement({ planId, requirementId: req2.requirementId });

      // Verify votes were added
      const before1 = await service.getRequirement({ planId, requirementId: req1.requirementId });
      const before2 = await service.getRequirement({ planId, requirementId: req2.requirementId });
      expect(before1.requirement.votes).toBe(2);
      expect(before2.requirement.votes).toBe(1);

      // Reset all votes
      const result = await service.resetAllVotes({ planId });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(2);

      // Verify all votes are 0
      const after1 = await service.getRequirement({ planId, requirementId: req1.requirementId });
      const after2 = await service.getRequirement({ planId, requirementId: req2.requirementId });
      expect(after1.requirement.votes).toBe(0);
      expect(after2.requirement.votes).toBe(0);
    });

    it('should handle empty requirements list', async () => {
      const result = await service.resetAllVotes({ planId });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(0);
    });

    it('should increment version for each requirement', async () => {
      const req = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test Req',
          description: 'Test',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'low',
          category: 'functional',
        },
      });

      await service.voteForRequirement({ planId, requirementId: req.requirementId });

      const before = await service.getRequirement({ planId, requirementId: req.requirementId });
      const versionBefore = before.requirement.version;

      await service.resetAllVotes({ planId });

      const after = await service.getRequirement({ planId, requirementId: req.requirementId });
      expect(after.requirement.version).toBe((versionBefore as number) + 1);
    });

    it('should handle requirements with undefined votes (backward compatibility)', async () => {
      const req = await service.addRequirement({
        planId,
        requirement: {
          title: 'Legacy Req',
          description: 'Has undefined votes',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'medium',
          category: 'functional',
        },
      });

      // Simulate legacy requirement by deleting votes field
      const repo = repositoryFactory.createRepository<Requirement>('requirement', planId);
      const requirement = await repo.findById(req.requirementId);
      delete (requirement as Partial<Requirement>).votes;
      await repo.update(requirement.id, requirement);

      // Reset should initialize to 0 and count as updated
      const result = await service.resetAllVotes({ planId });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);

      const after = await service.getRequirement({ planId, requirementId: req.requirementId });
      expect(after.requirement.votes).toBe(0);
    });

    it('should only count actually modified requirements', async () => {
      await service.addRequirement({
        planId,
        requirement: {
          title: 'Already Zero',
          description: 'No votes',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'low',
          category: 'functional',
        },
      });

      const req2 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Has Votes',
          description: 'Has votes',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'high',
          category: 'functional',
        },
      });

      await service.voteForRequirement({ planId, requirementId: req2.requirementId });

      const result = await service.resetAllVotes({ planId });

      // Only req2 should be counted as updated (req1 already had 0 votes)
      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);
    });

    it('should throw if plan not found', async () => {
      await expect(
        service.resetAllVotes({ planId: 'non-existent' })
      ).rejects.toThrow('Plan not found');
    });

    it('should update updatedAt timestamp', async () => {
      const req = await service.addRequirement({
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

      await service.voteForRequirement({ planId, requirementId: req.requirementId });

      const before = await service.getRequirement({ planId, requirementId: req.requirementId });
      const updatedAtBefore = before.requirement.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await service.resetAllVotes({ planId });

      const after = await service.getRequirement({ planId, requirementId: req.requirementId });
      expect(after.requirement.updatedAt).not.toBe(updatedAtBefore);
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
        if (fullReq === undefined) throw new Error('FullReq should be defined');
        expect(fullReq.acceptanceCriteria).toBeDefined();
        expect(fullReq.impact).toBeDefined();
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

  describe('Sprint 5: Array Field Operations', () => {
    it('should append item to acceptanceCriteria array', async () => {
      const { requirementId } = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'Test',
          category: 'functional',
          priority: 'medium',
          acceptanceCriteria: ['Criteria 1', 'Criteria 2'],
          source: { type: 'user-request' },
        },
      });

      await service.arrayAppend({
        planId,
        requirementId,
        field: 'acceptanceCriteria',
        value: 'Criteria 3',
      });

      const result = await service.getRequirement({ planId, requirementId, fields: ['*'] });
      expect(result.requirement.acceptanceCriteria).toEqual(['Criteria 1', 'Criteria 2', 'Criteria 3']);
    });

    it('should prepend item to acceptanceCriteria array', async () => {
      const { requirementId } = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'Test',
          category: 'functional',
          priority: 'medium',
          acceptanceCriteria: ['Criteria 2', 'Criteria 3'],
          source: { type: 'user-request' },
        },
      });

      await service.arrayPrepend({
        planId,
        requirementId,
        field: 'acceptanceCriteria',
        value: 'Criteria 1',
      });

      const result = await service.getRequirement({ planId, requirementId, fields: ['*'] });
      expect(result.requirement.acceptanceCriteria).toEqual(['Criteria 1', 'Criteria 2', 'Criteria 3']);
    });

    it('should insert item at specific index', async () => {
      const { requirementId } = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'Test',
          category: 'functional',
          priority: 'medium',
          acceptanceCriteria: ['Criteria 1', 'Criteria 3'],
          source: { type: 'user-request' },
        },
      });

      await service.arrayInsertAt({
        planId,
        requirementId,
        field: 'acceptanceCriteria',
        index: 1,
        value: 'Criteria 2',
      });

      const result = await service.getRequirement({ planId, requirementId, fields: ['*'] });
      expect(result.requirement.acceptanceCriteria).toEqual(['Criteria 1', 'Criteria 2', 'Criteria 3']);
    });

    it('should update item at specific index', async () => {
      const { requirementId } = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'Test',
          category: 'functional',
          priority: 'medium',
          acceptanceCriteria: ['Criteria 1', 'Old Criteria', 'Criteria 3'],
          source: { type: 'user-request' },
        },
      });

      await service.arrayUpdateAt({
        planId,
        requirementId,
        field: 'acceptanceCriteria',
        index: 1,
        value: 'Criteria 2',
      });

      const result = await service.getRequirement({ planId, requirementId, fields: ['*'] });
      expect(result.requirement.acceptanceCriteria).toEqual(['Criteria 1', 'Criteria 2', 'Criteria 3']);
    });

    it('should remove item at specific index', async () => {
      const { requirementId } = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'Test',
          category: 'functional',
          priority: 'medium',
          acceptanceCriteria: ['Criteria 1', 'Extra Criteria', 'Criteria 2'],
          source: { type: 'user-request' },
        },
      });

      await service.arrayRemoveAt({
        planId,
        requirementId,
        field: 'acceptanceCriteria',
        index: 1,
      });

      const result = await service.getRequirement({ planId, requirementId, fields: ['*'] });
      expect(result.requirement.acceptanceCriteria).toEqual(['Criteria 1', 'Criteria 2']);
    });
  });

  describe('bulk_update (Sprint 9 - RED Phase)', () => {
    it('RED 9.1: should update multiple requirements in one call', async () => {
      // Create 3 requirements
      const req1 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Requirement 1',
          description: 'First requirement',
          category: 'functional',
          priority: 'high',
          acceptanceCriteria: ['AC1'],
          source: { type: 'user-request' },
        },
      });

      const req2 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Requirement 2',
          description: 'Second requirement',
          category: 'technical',
          priority: 'medium',
          acceptanceCriteria: ['AC2'],
          source: { type: 'user-request' },
        },
      });

      const req3 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Requirement 3',
          description: 'Third requirement',
          category: 'functional',
          priority: 'low',
          acceptanceCriteria: ['AC3'],
          source: { type: 'user-request' },
        },
      });

      // Bulk update all 3 requirements
      const result = await service.bulkUpdateRequirements({
        planId,
        updates: [
          { requirementId: req1.requirementId, updates: { priority: 'critical' } },
          { requirementId: req2.requirementId, updates: { status: 'approved' } },
          { requirementId: req3.requirementId, updates: { category: 'technical' } },
        ],
      });

      // Verify results
      expect(result.updated).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(3);

      // Verify actual updates
      const updated1 = await service.getRequirement({ planId, requirementId: req1.requirementId });
      expect(updated1.requirement.priority).toBe('critical');

      const updated2 = await service.getRequirement({ planId, requirementId: req2.requirementId });
      expect(updated2.requirement.status).toBe('approved');

      const updated3 = await service.getRequirement({ planId, requirementId: req3.requirementId });
      expect(updated3.requirement.category).toBe('technical');
    });

    it('RED 9.2: should return success/error for each update', async () => {
      const req1 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Valid Requirement',
          description: 'Valid',
          category: 'functional',
          priority: 'high',
          acceptanceCriteria: [],
          source: { type: 'user-request' },
        },
      });

      const result = await service.bulkUpdateRequirements({
        planId,
        updates: [
          { requirementId: req1.requirementId, updates: { priority: 'low' } },
          { requirementId: 'non-existent-id', updates: { priority: 'high' } },
        ],
      });

      expect(result.updated).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results).toHaveLength(2);

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].requirementId).toBe(req1.requirementId);

      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBeDefined();
    });

    it('RED 9.3: should support atomic mode (all-or-nothing)', async () => {
      const req1 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Req 1',
          description: 'Test',
          category: 'functional',
          priority: 'high',
          acceptanceCriteria: [],
          source: { type: 'user-request' },
        },
      });

      const req2 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Req 2',
          description: 'Test',
          category: 'functional',
          priority: 'medium',
          acceptanceCriteria: [],
          source: { type: 'user-request' },
        },
      });

      // Attempt bulk update with one invalid ID (atomic mode)
      await expect(
        service.bulkUpdateRequirements({
          planId,
          updates: [
            { requirementId: req1.requirementId, updates: { priority: 'critical' } },
            { requirementId: 'invalid-id', updates: { priority: 'low' } },
          ],
          atomic: true,
        })
      ).rejects.toThrow();

      // Verify no changes were applied (rollback)
      const check1 = await service.getRequirement({ planId, requirementId: req1.requirementId });
      expect(check1.requirement.priority).toBe('high'); // unchanged

      const check2 = await service.getRequirement({ planId, requirementId: req2.requirementId });
      expect(check2.requirement.priority).toBe('medium'); // unchanged
    });

    it('RED 9.3b (BUGFIX): atomic mode should rollback partial updates when validation fails mid-execution', async () => {
      /**
       * CRITICAL BUG: Current atomic implementation validates entity existence upfront,
       * but each updateFn() call immediately persists changes to disk via storage.saveEntities().
       * If update #1 succeeds but update #2 fails validation, update #1 remains persisted.
       *
       * Example scenario:
       * - req1.priority = 'high'
       * - Bulk update with atomic=true:
       *   1. Update req1.priority to 'critical' → succeeds, saves to disk
       *   2. Update req2.tags to invalid format → fails validation
       * - Expected: Both updates rolled back (req1.priority still 'high')
       * - Actual BUG: req1.priority changed to 'critical' (partial modification persisted)
       *
       * Fix requires: Collect all changes in memory, validate all, then single atomic write.
       */
      const req1 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Req 1',
          description: 'Test',
          category: 'functional',
          priority: 'high',
          acceptanceCriteria: [],
          source: { type: 'user-request' },
        },
      });

      const req2 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Req 2',
          description: 'Test',
          category: 'functional',
          priority: 'medium',
          acceptanceCriteria: [],
          source: { type: 'user-request' },
          tags: [{ key: 'env', value: 'prod' }],
        },
      });

      // Attempt bulk update where:
      // - First update is valid (req1: priority change)
      // - Second update has invalid data (req2: malformed tags - missing 'key' field)
      await expect(
        service.bulkUpdateRequirements({
          planId,
          updates: [
            { requirementId: req1.requirementId, updates: { priority: 'critical' } },
            { requirementId: req2.requirementId, updates: { tags: [{ invalidField: 'test' }] as unknown as { key: string; value: string }[] } },
          ],
          atomic: true,
        })
      ).rejects.toThrow();

      // BUGFIX TEST: Verify req1 was NOT modified (true atomicity)
      const check1 = await service.getRequirement({ planId, requirementId: req1.requirementId });
      expect(check1.requirement.priority).toBe('high'); // Should remain unchanged due to atomic rollback

      // req2 should also be unchanged
      const check2 = await service.getRequirement({ planId, requirementId: req2.requirementId });
      expect(check2.requirement.metadata.tags).toEqual([{ key: 'env', value: 'prod' }]); // unchanged
    });

    it('RED 9.4: should handle empty updates array', async () => {
      const result = await service.bulkUpdateRequirements({
        planId,
        updates: [],
      });

      expect(result.updated).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('RED 9.5: should update requirements with different field combinations', async () => {
      const req1 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test',
          description: 'Test',
          category: 'functional',
          priority: 'high',
          acceptanceCriteria: ['AC1'],
          source: { type: 'user-request' },
        },
      });

      const result = await service.bulkUpdateRequirements({
        planId,
        updates: [
          {
            requirementId: req1.requirementId,
            updates: {
              title: 'Updated Title',
              description: 'Updated Description',
              priority: 'critical',
              acceptanceCriteria: ['Updated AC1', 'Updated AC2'],
            },
          },
        ],
      });

      expect(result.updated).toBe(1);

      const updated = await service.getRequirement({ planId, requirementId: req1.requirementId });
      expect(updated.requirement.title).toBe('Updated Title');
      expect(updated.requirement.description).toBe('Updated Description');
      expect(updated.requirement.priority).toBe('critical');
      expect(updated.requirement.acceptanceCriteria).toEqual(['Updated AC1', 'Updated AC2']);
    });
  });

  // REQ-5: Data Integrity - Cascading Delete and Cleanup
  describe('delete_requirement cascading (REQ-5)', () => {
    let solutionService: SolutionService;

    beforeEach(() => {
      solutionService = new SolutionService(repositoryFactory, planService);
    });

    it('RED: should cascade delete all links when requirement is deleted', async () => {
      // Create requirement
      const req = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'Test',
          category: 'functional',
          priority: 'high',
          acceptanceCriteria: [],
          source: { type: 'user-request' },
        },
      });

      // Create solution
      const sol = await solutionService.proposeSolution({
        planId,
        solution: { title: 'Test Solution' },
      });

      // Create link: solution implements requirement
      await linkingService.linkEntities({
        planId,
        sourceId: sol.solutionId,
        targetId: req.requirementId,
        relationType: 'implements',
      });

      // Verify link exists
      const linksBefore = await linkingService.getEntityLinks({
        planId,
        entityId: req.requirementId,
      });
      expect(linksBefore.links).toHaveLength(1);

      // Delete requirement
      await service.deleteRequirement({
        planId,
        requirementId: req.requirementId,
      });

      // Verify link was deleted
      const linksAfter = await linkingService.getEntityLinks({
        planId,
        entityId: req.requirementId,
      });
      expect(linksAfter.links).toHaveLength(0);
    });

    it('RED: should clean solution.addressing when requirement is deleted', async () => {
      // Create requirement
      const req = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'Test',
          category: 'functional',
          priority: 'high',
          acceptanceCriteria: [],
          source: { type: 'user-request' },
        },
      });

      // Create solution that addresses this requirement
      const sol = await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'Test Solution',
          addressing: [req.requirementId],
        },
      });

      // Verify solution.addressing contains requirement ID
      const solBefore = await solutionService.getSolution({
        planId,
        solutionId: sol.solutionId,
      });
      expect(solBefore.solution.addressing).toContain(req.requirementId);

      // Delete requirement
      await service.deleteRequirement({
        planId,
        requirementId: req.requirementId,
      });

      // Verify solution.addressing was cleaned
      const solAfter = await solutionService.getSolution({
        planId,
        solutionId: sol.solutionId,
      });
      expect(solAfter.solution.addressing).not.toContain(req.requirementId);
      expect(solAfter.solution.addressing).toHaveLength(0);
    });

    it('RED: should clean multiple solutions when requirement is deleted', async () => {
      // Create requirement
      const req = await service.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'Test',
          category: 'functional',
          priority: 'high',
          acceptanceCriteria: [],
          source: { type: 'user-request' },
        },
      });

      // Create multiple solutions addressing this requirement
      const sol1 = await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'Solution 1',
          addressing: [req.requirementId],
        },
      });

      const sol2 = await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'Solution 2',
          addressing: [req.requirementId],
        },
      });

      // Delete requirement
      await service.deleteRequirement({
        planId,
        requirementId: req.requirementId,
      });

      // Verify both solutions were cleaned
      const sol1After = await solutionService.getSolution({
        planId,
        solutionId: sol1.solutionId,
      });
      expect(sol1After.solution.addressing).toHaveLength(0);

      const sol2After = await solutionService.getSolution({
        planId,
        solutionId: sol2.solutionId,
      });
      expect(sol2After.solution.addressing).toHaveLength(0);
    });

    it('GREEN: should preserve other requirement IDs in solution.addressing', async () => {
      // Create two requirements
      const req1 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Requirement 1',
          description: 'Test',
          category: 'functional',
          priority: 'high',
          acceptanceCriteria: [],
          source: { type: 'user-request' },
        },
      });

      const req2 = await service.addRequirement({
        planId,
        requirement: {
          title: 'Requirement 2',
          description: 'Test',
          category: 'functional',
          priority: 'high',
          acceptanceCriteria: [],
          source: { type: 'user-request' },
        },
      });

      // Create solution addressing both requirements
      const sol = await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'Test Solution',
          addressing: [req1.requirementId, req2.requirementId],
        },
      });

      // Delete only req1
      await service.deleteRequirement({
        planId,
        requirementId: req1.requirementId,
      });

      // Verify req2 ID is preserved
      const solAfter = await solutionService.getSolution({
        planId,
        solutionId: sol.solutionId,
      });
      expect(solAfter.solution.addressing).toHaveLength(1);
      expect(solAfter.solution.addressing).toContain(req2.requirementId);
      expect(solAfter.solution.addressing).not.toContain(req1.requirementId);
    });
  });
});
