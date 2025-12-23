# MCP Planning Server

A comprehensive planning system with:
- **MCP Server** - Plugin for Claude Code CLI
- **REST API** - NestJS backend server
- **Web Dashboard** - Angular UI for visual planning

## 🚀 Quick Start (Web Dashboard)

**For developers who want to run the Web UI:**

### Windows
```cmd
start-dev.bat
```

### Linux/macOS
```bash
chmod +x start-dev.sh
./start-dev.sh
```

Then open http://localhost:8791 in your browser.

The startup scripts will automatically check:
- Node.js version (18.19.1+ required for Angular 21)
- pnpm installation (with installation instructions if missing)
- Dependencies and build status

---

## What is this?

This project provides two ways to interact with the planning system:

### 1. Web Dashboard (NEW)
A modern web interface built with Angular and PrimeNG:
- Visual task management with drag-and-drop
- Real-time progress tracking
- Interactive phase hierarchy
- RESTful API integration

**Ports:**
- Web Server (API): `8790`
- Web Dashboard (UI): `8791`

### 2. MCP Server (Claude Code Integration)
A plugin for Claude Code (Anthropic's AI coding assistant) that helps:
- Break down complex tasks into steps
- Track what's done and what's next
- Record technical decisions
- Compare different solution approaches

## Prerequisites

Before installing, make sure you have:
- **Node.js** 18.19.1 or higher (required for Angular 21)
  - Recommended: Node.js 20.11.1+ or 22.0.0+
  - Download from https://nodejs.org
- **pnpm** (required - this is a pnpm workspace monorepo)
- **Claude Code** - the CLI tool from Anthropic (for MCP server usage)

To check if Node.js is installed:
```bash
node --version
```

To install pnpm globally:
```bash
npm install -g pnpm
```

**Note:** The startup scripts (`start-dev.bat` / `start-dev.sh`) will automatically check these requirements and provide installation instructions if needed.

## Installation

1. Clone or download this repository

2. Open terminal in the project folder

3. Install dependencies:
```bash
pnpm install
```

4. Build the project:
```bash
pnpm run build
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
