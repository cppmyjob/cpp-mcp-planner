# MCP Planning Server

MCP server for Claude Code that helps organize and track software development tasks.

## What is this?

This is a plugin for Claude Code (Anthropic's AI coding assistant). It adds planning tools that help:
- Break down complex tasks into steps
- Track what's done and what's next
- Record technical decisions
- Compare different solution approaches

## Prerequisites

Before installing, make sure you have:
- **Node.js** (version 18 or higher) - download from https://nodejs.org
- **pnpm** (recommended package manager for this monorepo)
- **Claude Code** - the CLI tool from Anthropic

To check if Node.js is installed, run in terminal:
```bash
node --version
```

To install pnpm globally:
```bash
npm install -g pnpm
```

## Installation

1. Clone or download this repository

2. Open terminal in the project folder

3. Install dependencies:
```bash
pnpm install
```

4. Build the project:
```bash
npm run build
```

After build, you should see a `dist` folder with compiled files.

**Note:** This is a monorepo managed by pnpm workspaces. All dependencies are installed with a single `pnpm install` command from the root directory.

## Configuration

To use this server with Claude Code, you need to add it to MCP settings.

### Step 1: Find your settings file

Settings can be placed in one of these locations:

| Location | File path | Use case |
|----------|-----------|----------|
| Project (private) | `.claude/settings.local.json` | Only for you, not shared |
| Project (shared) | `.claude/settings.json` | Shared with team via git |
| Global | `~/.claude/settings.json` | All your projects |

### Step 2: Add server configuration

Open or create the settings file and add:

```json
{
  "mcpServers": {
    "planning": {
      "command": "node",
      "args": ["FULL_PATH_TO/planner/dist/index.js"],
      "env": {
        "MCP_PLANNING_STORAGE_PATH": "./.mcp-plans"
      }
    }
  }
}
```

**Important:** Replace `FULL_PATH_TO` with the actual path to this folder.

Example paths:
- Windows: `D:/Projects/planner/dist/index.js`
- Mac/Linux: `/home/user/projects/planner/dist/index.js`

### Step 3 (Optional): Allow tools without confirmation

By default, Claude Code asks permission for each tool use. To skip confirmation for planning tools, add this section to your settings file:

```json
{
  "permissions": {
    "allow": [
      "mcp__planning"
    ]
  }
}
```

Your complete settings file will look like this:

```json
{
  "mcpServers": {
    "planning": {
      "command": "node",
      "args": ["FULL_PATH_TO/planner/dist/index.js"],
      "env": {
        "MCP_PLANNING_STORAGE_PATH": "./.mcp-plans"
      }
    }
  },
  "permissions": {
    "allow": [
      "mcp__planning"
    ]
  }
}
```

**Note:** Use exactly `mcp__planning` (not `mcp__planning__*`). Wildcards are not supported.

## How to use

Once configured, just talk to Claude Code naturally.

### Starting a new plan

Tell Claude Code what you want to build:

> "I need to build a user login system"

Claude Code will automatically:
1. Create a plan
2. Add requirements
3. Suggest solutions
4. Break work into phases

### Checking progress

Ask Claude Code about your plan:

> "What's the status of my plan?"
> "What should I work on next?"

### Updating progress

Tell Claude Code when you finish something:

> "I finished the login form"

Claude Code will update the plan and suggest what to do next.

## Available tools

The server provides tools in 8 categories:

| Category | Description |
|----------|-------------|
| Plan | Create and manage plans |
| Requirement | Define what needs to be built |
| Solution | Compare different approaches |
| Decision | Record technical choices |
| Phase | Break work into steps |
| Link | Connect related items |
| Query | Search and analyze plans |
| Artifact | Store code and configs |

## Where plans are stored

Plans are saved as JSON files:

```
.mcp-plans/
  plans/
    {plan-id}/
      manifest.json
      requirements.json
      solutions.json
      decisions.json
      phases.json
      links.json
      artifacts.json
  active-plans.json
```

## Troubleshooting

**Claude Code doesn't see the planning tools**
- Check that the path in settings is correct
- Make sure you ran `npm run build`
- Restart Claude Code after changing settings

**Permission errors**
- Check that the storage path is writable
- On Windows, avoid paths with spaces if possible

## License

MIT
