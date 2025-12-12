#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, createServices } from './server/index.js';

const storagePath = process.env.MCP_PLANNING_STORAGE_PATH ?? './.mcp-plans';

async function main() {
  const services = await createServices(storagePath);
  const { server } = createMcpServer(services);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Planning Server started');
}

main().catch(console.error);
