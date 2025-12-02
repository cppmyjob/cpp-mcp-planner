# MCP Planning Server

A Model Context Protocol (MCP) server for Claude Code that provides structured task planning and tracking capabilities.

## Features

- **40 planning tools** organized into 8 categories
- **File-based JSON storage** with atomic writes
- **Hierarchical phases** with progress tracking
- **Requirement traceability** from definition to implementation
- **Decision records** (ADR-style) with supersede support
- **Solution comparison** with tradeoff analysis

## Installation

```bash
npm install
npm run build
```

## Configuration

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "planner": {
      "command": "node",
      "args": ["path/to/cpp-mcp-planner/dist/index.js"],
      "env": {
        "MCP_PLANNING_STORAGE_PATH": "./.mcp-plans"
      }
    }
  }
}
```

## Usage

### Creating a Plan

Simply describe your task to Claude Code. The assistant will automatically create a plan:

> "I need to build a user authentication system with OAuth support"

Claude Code will:
1. Create a new plan
2. Add requirements based on your description
3. Propose solutions with tradeoffs
4. Break down implementation into phases

### Tracking Progress

As you work, Claude Code updates the plan:

> "I've finished implementing the login form"

The assistant will mark the corresponding phase as complete and suggest next actions.

### Viewing Plan Status

Ask about your current progress:

> "What's the status of my plan?"
> "What should I work on next?"

## Tool Categories

| Category | Tools | Description |
|----------|-------|-------------|
| Plan Management | 7 | Create, list, get, update, archive plans |
| Requirements | 5 | Manage requirements with priorities and acceptance criteria |
| Solutions | 6 | Propose, compare, and select solutions |
| Decisions | 4 | Record architectural decisions (ADR) |
| Phases | 6 | Hierarchical implementation phases |
| Linking | 3 | Entity relationships with cycle detection |
| Query | 4 | Search, trace, validate, export |
| System | 1 | Health check |

## Storage

Plans are stored as JSON files in the configured storage path:

```
.mcp-plans/
├── plans/
│   └── {plan-id}/
│       ├── manifest.json
│       ├── requirements.json
│       ├── solutions.json
│       ├── decisions.json
│       ├── phases.json
│       └── links.json
└── active-plans.json
```

## Development

```bash
# Run tests
npm test

# Build
npm run build

# Type check
npx tsc --noEmit
```

## License

MIT
