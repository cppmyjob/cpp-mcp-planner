import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LinkingService } from '../../src/domain/services/linking-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { RepositoryFactory } from '../../src/infrastructure/factory/repository-factory.js';
import { FileLockManager } from '../../src/infrastructure/repositories/file/file-lock-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('LinkingService', () => {
  let service: LinkingService;
  let planService: PlanService;
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-link-test-${Date.now().toString()}`);

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
    service = new LinkingService(repositoryFactory);

    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For testing links',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await repositoryFactory.dispose();
    await lockManager.dispose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('link_entities', () => {
    it('should create a link', async () => {
      const result = await service.linkEntities({
        planId,
        sourceId: 'sol-001',
        targetId: 'req-001',
        relationType: 'implements',
      });

      expect(result.linkId).toBeDefined();

      // Verify via getEntityLinks
      const links = await service.getEntityLinks({ planId, entityId: 'sol-001', direction: 'outgoing' });
      expect(links.outgoing).toHaveLength(1);
      expect(links.outgoing[0].relationType).toBe('implements');
    });

    it('should prevent duplicate links', async () => {
      await service.linkEntities({
        planId,
        sourceId: 'sol-001',
        targetId: 'req-001',
        relationType: 'implements',
      });

      await expect(
        service.linkEntities({
          planId,
          sourceId: 'sol-001',
          targetId: 'req-001',
          relationType: 'implements',
        })
      ).rejects.toThrow('Link already exists');
    });

    it('should store metadata', async () => {
      const result = await service.linkEntities({
        planId,
        sourceId: 'sol-001',
        targetId: 'sol-002',
        relationType: 'alternative_to',
        metadata: { comparison: 'Both solve auth' },
      });

      expect(result.linkId).toBeDefined();

      // Verify via getEntityLinks
      const links = await service.getEntityLinks({ planId, entityId: 'sol-001', direction: 'outgoing' });
      expect(links.outgoing[0].metadata?.comparison).toBe('Both solve auth');
    });

    it('should detect circular dependencies', async () => {
      await service.linkEntities({
        planId,
        sourceId: 'phase-A',
        targetId: 'phase-B',
        relationType: 'depends_on',
      });

      await service.linkEntities({
        planId,
        sourceId: 'phase-B',
        targetId: 'phase-C',
        relationType: 'depends_on',
      });

      // This would create A -> B -> C -> A cycle
      await expect(
        service.linkEntities({
          planId,
          sourceId: 'phase-C',
          targetId: 'phase-A',
          relationType: 'depends_on',
        })
      ).rejects.toThrow('Circular dependency');
    });

    it('should allow non-depends_on links without cycle check', async () => {
      // This is fine - alternative_to is not a dependency
      await service.linkEntities({
        planId,
        sourceId: 'sol-001',
        targetId: 'sol-002',
        relationType: 'alternative_to',
      });

      const result = await service.linkEntities({
        planId,
        sourceId: 'sol-002',
        targetId: 'sol-001',
        relationType: 'alternative_to',
      });

      expect(result.linkId).toBeDefined();
    });
  });

  describe('get_entity_links', () => {
    beforeEach(async () => {
      // Create some links
      await service.linkEntities({
        planId,
        sourceId: 'sol-001',
        targetId: 'req-001',
        relationType: 'implements',
      });
      await service.linkEntities({
        planId,
        sourceId: 'sol-002',
        targetId: 'req-001',
        relationType: 'implements',
      });
      await service.linkEntities({
        planId,
        sourceId: 'phase-001',
        targetId: 'req-001',
        relationType: 'addresses',
      });
    });

    it('should get all links for entity', async () => {
      const result = await service.getEntityLinks({
        planId,
        entityId: 'req-001',
      });

      expect(result.links).toHaveLength(3);
      expect(result.incoming).toHaveLength(3);
      expect(result.outgoing).toHaveLength(0);
    });

    it('should filter by direction', async () => {
      const result = await service.getEntityLinks({
        planId,
        entityId: 'sol-001',
        direction: 'outgoing',
      });

      expect(result.links).toHaveLength(1);
      expect(result.outgoing).toHaveLength(1);
      expect(result.incoming).toHaveLength(0);
    });

    it('should filter by relation type', async () => {
      const result = await service.getEntityLinks({
        planId,
        entityId: 'req-001',
        relationType: 'implements',
      });

      expect(result.incoming).toHaveLength(2);
    });
  });

  describe('unlink_entities', () => {
    it('should delete link by id', async () => {
      const created = await service.linkEntities({
        planId,
        sourceId: 'sol-001',
        targetId: 'req-001',
        relationType: 'implements',
      });

      const result = await service.unlinkEntities({
        planId,
        linkId: created.linkId,
      });

      expect(result.success).toBe(true);
      expect(result.deletedLinkIds).toContain(created.linkId);

      const links = await service.getEntityLinks({ planId, entityId: 'req-001' });
      expect(links.links).toHaveLength(0);
    });

    it('should delete by source/target/type', async () => {
      await service.linkEntities({
        planId,
        sourceId: 'sol-001',
        targetId: 'req-001',
        relationType: 'implements',
      });

      const result = await service.unlinkEntities({
        planId,
        sourceId: 'sol-001',
        targetId: 'req-001',
        relationType: 'implements',
      });

      expect(result.success).toBe(true);
      expect(result.deletedLinkIds).toHaveLength(1);
    });
  });

  describe('helper methods', () => {
    it('should get all links for entity', async () => {
      await service.linkEntities({
        planId,
        sourceId: 'sol-001',
        targetId: 'req-001',
        relationType: 'implements',
      });

      const links = await service.getLinksForEntity(planId, 'sol-001');
      expect(links).toHaveLength(1);
    });

    it('should delete all links for entity', async () => {
      await service.linkEntities({
        planId,
        sourceId: 'sol-001',
        targetId: 'req-001',
        relationType: 'implements',
      });
      await service.linkEntities({
        planId,
        sourceId: 'sol-001',
        targetId: 'req-002',
        relationType: 'implements',
      });

      const deleted = await service.deleteLinksForEntity(planId, 'sol-001');
      expect(deleted).toBe(2);

      const remaining = await service.getLinksForEntity(planId, 'sol-001');
      expect(remaining).toHaveLength(0);
    });
  });

  describe('minimal return values (Sprint 6)', () => {
    describe('linkEntities should return only linkId', () => {
      it('should not include full link object in result', async () => {
        const result = await service.linkEntities({
          planId,
          sourceId: 'sol-001',
          targetId: 'req-001',
          relationType: 'implements',
        });

        expect(result.linkId).toBeDefined();
        expect(result).not.toHaveProperty('link');
      });
    });
  });
});
