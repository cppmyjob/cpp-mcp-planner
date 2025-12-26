import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Services } from './services.js';
import {
  planSchema,
  planToolDescription,
  requirementSchema,
  requirementToolDescription,
  solutionSchema,
  solutionToolDescription,
  decisionSchema,
  decisionToolDescription,
  phaseSchema,
  phaseToolDescription,
  artifactSchema,
  artifactToolDescription,
  linkSchema,
  linkToolDescription,
  querySchema,
  queryToolDescription,
  batchSchema,
  batchToolDescription,
  // GREEN: Phase 4.14 - Import project schema
  projectSchema,
  projectToolDescription,
} from './schemas/index.js';
import {
  handlePlan,
  handleRequirement,
  handleSolution,
  handleDecision,
  handlePhase,
  handleArtifact,
  handleLink,
  handleQuery,
  handleBatch,
  // GREEN: Phase 4.14 - Import project handler
  handleProject,
} from './handlers/index.js';

export interface McpServerResult {
  server: McpServer;
  services: Services;
}

export function createMcpServer(services: Services): McpServerResult {
  const server = new McpServer({
    name: 'mcp-planning-server',
    version: '1.0.0',
  });

  // Register all 10 tools with Zod schemas
  // BUG FIX: Remove try-catch blocks to allow errors to propagate naturally to MCP SDK
  server.registerTool('plan', { description: planToolDescription, inputSchema: planSchema }, async (args) => {
    return await handlePlan(args as unknown as { action: string; [key: string]: unknown }, services);
  });

  server.registerTool('requirement', { description: requirementToolDescription, inputSchema: requirementSchema }, async (args) => {
    return await handleRequirement(args as unknown as { action: string; [key: string]: unknown }, services);
  });

  server.registerTool('solution', { description: solutionToolDescription, inputSchema: solutionSchema }, async (args) => {
    return await handleSolution(args as unknown as { action: string; [key: string]: unknown }, services);
  });

  server.registerTool('decision', { description: decisionToolDescription, inputSchema: decisionSchema }, async (args) => {
    return await handleDecision(args as unknown as { action: string; [key: string]: unknown }, services);
  });

  server.registerTool('phase', { description: phaseToolDescription, inputSchema: phaseSchema }, async (args) => {
    return await handlePhase(args as unknown as { action: string; [key: string]: unknown }, services);
  });

  server.registerTool('artifact', { description: artifactToolDescription, inputSchema: artifactSchema }, async (args) => {
    return await handleArtifact(args as unknown as { action: string; [key: string]: unknown }, services);
  });

  server.registerTool('link', { description: linkToolDescription, inputSchema: linkSchema }, async (args) => {
    return await handleLink(args as unknown as { action: string; [key: string]: unknown }, services);
  });

  server.registerTool('query', { description: queryToolDescription, inputSchema: querySchema }, async (args) => {
    return await handleQuery(args as unknown as { action: string; [key: string]: unknown }, services);
  });

  server.registerTool('batch', { description: batchToolDescription, inputSchema: batchSchema }, async (args) => {
    return await handleBatch(args as unknown as { planId: string; operations: unknown[] }, services);
  });

  // GREEN: Phase 4.14 - Register project tool
  server.registerTool('project', { description: projectToolDescription, inputSchema: projectSchema }, async (args) => {
    return await handleProject(args as unknown as { action: string; [key: string]: unknown }, services);
  });

  return { server, services };
}
