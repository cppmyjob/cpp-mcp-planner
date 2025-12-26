# Multi-Workspace Support for MCP Planning Server

MCP connects to different repositories, each creating its own `.mcp-plans`. To view plans, a separate Web Server + Dashboard is needed for each repository.

**Solution:** Centralized storage with explicit project name:
- All plans stored in one location: `~/.mcp-planner` (or via env var)
- User specifies project name when creating a plan
- One Web Server + Dashboard displays all plans grouped by projects

**Storage Structure:**
```
~/.mcp-planner/
└── {projectId}/
    ├── project.json
    └── plans/{planId}/
```

**Status**: completed
**Progress**: 100%

## Requirements

### Data Model Changes (types.ts)

Modify PlanManifest: name and description - optional. Add projectId (required), projectPath (optional).

Add new types:
- ProjectConfig: { projectId: string, name?: string, description?: string } - for .mcp-config.json
- ProjectInfo: { id: string, name?: string, path?: string, plansCount: number, createdAt: string, updatedAt: string } - for project information in storage

**Priority**: critical | **Category**: technical

**Acceptance Criteria**:
- PlanManifest.name became optional
- PlanManifest.description became optional
- PlanManifest contains projectId (required) and projectPath (optional)
- Added ProjectConfig type: { projectId, name?, description? }
- Added ProjectInfo type: { id, name?, path?, plansCount, createdAt, updatedAt }
- Added GroupedPlansResult type

### Infrastructure Changes - Project Repository

Create FileProjectRepository for managing project directories. Change path logic: was baseDir/plans/planId/, became baseDir/projectId/plans/planId/

**Priority**: critical | **Category**: technical

**Acceptance Criteria**:
- FileProjectRepository created with projectId validation
- ProjectRepository interface defined
- RepositoryFactory.createProjectRepository() added
- FilePlanRepository accepts projectId for path formation
- Atomic write of project.json

### Services Changes - ProjectService

Create new ProjectService with methods: registerProject, getProject, listProjects, updateProject, deleteProject. Update PlanService for filtering by projectId and plan grouping.

**Priority**: critical | **Category**: technical

**Acceptance Criteria**:
- ProjectService created with all CRUD methods
- PlanService.createPlan() requires projectId
- PlanService.listPlans() supports filtering by projectId
- PlanService.listPlansGrouped() added

### MCP Server Changes

MCP Server reads .mcp-config.json from process.cwd() at startup to get projectId and name. Default storage path: ~/.mcp-planner (or MCP_PLANNER_STORAGE env var). create_plan does NOT require projectId (taken from config). Add init_project tool for creating .mcp-config.json.

**Priority**: high | **Category**: technical

**Acceptance Criteria**:
- MCP Server reads .mcp-config.json from process.cwd() at startup
- Default storage path: ~/.mcp-planner or %USERPROFILE%\.mcp-planner
- MCP_PLANNER_STORAGE env var supported
- create_plan: projectId taken from config, not passed explicitly
- init_project tool creates .mcp-config.json interactively
- list_plans: projectId filter optional

### Web Server Changes - Projects Module

Create new ProjectsModule with REST API for projects. Endpoints: GET/POST /projects, GET/PATCH/DELETE /projects/:id, GET /projects/:id/plans. Update PlansController for filtering by projectId.

**Priority**: high | **Category**: technical

**Acceptance Criteria**:
- GET /api/v1/projects - list all projects
- GET /api/v1/projects/:id - get project
- GET /api/v1/projects/:id/plans - project plans
- POST /api/v1/projects - create project
- PATCH /api/v1/projects/:id - update project
- DELETE /api/v1/projects/:id - delete project
- GET /api/v1/plans?projectId=xxx works
- POST /api/v1/plans requires projectId

### Web Dashboard Changes - Project Selector

Add Project selector to Header. Flow: Project - Plan - Features. When changing Project, Plan selector resets. Saving active-project-id in localStorage.

**Priority**: high | **Category**: functional

**Acceptance Criteria**:
- Header contains two dropdowns: Project and Plan
- ProjectService (API client) created
- ProjectStateService (signal-based state) created
- PlanService.list() supports projectId filter
- When changing Project - Plan selector resets
- active-project-id saved in localStorage
- If name is not set - projectId is displayed

### ProjectId Validation

ProjectId validation: only characters allowed for directory name. Regex: /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/. Prohibited: /, \, :, *, ?, ", spaces and other special characters.

**Priority**: critical | **Category**: non-functional

**Acceptance Criteria**:
- isValidProjectId() validator created
- Regex: /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
- Validation applied when creating project/plan
- Clear error messages

### Configuration Constants

Add constants for centralized storage. DEFAULT_CENTRAL_STORAGE with variants for Windows and POSIX. ENV_VARS.STORAGE_PATH for environment variable.

**Priority**: medium | **Category**: technical

**Acceptance Criteria**:
- DEFAULT_CENTRAL_STORAGE.windows = %USERPROFILE%\.mcp-planner
- DEFAULT_CENTRAL_STORAGE.posix = ~/.mcp-planner
- ENV_VARS.STORAGE_PATH = MCP_PLANNER_STORAGE

### Local Project Configuration

Each project should have .mcp-config.json in the root directory. File contains projectId (required) and name (optional). MCP Server automatically reads config at startup from process.cwd(). projectId is generated from directory name, name is set by user.

**Implementation:** ConfigService (with lazy loading) + ConfigRepository for reading and caching local config.

**Priority**: critical | **Category**: technical

**Acceptance Criteria**:
- .mcp-config.json file in project root
- projectId field required, generated from directory name
- name field optional, set by user
- MCP Server reads config from process.cwd() at startup
- workspacePath determined automatically as process.cwd()

### Project Initialization Tool

CLI command init_project for project initialization. Creates .mcp-config.json in current directory, generates projectId from directory name (kebab-case), requests name interactively (optional). Checks that file does not exist and outputs success message.

**Priority**: high | **Category**: functional

**Acceptance Criteria**:
- MCP tool init_project creates .mcp-config.json
- projectId generated from current directory name
- name requested interactively (optional)
- Check for file existence before creation
- Success message with projectId and name
- Error if .mcp-config.json already exists

## Solutions

### Local project configuration + centralized storage [SELECTED]

Each project has .mcp-config.json in root directory with projectId and name. MCP Server reads config from process.cwd() at startup and automatically determines workspacePath. Plans stored centrally in ~/.mcp-planner/{projectId}/plans/. One Web Server shows plans of all projects.

**Trade-offs**:
- **Migration simplicity**: +No migration of existing data needed - starting with clean slate / -Old plans in .mcp-plans won't be visible
- **Project isolation**: +Each project in its own directory, Easy to backup/delete entire project / -Cannot share plans between projects
- **User Experience**: +One Dashboard for all projects, Clear Project - Plan hierarchy / -Additional project selection step

## Phases

- **1. Step 1: Core Package - Types & Validators** [DONE]
  - **1.2. [RED->GREEN] Add projectId, projectPath to PlanManifest** [DONE]
  - **1.3. [RED->GREEN] Add ProjectConfig type** [DONE]
  - **1.4. [RED->GREEN] Add ProjectInfo type** [DONE]
  - **1.5. [RED->GREEN] Add isValidProjectId() validator** [DONE]
  - **1.6. [RED] Test enhanced projectId validation** [DONE]
  - **1.7. [GREEN] Implement enhanced isValidProjectId()** [DONE]
  - **1.8. [RED] Test updates for plan-service.test.ts (Step 1)** [DONE]
  - **1.99. [ORDER+RUN] Lint and tests Step 1** [DONE]
- **2. Step 2: Core Package - Repository** [DONE]
  - **2.1. [RED->GREEN] Create ConfigRepository interface** [DONE]
  - **2.10. [GREEN] Update FileRepository and Factory for projectId paths** [DONE]
  - **2.2. [RED->GREEN] Implement FileConfigRepository** [DONE]
  - **2.4. [RED->GREEN] Update FilePlanRepository - projectId for paths** [DONE]
  - **2.5. [RED] Test symlink detection in file operations** [DONE]
  - **2.6. [GREEN] Implement assertNotSymlink() utility** [DONE]
  - **2.7. [RED] Test tilde expansion for storage path** [DONE]
  - **2.8. [GREEN] Implement expandTilde() utility** [DONE]
  - **2.9. [RED] Test updates for file-repository.test.ts** [DONE]
  - **2.99. [ORDER+RUN] Lint and tests Step 2** [DONE]
- **3. Step 3: Core Package - Services** [DONE]
  - **3.1. [RED->GREEN] Create ConfigService** [DONE]
  - **3.2. [RED->GREEN] Create ProjectService** [DONE]
  - **3.3. [RED->GREEN] PlanService.createPlan() - auto-detect projectId** [DONE]
  - **3.4. [RED->GREEN] Update ActivePlanMapping - add projectId** [DONE]
  - **3.5. [RED] Test ConfigService lazy loading pattern** [DONE]
  - **3.6. [GREEN] Implement ConfigService with lazy loading** [DONE]
  - **3.7. [RED] Test case-insensitive projectId conflict detection** [DONE]
  - **3.8. [GREEN] Add case-insensitive conflict detection to ProjectService** [DONE]
  - **3.9. [RED] Test updates for plan-service.test.ts (createPlan with projectId)** [DONE]
  - **3.99. [ORDER+RUN] Lint and tests Step 3** [DONE]
- **4. Step 4: MCP Server** [DONE]
  - **4.10. [RED->GREEN] Initialize ConfigService at startup** [DONE]
  - **4.14. [RED->GREEN] Create project tool - init action** [DONE]
  - **4.15. [RED->GREEN] Create project tool - CRUD actions** [DONE]
  - **4.16. [RED->GREEN] Register project tool** [DONE]
  - **4.17. [RED] Test config file error scenarios** [DONE]
  - **4.18. [GREEN] Implement config file error handling** [DONE]
  - **4.19. [RED] Test workspace path validation** [DONE]
  - **4.2. [RED->GREEN] Update plan tool - remove projectId parameter** [DONE]
  - **4.20. [GREEN] Implement workspace path validation** [DONE]
  - **4.21. [RED] Test updates for test-utils.ts and E2E tests** [DONE]
  - **4.3. [RED->GREEN] Update plan tool - filtering by projectId** [DONE]
  - **4.99. [ORDER+RUN] Lint and tests Step 4** [DONE]
- **5. Step 5: Web Server** [DONE]
  - **5.1. [RED->GREEN] Create ProjectsModule with controller** [DONE]
  - **5.2. [RED->GREEN] Update CoreModule - add Project providers** [DONE]
  - **5.3. [RED->GREEN] Update PlansController - query params** [DONE]
  - **5.4. [RED->GREEN] Update DTOs** [DONE]
  - **5.6. [RED] Test query param sanitization in PlansController** [DONE]
  - **5.7. [GREEN] Implement query param sanitization** [DONE]
  - **5.8. [RED] Test updates for plans.e2e-spec.ts** [DONE]
  - **5.99. [ORDER+RUN] Lint and tests Step 5** [DONE]
- **6. Step 6: Web Dashboard** [DONE]
  - **6.1. [RED->GREEN] Add ProjectInfo model to models/** [DONE]
  - **6.2. [RED->GREEN] Update PlanManifest model** [DONE]
  - **6.3. [RED->GREEN] Create ProjectService (API client)** [DONE]
  - **6.4. [RED->GREEN] Create ProjectStateService (signal-based state)** [DONE]
  - **6.5. [RED->GREEN] Update HeaderComponent - project selector** [DONE]
  - **6.6. [RED->GREEN] Update PlanService.list() - filtering by projectId** [DONE]
  - **6.7. [RED->GREEN] Update localStorage persistence - active-project-id** [DONE]
  - **6.8. [RED->GREEN] Create ProjectInitDialog component** [DONE]
  - **6.9. [REFACTOR] Implement Flow: Project - Plan - Features** [DONE]
  - **6.99. [ORDER+RUN] Lint and tests Step 6** [DONE]

## Artifacts

### Core Package - Critical Files

Files to modify/create in @mcp-planner/core

**Type**: documentation

**Files**:
- `packages/core/src/domain/entities/types.ts` [modify] - Add project fields, name/description optional
- `packages/core/src/domain/services/plan-service.ts` [modify] - Filter by project, pass projectId
- `packages/core/src/domain/services/project-service.ts` [create] - New service
- `packages/core/src/domain/services/validators.ts` [modify] - ProjectId validation (regex)
- `packages/core/src/infrastructure/repositories/file/file-project-repository.ts` [create] - New repository
- `packages/core/src/infrastructure/repositories/file/file-plan-repository.ts` [modify] - Change paths considering projectId
- `packages/core/src/infrastructure/factory/repository-factory.ts` [modify] - Change path logic

### MCP Server - Critical Files

Files to modify in @mcp-planner/mcp-server

**Type**: documentation

**Files**:
- `packages/mcp-server/src/cli.ts` [modify] - Centralized path
- `packages/mcp-server/src/server/handlers/plan-handler.ts` [modify] - projectId parameter

### Web Server - Critical Files

Files to modify/create in @mcp-planner/web-server

**Type**: documentation

**Files**:
- `packages/web-server/src/modules/core/core.module.ts` [modify] - DI for project
- `packages/web-server/src/modules/projects/projects.module.ts` [create] - New module
- `packages/web-server/src/modules/projects/projects.controller.ts` [create] - New controller

### Web Dashboard - Critical Files

Files to modify/create in @mcp-planner/web-dashboard

**Type**: documentation

**Files**:
- `packages/web-dashboard/src/app/models/plan.model.ts` [modify] - projectId, name/description optional
- `packages/web-dashboard/src/app/models/project.model.ts` [create] - New ProjectInfo model
- `packages/web-dashboard/src/app/core/services/api/project.service.ts` [create] - New API service
- `packages/web-dashboard/src/app/core/services/project-state.service.ts` [create] - New state service
- `packages/web-dashboard/src/app/core/services/api/plan.service.ts` [modify] - Add projectId filter
- `packages/web-dashboard/src/app/layout/header/header.ts` [modify] - Project selector dropdown

### Storage Structure

New directory structure for centralized storage

**Type**: documentation
 | **Language**: markdown
 | **File**: storage-structure.md

```markdown
# Storage Structure

```
~/.mcp-planner/                   # Or MCP_PLANNER_STORAGE
└── {projectId}/                  # Project directory
    ├── project.json              # ProjectInfo: { id, name?, path? }
    └── plans/
        └── {planId}/
            ├── manifest.json     # Includes projectId
            ├── entities/
            ├── links.json
            └── history/
```

## Example

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

---

## API Design

### Projects API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/projects` | List all projects |
| GET | `/api/v1/projects/:id` | Get project by projectId |
| GET | `/api/v1/projects/:id/plans` | Project plans |
| POST | `/api/v1/projects` | Create project |
| PATCH | `/api/v1/projects/:id` | Update project (name, path) |
| DELETE | `/api/v1/projects/:id` | Delete project |

### Modified Endpoints

- `GET /api/v1/plans?projectId=xxx` - filter by project
- `GET /api/v1/plans?groupByProject=true` - grouping
- `POST /api/v1/plans` - changed:
  - `projectId` (required)
  - `name` (optional)
  - `description` (optional)
  - `projectPath` (optional)
```
