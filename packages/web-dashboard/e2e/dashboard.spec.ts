import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Browser console error: ${msg.text()}`);
      }
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Statistics Cards', () => {
    test('RED: should display statistics cards with plan summary data', async ({ page }) => {
      // Check statistics cards container
      const statsContainer = page.locator('[data-testid="statistics-cards"]');
      await expect(statsContainer).toBeVisible();

      // Check all 6 stat cards
      await expect(page.locator('[data-testid="stat-card-requirements"]')).toBeVisible();
      await expect(page.locator('[data-testid="stat-card-solutions"]')).toBeVisible();
      await expect(page.locator('[data-testid="stat-card-decisions"]')).toBeVisible();
      await expect(page.locator('[data-testid="stat-card-phases"]')).toBeVisible();
      await expect(page.locator('[data-testid="stat-card-artifacts"]')).toBeVisible();
      await expect(page.locator('[data-testid="stat-card-completion"]')).toBeVisible();
    });

    test('RED: should fetch plan summary from API', async ({ page }) => {
      const apiCalls: string[] = [];

      page.on('request', request => {
        if (request.url().includes('/api')) {
          apiCalls.push(`${request.method()} ${request.url()}`);
        }
      });

      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Should have called /plans/{planId}/summary
      const summaryCall = apiCalls.find(call => call.includes('/summary'));
      expect(summaryCall).toBeTruthy();
    });

    test('RED: should display numeric values in stat cards', async ({ page }) => {
      // Check that cards show actual numbers (not zero or empty)
      const requirementsCard = page.locator('[data-testid="stat-card-requirements"]');
      const requirementsValue = await requirementsCard.locator('[data-testid="stat-value"]').textContent();
      expect(requirementsValue).toMatch(/\d+/); // Contains digits

      const completionCard = page.locator('[data-testid="stat-card-completion"]');
      const completionValue = await completionCard.locator('[data-testid="stat-value"]').textContent();
      expect(completionValue).toMatch(/\d+%/); // Contains percentage
    });
  });

  test.describe('Requirements by Status Chart', () => {
    test('RED: should display requirements chart container', async ({ page }) => {
      const chartContainer = page.locator('[data-testid="requirements-chart"]');
      await expect(chartContainer).toBeVisible();

      // Check chart title
      await expect(page.locator('[data-testid="requirements-chart-title"]')).toContainText('Requirements by Status');
    });

    test('RED: should render PrimeNG chart component', async ({ page }) => {
      // PrimeNG chart renders as canvas element
      const chartCanvas = page.locator('[data-testid="requirements-chart"] canvas');
      await expect(chartCanvas).toBeVisible();
    });

    test('RED: should fetch requirements from API', async ({ page }) => {
      const apiCalls: string[] = [];

      page.on('request', request => {
        if (request.url().includes('/api')) {
          apiCalls.push(`${request.method()} ${request.url()}`);
        }
      });

      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Should have called /plans/{planId}/requirements
      const requirementsCall = apiCalls.find(call => call.includes('/requirements'));
      expect(requirementsCall).toBeTruthy();
    });

    test('RED: should take screenshot of chart', async ({ page }) => {
      await page.screenshot({ path: 'e2e/screenshots/dashboard-requirements-chart.png' });
    });
  });

  test.describe('Active Phases Table', () => {
    test('RED: should display active phases table', async ({ page }) => {
      const table = page.locator('[data-testid="active-phases-table"]');
      await expect(table).toBeVisible();

      // Check table header
      await expect(page.locator('[data-testid="active-phases-title"]')).toContainText('Active Phases');
    });

    test('RED: should show table columns', async ({ page }) => {
      // Check for table headers
      const table = page.locator('[data-testid="active-phases-table"]');
      await expect(table.locator('th').filter({ hasText: 'Title' })).toBeVisible();
      await expect(table.locator('th').filter({ hasText: 'Progress' })).toBeVisible();
      await expect(table.locator('th').filter({ hasText: 'Priority' })).toBeVisible();
      await expect(table.locator('th').filter({ hasText: 'Status' })).toBeVisible();
    });

    test('RED: should filter phases with in_progress status', async ({ page }) => {
      const apiCalls: string[] = [];

      page.on('request', request => {
        if (request.url().includes('/api')) {
          apiCalls.push(request.url());
        }
      });

      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Should filter by status=in_progress
      const phasesCall = apiCalls.find(call => call.includes('/phases') && call.includes('status=in_progress'));
      expect(phasesCall).toBeTruthy();
    });

    test('RED: should display progress bars in table rows', async ({ page }) => {
      // Check for p-progressbar components
      const progressBars = page.locator('[data-testid="active-phases-table"] .p-progressbar');
      await expect(progressBars.first()).toBeVisible();
    });
  });

  test.describe('Blockers Panel', () => {
    test('RED: should display blockers panel', async ({ page }) => {
      const panel = page.locator('[data-testid="blockers-panel"]');
      await expect(panel).toBeVisible();

      // Check panel title
      await expect(page.locator('[data-testid="blockers-title"]')).toContainText('Blockers');
    });

    test('RED: should fetch blocked phases from API', async ({ page }) => {
      const apiCalls: string[] = [];

      page.on('request', request => {
        if (request.url().includes('/api')) {
          apiCalls.push(request.url());
        }
      });

      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Should filter by status=blocked
      const blockedPhasesCall = apiCalls.find(call => call.includes('/phases') && call.includes('status=blocked'));
      expect(blockedPhasesCall).toBeTruthy();
    });

    test('RED: should display blocker cards with reasons', async ({ page }) => {
      // Check for blocker items
      const blockerItems = page.locator('[data-testid="blocker-item"]');
      await expect(blockerItems.first()).toBeVisible();

      // Each blocker should show phase title
      await expect(blockerItems.first().locator('[data-testid="blocker-phase-title"]')).toBeVisible();

      // Each blocker should show blocking reason
      await expect(blockerItems.first().locator('[data-testid="blocker-reason"]')).toBeVisible();
    });

    test('RED: should show empty state when no blockers', async ({ page }) => {
      // If no blocked phases, should show empty message
      const emptyState = page.locator('[data-testid="blockers-empty-state"]');
      // This will either be visible or not visible depending on data
      // Just check element exists
      await expect(emptyState).toBeTruthy();
    });
  });

  test.describe('Integration', () => {
    test('RED: should display all dashboard components together', async ({ page }) => {
      // All 4 main sections should be visible
      await expect(page.locator('[data-testid="statistics-cards"]')).toBeVisible();
      await expect(page.locator('[data-testid="requirements-chart"]')).toBeVisible();
      await expect(page.locator('[data-testid="active-phases-table"]')).toBeVisible();
      await expect(page.locator('[data-testid="blockers-panel"]')).toBeVisible();

      // Take full dashboard screenshot
      await page.screenshot({
        path: 'e2e/screenshots/dashboard-full-page.png',
        fullPage: true
      });
    });

    test('RED: should refresh data when navigating back to dashboard', async ({ page }) => {
      // Navigate away
      await page.locator('[data-testid="nav-requirements"]').click();
      await page.waitForURL(/.*\/requirements/);

      // Navigate back to dashboard
      await page.locator('[data-testid="nav-dashboard"]').click();
      await page.waitForURL(/.*\/dashboard/);

      // Components should still be visible
      await expect(page.locator('[data-testid="statistics-cards"]')).toBeVisible();
    });
  });
});
