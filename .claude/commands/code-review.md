---
description: "Advanced code review - analyzes uncommitted changes for project standards compliance. Creates TDD sprints for bug fixes. Multi-process safety focused."
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

# Advanced Code Review for MCP Planning Server

## Current Changes

**Modified files:**
!`git diff --name-only HEAD`

**Change statistics:**
!`git diff --stat HEAD`

**Full diff:**
!`git diff HEAD`

**Current branch:**
!`git branch --show-current`

---

## Your Task

You are a code review expert for the **MCP Planning Server** project. Analyze the uncommitted changes shown above for compliance with project standards.

**CRITICAL REQUIREMENT:** This project runs in **multi-process mode**. All code must be safe for concurrent access from multiple Node.js processes.

**Command Arguments:**
- `--auto-sprint` (optional): If provided, automatically create sprint without user confirmation when CRITICAL or HIGH issues are found. Skip the "Reply 'yes'" prompt and proceed directly to MCP planner integration. Note: Only triggers for CRITICAL/HIGH severity - LOW/MEDIUM issues will not create a sprint automatically.

### Project Context

**Technology Stack:**
- **TypeScript 5.3+** with strict mode
- **Node.js 18+** with ES2022 modules
- **Jest** testing framework with TDD methodology
- **File-based storage** with proper-lockfile for **multi-process concurrency**
- **Clean Architecture**: domain/infrastructure layers

**Coding Standards:**

1. **TDD Methodology** — Tests must be marked with RED/GREEN/REFACTOR comments
2. **Type Safety** — Strict TypeScript, no `as any` allowed
3. **Async/Await** — All I/O operations must be asynchronous
4. **Error Classes** — Use custom errors from `domain/repositories/errors.ts` (NotFoundError, ValidationError, ConflictError, LockError, etc.)
5. **Validation** — Use centralized validators from `domain/services/validators.ts`
6. **Multi-Process Locking** — **MANDATORY** FileLockManager for ALL file operations (cross-process safety)
7. **Versioning** — Optimistic locking with version increments

---

## Deep Analysis Checklist

Perform comprehensive analysis across **7 categories** with **SPECIAL FOCUS on multi-process safety**:

### 1. TYPE SAFETY ANALYSIS

Check TypeScript strict mode compliance:

**❌ Anti-patterns to detect:**
- Usage of `as any` or `as unknown` (type evasion)
- Property access without null/undefined checks
- Unsafe type assertions without validation
- Missing return type annotations on public methods
- Unsafe array indexing without bounds checking
- Casting without validation

**✅ Correct patterns:**
```typescript
// CORRECT: Type guards and null checks
if (entity && typeof entity.property === 'string') {
  const value: string = entity.property;
}

// INCORRECT: Type evasion
const value = entity.property as any; // ❌
```

---

### 2. MULTI-PROCESS CONCURRENCY & RACE CONDITIONS

**🚨 CRITICAL CATEGORY - MULTI-PROCESS SAFETY**

This is the MOST IMPORTANT category. The project runs in multi-process mode where multiple Node.js processes access the same files concurrently.

**📘 FileLockManager API Quick Reference:**
```typescript
// Import
import { FileLockManager } from './infrastructure/repositories/file/file-lock-manager.js';

// Methods
acquire(resource: string) → Promise<() => Promise<boolean>>
  // Returns a release function. Call it in finally block.

withLock(resource, callback, options?) → Promise<T>
  // PREFERRED: Automatically handles acquire/release with cleanup

// Usage
const release = await lockManager.acquire('my-resource');
try {
  // critical section
} finally {
  await release(); // Returns true if clean, false if compromised
}

// OR (better)
await lockManager.withLock('my-resource', async () => {
  // critical section - auto cleanup
}, { acquireTimeout: 5000 });
```

**❌ Anti-patterns to detect (CRITICAL):**

**FILE OPERATIONS:**
- ❌ **CRITICAL:** File operations (read/write/delete) without FileLockManager
- ❌ **CRITICAL:** Using in-memory LockManager instead of FileLockManager (not multi-process safe)
- ❌ **CRITICAL:** Lock acquired but not released (missing finally block)
- ❌ **CRITICAL:** Lock timeout not handled
- ❌ **CRITICAL:** Reading file, then writing without holding lock throughout
- ❌ **CRITICAL:** Atomic operations (like atomicWrite) used without lock

**INITIALIZATION:**
- ❌ Double initialization without guards (missing `initialized` flag)
- ❌ `initialize()` called multiple times without checking `isInitialized()`
- ❌ Shared instances (like FileLockManager) not injected via constructor

**CACHE COHERENCY:**
- ❌ Cache read without lock, then mutation
- ❌ Cache not invalidated after mutations
- ❌ In-memory cache shared across processes (impossible - each process has own memory)
- ❌ TTL-based cache without cross-process invalidation

**STATE SHARING:**
- ❌ Shared mutable state (class-level variables that change)
- ❌ Singleton patterns without proper locking
- ❌ Event emitters shared across processes

**✅ Correct patterns for multi-process safety:**

```typescript
// CORRECT: File operation with FileLockManager
async create(entity: T): Promise<T> {
  const lockResource = `${this.entityType}:${entity.id}`;

  // Acquire cross-process lock (returns release function)
  const release = await this.fileLockManager.acquire(lockResource);
  try {
    // Perform file operation while holding lock
    await this.atomicWrite(entity); // atomicWrite = temp file + atomic rename
    this.entityCache.set(entity.id, entity); // Local cache only (each process has own)
  } finally {
    // MUST call release function in finally
    await release();
  }

  return entity;
}

// BEST PRACTICE: Use withLock() helper
async create(entity: T): Promise<T> {
  const lockResource = `${this.entityType}:${entity.id}`;

  return await this.fileLockManager.withLock(lockResource, async () => {
    await this.atomicWrite(entity); // Automatically handles acquire/release
    this.entityCache.set(entity.id, entity);
    return entity;
  });
}

// CORRECT: Shared FileLockManager injection
constructor(
  baseDir: string,
  fileLockManager?: FileLockManager // Inject shared instance
) {
  // Use shared instance or create new one
  this.fileLockManager = fileLockManager || new FileLockManager(baseDir);
}

// CORRECT: Double initialization guard
async initialize(): Promise<void> {
  if (this.initialized) {
    return; // Already initialized
  }

  // Only initialize FileLockManager if not already initialized (shared instance)
  if (!this.fileLockManager.isInitialized()) {
    await this.fileLockManager.initialize();
  }

  this.initialized = true;
}

// INCORRECT: File operation without lock
await this.writeFile(entity); // ❌ Missing FileLockManager

// INCORRECT: In-memory LockManager (not multi-process safe)
import { LockManager } from './lock-manager.js'; // ❌ Use FileLockManager instead
// CORRECT import:
import { FileLockManager } from './infrastructure/repositories/file/file-lock-manager.js';

// INCORRECT: Lock not released
const release = await this.fileLockManager.acquire(resource);
await this.operation(); // ❌ Missing try/finally - if this throws, lock is leaked!

// INCORRECT: Read-modify-write without lock
const data = await this.readFile(); // ❌ Not holding lock
data.value++;
await this.writeFile(data); // ❌ Race condition - another process may have modified file
```

**Multi-Process Race Condition Examples:**

```typescript
// ❌ RACE CONDITION EXAMPLE 1: Read without lock
// Process A reads entity version 1
const entity = await this.readEntity(id); // No lock
// Process B reads entity version 1
// Process A modifies and writes version 2
await this.writeEntity(entity);
// Process B modifies and writes version 2 (overwrites A's changes!)
// RESULT: Lost update

// ✅ CORRECT: Lock for entire read-modify-write
const release = await this.fileLockManager.acquire(`entity:${id}`);
try {
  const entity = await this.readEntity(id);
  entity.value++;
  await this.writeEntity(entity);
} finally {
  await release(); // Call the returned release function
}

// ✅ BEST PRACTICE: Use withLock() helper
await this.fileLockManager.withLock(`entity:${id}`, async () => {
  const entity = await this.readEntity(id);
  entity.value++;
  await this.writeEntity(entity);
});

// ❌ RACE CONDITION EXAMPLE 2: Cache invalidation
this.cache.delete(id); // ❌ Only invalidates THIS process's cache
// Other processes still have stale cached data
// RESULT: Data inconsistency

// ✅ CORRECT: No shared cache, or TTL-based with short duration
// Each process has its own cache (no cross-process cache)
// Use short TTL (5 seconds) to minimize staleness
```

---

### 3. ERROR HANDLING

Check custom error class usage:

**❌ Anti-patterns to detect:**
- `throw new Error("...")` instead of custom classes
- Async operations without try/catch
- Empty catch blocks: `catch (e) { }`
- Missing finally blocks for cleanup (especially for locks)
- Errors caught but not logged or rethrown
- Missing error propagation in batch operations
- Lock not released in error paths

**✅ Correct patterns:**
```typescript
// CORRECT: Custom error classes
import { NotFoundError, ValidationError, LockError } from './domain/repositories/errors.js';

if (!entity) {
  throw new NotFoundError('Phase', phaseId);
}

if (!input.title) {
  throw new ValidationError('Invalid input', [
    { field: 'title', message: 'Title is required', value: input.title }
  ]);
}

// CORRECT: Lock release in error path (manual pattern)
const release = await this.fileLockManager.acquire(resource);
try {
  await this.operation();
} catch (error) {
  // Handle error if needed
  throw error; // Release will still happen in finally
} finally {
  await release(); // Always called, even on error
}

// BEST PRACTICE: Use withLock() - handles errors automatically
try {
  await this.fileLockManager.withLock(resource, async () => {
    await this.operation();
  });
} catch (error) {
  // Lock automatically released even if operation throws
  throw error;
}

// INCORRECT: Generic Error
throw new Error('Phase not found'); // ❌ Use NotFoundError instead

// INCORRECT: Lock not released on error
const release = await this.fileLockManager.acquire(resource);
try {
  await this.operation();
  await release(); // ❌ Won't run if operation throws
} catch (error) {
  // Lock leaked!
}
```

---

### 4. TESTING GAPS

Check test coverage and TDD compliance:

**❌ Anti-patterns to detect:**
- New functionality without corresponding tests
- Tests without RED/GREEN/REFACTOR markers in comments
- Edge cases not covered (empty arrays, null, undefined)
- Missing tests for async error scenarios
- **No tests for concurrent operations** (CRITICAL for multi-process)
- Missing assertions in tests
- Tests don't verify negative scenarios

**✅ Correct patterns:**
```typescript
// CORRECT: TDD with markers
describe('PhaseService', () => {
  it('RED: should throw error for invalid phase', async () => {
    await expect(service.addPhase({ title: '' })).rejects.toThrow(ValidationError);
  });

  it('GREEN: should add phase successfully', async () => {
    const result = await service.addPhase({ title: 'Phase 1' });
    expect(result.phaseId).toBeDefined();
  });

  // IMPORTANT: Multi-process concurrent tests
  it('RED: should handle concurrent writes safely', async () => {
    const promises = Array(10).fill(null).map((_, i) =>
      service.addPhase({ title: `Phase ${i}` })
    );
    const results = await Promise.all(promises);
    // All should succeed, no race conditions
    expect(results).toHaveLength(10);
    expect(new Set(results.map(r => r.phaseId)).size).toBe(10);
  });
});

// INCORRECT: Test without edge cases
it('should work', async () => {
  const result = await service.method();
  // ❌ Missing edge case and error tests
  // ❌ Missing concurrent access tests
});
```

---

### 5. VALIDATION COMPLETENESS

Check validator usage:

**❌ Anti-patterns to detect:**
- Missing input validation before processing
- Array operations without length checks
- String operations without null/empty check
- No size limits on collections
- Validators from `validators.ts` not used
- Validation errors not actionable
- Missing format validation (UUID, regex patterns, enums)

**✅ Correct patterns:**
```typescript
// CORRECT: Use centralized validators
import { validateEffortEstimate, validateTags, validatePriority } from './domain/services/validators.js';

validateEffortEstimate(phase.estimatedEffort, 'phase.estimatedEffort');
validateTags(requirement.tags);
validatePriority(requirement.priority);

// INCORRECT: Inline validation without using validators.ts
if (!input.title || input.title.length === 0) { // ❌ Should use validator
  throw new Error('Invalid title');
}
```

---

### 6. RESOURCE MANAGEMENT

Check proper resource management (CRITICAL in multi-process):

**❌ Anti-patterns to detect:**
- File handles not closed
- **Locks not released (missing finally block)** - CRITICAL
- Unbounded caches (memory leaks)
- Promises not awaited (floating promises)
- Event listeners not removed
- Missing cleanup in error paths
- Lock timeouts not configured
- Deadlock potential (lock ordering issues)

**✅ Correct patterns:**
```typescript
// CORRECT: Cleanup in finally (manual pattern)
const release = await this.fileLockManager.acquire(resource);
try {
  await operation();
} finally {
  await release(); // Always called
}

// BEST PRACTICE: Use withLock() with timeout
await this.fileLockManager.withLock(
  resource,
  async () => {
    await operation();
  },
  { acquireTimeout: 5000 } // Custom timeout
);

// CORRECT: Awaited promises
await Promise.all(operations); // ✅

// INCORRECT: Floating promise
operation(); // ❌ Missing await

// INCORRECT: Lock leaked
const release = await this.fileLockManager.acquire(resource);
await operation(); // ❌ If this throws, lock is never released
await release();
```

---

### 7. PERFORMANCE CONSIDERATIONS

Check performance issues (especially multi-process):

**❌ Anti-patterns to detect:**
- N+1 query patterns (loading all entities for filtering)
- Loop with await inside (should use Promise.all)
- Full index rebuild on single entity change
- Individual file writes instead of batch operations
- Aggressive cache invalidation (clear all instead of selective)
- Cloning large objects unnecessarily
- **Excessive lock contention** (holding locks too long)
- **Fine-grained locking** where coarse locks would suffice

**✅ Correct patterns:**
```typescript
// CORRECT: Parallel execution
await Promise.all(items.map(item => processItem(item)));

// CORRECT: Minimize lock hold time
const lockResource = `entity:${id}`;

await this.fileLockManager.withLock(lockResource, async () => {
  // Do ONLY critical section here
  const entity = await this.readFile(id);
  entity.value = newValue;
  await this.writeFile(entity);
  // Don't do expensive computation while holding lock
});

// Expensive computation AFTER releasing lock
const result = expensiveComputation(entity);

// INCORRECT: Sequential in loop
for (const item of items) {
  await processItem(item); // ❌ Should use Promise.all
}

// INCORRECT: Expensive operation while holding lock
await this.fileLockManager.withLock(resource, async () => {
  await this.readFile();
  await expensiveNetworkCall(); // ❌ Don't do this while holding lock
  await this.writeFile();
});
```

---

## Report Format

Generate a structured report in this exact format:

### 📋 Code Review Report

**Branch:** `{branch-name}`
**Files changed:** {count}
**Lines changed:** +{additions} -{deletions}

---

### 🔍 FINDINGS

#### 🔴 CRITICAL ({count})

{For each critical issue:}

**C-{number}: {Brief issue title}**
- **File:** `{file-path}:{line-number}`
- **Category:** {Type Safety | **Multi-Process Concurrency** | Error Handling | Testing | Validation | Resources | Performance}
- **Issue:** {Detailed description}
- **Impact:** {Why critical - production bugs, data corruption, race conditions, deadlocks}
- **Multi-Process Risk:** {If concurrency: HIGH/MEDIUM/LOW - explain race condition scenario}
- **Fix:**
  ```typescript
  // Example of correct implementation
  ```
- **Violated Standard:** {Reference to specific standard from 7 points above}

#### 🟠 HIGH ({count})

{Same format for HIGH severity}

#### 🟡 MEDIUM ({count})

{Same format for MEDIUM severity}

#### ⚪ LOW ({count})

{Same format for LOW severity}

---

### 📊 SUMMARY

**Total Issues:** {total-count}
- 🔴 Critical: {critical-count}
- 🟠 High: {high-count}
- 🟡 Medium: {medium-count}
- ⚪ Low: {low-count}

**Most Common Issues:**
1. {Category}: {count} occurrences
2. {Category}: {count} occurrences
3. {Category}: {count} occurrences

**Standards Compliance:** {percentage}% ({passed}/{total} checks)

**Multi-Process Safety Score:** {percentage}%
- FileLockManager usage: {used}/{total_file_ops} file operations
- Lock patterns: {correct}/{total_locks} correct (with finally)
- Race conditions detected: {race_condition_count}

---

{**IMPORTANT:** If CRITICAL or HIGH issues found:}

### 🚀 RECOMMENDED ACTION

**Decision Flow:**
```
Issues found? → No → Exit (Scenario 1)
              ↓ Yes
Critical/High? → No → Show report only (LOW/MEDIUM issues)
              ↓ Yes
--auto-sprint? → Yes → Create sprint automatically (Step 1-4)
              ↓ No
              Show prompt → User says "yes"? → Yes → Create sprint (Step 1-4)
                                             ↓ No
                                             Exit (report only)
```

---

{If `--auto-sprint` flag was provided:}
**Creating sprint automatically...**

{If `--auto-sprint` flag was NOT provided:}
**Would you like to create a sprint to fix the identified issues?**

The sprint will include:
- ✅ **Requirements** for each issue category (added to current plan)
- 💡 **Solutions** with TDD approach
- 📍 **Phases:** **RED** (write tests) → **GREEN** (implement) → **REFACTOR** (optimize) → **REVIEW** (final check)
- 🔗 **Links** for full traceability

**Reply "yes" to create the sprint.**

{If user replies "yes" OR if `--auto-sprint` flag was provided - proceed to MCP planner integration below}

---

## MCP Planner Integration

{**DECISION POINT:**
- If `--auto-sprint` flag PROVIDED → Execute Steps 1-4 immediately
- If `--auto-sprint` flag NOT PROVIDED → WAIT for user to reply "yes", then execute Steps 1-4
- If user replies anything other than "yes" → SKIP this section entirely}

### Step 1: Get Active Plan

Use MCP planning tool to get active plan:

```typescript
const plan = await mcp__planning__plan({
  action: "get_active"
});

if (!plan || !plan.planId) {
  throw new Error("⚠️ No active plan found. Please activate a plan first using MCP planner.");
}

const planId = plan.planId;
```

### Step 2: Create Structure via Batch Operation

Group issues by category and create entities atomically:

**tempId Allocation Strategy:**
- Requirements: $0, $1, $2, ... (one per issue category)
- Solutions: $10, $11, $12, ... (one per requirement, matching index)
- Decision: $20 (single decision record)
- Phases: $100, $101, $102, $103 (4 TDD phases shared across all categories)

**Why this spacing?** Prevents collisions and makes relationships clear:
- Solution $10 addresses Requirement $0
- Solution $11 addresses Requirement $1, etc.

**For each issue category (Type Safety, Multi-Process Concurrency, etc.):**

1. **Requirement** with tempId for linking:

```typescript
{
  entity_type: "requirement",
  payload: {
    tempId: "$0", // Or $1, $2, ... for next categories
    title: `Fix ${category} Issues (${issueCount} issues)`,
    description: `Resolve all ${category} issues from code review:

${issuesInCategory.map(issue => `- ${issue.file}:${issue.line}: ${issue.title}`).join('\n')}

${category === 'Multi-Process Concurrency' ? `
**CRITICAL MULTI-PROCESS SAFETY ISSUES:**
These issues can cause race conditions, data corruption, or deadlocks in production when multiple processes access the same files concurrently.
` : ''}`,
    rationale: `Code review identified ${issueCount} ${severity} severity ${category} issues that violate project standards and may cause production problems.${category === 'Multi-Process Concurrency' ? ' CRITICAL: These are multi-process safety violations.' : ''}`,
    priority: severity === 'CRITICAL' ? 'critical' : 'high',
    category: "technical",
    status: "draft",
    acceptanceCriteria: [
      "All identified issues in this category are fixed",
      "Tests added/updated to prevent regression",
      category === 'Multi-Process Concurrency' ? "Concurrent test scenarios pass (10+ parallel operations)" : "Code review checks pass",
      "No new issues introduced",
      category === 'Multi-Process Concurrency' ? "FileLockManager used for all file operations" : "Standards compliance verified"
    ],
    source: {
      type: "discovered",
      context: `/code-review command on ${new Date().toISOString()}`
    }
  }
}
```

2. **Solution** with TDD approach:

```typescript
{
  entity_type: "solution",
  payload: {
    tempId: "$10", // Or $11, $12, ... for next categories (matching requirement index)
    title: `TDD Fix for ${category} Issues`,
    description: `Test-Driven Development approach to fix ${category} issues`,
    addressing: ["$0"], // Link to corresponding requirement: ["$0"] for first, ["$1"] for second, etc.
    approach: `Follow TDD methodology:

1. **RED Phase:** Write failing tests that expose the issues
   ${category === 'Multi-Process Concurrency' ? '- Include concurrent test scenarios (10+ parallel operations)' : ''}
   ${category === 'Multi-Process Concurrency' ? '- Test race conditions explicitly' : ''}
2. **GREEN Phase:** Implement minimal fixes to pass tests
   ${category === 'Multi-Process Concurrency' ? '- Add FileLockManager to all file operations' : ''}
   ${category === 'Multi-Process Concurrency' ? '- Ensure proper lock acquire/release with finally blocks' : ''}
3. **REFACTOR Phase:** Optimize and clean up implementation
4. **REVIEW Phase:** Final verification and documentation`,
    implementationNotes: `Specific fixes needed:

${issuesInCategory.map(issue => `
### ${issue.file}:${issue.line}
**Issue:** ${issue.description}
**Fix:** ${issue.suggestedFix}
${issue.multiProcessRisk ? `**Multi-Process Risk:** ${issue.multiProcessRisk}` : ''}
`).join('\n')}`,
    tradeoffs: [
      {
        aspect: "Development Time",
        pros: ["Systematic approach", "Comprehensive testing"],
        cons: ["Requires writing tests first"],
        score: 8
      },
      {
        aspect: "Code Quality",
        pros: ["High confidence in fixes", "Prevents regressions", category === 'Multi-Process Concurrency' ? "Ensures multi-process safety" : "Maintains standards"],
        cons: [],
        score: 10
      }
    ],
    evaluation: {
      technicalFeasibility: "high",
      effortEstimate: {
        value: issueCount * 2,
        unit: "hours",
        confidence: "medium"
      },
      riskAssessment: category === 'Multi-Process Concurrency'
        ? "Medium risk - Multi-process issues are subtle but TDD with concurrent tests mitigates"
        : "Low risk - TDD ensures correctness"
    }
  }
}
```

3. **Decision record:**

```typescript
{
  entity_type: "decision",
  payload: {
    tempId: "$20",
    title: "Use TDD Methodology for Bug Fixes with Multi-Process Testing",
    question: "How should we approach fixing code review issues, especially multi-process safety?",
    context: `Code review found ${totalIssues} issues requiring fixes. ${multiProcessIssues > 0 ? `${multiProcessIssues} are CRITICAL multi-process safety issues.` : ''} Need structured approach to ensure quality.`,
    decision: "Follow Test-Driven Development (RED → GREEN → REFACTOR → REVIEW) cycle for all fixes, with mandatory concurrent test scenarios for multi-process issues",
    consequences: `
**Positive:**
- High confidence in fixes
- Comprehensive test coverage including concurrent scenarios
- Prevents future regressions
- Follows project TDD standards
- **Ensures multi-process safety through explicit concurrent testing**

**Negative:**
- Slightly more time for initial development
- Requires discipline to write tests first
- Concurrent tests may be complex to write`,
    alternativesConsidered: [
      {
        option: "Direct fixes without tests",
        reasoning: "Faster short-term",
        whyNotChosen: "Violates project TDD standards, no regression protection, multi-process race conditions likely to recur"
      },
      {
        option: "Tests after implementation",
        reasoning: "More natural for some developers",
        whyNotChosen: "Not true TDD, tests may miss edge cases, concurrent race conditions hard to spot without failing tests first"
      },
      {
        option: "Manual multi-process testing only",
        reasoning: "Could test with multiple processes manually",
        whyNotChosen: "Not reproducible, hard to verify, doesn't prevent regressions"
      }
    ]
  }
}
```

4. **Phases (TDD cycle):**

```typescript
// RED Phase
{
  entity_type: "phase",
  payload: {
    tempId: "$100",
    title: "RED: Write Failing Tests",
    description: "Create tests that expose all identified issues, including concurrent test scenarios",
    objectives: [
      "Write test for each identified bug",
      "Ensure tests fail with current code",
      "Cover all edge cases and error scenarios",
      "**Add concurrent test scenarios (10+ parallel operations)** for multi-process issues"
    ],
    deliverables: [
      "Test files with RED: markers",
      "Failing test suite demonstrating issues",
      "Concurrent test scenarios that expose race conditions"
    ],
    successCriteria: [
      "All issues have corresponding tests",
      "Tests fail for expected reasons",
      "Test descriptions are clear and specific",
      "Concurrent tests demonstrate race conditions"
    ],
    estimatedEffort: {
      value: Math.ceil(totalIssues * 0.5),
      unit: "hours",
      confidence: "medium"
    },
    priority: "critical",
    implementationNotes: `
**Testing Multi-Process Issues:**
For concurrency bugs, write tests that will FAIL without proper locking:

\`\`\`typescript
// Test 1: Concurrent updates to SAME entity (exposes lost updates)
it('RED: should handle concurrent updates without lost writes', async () => {
  const entity = await service.create({ id: 'entity-1', counter: 0 });

  // 10 concurrent increments
  const promises = Array(10).fill(null).map(() =>
    service.update(entity.id, (e) => ({ ...e, counter: e.counter + 1 }))
  );

  await Promise.all(promises);

  const final = await service.findById(entity.id);
  expect(final.counter).toBe(10); // ❌ Will fail without locking (lost updates)
});

// Test 2: Concurrent creates with unique IDs (should all succeed)
it('RED: should handle concurrent creates without race conditions', async () => {
  const promises = Array(10).fill(null).map((_, i) =>
    service.create({ id: \`entity-\${i}\` })
  );
  const results = await Promise.all(promises);
  expect(results).toHaveLength(10); // All succeed
  expect(new Set(results.map(r => r.id)).size).toBe(10); // No duplicates
});
\`\`\`
`
  }
},

// GREEN Phase
{
  entity_type: "phase",
  payload: {
    tempId: "$101",
    title: "GREEN: Implement Minimal Fixes",
    description: "Fix issues with minimal code changes to pass tests, ensure FileLockManager usage",
    objectives: [
      "Make all RED tests pass",
      "Implement fixes according to suggestions",
      "**Add FileLockManager to all file operations**",
      "Maintain existing functionality"
    ],
    deliverables: [
      "Fixed source files with FileLockManager usage",
      "Passing test suite including concurrent tests",
      "GREEN: markers in tests"
    ],
    successCriteria: [
      "All tests pass including concurrent scenarios",
      "No new issues introduced",
      "Code review checks pass",
      "**All file operations use FileLockManager with proper try/finally**"
    ],
    estimatedEffort: {
      value: Math.ceil(totalIssues * 1),
      unit: "hours",
      confidence: "medium"
    },
    priority: "critical"
  }
},

// REFACTOR Phase
{
  entity_type: "phase",
  payload: {
    tempId: "$102",
    title: "REFACTOR: Optimize Implementation",
    description: "Refine fixes for clarity, performance, maintainability",
    objectives: [
      "Simplify complex fixes",
      "Improve code clarity",
      "Optimize performance where applicable",
      "Minimize lock hold time for better concurrency"
    ],
    deliverables: [
      "Refactored code",
      "Updated tests with REFACTOR: markers",
      "Performance benchmarks (if applicable)"
    ],
    successCriteria: [
      "All tests still pass",
      "Code follows project standards",
      "No duplication or complexity increase",
      "Lock contention minimized"
    ],
    estimatedEffort: {
      value: Math.ceil(totalIssues * 0.5),
      unit: "hours",
      confidence: "high"
    },
    priority: "high"
  }
},

// REVIEW Phase
{
  entity_type: "phase",
  payload: {
    tempId: "$103",
    title: "REVIEW: Final Verification",
    description: "Comprehensive review and documentation",
    objectives: [
      "Run full test suite",
      "Verify all issues resolved",
      "Update documentation",
      "**Run /code-review command again to verify clean report**"
    ],
    deliverables: [
      "Clean git diff",
      "Updated documentation",
      "Clean code review report",
      "**Multi-Process Safety Score: 100%**"
    ],
    successCriteria: [
      "Test coverage maintained/improved",
      "No open code review findings",
      "Documentation updated",
      "Ready for PR",
      "**All file operations use FileLockManager**"
    ],
    estimatedEffort: {
      value: 1,
      unit: "hours",
      confidence: "high"
    },
    priority: "high"
  }
}
```

5. **Links for traceability:**

```typescript
// Solution → Requirement (for each category)
// Example for first category:
{
  entity_type: "link",
  payload: {
    sourceId: "$10", // Solution for first category
    targetId: "$0",  // Requirement for first category
    relationType: "implements"
  }
},
// Repeat for $11→$1, $12→$2, etc.

// Phase → All Requirements (phases address all requirements)
// Each phase addresses all requirements from all categories
{
  entity_type: "link",
  payload: {
    sourceId: "$100", // RED phase
    targetId: "$0",   // First requirement
    relationType: "addresses"
  }
},
// Repeat for each phase ($100, $101, $102, $103) to each requirement ($0, $1, $2, ...)

// Phase dependencies (GREEN depends on RED, etc.)
{
  entity_type: "link",
  payload: {
    sourceId: "$101", // GREEN phase
    targetId: "$100", // RED phase
    relationType: "depends_on"
  }
},
{
  entity_type: "link",
  payload: {
    sourceId: "$102", // REFACTOR phase
    targetId: "$101", // GREEN phase
    relationType: "depends_on"
  }
},
{
  entity_type: "link",
  payload: {
    sourceId: "$103", // REVIEW phase
    targetId: "$102", // REFACTOR phase
    relationType: "depends_on"
  }
}
```

### Step 3: Execute Batch Operation

Collect all operations and execute atomically:

```typescript
await mcp__planning__batch({
  planId: planId,
  operations: [
    // 1. Requirements (one per issue category)
    ...requirementOperations, // tempId: $0, $1, $2, ...

    // 2. Solutions (one per requirement)
    ...solutionOperations, // tempId: $10, $11, $12, ...

    // 3. Decision record
    decisionOperation, // tempId: $20

    // 4. Phases (4 TDD phases shared across all)
    ...phaseOperations, // tempId: $100, $101, $102, $103

    // 5. Links for traceability
    ...linkOperations // Includes:
    // - Solution → Requirement (implements)
    // - Phase → Requirements (addresses)
    // - Phase → Phase (depends_on)
  ]
});
```

### Step 4: Confirm Creation

After successful sprint creation:

```
✅ **Sprint added to current plan successfully!**

**Requirements added:** {requirementCount}
**Solutions:** {solutionCount} (TDD approach)
**Phases:** RED → GREEN → REFACTOR → REVIEW
**Links:** Full traceability

**Multi-Process Safety:** {multiProcessIssues} critical concurrency issues identified

**Next Steps:**
1. Review plan: Use MCP planner to navigate
2. Start with RED phase: Write failing tests (including concurrent scenarios)
3. After completion, run /code-review again to verify fixes
```

---

## Edge Case Handling

**Scenario 1: No uncommitted changes**
```
✅ **No uncommitted changes to review.**

Working directory is clean. Great job!
```

**Scenario 1a: --auto-sprint with no issues**
```
✅ **No issues found!**

Code review passed all checks. No sprint needed.
```

**Scenario 1b: --auto-sprint with only LOW/MEDIUM issues**
```
📝 **Minor issues found (no sprint created)**

Found {count} LOW/MEDIUM severity issues.
--auto-sprint only creates sprints for CRITICAL/HIGH issues.

Review the findings above. To create a sprint for these issues, run:
/code-review

(without --auto-sprint flag, then reply "yes" when prompted)
```

**Scenario 2: Merge conflicts detected**
```
⚠️ **Merge conflicts detected.**

Resolve conflicts before code review:
{list of conflicting files}
```

**Scenario 3: Large diff (>1000 lines)**
```
⚠️ **Large changeset detected ({lines} lines).**

Analysis may take some time. Continue? (yes/no)
```

**Scenario 4: MCP planner unavailable**
```
📝 **Report generated successfully.**

⚠️ Note: MCP planner unavailable. Sprint creation disabled.
Fix issues manually or check MCP planner availability.
```

**Scenario 5: Batch operation error**
```
❌ **Failed to create sprint.**

Error details: {error.message}

Try:
1. Ensure an active plan exists (use MCP planner)
2. Check MCP planner availability
3. Retry later
```

---

## 🚨 Common Mistakes to Avoid

**Multi-Process Locking Mistakes:**

1. **Using acquire() without capturing release function**
   ```typescript
   ❌ await lockManager.acquire(resource); // Wrong! Doesn't capture release
   ✅ const release = await lockManager.acquire(resource);
   ```

2. **Not using withLock() for simple cases**
   ```typescript
   ❌ Manual acquire/release for simple operations
   ✅ await lockManager.withLock(resource, async () => { /* ... */ });
   ```

3. **Holding locks during slow operations**
   ```typescript
   ❌ await lockManager.withLock(resource, async () => {
        await slowNetworkCall(); // Bad!
      });
   ✅ // Do slow work OUTSIDE lock, only lock for file I/O
   ```

4. **Forgetting try/finally (if using manual acquire)**
   ```typescript
   ❌ const release = await lockManager.acquire(resource);
      await operation(); // If throws, lock leaks!
   ✅ const release = await lockManager.acquire(resource);
      try { await operation(); } finally { await release(); }
   ```

5. **Using in-memory LockManager for multi-process**
   ```typescript
   ❌ import { LockManager } from './lock-manager.js'; // Not multi-process safe!
   ✅ import { FileLockManager } from './infrastructure/repositories/file/file-lock-manager.js';
   ```

---

## Critical Files for Analysis

When reading code and checking patterns, use these files as reference:

1. **src/domain/repositories/errors.ts** — Custom error hierarchy, type guards
2. **src/domain/services/validators.ts** — Centralized validators with detailed checks
3. **src/infrastructure/repositories/file/file-lock-manager.ts** — **CRITICAL: Correct lock patterns for multi-process safety**
4. **src/infrastructure/repositories/file/file-repository.ts** — Example of FileLockManager usage, shared instance injection
5. **tests/domain/*-service.test.ts** — TDD structure with RED/GREEN/REFACTOR
6. **tests/infrastructure/file-repository.test.ts** — Concurrent test examples
