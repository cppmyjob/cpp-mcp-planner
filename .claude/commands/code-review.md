---
description: "Code review for MCP Planning Server. Checks domain, services, server, infrastructure. Creates TDD sprints."
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - mcp__planning__plan
  - mcp__planning__requirement
  - mcp__planning__solution
  - mcp__planning__decision
  - mcp__planning__phase
  - mcp__planning__batch
  - mcp__planning__link
argument-hint: "[--auto-sprint]"
---

# Code Review: MCP Planning Server

## Unpushed Changes

**Branch:**
!`git branch --show-current`

**Commits (local only):**
!`git log --oneline @{u}..HEAD`

**Modified files:**
!`git diff --name-only @{u}..HEAD`

**Statistics:**
!`git diff --stat @{u}..HEAD`

**Full diff:**
!`git diff @{u}..HEAD`

---

## ESLint Check

**MANDATORY STEP - Launch ESLint Agent:**

Before analyzing code manually, launch a separate agent to handle ESLint:

```typescript
Task({
  subagent_type: "general-purpose",
  description: "Fix ESLint violations",
  prompt: `
# ESLint Auto-Fix and Manual Correction

## Your Task:
1. Run \`npm run lint\` to check for violations
2. Run \`npm run lint:fix\` to auto-fix what's possible
3. Run \`npm run lint\` again to see remaining errors
4. For EACH remaining error:
   - Read the file with the error
   - Manually fix the violation according to eslint.config.js rules
   - Ensure the fix follows CLAUDE.md best practices
5. Run \`npm run lint\` one final time to verify all errors are fixed
6. Report summary: how many auto-fixed, how many manually fixed

## Important:
- Fix ALL errors, not just some
- Follow eslint.config.js:5-200 strictly
- Reference CLAUDE.md for context on each rule
- Do NOT skip any violations
  `
})
```

**Wait for the ESLint agent to complete before continuing with manual code review.**

---

## Your Task

After ESLint agent completes, analyze unpushed commits for compliance with project standards (see CLAUDE.md).

**Arguments:**
- `--auto-sprint`: Auto-create sprint for CRITICAL/HIGH issues (skip confirmation)

---

## Review Process

### Step 1: Context Gathering
Before analyzing the diff:
1. Read modified files in full (use Read tool, not just diff)
2. Check imported modules for existing patterns
3. Look at similar implementations in codebase (use Grep/Glob)
4. Review related tests if present

### Step 2: Analysis (Chain-of-Thought)
For each potential issue, apply this reasoning chain:
1. **Observe:** What exactly looks problematic in the code?
2. **Reason:** Why is this an issue? What's the potential impact?
3. **Verify:** Is this a real issue or an intentional pattern (check CLAUDE.md)?
4. **Recommend:** Only if verified as real issue, provide specific fix with code

### Step 3: Report
Generate structured report. Each finding MUST have:
- Explicit reasoning (not just "this is wrong")
- Code suggestion showing the fix

---

## What NOT to Flag

Avoid false positives by NOT flagging:
- Patterns explicitly documented in CLAUDE.md
- Style preferences without functional impact
- Issues already caught by TypeScript compiler
- Intentional complexity in inherently complex algorithms
- Legacy code not part of current changes
- Test fixtures and mock data

---

## Checklist (5 Categories)

### 1. ENTITY & TYPE DESIGN (Critical)

- [ ] Status fields use literal unions (not plain strings)?
- [ ] Version field present and incremented on updates?
- [ ] Effort estimates use structured format `{ value, unit, confidence }`?
- [ ] Priority uses standard enum `critical | high | medium | low`?
- [ ] Phase hierarchy: order based on max(sibling.order)+1?

**Anti-patterns:** String status instead of union, missing version increment, legacy hours/complexity format

### 2. SERVICE PATTERNS (High)

- [ ] Input/Output types separated (AddXInput → AddXResult)?
- [ ] Field filtering supported (fields, excludeMetadata, excludeComputed)?
- [ ] Validation using validators.ts (validateEffortEstimate, validateTags, validateTargets, validateCodeRefs)?
- [ ] Service dependencies injected correctly (order matters)?
- [ ] Version history integration if applicable?
- [ ] Batch tempId fields correct (parentId, addressing, sourceId, targetId, relatedRequirementIds)?

**Anti-patterns:** Mixed input/output, inline validation, missing field filtering, wrong service init order, unknown tempId fields

### 3. ERROR HANDLING & MCP SERVER (High)

- [ ] Custom errors used (NotFoundError, ValidationError, ConflictError, LockError)?
- [ ] Error context preserved on re-throw?
- [ ] MCP server: plain Error with code, NOT McpError (prevents double-wrap)?
- [ ] Entity type and ID included in error messages?
- [ ] Array index included in validation errors?
- [ ] MCP handlers: action-based routing (not separate tools)?
- [ ] MCP response: JSON in content[0].text?

**Anti-patterns:** Generic `new Error()`, lost stack trace, McpError in server, separate tools per action, wrong response format

### 4. CONCURRENCY & STORAGE (Medium)

- [ ] FileLockManager for file operations (cross-process)?
- [ ] `withLock()` instead of manual acquire/release?
- [ ] Atomic writes (temp file → rename)?
- [ ] Cache invalidation on update?
- [ ] Batch operations use atomic semantics (rollback on failure)?

**Anti-patterns:** In-memory lock for files, manual lock without finally, non-atomic writes

### 5. TESTING (Medium)

- [ ] TDD markers present (RED/GREEN/REFACTOR/REVIEW)?
- [ ] Test setup uses temp directory pattern?
- [ ] Cleanup in afterEach?
- [ ] UUID format assertions where needed?
- [ ] Error scenarios tested with rejects.toThrow?

**Anti-patterns:** Missing TDD markers, shared test state, no cleanup, missing error tests

---

## Report Format

```markdown
## Code Review Report

**Branch:** {branch}
**Files:** {count} | **Lines:** +{add} -{del}

### Findings

#### CRITICAL ({count})

### [C-1] {title}

**Location:** `{path}:{line}`
**Category:** {Entity Design | Service | Error | Concurrency | Testing}

**Reasoning:**
{Explain: what is problematic, why it's an issue, potential impact}

**Recommendation:**
{What to change and why}

\`\`\`suggestion
// Before
{original code}

// After
{fixed code}
\`\`\`

---

#### HIGH ({count})
{same format as CRITICAL}

#### MEDIUM ({count})
{same format}

#### LOW ({count})
{same format}

### Summary
- Critical: {n} | High: {n} | Medium: {n} | Low: {n}
```

---

## MCP Sprint Creation

**When:** CRITICAL or HIGH issues found AND (--auto-sprint OR user confirms)

**Decision flow:**
1. No issues → Exit
2. Only LOW/MEDIUM → Report only (no sprint)
3. CRITICAL/HIGH + --auto-sprint → Create sprint automatically
4. CRITICAL/HIGH + no flag → Ask user, create on "yes"

### Get Active Plan

```typescript
const plan = await mcp__planning__plan({ action: "get_active" });
if (!plan?.planId) throw new Error("No active plan. Activate one first.");
```

### Create Sprint (Batch)

```typescript
await mcp__planning__batch({
  planId: plan.planId,
  operations: [
    // Requirement
    { entity_type: "requirement", payload: {
      tempId: "$0",
      title: `Fix ${category} Issues (${count})`,
      priority: severity === 'CRITICAL' ? 'critical' : 'high',
      category: "technical",
      acceptanceCriteria: ["All issues fixed", "Tests added", "No regressions"]
    }},
    // Solution
    { entity_type: "solution", payload: {
      tempId: "$10",
      title: `TDD Fix: ${category}`,
      addressing: ["$0"],
      approach: "RED → GREEN → REFACTOR → REVIEW"
    }},
    // Phases (TDD flow)
    { entity_type: "phase", payload: { tempId: "$100", title: "RED: Write Failing Tests", priority: "critical" }},
    { entity_type: "phase", payload: { tempId: "$101", title: "GREEN: Implement Fixes", priority: "critical" }},
    { entity_type: "phase", payload: { tempId: "$102", title: "REFACTOR: Optimize", priority: "high" }},
    { entity_type: "phase", payload: { tempId: "$103", title: "REVIEW: Verify", priority: "high" }},
    // Links
    { entity_type: "link", payload: { sourceId: "$10", targetId: "$0", relationType: "implements" }},
    { entity_type: "link", payload: { sourceId: "$100", targetId: "$0", relationType: "addresses" }},
    { entity_type: "link", payload: { sourceId: "$101", targetId: "$0", relationType: "addresses" }},
    { entity_type: "link", payload: { sourceId: "$102", targetId: "$0", relationType: "addresses" }},
    { entity_type: "link", payload: { sourceId: "$103", targetId: "$0", relationType: "addresses" }},
    { entity_type: "link", payload: { sourceId: "$101", targetId: "$100", relationType: "depends_on" }},
    { entity_type: "link", payload: { sourceId: "$102", targetId: "$101", relationType: "depends_on" }},
    { entity_type: "link", payload: { sourceId: "$103", targetId: "$102", relationType: "depends_on" }}
  ]
});
```

### Confirmation Message

```
Sprint added to plan!

Requirements: {n} | Solutions: {n} | Phases: RED → GREEN → REFACTOR → REVIEW

Next: Start RED phase - write failing tests
```

---

## Edge Cases

| Scenario | Action |
|----------|--------|
| No unpushed commits | "All commits pushed, nothing to review" |
| No upstream branch | "No upstream branch configured. Use: git push -u origin {branch}" |
| No issues | "All checks passed" |
| --auto-sprint + only LOW/MEDIUM | Report only, explain why no sprint |
| No active plan | Error: "Activate a plan first" |
| Merge conflicts | "Resolve conflicts first" |
| Large diff (>1000 lines) | Warn, ask to continue |

---

## Quality Gates

Before submitting report, verify:
- [ ] Each finding has explicit **Reasoning** (not just "this is wrong")
- [ ] Each finding has **code suggestion** (before/after format)
- [ ] No findings for patterns documented in CLAUDE.md
- [ ] Severity is justified:
  - Critical = causes crash, data loss, or security issue
  - High = breaking change, wrong behavior
  - Medium = code smell, maintainability concern
  - Low = style, minor improvement
- [ ] False positive check: Would a senior dev agree this is a real issue?

---

## Reference

See **CLAUDE.md** for detailed Best Practices on:
- Entity types and versioning
- Service patterns and dependencies
- MCP server error handling
- Infrastructure and locking
- Validation and testing
