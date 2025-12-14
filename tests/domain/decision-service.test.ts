import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DecisionService } from '../../src/domain/services/decision-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { RepositoryFactory } from '../../src/infrastructure/factory/repository-factory.js';
import { FileLockManager } from '../../src/infrastructure/repositories/file/file-lock-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('DecisionService', () => {
  let service: DecisionService;
  let planService: PlanService;
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-dec-test-${Date.now().toString()}`);

    lockManager = new FileLockManager(testDir);
    await lockManager.initialize();

    repositoryFactory = new RepositoryFactory({
      type: 'file',
      baseDir: testDir,
      lockManager,
      cacheOptions: { enabled: true, ttl: 5000, maxSize: 1000 }
    });

    const planRepo = repositoryFactory.createPlanRepository();
    await planRepo.initialize();

    planService = new PlanService(repositoryFactory);
    service = new DecisionService(repositoryFactory, planService);

    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For testing decisions',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await repositoryFactory.dispose();
    await lockManager.dispose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('record_decision', () => {
    // RED: Validation tests for REQUIRED fields
    describe('title validation (REQUIRED field)', () => {
      it('RED: should reject missing title (undefined)', async () => {
        await expect(service.recordDecision({
          planId,
          decision: {
            // @ts-expect-error - Testing invalid input
            title: undefined,
            question: 'Which database?',
            context: 'Need ACID',
            decision: 'PostgreSQL',
          },
        })).rejects.toThrow('title is required');
      });

      it('RED: should reject empty title', async () => {
        await expect(service.recordDecision({
          planId,
          decision: {
            title: '',
            question: 'Which database?',
            context: 'Need ACID',
            decision: 'PostgreSQL',
          },
        })).rejects.toThrow('title must be a non-empty string');
      });

      it('RED: should reject whitespace-only title', async () => {
        await expect(service.recordDecision({
          planId,
          decision: {
            title: '   ',
            question: 'Which database?',
            context: 'Need ACID',
            decision: 'PostgreSQL',
          },
        })).rejects.toThrow('title must be a non-empty string');
      });
    });

    describe('question validation (REQUIRED field)', () => {
      it('RED: should reject missing question (undefined)', async () => {
        await expect(service.recordDecision({
          planId,
          decision: {
            title: 'Database Choice',
            // @ts-expect-error - Testing invalid input
            question: undefined,
            context: 'Need ACID',
            decision: 'PostgreSQL',
          },
        })).rejects.toThrow('question is required');
      });

      it('RED: should reject empty question', async () => {
        await expect(service.recordDecision({
          planId,
          decision: {
            title: 'Database Choice',
            question: '',
            context: 'Need ACID',
            decision: 'PostgreSQL',
          },
        })).rejects.toThrow('question must be a non-empty string');
      });
    });

    describe('decision validation (REQUIRED field)', () => {
      it('RED: should reject missing decision (undefined)', async () => {
        await expect(service.recordDecision({
          planId,
          decision: {
            title: 'Database Choice',
            question: 'Which database?',
            context: 'Need ACID',
            // @ts-expect-error - Testing invalid input
            decision: undefined,
          },
        })).rejects.toThrow('decision is required');
      });

      it('RED: should reject empty decision', async () => {
        await expect(service.recordDecision({
          planId,
          decision: {
            title: 'Database Choice',
            question: 'Which database?',
            context: 'Need ACID',
            decision: '',
          },
        })).rejects.toThrow('decision must be a non-empty string');
      });
    });

    // GREEN: Tests for minimal decision with defaults
    describe('minimal decision with defaults', () => {
      it('GREEN: should accept minimal decision (title + question + decision only)', async () => {
        const result = await service.recordDecision({
          planId,
          decision: {
            title: 'Tech Stack',
            question: 'Which framework?',
            decision: 'TypeScript + Express',
          },
        });

        expect(result.decisionId).toBeDefined();

        // Verify defaults were applied
        const { decision } = await service.getDecision({ planId, decisionId: result.decisionId, fields: ['*'] });
        expect(decision.title).toBe('Tech Stack');
        expect(decision.question).toBe('Which framework?');
        expect(decision.decision).toBe('TypeScript + Express');
        expect(decision.context).toBe('');  // default
        expect(decision.alternativesConsidered).toEqual([]);  // default
        expect(decision.status).toBe('active');
      });
    });

    it('should record a new decision', async () => {
      const result = await service.recordDecision({
        planId,
        decision: {
          title: 'JWT Library Selection',
          question: 'Which JWT library should we use?',
          context: 'Need secure JWT handling',
          decision: 'Use jsonwebtoken',
          alternativesConsidered: [
            { option: 'jose', reasoning: 'Modern', whyNotChosen: 'Less mature' },
          ],
        },
      });

      expect(result.decisionId).toBeDefined();

      // Verify via getDecision
      const { decision } = await service.getDecision({ planId, decisionId: result.decisionId, fields: ['*'] });
      expect(decision.title).toBe('JWT Library Selection');
      expect(decision.status).toBe('active');
    });

    it('should store alternatives considered', async () => {
      const result = await service.recordDecision({
        planId,
        decision: {
          title: 'Database Choice',
          question: 'Which database?',
          context: 'Need ACID',
          decision: 'PostgreSQL',
          alternativesConsidered: [
            { option: 'MySQL', reasoning: 'Popular', whyNotChosen: 'Less features' },
            { option: 'MongoDB', reasoning: 'Flexible', whyNotChosen: 'No ACID' },
          ],
        },
      });

      // Verify via getDecision
      const { decision } = await service.getDecision({ planId, decisionId: result.decisionId, fields: ['*'] });
      expect(decision.alternativesConsidered).toHaveLength(2);
    });
  });

  describe('get_decision_history', () => {
    beforeEach(async () => {
      await service.recordDecision({
        planId,
        decision: {
          title: 'First Decision',
          question: 'Q1',
          context: 'C1',
          decision: 'D1',
          alternativesConsidered: [],
        },
      });
      await service.recordDecision({
        planId,
        decision: {
          title: 'Second Decision',
          question: 'Q2',
          context: 'C2',
          decision: 'D2',
          alternativesConsidered: [],
        },
      });
    });

    it('should return decision history', async () => {
      const result = await service.getDecisionHistory({ planId });
      expect(result.decisions).toHaveLength(2);
    });

    it('should search in decision text', async () => {
      const result = await service.getDecisionHistory({
        planId,
        filters: { search: 'First' },
      });
      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0].title).toBe('First Decision');
    });
  });

  describe('update_decision (supersede)', () => {
    it('should supersede a decision', async () => {
      const original = await service.recordDecision({
        planId,
        decision: {
          title: 'JWT Choice',
          question: 'Which JWT lib?',
          context: 'Auth',
          decision: 'jsonwebtoken',
          alternativesConsidered: [],
        },
      });

      const result = await service.updateDecision({
        planId,
        decisionId: original.decisionId,
        supersede: {
          newDecision: 'jose',
          reason: 'Performance issues found',
        },
      });

      // Verify via getDecision
      const { decision: newDecision } = await service.getDecision({ planId, decisionId: result.decisionId, fields: ['*'] });
      const { decision: oldDecision } = await service.getDecision({ planId, decisionId: original.decisionId, fields: ['*'] });

      expect(newDecision.decision).toBe('jose');
      expect(newDecision.status).toBe('active');
      expect(oldDecision.status).toBe('superseded');
      expect(newDecision.supersedes).toBe(original.decisionId);
    });

    it('should add old decision to alternatives', async () => {
      const original = await service.recordDecision({
        planId,
        decision: {
          title: 'Choice',
          question: 'Q',
          context: 'C',
          decision: 'Option A',
          alternativesConsidered: [],
        },
      });

      const result = await service.updateDecision({
        planId,
        decisionId: original.decisionId,
        supersede: {
          newDecision: 'Option B',
          reason: 'Better performance',
        },
      });

      // Verify via getDecision
      const { decision: newDecision } = await service.getDecision({ planId, decisionId: result.decisionId, fields: ['*'] });

      const oldInAlternatives = newDecision.alternativesConsidered.find(
        (a) => a.option === 'Option A'
      );
      expect(oldInAlternatives).toBeDefined();
      expect(oldInAlternatives?.whyNotChosen).toBe('Better performance');
    });

    // RED: BUG #8 - supersedeDecision crashes when alternativesConsidered is missing
    it('should handle decisions with missing alternativesConsidered field', async () => {
      // Create a decision with missing alternativesConsidered (simulating corrupted/legacy data)
      const repo = repositoryFactory.createRepository('decision', planId);
      const decisionWithoutAlternatives = {
        id: 'dec-no-alternatives',
        type: 'decision' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        metadata: { createdBy: 'test', tags: [], annotations: [] },
        title: 'Legacy Decision',
        question: 'Which approach?',
        context: 'Old decision from before alternativesConsidered was required',
        decision: 'Option A',
        status: 'active' as const,
        // NOTE: alternativesConsidered field is intentionally missing
      };
      await repo.create(decisionWithoutAlternatives);

      // This should NOT crash - it should handle missing alternativesConsidered gracefully
      const result = await service.supersedeDecision({
        planId,
        decisionId: 'dec-no-alternatives',
        newDecision: {
          decision: 'Option B',
        },
        reason: 'Better approach found',
      });

      expect(result.success).toBe(true);
      expect(result.newDecisionId).toBeDefined();

      // Verify new decision was created with old decision in alternatives
      const { decision: newDecision } = await service.getDecision({
        planId,
        decisionId: result.newDecisionId,
        fields: ['*'],
      });
      expect(newDecision.decision).toBe('Option B');
      expect(newDecision.alternativesConsidered).toHaveLength(1);
      expect(newDecision.alternativesConsidered[0].option).toBe('Option A');
    });

    // Sprint 3: DecisionService.supersede() Fix (Bugs #5, #6, #14)
    // RED phase - these tests should FAIL initially until bugs are fixed
    describe('Sprint 3: supersede() bug fixes', () => {
      it('RED: should throw error when decision not found', async () => {
        await expect(service.supersedeDecision({
          planId,
          decisionId: 'non-existent-decision-id',
          newDecision: { decision: 'New decision' },
          reason: 'Testing non-existent',
        })).rejects.toThrow(/decision.*not found/i);
      });

      it('RED: should validate newDecision.decision is required (empty string)', async () => {
        const original = await service.recordDecision({
          planId,
          decision: {
            title: 'Test Decision',
            question: 'Test question?',
            context: 'Context',
            decision: 'Original decision',
            alternativesConsidered: [],
          },
        });

        // validateRequiredString throws "must be a non-empty string" for empty strings
        await expect(service.supersedeDecision({
          planId,
          decisionId: original.decisionId,
          newDecision: { decision: '' }, // Empty decision
          reason: 'Testing empty decision',
        })).rejects.toThrow('decision must be a non-empty string');
      });

      it('RED: should validate newDecision.decision is not whitespace-only', async () => {
        const original = await service.recordDecision({
          planId,
          decision: {
            title: 'Test Decision',
            question: 'Test question?',
            context: 'Context',
            decision: 'Original decision',
            alternativesConsidered: [],
          },
        });

        await expect(service.supersedeDecision({
          planId,
          decisionId: original.decisionId,
          newDecision: { decision: '   ' }, // Whitespace only
          reason: 'Testing whitespace decision',
        })).rejects.toThrow('decision must be a non-empty string');
      });

      it('RED: should not allow superseding already superseded decision', async () => {
        const original = await service.recordDecision({
          planId,
          decision: {
            title: 'Test Decision',
            question: 'Test question?',
            context: 'Context',
            decision: 'Decision v1',
            alternativesConsidered: [],
          },
        });

        // First supersede
        await service.supersedeDecision({
          planId,
          decisionId: original.decisionId,
          newDecision: { decision: 'Decision v2' },
          reason: 'First supersede',
        });

        // Try to supersede already superseded decision
        await expect(service.supersedeDecision({
          planId,
          decisionId: original.decisionId, // This is now 'superseded'
          newDecision: { decision: 'Decision v3' },
          reason: 'Second supersede attempt',
        })).rejects.toThrow('Cannot supersede a decision that is already superseded');
      });

      it('GREEN: successful supersede should maintain consistent state', async () => {
        const original = await service.recordDecision({
          planId,
          decision: {
            title: 'Consistent Test',
            question: 'Test?',
            context: 'Context',
            decision: 'Original',
            alternativesConsidered: [],
          },
        });

        const result = await service.supersedeDecision({
          planId,
          decisionId: original.decisionId,
          newDecision: { decision: 'New decision' },
          reason: 'Upgrade',
        });

        // Verify old decision state
        const { decision: oldDecision } = await service.getDecision({
          planId,
          decisionId: original.decisionId,
          fields: ['*'],
        });
        expect(oldDecision.status).toBe('superseded');
        expect(oldDecision.supersededBy).toBe(result.newDecisionId);

        // Verify new decision state
        const { decision: newDecision } = await service.getDecision({
          planId,
          decisionId: result.newDecisionId,
          fields: ['*'],
        });
        expect(newDecision.status).toBe('active');
        expect(newDecision.supersedes).toBe(original.decisionId);
      });

      // BUG-014 FIX: supersede should REUSE existing decision when UUID is provided
      describe('BUG-014: supersede with existing decision ID (ADR pattern)', () => {
        it('RED: should reuse existing decision when UUID is provided, not create duplicate', async () => {
          // Create Decision 1 (to be superseded)
          const decision1 = await service.recordDecision({
            planId,
            decision: {
              title: 'Decision 1 for supersede test',
              question: 'Should we use approach A?',
              decision: 'Yes, use approach A',
              context: 'Testing supersede functionality',
              alternativesConsidered: [
                { option: 'Approach B', reasoning: 'Alternative', whyNotChosen: 'Not chosen' },
              ],
              consequences: 'Will be superseded',
            },
          });

          // Create Decision 2 (the new/better approach)
          const decision2 = await service.recordDecision({
            planId,
            decision: {
              title: 'Decision 2 - new approach',
              question: 'Should we use approach B instead?',
              decision: 'Yes, approach B is better',
              context: 'New decision to supersede old one',
              alternativesConsidered: [],
              consequences: 'Better outcome',
            },
          });

          // Get initial state of Decision 2 before supersede
          const { decision: decision2Before } = await service.getDecision({
            planId,
            decisionId: decision2.decisionId,
            fields: ['*'],
          });

          // Supersede Decision 1 WITH Decision 2 (provide UUID, not string)
          const result = await service.supersedeDecision({
            planId,
            decisionId: decision1.decisionId,
            newDecision: {
              decision: decision2.decisionId, // UUID of existing decision
            },
            reason: 'Testing if BUG-014 is fixed',
          });

          // CRITICAL ASSERTIONS: Should reuse existing decision, not create new one
          expect(result.newDecisionId).toBe(decision2.decisionId);
          expect(result.supersededDecisionId).toBe(decision1.decisionId);

          // Verify Decision 1 is marked as superseded
          const { decision: decision1After } = await service.getDecision({
            planId,
            decisionId: decision1.decisionId,
            fields: ['*'],
          });
          expect(decision1After.status).toBe('superseded');
          expect(decision1After.supersededBy).toBe(decision2.decisionId);

          // Verify Decision 2 is updated with supersedes field (REUSED, not created)
          const { decision: decision2After } = await service.getDecision({
            planId,
            decisionId: decision2.decisionId,
            fields: ['*'],
          });
          expect(decision2After.status).toBe('active');
          expect(decision2After.supersedes).toBe(decision1.decisionId);

          // Verify Decision 2 retains its ORIGINAL data (not copied from Decision 1)
          expect(decision2After.title).toBe('Decision 2 - new approach');
          expect(decision2After.question).toBe('Should we use approach B instead?');
          expect(decision2After.decision).toBe('Yes, approach B is better'); // NOT the UUID string
          expect(decision2After.context).toBe('New decision to supersede old one');
          expect(decision2After.consequences).toBe('Better outcome');

          // Verify Decision 2 version incremented (it was updated, not created)
          expect(decision2After.version).toBe(decision2Before.version + 1);

          // Verify NO third decision was created
          const allDecisions = await service.listDecisions({ planId, fields: ['*'] });
          expect(allDecisions.total).toBe(2); // Only Decision 1 and Decision 2, NO third decision
        });

        it('RED: should throw error if provided decision UUID does not exist', async () => {
          const decision1 = await service.recordDecision({
            planId,
            decision: {
              title: 'Decision to supersede',
              question: 'Question',
              decision: 'Original',
              context: 'Context',
              alternativesConsidered: [],
            },
          });

          // Try to supersede with non-existent decision ID (valid UUID format, but doesn't exist)
          await expect(service.supersedeDecision({
            planId,
            decisionId: decision1.decisionId,
            newDecision: {
              decision: '12345678-1234-1234-1234-123456789012', // Valid UUID format but non-existent
            },
            reason: 'Testing error handling',
          })).rejects.toThrow(/decision.*not found/i);
        });

        // M-2 FIX: Version double-increment in reuseExistingDecision
        it('GREEN: old decision version should increment by exactly 1 (not 2) when reusing existing decision', async () => {
          // FIXED: Removed manual version += 1, repo.update() handles it automatically

          // Create Decision 1 (will be superseded)
          const decision1 = await service.recordDecision({
            planId,
            decision: {
              title: 'Decision 1 - version test',
              question: 'Test version increment?',
              decision: 'Yes',
              context: 'Testing M-2 bug',
              alternativesConsidered: [],
            },
          });

          // Create Decision 2 (will be reused as superseding decision)
          const decision2 = await service.recordDecision({
            planId,
            decision: {
              title: 'Decision 2 - reuse target',
              question: 'Reuse this?',
              decision: 'Yes, reuse me',
              context: 'Will be linked via supersede',
              alternativesConsidered: [],
            },
          });

          // Get initial versions
          const { decision: d1Before } = await service.getDecision({
            planId,
            decisionId: decision1.decisionId,
            fields: ['*'],
          });
          const { decision: d2Before } = await service.getDecision({
            planId,
            decisionId: decision2.decisionId,
            fields: ['*'],
          });

          expect(d1Before.version).toBe(1);
          expect(d2Before.version).toBe(1);

          // Supersede Decision 1 WITH Decision 2 (UUID reuse path)
          await service.supersedeDecision({
            planId,
            decisionId: decision1.decisionId,
            newDecision: {
              decision: decision2.decisionId, // UUID triggers reuseExistingDecision()
            },
            reason: 'Testing version increment',
          });

          // Verify versions after supersede
          const { decision: d1After } = await service.getDecision({
            planId,
            decisionId: decision1.decisionId,
            fields: ['*'],
          });
          const { decision: d2After } = await service.getDecision({
            planId,
            decisionId: decision2.decisionId,
            fields: ['*'],
          });

          // M-2 FIX ASSERTION: Old decision version should be 2 (incremented by 1)
          // FIXED: repo.update() handles version increment automatically
          expect(d1After.version).toBe(2);

          // Decision 2 should also increment by 1 (repo.update() call)
          expect(d2After.version).toBe(2);
        });
      });
    });
  });

  describe('list_decisions', () => {
    it('should filter by status', async () => {
      const d1 = await service.recordDecision({
        planId,
        decision: {
          title: 'D1',
          question: 'Q',
          context: 'C',
          decision: 'A',
          alternativesConsidered: [],
        },
      });

      await service.updateDecision({
        planId,
        decisionId: d1.decisionId,
        supersede: { newDecision: 'B', reason: 'Test' },
      });

      const activeOnly = await service.listDecisions({
        planId,
        filters: { status: 'active' },
      });

      expect(activeOnly.decisions).toHaveLength(1);
      expect(activeOnly.decisions[0].decision).toBe('B');
    });
  });

  describe('minimal return values (Sprint 6)', () => {
    describe('recordDecision should return only decisionId', () => {
      it('should not include full decision object in result', async () => {
        const result = await service.recordDecision({
          planId,
          decision: {
            title: 'Test Decision',
            question: 'What to do?',
            context: 'Context',
            decision: 'Do X',
            alternativesConsidered: [],
          },
        });

        expect(result.decisionId).toBeDefined();
        expect(result).not.toHaveProperty('decision');
      });
    });

    describe('updateDecision should return only success and decisionId', () => {
      it('should not include full decision object in result', async () => {
        const added = await service.recordDecision({
          planId,
          decision: {
            title: 'Test',
            question: 'Q',
            context: 'C',
            decision: 'D',
            alternativesConsidered: [],
          },
        });

        const result = await service.updateDecision({
          planId,
          decisionId: added.decisionId,
          updates: { consequences: 'Updated consequences' },
        });

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('decision');
      });
    });

    describe('BUG #18: REQUIRED fields validation in updateDecision (TDD - RED phase)', () => {
      let decisionId: string;

      beforeEach(async () => {
        const result = await service.recordDecision({
          planId,
          decision: {
            title: 'Original Title',
            question: 'Original Question',
            decision: 'Original Decision',
          },
        });
        decisionId = result.decisionId;
      });

      describe('title validation', () => {
        it('RED: should reject empty title', async () => {
          await expect(service.updateDecision({
            planId,
            decisionId,
            updates: { title: '' },
          })).rejects.toThrow('title must be a non-empty string');
        });

        it('RED: should reject whitespace-only title', async () => {
          await expect(service.updateDecision({
            planId,
            decisionId,
            updates: { title: '   ' },
          })).rejects.toThrow('title must be a non-empty string');
        });
      });

      describe('question validation', () => {
        it('RED: should reject empty question', async () => {
          await expect(service.updateDecision({
            planId,
            decisionId,
            updates: { question: '' },
          })).rejects.toThrow('question must be a non-empty string');
        });

        it('RED: should reject whitespace-only question', async () => {
          await expect(service.updateDecision({
            planId,
            decisionId,
            updates: { question: '   ' },
          })).rejects.toThrow('question must be a non-empty string');
        });
      });

      describe('decision validation', () => {
        it('RED: should reject empty decision', async () => {
          await expect(service.updateDecision({
            planId,
            decisionId,
            updates: { decision: '' },
          })).rejects.toThrow('decision must be a non-empty string');
        });

        it('RED: should reject whitespace-only decision', async () => {
          await expect(service.updateDecision({
            planId,
            decisionId,
            updates: { decision: '   ' },
          })).rejects.toThrow('decision must be a non-empty string');
        });
      });

      it('GREEN: should allow valid updates', async () => {
        const result = await service.updateDecision({
          planId,
          decisionId,
          updates: {
            title: 'New Title',
            question: 'New Question',
            decision: 'New Decision',
          },
        });
        expect(result.success).toBe(true);

        const updated = await service.getDecision({
          planId,
          decisionId,
        });
        expect(updated.decision.title).toBe('New Title');
        expect(updated.decision.question).toBe('New Question');
        expect(updated.decision.decision).toBe('New Decision');
      });
    });

    describe('supersedeDecision should return only success and IDs', () => {
      it('should not include full decision objects in result', async () => {
        const original = await service.recordDecision({
          planId,
          decision: {
            title: 'Original',
            question: 'Q',
            context: 'C',
            decision: 'A',
            alternativesConsidered: [],
          },
        });

        const result = await service.supersedeDecision({
          planId,
          decisionId: original.decisionId,
          newDecision: {
            decision: 'B',
            context: 'Updated context',
          },
          reason: 'Better option',
        });

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('newDecision');
        expect(result).not.toHaveProperty('supersededDecision');
      });
    });
  });
});
