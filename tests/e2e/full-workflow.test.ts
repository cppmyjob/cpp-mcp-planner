import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { handleToolCall } from '../../src/server/handlers/index.js';
import {
  createTestContext,
  cleanupTestContext,
  type TestContext,
} from '../helpers/test-utils.js';

/**
 * Integration workflow test that simulates a complete planning scenario.
 *
 * NOTE: This test calls handleToolCall() directly, bypassing MCP transport.
 * For E2E tests through the actual MCP protocol, see tests/e2e/mcp-all-tools.test.ts
 *
 * This test demonstrates a realistic workflow:
 * 1. Create a plan
 * 2. Add requirements
 * 3. Propose multiple solutions
 * 4. Compare and select a solution
 * 5. Record decisions
 * 6. Create phases with hierarchy
 * 7. Link entities together
 * 8. Query and validate the plan
 * 9. Export the complete plan
 */
describe('E2E: Complete Planning Workflow', () => {
  let ctx: TestContext;
  let planId: string;
  const requirementIds: string[] = [];
  const solutionIds: string[] = [];
  const decisionIds: string[] = [];
  const phaseIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestContext('e2e-workflow');
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  describe('Step 1: Plan Creation', () => {
    it('should create a new project plan', async () => {
      const result = await handleToolCall(
        'plan',
        {
          action: 'create',
          name: 'User Authentication System',
          description: 'Implement a secure authentication system with OAuth support',
          author: 'e2e-test',
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.planId).toBeDefined();
      planId = parsed.planId;

      // Verify via get
      const getResult = await handleToolCall(
        'plan',
        { action: 'get', planId },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.plan.manifest.name).toBe('User Authentication System');
    });

    it('should set the plan as active', async () => {
      const result = await handleToolCall(
        'plan',
        { action: 'set_active', planId, workspacePath: '/e2e-test-workspace' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Step 2: Requirements Gathering', () => {
    it('should add functional requirements', async () => {
      const requirements = [
        {
          title: 'User Registration',
          description: 'Users must be able to register with email and password',
          source: { type: 'user-request' },
          acceptanceCriteria: [
            'Email validation',
            'Password strength requirements',
            'Confirmation email sent',
          ],
          priority: 'high',
          category: 'functional',
        },
        {
          title: 'OAuth Integration',
          description: 'Support login via Google and GitHub',
          source: { type: 'user-request' },
          acceptanceCriteria: [
            'Google OAuth works',
            'GitHub OAuth works',
            'Account linking supported',
          ],
          priority: 'medium',
          category: 'functional',
        },
        {
          title: 'Session Management',
          description: 'Secure session handling with JWT tokens',
          source: { type: 'discovered', context: 'Authentication security analysis' }, // BUG-011 FIX: Changed from 'derived' without parentId
          acceptanceCriteria: [
            'JWT tokens issued on login',
            'Refresh token rotation',
            'Session revocation',
          ],
          priority: 'high',
          category: 'technical',
        },
      ];

      for (const req of requirements) {
        const result = await handleToolCall(
          'requirement',
          { action: 'add', planId, requirement: req },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.requirementId).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        requirementIds.push(parsed.requirementId);
      }

      expect(requirementIds).toHaveLength(3);
    });

    it('should list all requirements', async () => {
      const result = await handleToolCall(
        'requirement',
        { action: 'list', planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.requirements).toHaveLength(3);
    });
  });

  describe('Step 3: Solution Design', () => {
    it('should propose multiple authentication solutions', async () => {
      const solutions = [
        {
          title: 'Custom JWT Implementation',
          description: 'Build authentication from scratch using JWT',
          approach: 'Implement custom JWT generation and validation with refresh tokens',
          addressing: [requirementIds[0], requirementIds[2]],
          tradeoffs: [
            {
              aspect: 'Control',
              pros: ['Full control over implementation'],
              cons: ['More code to maintain'],
            },
          ],
          evaluation: {
            effortEstimate: { value: 10, unit: 'days', confidence: 'medium' },
            technicalFeasibility: 'high',
            riskAssessment: 'Medium - requires security expertise',
          },
        },
        {
          title: 'Auth0 Integration',
          description: 'Use Auth0 as managed authentication service',
          approach: 'Integrate Auth0 SDK for all authentication flows',
          addressing: requirementIds,
          tradeoffs: [
            {
              aspect: 'Cost',
              pros: ['Faster implementation'],
              cons: ['Monthly subscription cost'],
            },
          ],
          evaluation: {
            effortEstimate: { value: 3, unit: 'days', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low - battle-tested solution',
          },
        },
        {
          title: 'Passport.js with Custom Backend',
          description: 'Use Passport.js strategies with custom session store',
          approach: 'Leverage Passport.js for OAuth, custom JWT for sessions',
          addressing: requirementIds,
          tradeoffs: [
            {
              aspect: 'Flexibility',
              pros: ['Many strategy options'],
              cons: ['Configuration complexity'],
            },
          ],
          evaluation: {
            effortEstimate: { value: 5, unit: 'days', confidence: 'medium' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low - well-documented library',
          },
        },
      ];

      for (const sol of solutions) {
        const result = await handleToolCall(
          'solution',
          { action: 'propose', planId, solution: sol },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.solutionId).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        solutionIds.push(parsed.solutionId);
      }

      expect(solutionIds).toHaveLength(3);
    });

    it('should compare all solutions', async () => {
      const result = await handleToolCall(
        'solution',
        { action: 'compare', planId, solutionIds },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.comparison).toBeDefined();
      expect(parsed.comparison.solutions).toHaveLength(3);
    });

    it('should select the best solution', async () => {
      const result = await handleToolCall(
        'solution',
        {
          action: 'select',
          planId,
          solutionId: solutionIds[2], // Passport.js solution
          reason: 'Best balance of effort, flexibility, and maintainability',
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await handleToolCall(
        'solution',
        { action: 'get', planId, solutionId: solutionIds[2] },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.solution.status).toBe('selected');
    });
  });

  describe('Step 4: Decision Recording', () => {
    it('should record architectural decisions', async () => {
      const decisions = [
        {
          title: 'Token Storage Strategy',
          question: 'How should JWT tokens be stored on the client?',
          context: 'Need secure storage that prevents XSS attacks',
          decision: 'Use httpOnly cookies for refresh tokens, memory for access tokens',
          alternativesConsidered: [
            {
              option: 'localStorage',
              reasoning: 'Rejected due to XSS vulnerability',
            },
            {
              option: 'sessionStorage',
              reasoning: 'Rejected - tokens lost on tab close',
            },
          ],
          consequences: 'Requires CSRF protection. More secure against XSS.',
        },
        {
          title: 'Password Hashing Algorithm',
          question: 'Which algorithm for password hashing?',
          context: 'Need secure, industry-standard hashing',
          decision: 'Use bcrypt with cost factor 12',
          alternativesConsidered: [
            {
              option: 'Argon2',
              reasoning: 'Considered but less library support',
            },
            {
              option: 'PBKDF2',
              reasoning: 'Rejected - bcrypt more resistant to GPU attacks',
            },
          ],
          consequences: 'Proven security. Good library support.',
        },
      ];

      for (const dec of decisions) {
        const result = await handleToolCall(
          'decision',
          { action: 'record', planId, decision: dec },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.decisionId).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        decisionIds.push(parsed.decisionId);
      }

      expect(decisionIds).toHaveLength(2);
    });
  });

  describe('Step 5: Phase Planning', () => {
    it('should create implementation phases with hierarchy', async () => {
      // Create parent phase
      const mainPhaseResult = await handleToolCall(
        'phase',
        {
          action: 'add',
          planId,
          phase: {
            title: 'Phase 1: Core Authentication',
            description: 'Implement basic authentication infrastructure',
            objectives: ['Set up auth service', 'Implement user model', 'Create login/register endpoints'],
            deliverables: ['Auth service module', 'User database schema', 'REST API endpoints'],
            successCriteria: ['All unit tests pass', 'Security audit passed'],
          },
        },
        ctx.services
      );

      const mainPhase = JSON.parse(mainPhaseResult.content[0].text);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      phaseIds.push(mainPhase.phaseId);

      // Create child phases
      const subPhases = [
        {
          title: 'Task 1.1: Database Setup',
          description: 'Create user schema and migrations',
          objectives: ['Define user model', 'Create migrations'],
          deliverables: ['User table', 'Migration scripts'],
          successCriteria: ['Migrations run successfully'],
          parentId: mainPhase.phaseId,
        },
        {
          title: 'Task 1.2: JWT Implementation',
          description: 'Implement JWT token handling',
          objectives: ['Token generation', 'Token validation', 'Refresh logic'],
          deliverables: ['JWT utility module'],
          successCriteria: ['Tokens work correctly'],
          parentId: mainPhase.phaseId,
        },
        {
          title: 'Task 1.3: API Endpoints',
          description: 'Create authentication API',
          objectives: ['Login endpoint', 'Register endpoint', 'Logout endpoint'],
          deliverables: ['REST API routes'],
          successCriteria: ['API tests pass'],
          parentId: mainPhase.phaseId,
        },
      ];

      for (const phase of subPhases) {
        const result = await handleToolCall(
          'phase',
          { action: 'add', planId, phase },
          ctx.services
        );

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.phaseId).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        phaseIds.push(parsed.phaseId);
      }

      expect(phaseIds).toHaveLength(4);
    });

    it('should retrieve the phase tree', async () => {
      const result = await handleToolCall(
        'phase',
        { action: 'get_tree', planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tree).toBeDefined();
      expect(parsed.tree.length).toBeGreaterThan(0);
    });

    it('should update phase status to in_progress', async () => {
      const result = await handleToolCall(
        'phase',
        { action: 'update_status', planId, phaseId: phaseIds[1], status: 'in_progress' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);

      // Verify via get
      const getResult = await handleToolCall(
        'phase',
        { action: 'get', planId, phaseId: phaseIds[1] },
        ctx.services
      );
      const getParsed = JSON.parse(getResult.content[0].text);
      expect(getParsed.phase.status).toBe('in_progress');
    });
  });

  describe('Step 6: Entity Linking', () => {
    it('should link requirements to solutions', async () => {
      const result = await handleToolCall(
        'link',
        {
          action: 'create',
          planId,
          sourceId: requirementIds[0],
          targetId: solutionIds[2],
          relationType: 'implements',
          metadata: { coverage: 'full' },
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.linkId).toBeDefined();
    });

    it('should link phases to requirements', async () => {
      const result = await handleToolCall(
        'link',
        {
          action: 'create',
          planId,
          sourceId: phaseIds[1],
          targetId: requirementIds[0],
          relationType: 'implements',
        },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.linkId).toBeDefined();
    });

    it('should get all links for an entity', async () => {
      const result = await handleToolCall(
        'link',
        { action: 'get', planId, entityId: requirementIds[0] },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.links.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Step 7: Query and Analysis', () => {
    it('should search for authentication-related entities', async () => {
      const result = await handleToolCall(
        'query',
        { action: 'search', planId, query: 'authentication' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.length).toBeGreaterThan(0);
    });

    it('should trace a requirement through the plan', async () => {
      const result = await handleToolCall(
        'query',
        { action: 'trace', planId, requirementId: requirementIds[0] },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.requirement).toBeDefined();
      expect(parsed.requirement.id).toBe(requirementIds[0]);
    });

    it('should validate the plan', async () => {
      const result = await handleToolCall(
        'query',
        { action: 'validate', planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.checksPerformed).toBeDefined();
      expect(parsed.summary).toBeDefined();
    });

    it('should get next actions', async () => {
      const result = await handleToolCall(
        'phase',
        { action: 'get_next_actions', planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.actions).toBeDefined();
    });
  });

  describe('Step 8: Plan Export', () => {
    it('should export plan as markdown', async () => {
      const result = await handleToolCall(
        'query',
        { action: 'export', planId, format: 'markdown' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.format).toBe('markdown');
      expect(parsed.content).toContain('User Authentication System');
      expect(parsed.content).toContain('Requirements');
    });

    it('should export plan as JSON', async () => {
      const result = await handleToolCall(
        'query',
        { action: 'export', planId, format: 'json' },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.format).toBe('json');
      expect(parsed.content).toBeDefined();
    });
  });

  describe('Step 9: Plan Summary', () => {
    it('should retrieve complete plan with all entities', async () => {
      const result = await handleToolCall(
        'plan',
        { action: 'get', planId, includeEntities: true },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.plan.manifest.name).toBe('User Authentication System');
      expect(parsed.plan.entities.requirements).toHaveLength(3);
      expect(parsed.plan.entities.solutions).toHaveLength(3);
      expect(parsed.plan.entities.decisions).toHaveLength(2);
      expect(parsed.plan.entities.phases).toHaveLength(4);
    });

    it('should verify plan statistics', async () => {
      const result = await handleToolCall(
        'plan',
        { action: 'get', planId },
        ctx.services
      );

      const parsed = JSON.parse(result.content[0].text);
      const stats = parsed.plan.manifest.statistics;
      expect(stats.totalRequirements).toBe(3);
      expect(stats.totalSolutions).toBe(3);
      expect(stats.totalDecisions).toBe(2);
      expect(stats.totalPhases).toBe(4);
    });
  });
});
