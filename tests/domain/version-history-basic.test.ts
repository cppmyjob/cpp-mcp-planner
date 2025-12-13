/**
 * Basic Version History Tests
 * Sprint 7: Core functionality verification
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { RepositoryFactory } from '../../src/infrastructure/factory/repository-factory.js';
import { FileLockManager } from '../../src/infrastructure/repositories/file/file-lock-manager.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { RequirementService } from '../../src/domain/services/requirement-service.js';
import { VersionHistoryService } from '../../src/domain/services/version-history-service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Version History - Basic Tests', () => {
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
  let planService: PlanService;
  let versionHistoryService: VersionHistoryService;
  let requirementService: RequirementService;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-version-history-basic-${Date.now().toString()}`);

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
    versionHistoryService = new VersionHistoryService(repositoryFactory);
    requirementService = new RequirementService(repositoryFactory, planService, versionHistoryService);

    // Create plan with history enabled
    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'Test',
      enableHistory: true,
      maxHistoryDepth: 5
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await repositoryFactory.dispose();
    await lockManager.dispose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should create plan with enableHistory=true and maxHistoryDepth=5', async () => {
    const planRepo = repositoryFactory.createPlanRepository();
    const manifest = await planRepo.loadManifest(planId);
    expect(manifest.enableHistory).toBe(true);
    expect(manifest.maxHistoryDepth).toBe(5);
  });

  it('should save version history after requirement update', async () => {
    // Add requirement
    const req = await requirementService.addRequirement({
      planId,
      requirement: {
        title: 'Original Title',
        description: 'Original Description',
        priority: 'high',
        category: 'functional',
        source: {
          type: 'user-request',
          context: 'Test'
        },
        acceptanceCriteria: ['AC1', 'AC2']
      }
    });

    // Update requirement
    await requirementService.updateRequirement({
      planId,
      requirementId: req.requirementId,
      updates: {
        title: 'Updated Title'
      }
    });

    // Get history
    const history = await requirementService.getHistory({
      planId,
      requirementId: req.requirementId
    });

    expect(history.versions).toHaveLength(1);
    expect(history.versions[0].data.title).toBe('Original Title');
    expect(history.versions[0].version).toBe(1);
  });

  it('should generate diff between two versions', async () => {
    // Add requirement
    const req = await requirementService.addRequirement({
      planId,
      requirement: {
        title: 'V1 Title',
        description: 'V1 Description',
        priority: 'high',
        category: 'functional',
        source: {
          type: 'user-request',
          context: 'Test'
        },
        acceptanceCriteria: ['AC1']
      }
    });

    // Update to v2
    await requirementService.updateRequirement({
      planId,
      requirementId: req.requirementId,
      updates: {
        title: 'V2 Title',
        description: 'V2 Description'
      }
    });

    // Get diff
    const diff = await requirementService.diff({
      planId,
      requirementId: req.requirementId,
      version1: 1,
      version2: 2
    });

    expect(diff.version1.version).toBe(1);
    expect(diff.version2.version).toBe(2);
    expect(diff.changes.title.from).toBe('V1 Title');
    expect(diff.changes.title.to).toBe('V2 Title');
    expect(diff.changes.title.changed).toBe(true);
    expect(diff.changes.description.from).toBe('V1 Description');
    expect(diff.changes.description.to).toBe('V2 Description');
    expect(diff.changes.description.changed).toBe(true);
  });

  it('should rotate history when maxHistoryDepth is exceeded', async () => {
    // Create plan with maxHistoryDepth=2
    const plan2 = await planService.createPlan({
      name: 'Test Plan 2',
      description: 'Test',
      enableHistory: true,
      maxHistoryDepth: 2
    });

    const req = await requirementService.addRequirement({
      planId: plan2.planId,
      requirement: {
        title: 'V1',
        description: 'Test',
        priority: 'high',
        category: 'functional',
        source: {
          type: 'user-request',
          context: 'Test'
        },
        acceptanceCriteria: ['AC1']
      }
    });

    // Create 4 updates (should keep only last 2)
    for (let i = 2; i <= 5; i++) {
      await requirementService.updateRequirement({
        planId: plan2.planId,
        requirementId: req.requirementId,
        updates: {
          title: `V${i.toString()}`
        }
      });
    }

    const history = await requirementService.getHistory({
      planId: plan2.planId,
      requirementId: req.requirementId
    });

    expect(history.versions).toHaveLength(2);
    expect(history.versions[0].data.title).toBe('V4'); // Most recent old version
    expect(history.versions[1].data.title).toBe('V3'); // Oldest kept
  });

  it('should not save history when enableHistory=false', async () => {
    const plan3 = await planService.createPlan({
      name: 'No History Plan',
      description: 'Test',
      enableHistory: false
    });

    const req = await requirementService.addRequirement({
      planId: plan3.planId,
      requirement: {
        title: 'Original',
        description: 'Test',
        priority: 'high',
        category: 'functional',
        source: {
          type: 'user-request',
          context: 'Test'
        },
        acceptanceCriteria: ['AC1']
      }
    });

    await requirementService.updateRequirement({
      planId: plan3.planId,
      requirementId: req.requirementId,
      updates: {
        title: 'Updated'
      }
    });

    const history = await requirementService.getHistory({
      planId: plan3.planId,
      requirementId: req.requirementId
    });

    expect(history.versions).toHaveLength(0);
  });
});
