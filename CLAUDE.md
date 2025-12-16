# MCP Planning Server

## WHAT

TypeScript MCP server with REST API implementing structured planning workflow.
Monorepo architecture with 3 packages:
- **@mcp-planner/core** - Domain logic + infrastructure (file-based persistence, atomic writes, locking)
- **@mcp-planner/mcp-server** - MCP protocol server for Claude Code CLI
- **@mcp-planner/web-server** - NestJS REST API for Web Dashboard (8 resources, 50+ endpoints)

## WHY

Provides complete planning lifecycle: Requirements -> Solutions -> Decisions -> Phases -> Artifacts.
Supports traceability, version history, and batch operations with temp ID resolution.

## HOW

### Commands

```bash
npm run build         # Compile all packages
npm test              # Run all tests (core + mcp-server + web-server)
npm run lint:fix      # Fix ESLint errors -- MANDATORY after code changes
npm run test:web      # Run web-server E2E tests only
npm run build:web     # Build web-server only
```

### Workflow

1. **Before ANY code:** Review `eslint.config.js`
2. **After code changes:** `npm run lint:fix` -- ZERO TOLERANCE for errors
3. **Bug fixes:** Follow DOCTOR methodology below

---

## Code Style

- **NO** `any` -- ever. Use specific types or generics
- **NO** `I` prefix for interfaces -- use `User`, not `IUser`
- **NO** `_` prefix for private members -- use `private` modifier alone
  - **Exception:** `_` prefix allowed for unused variables (e.g., `_exhaustive` in switch)
- **NO** default exports -- named exports only
- **Explicit visibility** -- always specify `public`/`private`/`protected`
- Use `??` not `||` for defaults, `?.` for safe access
- Exhaustive switch with `never` for discriminated unions

Reference: `eslint.config.js` for full rules

---

## Validation Layers

| Layer | Responsibility |
|-------|----------------|
| **ZOD** (tool-definitions.ts) | Input parsing, types, formats -- API contract |
| **Services** | Business rules, entity checks, state transitions |

> **Rule:** ZOD = interface mapping only. Services = ALL validation logic.

---

## DOCTOR -- Bug Fix Methodology

| Phase | Name | Action |
|-------|------|--------|
| **D** | Diagnose | Analyze bug: reproduce, find root cause |
| **O** | Observe | Write failing test (RED) |
| **C** | Cure | Minimal fix to pass test (GREEN) |
| **T** | Transform | Refactor without changing behavior |
| **O** | Order | Run linter: `npm run lint:fix` |
| **R** | Run | Full test suite: `npm test` |

**Use for:** Any bug fix requiring code changes (skip for trivial typos).

**TDD Markers:** `RED:` (failing test) | `GREEN:` (minimal fix) | `REFACTOR:` (optimize) | `REVIEW:` (verify)

---

## Key Files

### Core Package (@mcp-planner/core)
| Area | File |
|------|------|
| Entity types | `packages/core/src/domain/entities/types.ts` |
| Error hierarchy | `packages/core/src/domain/repositories/errors.ts` |
| Validators | `packages/core/src/domain/services/validators.ts` |
| Domain services | `packages/core/src/domain/services/` (10 services) |
| File storage | `packages/core/src/infrastructure/file-storage.ts` |
| File repository | `packages/core/src/infrastructure/repositories/file/file-repository.ts` |
| Lock manager | `packages/core/src/infrastructure/repositories/file/file-lock-manager.ts` |

### MCP Server (@mcp-planner/mcp-server)
| Area | File |
|------|------|
| Services init | `packages/mcp-server/src/server/services.ts` |
| Tool handlers | `packages/mcp-server/src/server/handlers/` |
| MCP entry point | `packages/mcp-server/src/index.ts` |

### Web Server (@mcp-planner/web-server)
| Area | File |
|------|------|
| Main app | `packages/web-server/src/main.ts` |
| App module | `packages/web-server/src/app.module.ts` |
| Core DI module | `packages/web-server/src/modules/core/core.module.ts` |
| Feature modules | `packages/web-server/src/modules/*/` (plans, requirements, solutions, decisions, phases, artifacts, links, query) |
| E2E tests | `packages/web-server/test/*.e2e-spec.ts` |

---

## Architecture

@.claude/ARCHITECTURE.md
