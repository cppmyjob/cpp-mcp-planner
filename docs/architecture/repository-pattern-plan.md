# Repository Pattern Architecture Plan

> Sprint 9: Universal Storage Abstraction for cpp-mcp-planner

## Executive Summary

This document describes the architecture for introducing the Repository Pattern to support multiple storage backends (File, SQLite, PostgreSQL, MongoDB) with a unified interface.

### Current Problems

| Issue | Impact |
|-------|--------|
| All entities of one type in single file | Poor scalability (1000+ entities = 5MB file) |
| Full file rewrite on each update | O(n) write operations |
| Direct FileStorage dependency | Cannot switch storage backends |
| Concurrent write conflicts | Data corruption risk |

### Proposed Solution

- **Repository Pattern** with generic `IRepository<T>` interface
- **File-per-entity** storage strategy with indexes
- **Unit of Work** pattern for transactions
- **Factory Pattern** for storage backend selection

---

## 1. Universal Interface: IRepository<T>

```typescript
// src/domain/repositories/interfaces.ts

/**
 * Base entity interface
 */
interface IEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * Query options with filtering and pagination
 */
interface QueryOptions<T> {
  filter?: Partial<T> | ((entity: T) => boolean);
  sort?: { field: keyof T; order: 'asc' | 'desc' }[];
  pagination?: { limit: number; offset: number };
  fields?: (keyof T)[];  // Projection
}

interface QueryResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
}

/**
 * Universal repository interface
 */
interface IRepository<T extends IEntity> {
  // === CRUD ===
  create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<T>;
  findById(id: string): Promise<T | null>;
  findOne(filter: Partial<T>): Promise<T | null>;
  findMany(options?: QueryOptions<T>): Promise<QueryResult<T>>;
  update(id: string, updates: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;

  // === Bulk Operations ===
  createMany(entities: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'version'>[]): Promise<T[]>;
  updateMany(filter: Partial<T>, updates: Partial<T>): Promise<number>;
  deleteMany(filter: Partial<T>): Promise<number>;

  // === Utility ===
  count(filter?: Partial<T>): Promise<number>;
  exists(id: string): Promise<boolean>;
}

/**
 * Unit of Work for transactions
 */
interface IUnitOfWork {
  requirements: IRepository<Requirement>;
  solutions: IRepository<Solution>;
  decisions: IRepository<Decision>;
  phases: IRepository<Phase>;
  artifacts: IRepository<Artifact>;
  links: IRepository<Link>;

  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
```

---

## 2. File Storage Strategy

### Comparison of Approaches

| Approach | Pros | Cons | Use Case |
|----------|------|------|----------|
| **One file = all entities** (current) | Simple, single read/write | Doesn't scale, concurrency issues | <100 entities |
| **One file = one entity** | Minimal I/O, parallelism | Many files, listing complexity | >1000 entities |
| **Hybrid (chunks)** | Balance | Implementation complexity | 100-1000 entities |

### Recommended: **One file = one entity** + **Index file**

```
.mcp-plans/
├── config.json                          # Storage configuration
├── plans/
│   └── {planId}/
│       ├── manifest.json                # Plan metadata
│       ├── index/
│       │   ├── requirements.idx.json    # Index: {id → metadata}
│       │   ├── solutions.idx.json
│       │   ├── phases.idx.json
│       │   └── ...
│       ├── entities/
│       │   ├── requirements/
│       │   │   ├── {reqId-1}.json       # Single entity
│       │   │   ├── {reqId-2}.json
│       │   │   └── ...
│       │   ├── solutions/
│       │   │   ├── {solId-1}.json
│       │   │   └── ...
│       │   ├── phases/
│       │   ├── decisions/
│       │   └── artifacts/
│       ├── links/
│       │   └── {linkId}.json            # Each link separately
│       └── history/                     # Already implemented correctly
│           └── {entityType}/{entityId}.json
```

### Index File Structure

```typescript
// requirements.idx.json
interface EntityIndex<T> {
  version: number;           // Index version for cache invalidation
  lastUpdated: string;
  count: number;
  entries: {
    [id: string]: {
      // Only fields for filtering/sorting (no heavy data)
      title: string;
      status: string;
      priority?: string;
      category?: string;
      createdAt: string;
      updatedAt: string;
      version: number;
    }
  }
}
```

### Trade-offs

| Advantage | Compromise |
|-----------|------------|
| O(1) operations for single entity | Listing requires index read |
| Parallel writes without conflicts | Index must be synchronized |
| Easy migration to DB | More files on disk |
| Partial read (projection) | More complex atomic batch operations |

---

## 3. Storage Adapters

### Directory Structure

```
src/
├── domain/
│   ├── entities/
│   │   └── types.ts                    # Entity types (existing)
│   ├── repositories/
│   │   ├── interfaces.ts               # IRepository, IUnitOfWork
│   │   ├── base-repository.ts          # Abstract class with common logic
│   │   └── index.ts
│   └── services/                       # Existing services
│
├── infrastructure/
│   ├── repositories/
│   │   ├── file/
│   │   │   ├── file-repository.ts      # File implementation
│   │   │   ├── file-unit-of-work.ts    # File transactions
│   │   │   ├── index-manager.ts        # Index management
│   │   │   └── atomic-writer.ts        # Atomic write (graceful-fs)
│   │   ├── sqlite/
│   │   │   ├── sqlite-repository.ts
│   │   │   ├── sqlite-unit-of-work.ts
│   │   │   └── migrations/
│   │   ├── postgres/
│   │   │   ├── postgres-repository.ts
│   │   │   ├── postgres-unit-of-work.ts
│   │   │   └── migrations/
│   │   ├── mongo/
│   │   │   ├── mongo-repository.ts
│   │   │   └── mongo-unit-of-work.ts
│   │   └── index.ts
│   │
│   ├── factory/
│   │   └── repository-factory.ts       # Factory for creating repositories
│   │
│   └── file-storage.ts                 # DEPRECATED → replace with file-repository
```

### FileRepository Implementation

```typescript
// src/infrastructure/repositories/file/file-repository.ts

class FileRepository<T extends IEntity> implements IRepository<T> {
  private basePath: string;
  private entityType: string;
  private indexManager: IndexManager<T>;
  private atomicWriter: AtomicWriter;

  // Cache for hot data
  private cache: LRUCache<string, T>;

  constructor(
    planId: string,
    entityType: string,
    options?: { cacheSize?: number }
  ) {
    this.basePath = `.mcp-plans/plans/${planId}/entities/${entityType}`;
    this.entityType = entityType;
    this.indexManager = new IndexManager(planId, entityType);
    this.atomicWriter = new AtomicWriter();
    this.cache = new LRUCache({ max: options?.cacheSize ?? 100 });
  }

  async create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<T> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const entity: T = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } as T;

    // 1. Write entity file
    await this.atomicWriter.write(
      `${this.basePath}/${id}.json`,
      entity
    );

    // 2. Update index
    await this.indexManager.addEntry(id, this.extractIndexFields(entity));

    // 3. Update cache
    this.cache.set(id, entity);

    return entity;
  }

  async findById(id: string): Promise<T | null> {
    // Check cache first
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    const filePath = `${this.basePath}/${id}.json`;
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const entity = JSON.parse(data) as T;
      this.cache.set(id, entity);
      return entity;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async findMany(options?: QueryOptions<T>): Promise<QueryResult<T>> {
    // 1. Load index for filtering/sorting
    const index = await this.indexManager.load();

    // 2. Filter using index (without loading full entities)
    let entries = Object.entries(index.entries);

    if (options?.filter) {
      entries = entries.filter(([_, meta]) =>
        this.matchesFilter(meta, options.filter)
      );
    }

    // 3. Sort
    if (options?.sort) {
      entries = this.sortEntries(entries, options.sort);
    }

    const total = entries.length;

    // 4. Paginate
    if (options?.pagination) {
      const { offset, limit } = options.pagination;
      entries = entries.slice(offset, offset + limit);
    }

    // 5. Load full entities (parallel)
    const ids = entries.map(([id]) => id);
    const data = await Promise.all(ids.map(id => this.findById(id)));

    // 6. Apply projection if needed
    const result = options?.fields
      ? data.map(e => this.project(e!, options.fields!))
      : data.filter(Boolean) as T[];

    return {
      data: result,
      total,
      hasMore: options?.pagination
        ? (options.pagination.offset + result.length) < total
        : false
    };
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    const existing = await this.findById(id);
    if (!existing) throw new Error(`Entity ${id} not found`);

    const updated: T = {
      ...existing,
      ...updates,
      id,  // Prevent ID change
      createdAt: existing.createdAt,  // Prevent createdAt change
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    };

    await this.atomicWriter.write(`${this.basePath}/${id}.json`, updated);
    await this.indexManager.updateEntry(id, this.extractIndexFields(updated));
    this.cache.set(id, updated);

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    try {
      await fs.unlink(`${this.basePath}/${id}.json`);
      await this.indexManager.removeEntry(id);
      this.cache.delete(id);
      return true;
    } catch {
      return false;
    }
  }

  // Bulk operations with parallel execution
  async createMany(entities: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'version'>[]): Promise<T[]> {
    return Promise.all(entities.map(e => this.create(e)));
  }
}
```

### SQLite Repository (for comparison)

```typescript
// src/infrastructure/repositories/sqlite/sqlite-repository.ts

class SqliteRepository<T extends IEntity> implements IRepository<T> {
  private db: Database;
  private tableName: string;

  async findMany(options?: QueryOptions<T>): Promise<QueryResult<T>> {
    let query = this.db.prepare(`SELECT * FROM ${this.tableName}`);
    const params: any[] = [];

    // Build WHERE clause from filter
    if (options?.filter) {
      const conditions = Object.entries(options.filter)
        .map(([key, value]) => {
          params.push(value);
          return `${key} = ?`;
        });
      query = this.db.prepare(
        `SELECT * FROM ${this.tableName} WHERE ${conditions.join(' AND ')}`
      );
    }

    // Add ORDER BY
    if (options?.sort) {
      const orderClauses = options.sort
        .map(s => `${String(s.field)} ${s.order.toUpperCase()}`)
        .join(', ');
      // Modify query...
    }

    // Add LIMIT/OFFSET
    if (options?.pagination) {
      params.push(options.pagination.limit, options.pagination.offset);
      // Modify query...
    }

    const rows = query.all(...params);
    const total = this.db.prepare(
      `SELECT COUNT(*) as count FROM ${this.tableName}`
    ).get() as { count: number };

    return {
      data: rows.map(r => this.deserialize(r)),
      total: total.count,
      hasMore: options?.pagination
        ? (options.pagination.offset + rows.length) < total.count
        : false
    };
  }
}
```

---

## 4. Service Integration (Dependency Injection)

### Repository Factory

```typescript
// src/infrastructure/factory/repository-factory.ts

type StorageType = 'file' | 'sqlite' | 'postgres' | 'mongo';

interface StorageConfig {
  type: StorageType;
  options: {
    // File
    basePath?: string;

    // SQLite
    dbPath?: string;

    // PostgreSQL
    connectionString?: string;

    // MongoDB
    uri?: string;
    database?: string;
  };
}

class RepositoryFactory {
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  createUnitOfWork(planId: string): IUnitOfWork {
    switch (this.config.type) {
      case 'file':
        return new FileUnitOfWork(planId, this.config.options.basePath);
      case 'sqlite':
        return new SqliteUnitOfWork(planId, this.config.options.dbPath);
      case 'postgres':
        return new PostgresUnitOfWork(planId, this.config.options.connectionString);
      case 'mongo':
        return new MongoUnitOfWork(planId, this.config.options);
      default:
        throw new Error(`Unknown storage type: ${this.config.type}`);
    }
  }

  // Shortcut methods
  createRequirementRepository(planId: string): IRepository<Requirement> {
    return this.createUnitOfWork(planId).requirements;
  }
}
```

### Updated Services

```typescript
// src/domain/services/requirement-service.ts

class RequirementService {
  constructor(
    private repositoryFactory: RepositoryFactory,  // Instead of FileStorage
    private planService: PlanService,
    private versionHistoryService?: VersionHistoryService
  ) {}

  async addRequirement(input: AddRequirementInput): Promise<AddRequirementResult> {
    const uow = this.repositoryFactory.createUnitOfWork(input.planId);

    try {
      await uow.beginTransaction();

      const requirement = await uow.requirements.create({
        type: 'requirement',
        title: input.requirement.title,
        description: input.requirement.description,
        // ... other fields
      });

      // Save history if enabled
      if (this.versionHistoryService) {
        await this.versionHistoryService.saveVersion(
          input.planId,
          requirement.id,
          'requirement',
          requirement,
          1
        );
      }

      await this.planService.updateStatistics(input.planId);
      await uow.commit();

      return { requirementId: requirement.id };

    } catch (error) {
      await uow.rollback();
      throw error;
    }
  }

  async listRequirements(input: ListRequirementsInput): Promise<ListRequirementsResult> {
    const repo = this.repositoryFactory.createRequirementRepository(input.planId);

    const result = await repo.findMany({
      filter: {
        ...(input.filters?.priority && { priority: input.filters.priority }),
        ...(input.filters?.status && { status: input.filters.status }),
      },
      pagination: input.pagination,
      sort: [{ field: 'createdAt', order: 'desc' }],
      fields: input.fields,
    });

    return {
      requirements: result.data,
      total: result.total,
      hasMore: result.hasMore,
    };
  }
}
```

### Service Initialization

```typescript
// src/server/services.ts

interface ServicesConfig {
  storage: StorageConfig;
}

async function createServices(config: ServicesConfig): Promise<Services> {
  // 1. Create factory
  const repositoryFactory = new RepositoryFactory(config.storage);

  // 2. Create services with DI
  const planService = new PlanService(repositoryFactory);
  const versionHistoryService = new VersionHistoryService(repositoryFactory);

  const requirementService = new RequirementService(
    repositoryFactory,
    planService,
    versionHistoryService
  );

  const solutionService = new SolutionService(
    repositoryFactory,
    planService,
    versionHistoryService
  );

  // ... other services

  return {
    repositoryFactory,
    planService,
    requirementService,
    // ...
  };
}

// Usage example
const services = await createServices({
  storage: {
    type: 'file',  // or 'sqlite', 'postgres', 'mongo'
    options: {
      basePath: '.mcp-plans'
    }
  }
});
```

---

## 5. Migration Plan and Implementation Phases

### Phase 1: Infrastructure Preparation

```
Sprint 9.1: Repository Interfaces
├── Create src/domain/repositories/interfaces.ts
│   ├── IEntity
│   ├── IRepository<T>
│   ├── IUnitOfWork
│   ├── QueryOptions, QueryResult
├── Create base abstract class
└── Cover interfaces with tests
```

### Phase 2: File Repository

```
Sprint 9.2: FileRepository Implementation
├── Create src/infrastructure/repositories/file/
│   ├── atomic-writer.ts (move from file-storage.ts)
│   ├── index-manager.ts (new - for indexes)
│   ├── file-repository.ts
│   ├── file-unit-of-work.ts
├── Data migration:
│   └── migration-tool.ts - convert old structure to new
├── Tests with 1000+ entities (performance benchmark)
└── Remove legacy code from file-storage.ts
```

### Phase 3: Services Update

```
Sprint 9.3: Services Refactoring
├── Update RequirementService
├── Update SolutionService
├── Update DecisionService
├── Update PhaseService
├── Update ArtifactService
├── Update LinkingService
├── Update VersionHistoryService
├── Update BatchService → uses UnitOfWork
└── Update src/server/services.ts
```

### Phase 4: SQLite Repository (optional)

```
Sprint 10: SQLite Support
├── Add better-sqlite3 dependency
├── Create src/infrastructure/repositories/sqlite/
│   ├── sqlite-repository.ts
│   ├── sqlite-unit-of-work.ts
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── migration-runner.ts
├── Tests
└── Documentation
```

### Data Migration Script

```typescript
// src/infrastructure/migration/migrate-to-v2.ts

async function migrateToV2(planId: string): Promise<void> {
  const oldPath = `.mcp-plans/plans/${planId}`;

  // 1. Read old format
  const oldRequirements = JSON.parse(
    await fs.readFile(`${oldPath}/entities/requirements.json`, 'utf-8')
  );

  // 2. Create new directory structure
  await fs.mkdir(`${oldPath}/entities/requirements`, { recursive: true });

  // 3. Write individual files + build index
  const index: EntityIndex<Requirement> = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    count: oldRequirements.length,
    entries: {}
  };

  for (const req of oldRequirements) {
    await fs.writeFile(
      `${oldPath}/entities/requirements/${req.id}.json`,
      JSON.stringify(req, null, 2)
    );

    index.entries[req.id] = {
      title: req.title,
      status: req.status,
      priority: req.priority,
      category: req.category,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
      version: req.version
    };
  }

  // 4. Write index
  await fs.mkdir(`${oldPath}/index`, { recursive: true });
  await fs.writeFile(
    `${oldPath}/index/requirements.idx.json`,
    JSON.stringify(index, null, 2)
  );

  // 5. Archive old file
  await fs.rename(
    `${oldPath}/entities/requirements.json`,
    `${oldPath}/entities/requirements.json.bak`
  );

  // Repeat for other entity types...
}
```

---

## 6. Summary

### Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Domain Layer                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Services: RequirementService, SolutionService, etc.     │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │ uses                               │
│  ┌──────────────────────────┴──────────────────────────────┐    │
│  │ Repositories: IRepository<T>, IUnitOfWork               │    │
│  └──────────────────────────┬──────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────┘
                              │ implements
┌─────────────────────────────┼───────────────────────────────────┐
│                   Infrastructure Layer                           │
│  ┌──────────────────────────┴──────────────────────────────┐    │
│  │              RepositoryFactory                           │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │ creates                            │
│  ┌──────────┬───────────┬───┴───────┬────────────┐              │
│  │  File    │  SQLite   │ Postgres  │   Mongo    │              │
│  │ Repo     │  Repo     │   Repo    │   Repo     │              │
│  └────┬─────┴─────┬─────┴─────┬─────┴──────┬─────┘              │
│       │           │           │            │                     │
│    ┌──┴──┐    ┌───┴───┐   ┌───┴───┐   ┌────┴────┐               │
│    │ FS  │    │better-│   │  pg   │   │mongoose │               │
│    │     │    │sqlite3│   │       │   │         │               │
│    └─────┘    └───────┘   └───────┘   └─────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

### Storage Approach Comparison

| Criterion | Current (1 file) | Proposed (file/entity) | SQLite |
|-----------|------------------|------------------------|--------|
| **Read 1 entity** | O(n) parse | O(1) | O(log n) |
| **Write 1 entity** | O(n) serialize | O(1) | O(log n) |
| **List with filter** | O(n) | O(index) + O(k) load | O(log n) |
| **Concurrent writes** | Conflicts | No conflicts | ACID |
| **1000+ entities** | ~5MB file, ~500ms | ~1000 files, ~10ms | Fast |
| **Human readable** | Yes | Yes | No |
| **Git-friendly** | Poor (diff all) | Good (diff per file) | No |
| **Backup** | Simple | Simple | Simple |

### Recommendations

1. **First**: Introduce `IRepository<T>` interface without changing storage
2. **Then**: Implement `FileRepository` with new structure (file/entity)
3. **Optional**: Add `SqliteRepository` for production use-cases

### Dependencies to Add

```json
{
  "dependencies": {
    "lru-cache": "^10.0.0"
  },
  "optionalDependencies": {
    "better-sqlite3": "^9.0.0",
    "pg": "^8.11.0",
    "mongoose": "^8.0.0"
  }
}
```

---

## Appendix: Performance Benchmarks (Expected)

### File Storage (Current vs Proposed)

| Operation | Current (1 file, 1000 entities) | Proposed (file/entity) |
|-----------|--------------------------------|------------------------|
| Create 1 entity | ~150ms (read + parse + write all) | ~5ms |
| Read 1 entity | ~50ms (read + parse all) | ~2ms |
| Update 1 entity | ~150ms | ~5ms |
| List 100 entities | ~50ms | ~15ms (index + 100 reads) |
| Delete 1 entity | ~150ms | ~3ms |

### Memory Usage

| Scenario | Current | Proposed |
|----------|---------|----------|
| 1000 requirements loaded | ~5MB | ~500KB (index only) |
| With LRU cache (100 items) | ~5MB | ~1MB |

---

*Document created: 2024-12-07*
*Last updated: 2024-12-07*
