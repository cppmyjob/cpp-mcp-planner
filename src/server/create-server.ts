import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { tools } from './tool-definitions.js';
import { handleToolCall, ToolError } from './tool-handlers.js';
import type { Services } from './services.js';

export interface McpServer {
  server: Server;
  services: Services;
}

export function createMcpServer(services: Services): McpServer {
  const server = new Server(
    {
      name: 'mcp-planning-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools handler
  server.setRequestHandler(ListToolsRequestSchema, () => Promise.resolve({
    tools,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      if (!args) {
        throw new Error('Tool arguments are required');
      }
      return await handleToolCall(name, args, services);
    } catch (error) {
      // IMPORTANT: Do NOT throw McpError here! The SDK will wrap any error automatically.
      // Throwing McpError causes double-wrapping: "MCP error -32603: MCP error -32603: message"
      // Instead, throw a plain Error with code/data properties that the SDK extracts.

      if (error instanceof ToolError) {
        const code = error.code === 'MethodNotFound' ? ErrorCode.MethodNotFound : ErrorCode.InternalError;
        const err = new Error(error.message) as Error & { code: number };
        err.code = code;
        throw err;
      }

      // Non-ToolError: wrap with proper error code for MCP SDK
      const message = error instanceof Error ? error.message : 'Unknown error';
      const err = new Error(message) as Error & { code: number };
      err.code = ErrorCode.InternalError;
      throw err;
    }
  });

  return { server, services };
}
