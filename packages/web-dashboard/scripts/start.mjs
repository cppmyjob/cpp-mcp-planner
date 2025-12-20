#!/usr/bin/env node
/**
 * Start script for web-dashboard
 * Reads port from @mcp-planner/config and starts ng serve
 */

import { spawn } from 'child_process';
import { getWebDashboardPort } from '@mcp-planner/config/server';

const port = getWebDashboardPort();

console.log(`Starting Angular dev server on port ${port}...`);

const ngServe = spawn('ng', ['serve', '--port', port.toString()], {
  stdio: 'inherit',
  shell: true,
});

ngServe.on('error', (error) => {
  console.error(`Failed to start ng serve: ${error.message}`);
  process.exit(1);
});

ngServe.on('exit', (code) => {
  process.exit(code ?? 0);
});
