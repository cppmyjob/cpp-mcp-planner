# Architecture Reference

## Project Structure

```
src/
+-- domain/
|   +-- entities/     # Entity types with versioning
|   +-- repositories/ # Repository interfaces + errors
|   +-- services/     # Business logic (10 services)
+-- infrastructure/
|   +-- file-storage.ts           # Low-level I/O
|   +-- repositories/file/        # File-based persistence
+-- server/           # MCP protocol handlers
```

---

## Entity Design

All entities inherit base fields: `id`, `type`, `createdAt`, `updatedAt`, `version`, `metadata`

**Key patterns:**
- Version field required on every entity (optimistic locking)
- Status fields are literal unions, not strings
- Priority unified: `'critical' | 'high' | 'medium' | 'low'`
- EffortEstimate uses structured format with value/unit/confidence

Reference: `src/domain/entities/types.ts`

---

## Service Dependencies

```
PlanService (base)
+-- RequirementService, SolutionService, DecisionService
+-- PhaseService, ArtifactService
+-- LinkingService, QueryService, BatchService
+-- VersionHistoryService
```

All services depend on `PlanService` + `FileStorage`. Order matters in initialization.

**Field Filtering (all get/list operations):**
- `fields?: string[]` -- custom fields or `['*']` for all
- `excludeMetadata?: boolean` -- remove createdAt, updatedAt, version
- `excludeComputed?: boolean` -- for phases: remove depth, path, childCount

Reference: `src/server/services.ts`

---

## Phase Hierarchy

- Computed fields: `depth`, `path` ("1.2.3"), `childCount`
- Order based on `max(sibling.order) + 1`, not count (prevents duplicates on delete)

Reference: `src/domain/services/phase-service.ts`

---

## Links

9 relation types with cycle detection for `depends_on`:
- implements, addresses, depends_on, blocks
- alternative_to, supersedes, references
- derived_from, has_artifact

Reference: `src/domain/entities/types.ts` (RelationType)

---

## Error Handling

**CRITICAL:** Use custom errors from `src/domain/repositories/errors.ts`
- `NotFoundError`, `ValidationError`, `ConflictError`, `LockError`
- **NOT** `McpError` -- SDK auto-wraps; double-wrapping causes "MCP error -32603: MCP error -32603"
- Custom errors extend `RepositoryError`, not MCP types

Reference: `src/domain/repositories/errors.ts`

---

## Infrastructure

### File Storage
- Atomic writes with write-file-atomic (unique temp file per call for Windows)
- Directory structure: `plans/{planId}/manifest.json`, `entities/`, `links.json`, `history/`, `indexes/`

### File Repository
- Cross-process locking via `FileLockManager`
- Use `withLock()` instead of manual acquire/release
- In-memory cache per entity type, version mismatch detection

Reference: `src/infrastructure/file-storage.ts`, `src/infrastructure/repositories/file/`

---

## Batch Operations

### Temp ID Resolution
- Use `$0`, `$1`, `$2`... for cross-references within batch
- Resolved to real UUIDs before execution
- Fields that support tempId: `parentId`, `addressing`, `sourceId`, `targetId`, `relatedRequirementIds`

### Atomic Semantics
- Load all entities into memory, execute sequentially
- On any failure: rollback to original state
- On success: flush all changes atomically

Reference: `src/domain/services/batch-service.ts`

---

## MCP Server

### Tool Handler Pattern
- Action-based routing (not separate tools per operation)
- One handler per entity type: plan, requirement, solution, decision, phase, artifact, link, query, batch

### Response Format
- Return JSON in `content[0].text`
- Support field filtering in all responses

Reference: `src/server/handlers/`, `src/server/create-server.ts`
