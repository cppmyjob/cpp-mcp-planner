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
  ToolError,
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

  // Register all 9 tools with Zod schemas
  server.registerTool('plan', { description: planToolDescription, inputSchema: planSchema }, async (args) => {
    try {
      return await handlePlan(args as unknown as { action: string; [key: string]: unknown }, services);
    } catch (error) {
      return handleToolError(error);
    }
  });

  server.registerTool('requirement', { description: requirementToolDescription, inputSchema: requirementSchema }, async (args) => {
    try {
      return await handleRequirement(args as unknown as { action: string; [key: string]: unknown }, services);
    } catch (error) {
      return handleToolError(error);
    }
  });

  server.registerTool('solution', { description: solutionToolDescription, inputSchema: solutionSchema }, async (args) => {
    try {
      return await handleSolution(args as unknown as { action: string; [key: string]: unknown }, services);
    } catch (error) {
      return handleToolError(error);
    }
  });

  server.registerTool('decision', { description: decisionToolDescription, inputSchema: decisionSchema }, async (args) => {
    try {
      return await handleDecision(args as unknown as { action: string; [key: string]: unknown }, services);
    } catch (error) {
      return handleToolError(error);
    }
  });

  server.registerTool('phase', { description: phaseToolDescription, inputSchema: phaseSchema }, async (args) => {
    try {
      return await handlePhase(args as unknown as { action: string; [key: string]: unknown }, services);
    } catch (error) {
      return handleToolError(error);
    }
  });

  server.registerTool('artifact', { description: artifactToolDescription, inputSchema: artifactSchema }, async (args) => {
    try {
      return await handleArtifact(args as unknown as { action: string; [key: string]: unknown }, services);
    } catch (error) {
      return handleToolError(error);
    }
  });

  server.registerTool('link', { description: linkToolDescription, inputSchema: linkSchema }, async (args) => {
    try {
      return await handleLink(args as unknown as { action: string; [key: string]: unknown }, services);
    } catch (error) {
      return handleToolError(error);
    }
  });

  server.registerTool('query', { description: queryToolDescription, inputSchema: querySchema }, async (args) => {
    try {
      return await handleQuery(args as unknown as { action: string; [key: string]: unknown }, services);
    } catch (error) {
      return handleToolError(error);
    }
  });

  server.registerTool('batch', { description: batchToolDescription, inputSchema: batchSchema }, async (args) => {
    try {
      return await handleBatch(args as unknown as { planId: string; operations: unknown[] }, services);
    } catch (error) {
      return handleToolError(error);
    }
  });

  return { server, services };
}

function handleToolError(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  let message: string;

  if (error instanceof ToolError) {
    message = `[${error.code}] ${error.message}`;
  } else if (error instanceof Error) {
    message = error.message !== '' ? error.message : 'Error without message';
  } else {
    message = 'Unknown error';
  }

  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}
