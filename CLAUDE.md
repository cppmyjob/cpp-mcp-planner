# MCP Planning Server

## WHAT

TypeScript MCP server implementing structured planning workflow.
Layered architecture (domain/infrastructure/server) with file-based persistence, atomic writes, and cross-process locking.

## WHY

Provides complete planning lifecycle: Requirements -> Solutions -> Decisions -> Phases -> Artifacts.
Supports traceability, version history, and batch operations with temp ID resolution.

## HOW

### Commands

```bash
npm run build      # Compile TypeScript
npm test           # Run all tests
npm run lint:fix   # Fix ESLint errors -- MANDATORY after code changes
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

| Area | File |
|------|------|
| Entity types | `src/domain/entities/types.ts` |
| Error hierarchy | `src/domain/repositories/errors.ts` |
| Validators | `src/domain/services/validators.ts` |
| Services init | `src/server/services.ts` |
| Tool handlers | `src/server/handlers/` |
| File storage | `src/infrastructure/file-storage.ts` |
| File repository | `src/infrastructure/repositories/file/file-repository.ts` |
| Lock manager | `src/infrastructure/repositories/file/file-lock-manager.ts` |

---

## Architecture

@.claude/ARCHITECTURE.md
