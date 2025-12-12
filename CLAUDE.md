# MCP Planning Server — Best Practices

## Code Style & Conventions

### TypeScript Naming
- **NO** `I` prefix for interfaces — use `User`, not `IUser`
- **NO** `_` prefix for private members — use `private` modifier alone
- **Explicit visibility** — always specify `public`/`private`/`protected` on all class members
- File names: `kebab-case.ts` (e.g., `plan-service.ts`)
- Classes/Interfaces: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE` for true constants, `camelCase` for const references

### Type Safety (Strict)
- **NO** `any` — ever. Use specific types or generics
- **NO** `unknown` where avoidable — prefer type guards and discriminated unions
- Enable `strict: true` in tsconfig (includes `noImplicitAny`, `strictNullChecks`)
- Use `as const` for literal types
- Use `readonly` for immutable data
- Prefer `type` for unions/intersections, `interface` for object shapes

```typescript
// ❌ Bad
private _cache: any;
function process(data: unknown) { ... }

// ✅ Good
private cache: Map<string, Entity>;
function process(data: ProcessInput) { ... }
```

### Exhaustiveness & Safety
- Use exhaustive switch with `never` for discriminated unions
- Early return pattern — reduce nesting
- Nullish coalescing (`??`) over logical OR (`||`) for defaults
- Optional chaining (`?.`) for safe property access

```typescript
// Exhaustive switch
function getStatus(s: Status): string {
  switch (s) {
    case 'active': return 'Active';
    case 'archived': return 'Archived';
    default: {
      const _exhaustive: never = s;
      throw new Error(`Unknown status: ${_exhaustive}`);
    }
  }
}
```

### Module Organization
- One primary export per file (class, interface, or related group)
- Barrel exports (`index.ts`) for public API
- Named exports only — **NO** default exports
- Imports order: node builtins → external packages → internal modules

### Code Quality
- Functions: single responsibility, max ~50 lines
- Max 3-4 parameters; use options object for more
- Avoid nested callbacks — use async/await
- No magic numbers — use named constants
- Prefer composition over inheritance

---

## Architecture Overview

```
src/
├── domain/
│   ├── entities/     # Entity types with versioning
│   ├── repositories/ # Repository interfaces + errors
│   └── services/     # Business logic (9 services)
├── infrastructure/
│   ├── file-storage.ts           # Low-level I/O
│   └── repositories/file/        # File-based persistence
└── server/           # MCP protocol handlers
```

---

## 1. DOMAIN ENTITIES

### Entity Design
- All entities inherit base fields: `id`, `type`, `createdAt`, `updatedAt`, `version`, `metadata`
- **Version field** required on every entity (optimistic locking)
- **Status fields** are literal unions, not strings:
  ```
  Requirements: 'draft' | 'approved' | 'implemented' | 'deferred' | 'rejected'
  Solutions: 'proposed' | 'evaluated' | 'selected' | 'rejected' | 'implemented'
  Phases: 'planned' | 'in_progress' | 'completed' | 'blocked' | 'skipped'
  Decisions: 'active' | 'superseded' | 'reversed'
  Artifacts: 'draft' | 'reviewed' | 'approved' | 'implemented' | 'outdated'
  ```
- **Priority** unified: `'critical' | 'high' | 'medium' | 'low'`
- **Effort estimates** use structured format (NOT legacy hours/complexity):
  ```typescript
  { value: number, unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'story-points', confidence: 'low' | 'medium' | 'high' }
  ```

### Phase Hierarchy
- Computed fields: `depth`, `path` ("1.2.3"), `childCount`
- Order based on `max(sibling.order) + 1`, not count (prevents duplicates on delete)

### Links
- 9 relation types: `implements`, `addresses`, `depends_on`, `blocks`, `alternative_to`, `supersedes`, `references`, `derived_from`, `has_artifact`
- Cycle detection for `depends_on`

Reference: `src/domain/entities/types.ts`

---

## 2. DOMAIN SERVICES

### Service Dependencies
```
PlanService (base)
├── RequirementService, SolutionService, DecisionService
├── PhaseService, ArtifactService
├── LinkingService, QueryService, BatchService
└── VersionHistoryService
```

All services depend on `PlanService` + `FileStorage`. Order matters in initialization.

### Common Patterns

**Input/Output separation:**
```typescript
interface AddRequirementInput { planId, title, ... }
interface AddRequirementResult { requirementId, requirement }
```

**Field filtering (all get/list operations):**
- `fields?: string[]` — custom fields or `['*']` for all
- `excludeMetadata?: boolean` — remove createdAt, updatedAt, version (~162 bytes)
- `excludeComputed?: boolean` — for phases: remove depth, path, childCount (~50 bytes)

**Validation at service boundary:**
- Use validators from `validators.ts`
- Detect legacy formats and throw helpful errors
- Include array index in error messages

**Version history:**
- All entity services support `getHistory()` and `diff()`
- Auto-saves after update if history enabled in Plan manifest

Reference: `src/domain/services/`

---

## 3. MCP SERVER

### Tool Handler Pattern
- Action-based routing (not separate tools per operation)
- One handler per entity type: plan, requirement, solution, decision, phase, artifact, link, query, batch

### Error Handling
- Throw plain `Error` with code property, NOT `McpError`
- SDK auto-wraps errors; double-wrapping causes "MCP error -32603: MCP error -32603"
- Use custom errors: `NotFoundError`, `ValidationError`, `ConflictError`, `LockError`

### Response Format
- Return JSON in `content[0].text`
- Support field filtering in all responses

Reference: `src/server/tool-handlers.ts`, `src/server/create-server.ts`

---

## 4. INFRASTRUCTURE

### File Storage
- **Atomic writes** with graceful-fs (retry logic for Windows)
- Write to temp file, then atomic rename
- Directory structure: `plans/{planId}/manifest.json`, `entities/`, `links.json`, `history/`, `indexes/`

### File Repository
- Cross-process locking via `FileLockManager`
- Use `withLock()` instead of manual acquire/release
- In-memory cache per entity type
- Version mismatch detection on update

### Index Manager
- Fast lookups with caching
- Auto-rebuild on corruption
- Index per entity type

Reference: `src/infrastructure/file-storage.ts`, `src/infrastructure/repositories/file/`

---

## 5. BATCH OPERATIONS

### Temp ID Resolution
- Use `$0`, `$1`, `$2`... for cross-references within batch
- Resolved to real UUIDs before execution
- Fields that support tempId: `parentId`, `addressing`, `sourceId`, `targetId`, `relatedRequirementIds`

### Atomic Semantics
- Load all entities into memory
- Execute operations sequentially
- On any failure: rollback to original state
- On success: flush all changes atomically

Reference: `src/domain/services/batch-service.ts`

---

## 6. VALIDATION

### Validator Patterns
- Optional fields: skip if undefined/null
- Arrays: include index in error message
- Legacy detection: throw helpful "expected X, got Y" errors
- Regex validation: wrap in try/catch

### Key Validators
- `validateEffortEstimate()` — structured format
- `validateTags()` — key-value pairs
- `validateTargets()` — file targets with line precision
- `validateCodeRefs()` — format "file_path:line_number"
- `validatePriority()` — enum whitelist

Reference: `src/domain/services/validators.ts`

---

## 7. ERROR HANDLING

### Error Hierarchy
```
RepositoryError
├── NotFoundError
├── ValidationError (with details[])
├── ConflictError ('duplicate' | 'version' | 'constraint' | 'state')
├── LockError
├── TransactionError
├── StorageError
└── BulkOperationError
```

### Patterns
- Preserve error context on re-throw
- Use specific error types, not generic `new Error()`
- Include entity type and ID in error messages

Reference: `src/domain/repositories/errors.ts`

---

## 8. TESTING

### Setup Pattern
```typescript
beforeEach(async () => {
  testDir = path.join(os.tmpdir(), `test-${Date.now()}`);
  storage = new FileStorage(testDir);
  await storage.initialize();
  // Create services with dependencies
  // Create test plan
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});
```

### TDD Markers
- `RED:` — failing test first
- `GREEN:` — minimal implementation
- `REFACTOR:` — optimize
- `REVIEW:` — final verification

### Assertions
- UUID format: `/^[0-9a-f]{8}-[0-9a-f]{4}-...-[0-9a-f]{12}$/i`
- Error testing: `await expect(...).rejects.toThrow('message')`

Reference: `tests/domain/*-service.test.ts`

---

## Key Files

| Area | File |
|------|------|
| Entity types | `src/domain/entities/types.ts` |
| Error hierarchy | `src/domain/repositories/errors.ts` |
| Validators | `src/domain/services/validators.ts` |
| Services init | `src/server/services.ts` |
| Tool handlers | `src/server/tool-handlers.ts` |
| File storage | `src/infrastructure/file-storage.ts` |
| File repository | `src/infrastructure/repositories/file/file-repository.ts` |
| Lock manager | `src/infrastructure/repositories/file/file-lock-manager.ts` |
