# Testing Guidelines

## Pyramid
- 70% Unit | 20% Integration | 10% E2E
- Push tests down: prefer unit over E2E when possible

## Commands
- `npm run test:web` - unit tests
- `npx playwright test` - E2E tests

---

## Unit Tests

### Structure
```
describe('Subject', () => {
  describe('method/behavior', () => {
    it('should [expected behavior] when [condition]', () => {});
  });
});
```

### Service Coverage (MANDATORY)
Every service method requires:
1. Success case
2. Error/edge case
3. State persistence (if uses localStorage/signals)

### Component Coverage
**All components:**
- Creation test
- Critical DOM elements
- data-testid attributes

**Components with logic:**
- Signal state changes
- Service interactions
- User events
- Error states

### Signals & Effects
- Computed: set source → verify computed value
- Effects: use `TestBed.flushEffects()` after trigger

---

## E2E Tests

### Selectors (MANDATORY)
Use `data-testid` attributes only:
- `{feature}-page` - page containers
- `{component}-{element}` - component parts
- `{action}-button` - interactive elements

### Critical Paths (MUST cover)
- Navigation flows
- Persisted state (theme, preferences)
- Complex interactions (tree expand/collapse)
- Loading/error states

### Page Object Model
Encapsulate locators and actions in page classes.

---

## Mocking Principles

### What to mock
- HTTP layer (`HttpTestingController`)
- Browser APIs (`localStorage`, `matchMedia`)
- External libraries (Canvas for charts)

### What NOT to mock
- Angular DI (use real injection)
- Component templates (test real DOM)
- Signals (test real reactivity)

---

## Quality Criteria

### Coverage
- Target: 70-80% line coverage
- Focus: branch coverage > statement coverage
- Skip: trivial getters, framework boilerplate

### Test Independence
- No shared mutable state between tests
- Each test sets up own fixtures
- Use `afterEach` for cleanup

### Naming
- Unit: `*.spec.ts` (colocated)
- E2E: `e2e/*.spec.ts`

### TDD Markers
- `RED:` prefix for not-yet-implemented features
- `GREEN:` after minimal fix
- `REFACTOR:` for optimization phase

---

## Readability

### Test Naming
- Format: `should [expected behavior] when [condition]`
- Be specific: "should throw ValidationError when email is empty"
- Avoid vague: ~~"should work correctly"~~

### AAA Pattern (Arrange-Act-Assert)
```typescript
it('should...', () => {
  // Arrange - setup
  // Act - execute
  // Assert - verify
});
```

### Comments
- Explain WHY, not WHAT
- Document non-obvious test setup
- No comments for self-explanatory code

---

## Flakiness Prevention

### Deterministic Data
- Use fixed values, not random/Date.now()
- Seed random generators if randomness required
- Fixed timestamps in tests

### No Timing Dependencies
- Never use `setTimeout`/`sleep` in tests
- Use `fakeAsync` + `tick()` for Angular
- Use Playwright auto-waiting, not manual waits

### Isolated State
- Reset globals in `beforeEach`/`afterEach`
- Clear localStorage between tests
- No test order dependencies

### Network Isolation
- Mock ALL HTTP in unit tests
- E2E: use stable test fixtures, not production data

---

## Performance

### Speed Targets
- Unit test: < 100ms each
- E2E test: < 10s each
- Full suite: < 5 min

### Parallelization
- Unit: parallel by default (Vitest)
- E2E: parallel workers in CI

### Optimization
- Lazy component compilation
- Shared TestBed when possible
- Minimal fixture data
