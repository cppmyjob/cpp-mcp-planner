import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Link, RelationType } from '@mcp-planner/core';
import { FileLinkRepository, FileLockManager } from '@mcp-planner/core';

describe('FileLinkRepository', () => {
  // FIX M-4: Use os.tmpdir() instead of process.cwd()
  const testDir = path.join(os.tmpdir(), `test-${Date.now().toString()}-file-link-repository`);
  const planId = 'test-plan-1';

  let repository: FileLinkRepository;
  let lockManager: FileLockManager;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    lockManager = new FileLockManager(testDir);
    await lockManager.initialize();
    repository = new FileLinkRepository(testDir, planId, lockManager);
    await repository.initialize();
  });

  afterEach(async () => {
    await lockManager.dispose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // Helper to create test link
  const createTestLink = (
    sourceId: string,
    targetId: string,
    relationType: RelationType
  ): Omit<Link, 'id' | 'createdAt' | 'createdBy'> => ({
    sourceId,
    targetId,
    relationType,
    metadata: { test: true },
  });

  describe('REVIEW: Initialization', () => {
    it('should create FileLinkRepository instance', () => {
      expect(repository).toBeDefined();
    });

    it('should initialize with FileLockManager', () => {
      expect(lockManager.isInitialized()).toBe(true);
    });

    it('should initialize storage directories', async () => {
      const planDir = path.join(testDir, 'plans', planId);
      const linksDir = path.join(planDir, 'links');
      const indexesDir = path.join(planDir, 'indexes');

      const [linksExists, indexesExists] = await Promise.all([
        fs.access(linksDir).then(() => true).catch(() => false),
        fs.access(indexesDir).then(() => true).catch(() => false),
      ]);

      expect(linksExists).toBe(true);
      expect(indexesExists).toBe(true);
    });
  });

  describe('REVIEW: CRUD - Create', () => {
    it('should create new link', async () => {
      const linkData = createTestLink('req-1', 'sol-1', 'implements');
      const created = await repository.createLink(linkData);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.sourceId).toBe('req-1');
      expect(created.targetId).toBe('sol-1');
      expect(created.relationType).toBe('implements');
      expect(created.createdAt).toBeDefined();
      expect(created.createdBy).toBeDefined();
    });

    it('should throw ConflictError if link already exists', async () => {
      const linkData = createTestLink('req-1', 'sol-1', 'implements');
      await repository.createLink(linkData);

      await expect(repository.createLink(linkData)).rejects.toThrow(/already exists|conflict/i);
    });

    it('should update index on create (source index)', async () => {
      const linkData = createTestLink('req-1', 'sol-1', 'implements');
      const created = await repository.createLink(linkData);

      const bySource = await repository.findLinksBySource('req-1');
      expect(bySource).toHaveLength(1);
      expect(bySource[0].id).toBe(created.id);
    });

    it('should update index on create (target index)', async () => {
      const linkData = createTestLink('req-1', 'sol-1', 'implements');
      const created = await repository.createLink(linkData);

      const byTarget = await repository.findLinksByTarget('sol-1');
      expect(byTarget).toHaveLength(1);
      expect(byTarget[0].id).toBe(created.id);
    });

    it('should validate link data before create', async () => {
      const invalid = { sourceId: '', targetId: 'sol-1', relationType: 'implements' as RelationType };
      await expect(repository.createLink(invalid)).rejects.toThrow(/validation/i);
    });

    it('should use FileLockManager during create', async () => {
      // This test verifies that FileLockManager is used
      // If implementation doesn't use locks, concurrent creates could cause race conditions
      const promises = [
        repository.createLink(createTestLink('req-1', 'sol-1', 'implements')),
        repository.createLink(createTestLink('req-2', 'sol-2', 'implements')),
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(2);
      expect(results[0].id).not.toBe(results[1].id);
    });
  });

  describe('REVIEW: CRUD - Read', () => {
    it('should find link by ID', async () => {
      const linkData = createTestLink('req-1', 'sol-1', 'implements');
      const created = await repository.createLink(linkData);

      const found = await repository.getLinkById(created.id);
      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.sourceId).toBe('req-1');
      expect(found.targetId).toBe('sol-1');
    });

    it('should throw NotFoundError if link not found', async () => {
      await expect(repository.getLinkById('non-existent')).rejects.toThrow(/not found/i);
    });

    it('should check if link exists by composite key', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));

      expect(await repository.linkExists('req-1', 'sol-1', 'implements')).toBe(true);
      expect(await repository.linkExists('req-1', 'sol-2', 'implements')).toBe(false);
      expect(await repository.linkExists('req-1', 'sol-1', 'addresses')).toBe(false);
    });

    it('should find links by source ID', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('req-1', 'sol-2', 'implements'));
      await repository.createLink(createTestLink('req-2', 'sol-3', 'implements'));

      const links = await repository.findLinksBySource('req-1');
      expect(links).toHaveLength(2);
      expect(links.every((l: Link) => l.sourceId === 'req-1')).toBe(true);
    });

    it('should find links by source ID and relation type', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('req-1', 'phase-1', 'addresses'));
      await repository.createLink(createTestLink('req-2', 'sol-2', 'implements'));

      const links = await repository.findLinksBySource('req-1', 'implements');
      expect(links).toHaveLength(1);
      expect(links[0].relationType).toBe('implements');
    });

    it('should find links by target ID', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('req-2', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('req-3', 'sol-2', 'implements'));

      const links = await repository.findLinksByTarget('sol-1');
      expect(links).toHaveLength(2);
      expect(links.every((l: Link) => l.targetId === 'sol-1')).toBe(true);
    });

    it('should find links by target ID and relation type', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('phase-1', 'sol-1', 'addresses'));
      await repository.createLink(createTestLink('req-2', 'sol-2', 'implements'));

      const links = await repository.findLinksByTarget('sol-1', 'implements');
      expect(links).toHaveLength(1);
      expect(links[0].relationType).toBe('implements');
    });

    it('should find links by entity ID (both directions)', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('sol-1', 'phase-1', 'addresses'));
      await repository.createLink(createTestLink('req-2', 'sol-2', 'implements'));

      const links = await repository.findLinksByEntity('sol-1', 'both');
      expect(links).toHaveLength(2);
    });

    it('should find links by entity ID (outgoing only)', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('sol-1', 'phase-1', 'addresses'));

      const links = await repository.findLinksByEntity('sol-1', 'outgoing');
      expect(links).toHaveLength(1);
      expect(links[0].sourceId).toBe('sol-1');
    });

    it('should find links by entity ID (incoming only)', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('sol-1', 'phase-1', 'addresses'));

      const links = await repository.findLinksByEntity('sol-1', 'incoming');
      expect(links).toHaveLength(1);
      expect(links[0].targetId).toBe('sol-1');
    });
  });

  describe('REVIEW: CRUD - Delete', () => {
    it('should delete link by ID', async () => {
      const created = await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));

      await repository.deleteLink(created.id);

      await expect(repository.getLinkById(created.id)).rejects.toThrow(/not found/i);
    });

    it('should update indexes on delete', async () => {
      const created = await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));

      await repository.deleteLink(created.id);

      const bySource = await repository.findLinksBySource('req-1');
      expect(bySource).toHaveLength(0);

      const byTarget = await repository.findLinksByTarget('sol-1');
      expect(byTarget).toHaveLength(0);
    });

    it('should delete all links for entity', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('sol-1', 'phase-1', 'addresses'));
      await repository.createLink(createTestLink('req-2', 'sol-1', 'implements'));

      const count = await repository.deleteLinksForEntity('sol-1');
      expect(count).toBe(3); // All links where sol-1 is source or target

      const remaining = await repository.findLinksByEntity('sol-1', 'both');
      expect(remaining).toHaveLength(0);
    });

    it('should use FileLockManager during delete', async () => {
      const link1 = await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      const link2 = await repository.createLink(createTestLink('req-2', 'sol-2', 'implements'));

      // Concurrent deletes should be safe with FileLockManager
      const promises = [
        repository.deleteLink(link1.id),
        repository.deleteLink(link2.id),
      ];

      await Promise.all(promises);

      await expect(repository.getLinkById(link1.id)).rejects.toThrow();
      await expect(repository.getLinkById(link2.id)).rejects.toThrow();
    });
  });

  describe('REVIEW: Bulk Operations (createMany)', () => {
    it('should create multiple links at once', async () => {
      const links = [
        createTestLink('req-1', 'sol-1', 'implements'),
        createTestLink('req-2', 'sol-2', 'implements'),
        createTestLink('req-3', 'sol-3', 'implements'),
      ];

      const created = await repository.createMany(links);
      expect(created).toHaveLength(3);
      expect(created.every((l: Link) => Boolean(l.id) && Boolean(l.createdAt))).toBe(true);
    });

    it('should rollback all on createMany failure', async () => {
      const links = [
        createTestLink('req-1', 'sol-1', 'implements'),
        { sourceId: '', targetId: 'sol-2', relationType: 'implements' as RelationType }, // Invalid
      ];

      await expect(repository.createMany(links)).rejects.toThrow();

      // Verify rollback - no links should exist
      const allLinks = await repository.findLinksBySource('req-1');
      expect(allLinks).toHaveLength(0);
    });

    it('should update all indexes on createMany', async () => {
      const links = [
        createTestLink('req-1', 'sol-1', 'implements'),
        createTestLink('req-1', 'sol-2', 'implements'),
      ];

      await repository.createMany(links);

      const bySource = await repository.findLinksBySource('req-1');
      expect(bySource).toHaveLength(2);
    });
  });

  describe('REVIEW: Bulk Operations (deleteMany)', () => {
    it('should delete multiple links by IDs', async () => {
      const link1 = await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      const link2 = await repository.createLink(createTestLink('req-2', 'sol-2', 'implements'));
      const link3 = await repository.createLink(createTestLink('req-3', 'sol-3', 'implements'));

      const count = await repository.deleteMany([link1.id, link2.id]);
      expect(count).toBe(2);

      await expect(repository.getLinkById(link1.id)).rejects.toThrow();
      await expect(repository.getLinkById(link2.id)).rejects.toThrow();

      const link3Exists = await repository.getLinkById(link3.id);
      expect(link3Exists).toBeDefined();
    });

    it('should update indexes on deleteMany', async () => {
      const link1 = await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      const link2 = await repository.createLink(createTestLink('req-1', 'sol-2', 'implements'));

      await repository.deleteMany([link1.id, link2.id]);

      const bySource = await repository.findLinksBySource('req-1');
      expect(bySource).toHaveLength(0);
    });

    it('should delete links by filter (sourceId)', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('req-1', 'sol-2', 'implements'));
      await repository.createLink(createTestLink('req-2', 'sol-3', 'implements'));

      const count = await repository.deleteMany({ sourceId: 'req-1' });
      expect(count).toBe(2);

      const remaining = await repository.findLinksBySource('req-1');
      expect(remaining).toHaveLength(0);

      const req2Links = await repository.findLinksBySource('req-2');
      expect(req2Links).toHaveLength(1);
    });

    it('should delete links by filter (targetId)', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('req-2', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('req-3', 'sol-2', 'implements'));

      const count = await repository.deleteMany({ targetId: 'sol-1' });
      expect(count).toBe(2);

      const remaining = await repository.findLinksByTarget('sol-1');
      expect(remaining).toHaveLength(0);
    });

    it('should delete links by filter (relationType)', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('phase-1', 'req-1', 'addresses'));
      await repository.createLink(createTestLink('req-2', 'sol-2', 'implements'));

      const count = await repository.deleteMany({ relationType: 'implements' });
      expect(count).toBe(2);

      const addresses = await repository.findLinksByEntity('req-1', 'both');
      expect(addresses).toHaveLength(1);
      expect(addresses[0].relationType).toBe('addresses');
    });
  });

  describe('REVIEW: Concurrent Operations with FileLockManager', () => {
    it('should handle concurrent creates safely', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        repository.createLink(createTestLink(`req-${i.toString()}`, `sol-${i.toString()}`, 'implements'))
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);

      // All IDs should be unique
      const ids = results.map((r: Link) => r.id);
      expect(new Set(ids).size).toBe(10);
    });

    it('should handle concurrent deletes safely', async () => {
      const links = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          repository.createLink(createTestLink(`req-${i.toString()}`, `sol-${i.toString()}`, 'implements'))
        )
      );

      const deletePromises = links.map((l: Link) => repository.deleteLink(l.id));
      await Promise.all(deletePromises);

      for (const link of links) {
        await expect(repository.getLinkById(link.id)).rejects.toThrow();
      }
    });

    it('should handle mixed concurrent operations', async () => {
      const link1 = await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));

      const promises = [
        repository.createLink(createTestLink('req-2', 'sol-2', 'implements')),
        repository.getLinkById(link1.id),
        repository.findLinksBySource('req-1'),
        repository.deleteLink(link1.id),
      ];

      // Should not throw errors due to race conditions
      // FileLockManager should serialize conflicting operations
      await expect(Promise.all(promises)).resolves.toBeDefined();
    });
  });

  describe('REVIEW: Index Consistency', () => {
    it('should maintain source index consistency after multiple operations', async () => {
      const link1 = await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('req-1', 'sol-2', 'implements'));
      await repository.createLink(createTestLink('req-1', 'sol-3', 'implements'));

      await repository.deleteLink(link1.id);

      const links = await repository.findLinksBySource('req-1');
      expect(links).toHaveLength(2);
      expect(links.map((l: Link) => l.id)).not.toContain(link1.id);
    });

    it('should maintain target index consistency after multiple operations', async () => {
      const link1 = await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('req-2', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('req-3', 'sol-1', 'implements'));

      await repository.deleteLink(link1.id);

      const links = await repository.findLinksByTarget('sol-1');
      expect(links).toHaveLength(2);
      expect(links.map((l: Link) => l.id)).not.toContain(link1.id);
    });

    it('should maintain index consistency with createMany and deleteMany', async () => {
      const created = await repository.createMany([
        createTestLink('req-1', 'sol-1', 'implements'),
        createTestLink('req-1', 'sol-2', 'implements'),
        createTestLink('req-2', 'sol-3', 'implements'),
      ]);

      await repository.deleteMany([created[0].id, created[1].id]);

      const req1Links = await repository.findLinksBySource('req-1');
      expect(req1Links).toHaveLength(0);

      const req2Links = await repository.findLinksBySource('req-2');
      expect(req2Links).toHaveLength(1);
    });
  });

  describe('REVIEW: LinkIndexMetadata', () => {
    it('should store composite key in index (sourceId+targetId+relationType)', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));

      // This verifies LinkIndexMetadata structure
      // Index should allow efficient lookups by source, target, and relation type
      const exists = await repository.linkExists('req-1', 'sol-1', 'implements');
      expect(exists).toBe(true);

      // Different relation type = different link
      const existsDifferentType = await repository.linkExists('req-1', 'sol-1', 'addresses');
      expect(existsDifferentType).toBe(false);
    });

    it('should support efficient queries by relation type', async () => {
      await repository.createLink(createTestLink('req-1', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('req-2', 'sol-1', 'implements'));
      await repository.createLink(createTestLink('phase-1', 'sol-1', 'addresses'));

      const implementsLinks = await repository.findLinksByTarget('sol-1', 'implements');
      expect(implementsLinks).toHaveLength(2);

      const addressesLinks = await repository.findLinksByTarget('sol-1', 'addresses');
      expect(addressesLinks).toHaveLength(1);
    });
  });

  // ============================================================================
  // REVIEW: RelationType Enum Validation (Code Review Issue H-2)
  // ============================================================================
  describe('REVIEW: RelationType Enum Validation', () => {
    it('should reject invalid relationType values', async () => {
      const invalidLink = {
        sourceId: 'req-1',
        targetId: 'sol-1',
        relationType: 'invalid_type' as RelationType, // Not a valid RelationType
      };

      await expect(repository.createLink(invalidLink)).rejects.toThrow(/validation|relationType/i);
    });

    it('should accept all valid RelationType values', async () => {
      const validTypes = [
        'implements', 'addresses', 'depends_on', 'blocks',
        'alternative_to', 'supersedes', 'references', 'derived_from', 'has_artifact'
      ];

      for (let i = 0; i < validTypes.length; i++) {
        const link = {
          sourceId: `src-${i.toString()}`,
          targetId: `tgt-${i.toString()}`,
          relationType: validTypes[i] as RelationType,
        };
        const created = await repository.createLink(link);
        expect(created.relationType).toBe(validTypes[i]);
      }
    });
  });

  // ============================================================================
  // RED: Race Condition in deleteLink (Code Review Issue H-2)
  // ============================================================================
  describe('RED: TOCTOU Race in deleteLink (H-2)', () => {
    it('should handle concurrent deleteLink calls on same ID without errors', async () => {
      // This test exposes the TOCTOU race in deleteLink where:
      // 1. metadata is fetched OUTSIDE the lock
      // 2. Two concurrent deletes both get metadata
      // 3. First delete removes file and index entry
      // 4. Second delete tries to use stale metadata -> ENOENT or index corruption

      const link = await repository.createLink({
        sourceId: 'delete-race-1',
        targetId: 'delete-target-1',
        relationType: 'implements',
      });

      // Launch concurrent deletes on SAME link ID
      const concurrentDeletes = 10;
      const promises = Array.from({ length: concurrentDeletes }, () =>
        repository.deleteLink(link.id).catch((e: unknown) => e)
      );

      const results = await Promise.all(promises);

      // Count successes and failures
      const successes = results.filter((r) => r === undefined);
      const errors = results.filter((r): r is Error => r instanceof Error);

      // EXPECTED: Exactly 1 success, rest should fail with NotFoundError
      // BUG: With TOCTOU race, may get ENOENT errors or index corruption
      expect(successes.length).toBe(1);
      expect(errors.length).toBe(concurrentDeletes - 1);

      // All errors should be NotFoundError (already deleted)
      for (const error of errors) {
        expect(error.message).toMatch(/not found/i);
      }

      // Verify link is deleted
      await expect(repository.getLinkById(link.id)).rejects.toThrow(/not found/i);
    });
  });

  // ============================================================================
  // RED: Race Condition Test (Code Review Issue H-1)
  // ============================================================================
  describe('RED: Race Condition in createLink (H-1)', () => {
    it('should NOT allow duplicate links when concurrent createLink calls race', async () => {
      // This test exposes the TOCTOU race condition where:
      // 1. Two concurrent calls both pass linkExists() check
      // 2. Both proceed to create the same composite key link
      // 3. Result: duplicate data or index corruption

      const linkData = {
        sourceId: 'race-req-1',
        targetId: 'race-sol-1',
        relationType: 'implements' as const,
      };

      // Launch many concurrent creates with SAME composite key
      // With the race condition bug, some may succeed when they shouldn't
      const concurrentAttempts = 20;
      const promises = Array.from({ length: concurrentAttempts }, () =>
        repository.createLink(linkData).catch((e: unknown) => e)
      );

      const results = await Promise.all(promises);

      // Count successes and failures
      const successes = results.filter((r): r is Link => !(r instanceof Error));
      const failures = results.filter((r): r is Error => r instanceof Error);

      // EXPECTED: Exactly 1 success, rest should fail with ConflictError
      // BUG: With race condition, multiple may succeed
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(concurrentAttempts - 1);

      // All failures should be ConflictError (duplicate)
      for (const failure of failures) {
        expect(failure.message).toMatch(/already exists|conflict|duplicate/i);
      }

      // Verify only one link exists in storage
      const allLinks = await repository.findLinksBySource('race-req-1');
      expect(allLinks.length).toBe(1);
    });
  });
});
