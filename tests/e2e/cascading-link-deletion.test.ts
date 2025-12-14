import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { handleToolCall } from '../../src/server/handlers/index.js';
import {
  createTestContext,
  cleanupTestContext,
  type TestContext,
} from '../helpers/test-utils.js';

/**
 * RED PHASE - BUG-015: Cascading Link Deletion
 *
 * E2E tests verifying that when entities are deleted, their associated links are also deleted.
 * Tests cover: Phase, Decision, and Artifact deletion with link cleanup.
 *
 * These tests should FAIL initially, then PASS after GREEN phase fixes.
 */

describe('E2E: Cascading Link Deletion (BUG-015)', () => {
  let ctx: TestContext;
  let planId: string;

  beforeAll(async () => {
    ctx = await createTestContext('cascading-links');

    // Create test plan
    const planResult = await handleToolCall(
      'plan',
      {
        action: 'create',
        name: 'Cascading Link Test Plan',
        description: 'Testing BUG-015 cascading link deletion',
      },
      ctx.services
    );
    const plan = JSON.parse(planResult.content[0].text);
    planId = plan.planId;
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  // BUG-015: Test Phase deletion with link cleanup
  it('RED: should delete links when phase is deleted', async () => {
    // Step 1: Create two phases
    const phaseAResult = await handleToolCall(
      'phase',
      {
        action: 'add',
        planId,
        phase: {
          title: 'Phase A',
          objectives: ['Test phase A'],
        },
      },
      ctx.services
    );
    const phaseA = JSON.parse(phaseAResult.content[0].text);

    const phaseBResult = await handleToolCall(
      'phase',
      {
        action: 'add',
        planId,
        phase: {
          title: 'Phase B',
          objectives: ['Test phase B'],
        },
      },
      ctx.services
    );
    const phaseB = JSON.parse(phaseBResult.content[0].text);

    // Step 2: Create link: Phase A depends_on Phase B
    const linkResult = await handleToolCall(
      'link',
      {
        action: 'create',
        planId,
        sourceId: phaseA.phaseId,
        targetId: phaseB.phaseId,
        relationType: 'depends_on',
      },
      ctx.services
    );
    const link = JSON.parse(linkResult.content[0].text);
    expect(link.linkId).toBeDefined();

    // Step 3: Verify link exists
    const linksBefore = await handleToolCall(
      'link',
      {
        action: 'get',
        planId,
        entityId: phaseA.phaseId,
      },
      ctx.services
    );
    const linksBeforeParsed = JSON.parse(linksBefore.content[0].text);
    expect(linksBeforeParsed.links.length).toBe(1);

    // Step 4: Delete Phase A
    await handleToolCall(
      'phase',
      {
        action: 'delete',
        planId,
        phaseId: phaseA.phaseId,
      },
      ctx.services
    );

    // Step 5: Verify links are deleted (RED: This will FAIL before fix)
    const linksAfter = await handleToolCall(
      'link',
      {
        action: 'get',
        planId,
        entityId: phaseA.phaseId,
      },
      ctx.services
    );
    const linksAfterParsed = JSON.parse(linksAfter.content[0].text);

    // RED: Expected 0 links, but will find 1 orphan link before fix
    expect(linksAfterParsed.links.length).toBe(0);
  });

  it('RED: should delete links when target phase is deleted', async () => {
    // Step 1: Create two phases
    const phaseCResult = await handleToolCall(
      'phase',
      {
        action: 'add',
        planId,
        phase: {
          title: 'Phase C',
          objectives: ['Test phase C'],
        },
      },
      ctx.services
    );
    const phaseC = JSON.parse(phaseCResult.content[0].text);

    const phaseDResult = await handleToolCall(
      'phase',
      {
        action: 'add',
        planId,
        phase: {
          title: 'Phase D',
          objectives: ['Test phase D'],
        },
      },
      ctx.services
    );
    const phaseD = JSON.parse(phaseDResult.content[0].text);

    // Step 2: Create link: Phase C depends_on Phase D
    await handleToolCall(
      'link',
      {
        action: 'create',
        planId,
        sourceId: phaseC.phaseId,
        targetId: phaseD.phaseId,
        relationType: 'depends_on',
      },
      ctx.services
    );

    // Step 3: Delete Phase D (target of link)
    await handleToolCall(
      'phase',
      {
        action: 'delete',
        planId,
        phaseId: phaseD.phaseId,
      },
      ctx.services
    );

    // Step 4: Verify orphan link is deleted
    const linksAfter = await handleToolCall(
      'link',
      {
        action: 'get',
        planId,
        entityId: phaseC.phaseId,
      },
      ctx.services
    );
    const linksAfterParsed = JSON.parse(linksAfter.content[0].text);

    // RED: Orphan link should be deleted
    expect(linksAfterParsed.outgoing.length).toBe(0);
  });

  it('RED: should delete links when artifact is deleted', async () => {
    // Step 1: Create requirement (for artifact relation)
    const reqResult = await handleToolCall(
      'requirement',
      {
        action: 'add',
        planId,
        requirement: {
          title: 'Test Requirement',
          category: 'functional',
          priority: 'high',
          source: { type: 'user-request' },
          impact: { scope: ['api'], complexityEstimate: 3, riskLevel: 'low' },
        },
      },
      ctx.services
    );
    const req = JSON.parse(reqResult.content[0].text);

    // Step 2: Create artifact
    const artifactResult = await handleToolCall(
      'artifact',
      {
        action: 'add',
        planId,
        artifact: {
          title: 'Test Artifact',
          description: 'Test code artifact',
          artifactType: 'code',
          status: 'draft',
          content: {
            sourceCode: 'console.log("test");',
            language: 'javascript',
            filename: 'test.js',
          },
        },
      },
      ctx.services
    );
    const artifact = JSON.parse(artifactResult.content[0].text);

    // Step 3: Create link: Artifact has_artifact Requirement
    await handleToolCall(
      'link',
      {
        action: 'create',
        planId,
        sourceId: artifact.artifactId,
        targetId: req.requirementId,
        relationType: 'has_artifact',
      },
      ctx.services
    );

    // Step 4: Delete artifact
    await handleToolCall(
      'artifact',
      {
        action: 'delete',
        planId,
        artifactId: artifact.artifactId,
      },
      ctx.services
    );

    // Step 5: Verify link is deleted (RED: This will FAIL before fix)
    const linksAfter = await handleToolCall(
      'link',
      {
        action: 'get',
        planId,
        entityId: artifact.artifactId,
      },
      ctx.services
    );
    const linksAfterParsed = JSON.parse(linksAfter.content[0].text);

    // RED: Expected 0 links after artifact deletion
    expect(linksAfterParsed.links.length).toBe(0);
  });
});
