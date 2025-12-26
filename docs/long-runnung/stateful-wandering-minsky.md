# Multi-Workspace Support for MCP Planning Server

## Problem

MCP connects to different repositories, each creating its own `.mcp-plans`. To view plans, a separate Web Server + Dashboard is needed for each repository.

## Solution

**Centralized storage with explicit project name**:
- All plans stored in one location: `~/.mcp-planner` (or via env var)
- User specifies project name when creating a plan
- One Web Server + Dashboard displays all plans grouped by projects

---

## Architecture Changes

### 1. Data Model (`packages/core/src/domain/entities/types.ts`)

**Modify PlanManifest:**
```typescript
export interface PlanManifest {
  id: string;
  name?: string;              // CHANGED: Optional (was required)
  description?: string;       // CHANGED: Optional (was required)
  status: PlanStatus;
  author: string;
  // ... rest existing fields ...

  // NEW: Project identification
  projectId: string;          // Required - unique project identifier (valid dir name)
  projectPath?: string;       // Optional - informational, absolute path to workspace
}
```

**Add new type:**
```typescript
export interface ProjectInfo {
  id: string;                 // Unique project identifier (key, valid dir name)
  name?: string;              // Optional user-friendly display name
  path?: string;              // Optional - informational, workspace path
}
```

### 2. Infrastructure

**New file: `packages/core/src/infrastructure/repositories/file/file-project-repository.ts`**
- Manages project directories in `{baseDir}/{projectId}/`
- Stores `project.json` inside project directory
- ProjectId validation (allowed characters for directory name)
- CRUD operations for projects
- Atomic write

**Modify: `packages/core/src/infrastructure/factory/repository-factory.ts`**
- Add `createProjectRepository()` method
- **Change path logic**: `baseDir` now contains projectId
  - Was: `{baseDir}/plans/{planId}/`
  - Became: `{baseDir}/{projectId}/plans/{planId}/`

**Modify: `packages/core/src/infrastructure/repositories/file/file-plan-repository.ts`**
- Constructor accepts `projectId` for path formation
- `plansDir` = `{baseDir}/{projectId}/plans/`

### 3. Services

**Modify: `packages/core/src/domain/services/plan-service.ts`**

```typescript
// CreatePlanInput - change field requirements
interface CreatePlanInput {
  projectId: string;          // Required - unique project key (valid dir name)
  name?: string;              // CHANGED: Optional (was required)
  description?: string;       // CHANGED: Optional (was required)
  projectPath?: string;       // Optional - informational only
  // ... rest ...
}

// ListPlansInput - add filtering
interface ListPlansInput {
  projectId?: string;         // NEW: Filter by project
  groupByProject?: boolean;   // NEW: Return grouped result
  // ... rest ...
}

// New method
listPlansGrouped(): Promise<GroupedPlansResult>
```

**New service: `packages/core/src/domain/services/project-service.ts`**
- `registerProject(info: ProjectInfo)` - creates/updates project
- `getProject(id: string)` - get by projectId
- `listProjects()` - list all projects
- `updateProject(id: string, updates: Partial<ProjectInfo>)` - update name/path
- `deleteProject(id: string)` - delete project

### 4. MCP Server (`packages/mcp-server/`)

**Modify: `packages/mcp-server/src/cli.ts`**
```typescript
// Default centralized storage
const getDefaultStorage = () => {
  if (process.platform === 'win32') {
    return path.join(process.env.USERPROFILE ?? '', '.mcp-planner');
  }
  return path.join(process.env.HOME ?? '', '.mcp-planner');
};

const storagePath = process.env.MCP_PLANNER_STORAGE ?? getDefaultStorage();
```

**Modify: Tool definitions**
- `create_plan` - modify:
  - `projectId` (required) - unique project identifier (valid dir name)
  - `name` (optional) - user-friendly plan name
  - `description` (optional) - plan description
  - `projectPath` (optional) - informational path to workspace
- `list_plans` - add optional `projectId` parameter for filtering

### 5. Web Server (`packages/web-server/`)

**New module: `packages/web-server/src/modules/projects/`**
- `projects.controller.ts` - REST API for projects
- `projects.module.ts` - NestJS module
- DTOs for request/response

**API endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/projects` | List all projects |
| GET | `/api/v1/projects/:id` | Get project by projectId |
| GET | `/api/v1/projects/:id/plans` | Project plans |
| POST | `/api/v1/projects` | Create project |
| PATCH | `/api/v1/projects/:id` | Update project (name, path) |
| DELETE | `/api/v1/projects/:id` | Delete project |

**Modify existing endpoints:**
- `GET /api/v1/plans?projectId=xxx` - filter by project
- `GET /api/v1/plans?groupByProject=true` - grouping
- `POST /api/v1/plans` - modify:
  - `projectId` (required)
  - `name` (optional)
  - `description` (optional)
  - `projectPath` (optional)

**Modify: `packages/web-server/src/modules/core/core.module.ts`**
- Add `ProjectRepository` to providers
- Add `ProjectService` to providers

### 6. Web Dashboard (`packages/web-dashboard/`)

**Current architecture:**
- Header contains plan selection dropdown
- PlanStateService stores active planId in signal
- All components react to planId changes via effects

**Changes for project support:**

**New service: `packages/web-dashboard/src/app/core/services/api/project.service.ts`**
```typescript
@Injectable({ providedIn: 'root' })
export class ProjectService {
  list(): Observable<ProjectInfo[]>
  get(projectId: string): Observable<ProjectInfo>
  getPlans(projectId: string): Observable<PlanManifest[]>
}
```

**New state service: `packages/web-dashboard/src/app/core/services/project-state.service.ts`**
```typescript
@Injectable({ providedIn: 'root' })
export class ProjectStateService {
  readonly activeProjectId = signal<string | null>(null);

  setActiveProject(projectId: string): void
  clearActiveProject(): void
}
```

**Modify: `packages/web-dashboard/src/app/layout/header/header.ts`**
- Add project selector (first dropdown)
- Plan selector filtered by selected project
- Flow: Project → Plan → Features

**Modify: `packages/web-dashboard/src/app/core/models/plan.model.ts`**
```typescript
export interface PlanManifest {
  id: string;
  name?: string;              // Optional
  description?: string;       // Optional
  projectId: string;          // NEW: Required
  projectPath?: string;       // NEW: Optional
  // ... rest
}

export interface ProjectInfo {
  id: string;
  name?: string;
  path?: string;
}
```

**UI Design - Header Dropdowns:**
```
┌─────────────────────────────────────────────────────────┐
│ Header                                                  │
│ ┌─────────────────┐  ┌─────────────────┐                │
│ │ Project: [▼]    │  │ Plan: [▼]       │  [User Menu]   │
│ │ my-awesome-app  │  │ Sprint 1        │                │
│ └─────────────────┘  └─────────────────┘                │
└─────────────────────────────────────────────────────────┘

Flow:
1. User selects Project → project plans are loaded
2. User selects Plan → plan content is loaded
3. When Project changes → Plan selector resets
```

**Modify: `packages/web-dashboard/src/app/core/services/api/plan.service.ts`**
```typescript
// Add project filtering
list(params?: { projectId?: string }): Observable<PlanManifest[]>
```

**Modify: LocalStorage keys**
- `active-project-id` - save selected project
- `active-plan-id` - save selected plan

### 7. Configuration (`packages/config/`)

**Modify: `packages/config/src/constants.ts`**
```typescript
export const DEFAULT_CENTRAL_STORAGE = {
  windows: '%USERPROFILE%\\.mcp-planner',
  posix: '~/.mcp-planner',
};

export const ENV_VARS = {
  STORAGE_PATH: 'MCP_PLANNER_STORAGE',
};
```

---

## Implementation Order

### Step 1: Core Package - Types & Validators
- [ ] Modify `PlanManifest`: `name` and `description` → optional
- [ ] Add `projectId` (required), `projectPath` (optional) to `PlanManifest`
- [ ] Add `ProjectInfo` type
- [ ] Add `GroupedPlansResult` type
- [ ] Add `isValidProjectId(id: string)` validator to `validators.ts`
  - Regex: `/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`

### Step 2: Core Package - Repository
- [ ] Create `ProjectRepository` interface
- [ ] Implement `FileProjectRepository` with projectId validation
- [ ] Update `RepositoryFactory` - change path logic
- [ ] Update `FilePlanRepository` - accept projectId for paths

### Step 3: Core Package - Services
- [ ] Create `ProjectService`
- [ ] Update `PlanService.createPlan()` - require projectId
- [ ] Update `PlanService.listPlans()` - add filtering by projectId
- [ ] Add `PlanService.listPlansGrouped()`

### Step 4: MCP Server
- [ ] Update default storage path in `cli.ts`
- [ ] Update `create_plan` tool - add projectId (required), projectName, projectPath
- [ ] Update `list_plans` tool - add filtering by projectId

### Step 5: Web Server
- [ ] Create `ProjectsModule` with controller
- [ ] Update `CoreModule` - add ProjectRepository, ProjectService
- [ ] Update `PlansController` - add query params
- [ ] Update DTOs

### Step 6: Web Dashboard
- [ ] Add `ProjectInfo` model to `models/`
- [ ] Update `PlanManifest` model - add `projectId`, make `name`/`description` optional
- [ ] Create `ProjectService` (API client)
- [ ] Create `ProjectStateService` (state management)
- [ ] Update `HeaderComponent` - add project selector
- [ ] Update `PlanService.list()` - filtering by projectId
- [ ] Update localStorage persistence - add `active-project-id`

### Step 7: Testing
- [ ] Unit tests for ProjectService (core)
- [ ] E2E tests for /projects endpoints (web-server)
- [ ] Integration tests for plan grouping
- [ ] E2E tests for dashboard project selector

---

## Critical Files

### Core Package
| File | Change |
|------|--------|
| `packages/core/src/domain/entities/types.ts` | Add project fields, name/description optional |
| `packages/core/src/domain/services/plan-service.ts` | Filter by project, pass projectId |
| `packages/core/src/domain/services/project-service.ts` | New service |
| `packages/core/src/domain/services/validators.ts` | ProjectId validation (regex) |
| `packages/core/src/infrastructure/repositories/file/file-project-repository.ts` | New repository |
| `packages/core/src/infrastructure/repositories/file/file-plan-repository.ts` | Change paths considering projectId |
| `packages/core/src/infrastructure/factory/repository-factory.ts` | Change path logic |

### MCP Server
| File | Change |
|------|--------|
| `packages/mcp-server/src/cli.ts` | Centralized path |
| `packages/mcp-server/src/server/handlers/plan-handler.ts` | projectId parameter |

### Web Server
| File | Change |
|------|--------|
| `packages/web-server/src/modules/core/core.module.ts` | DI for project |
| `packages/web-server/src/modules/projects/*.ts` | New module |

### Web Dashboard
| File | Change |
|------|--------|
| `packages/web-dashboard/src/app/core/models/plan.model.ts` | projectId, name/description optional |
| `packages/web-dashboard/src/app/core/models/project.model.ts` | New ProjectInfo model |
| `packages/web-dashboard/src/app/core/services/api/project.service.ts` | New API service |
| `packages/web-dashboard/src/app/core/services/project-state.service.ts` | New state service |
| `packages/web-dashboard/src/app/core/services/api/plan.service.ts` | Add projectId filter |
| `packages/web-dashboard/src/app/layout/header/header.ts` | Project selector dropdown |

---

## Storage Structure (new)

```
~/.mcp-planner/                   # Or MCP_PLANNER_STORAGE
└── {projectId}/                  # Project directory (projectId = valid dir name)
    ├── project.json              # ProjectInfo: { id, name?, path? }
    └── plans/
        └── {planId}/
            ├── manifest.json     # Includes projectId, projectName?, projectPath?
            ├── entities/
            ├── links.json
            └── history/
```

**Example:**
```
~/.mcp-planner/
├── my-awesome-app/
│   ├── project.json
│   └── plans/
│       └── abc-123/
├── backend-api/
│   ├── project.json
│   └── plans/
│       ├── def-456/
│       └── ghi-789/
└── shared-lib/
    ├── project.json
    └── plans/
```

## Notes

- Migration of existing plans NOT needed - starting with clean slate
- `projectId` becomes required when creating a plan (unique key)
- **ProjectId validation**: only characters allowed for directory name
  - Allowed: `a-z`, `A-Z`, `0-9`, `-`, `_`, `.`
  - Prohibited: `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`, spaces
  - Regex: `/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`
- `name` - optional user-friendly name (was required)
- `description` - optional description (was required)
- `projectPath` - purely informational field (path to workspace)
- Dashboard displays plans grouped by projects (projectId)
- If `name` is not set, UI displays `projectId`
- Each project is isolated in its own directory
