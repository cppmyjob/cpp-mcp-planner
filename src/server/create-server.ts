import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
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
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      return await handleToolCall(name, args as Record<string, unknown>, services);
    } catch (error) {
      if (error instanceof ToolError) {
        const code = error.code === 'MethodNotFound' ? ErrorCode.MethodNotFound : ErrorCode.InternalError;
        throw new McpError(code, error.message);
      }
      throw error;
    }
  });

  return { server, services };
}
