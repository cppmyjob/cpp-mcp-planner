import { test, expect } from '@playwright/test';
import { screenshotPath } from './test-paths';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should redirect root to dashboard', async ({ page }) => {
    // Root should redirect to /dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Dashboard page should be visible
    const dashboardPage = page.locator('[data-testid="dashboard-page"]');
    await expect(dashboardPage).toBeVisible();
  });

  test('should navigate to requirements page', async ({ page }) => {
    // Click on requirements nav item
    await page.locator('[data-testid="nav-requirements"]').click();

    // Should navigate to requirements
    await expect(page).toHaveURL(/.*\/requirements/);

    // Requirements page should be visible
    const requirementsPage = page.locator('[data-testid="requirements-page"]');
    await expect(requirementsPage).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: screenshotPath('nav-requirements.png') });
  });

  test('should navigate to solutions page', async ({ page }) => {
    await page.locator('[data-testid="nav-solutions"]').click();

    await expect(page).toHaveURL(/.*\/solutions/);
    const solutionsPage = page.locator('[data-testid="solutions-page"]');
    await expect(solutionsPage).toBeVisible();
  });

  test('should navigate to decisions page', async ({ page }) => {
    await page.locator('[data-testid="nav-decisions"]').click();

    await expect(page).toHaveURL(/.*\/decisions/);
    const decisionsPage = page.locator('[data-testid="decisions-page"]');
    await expect(decisionsPage).toBeVisible();
  });

  test('should navigate to phases page', async ({ page }) => {
    await page.locator('[data-testid="nav-phases"]').click();

    await expect(page).toHaveURL(/.*\/phases/);
    const phasesPage = page.locator('[data-testid="phases-page"]');
    await expect(phasesPage).toBeVisible();
  });

  test('should navigate to artifacts page', async ({ page }) => {
    await page.locator('[data-testid="nav-artifacts"]').click();

    await expect(page).toHaveURL(/.*\/artifacts/);
    const artifactsPage = page.locator('[data-testid="artifacts-page"]');
    await expect(artifactsPage).toBeVisible();
  });

  test('should navigate back to dashboard', async ({ page }) => {
    // First go to requirements
    await page.locator('[data-testid="nav-requirements"]').click();
    await expect(page).toHaveURL(/.*\/requirements/);

    // Then back to dashboard
    await page.locator('[data-testid="nav-dashboard"]').click();
    await expect(page).toHaveURL(/.*\/dashboard/);

    const dashboardPage = page.locator('[data-testid="dashboard-page"]');
    await expect(dashboardPage).toBeVisible();
  });

  test('should highlight active navigation item', async ({ page }) => {
    // Navigate to requirements
    await page.locator('[data-testid="nav-requirements"]').click();
    await page.waitForURL(/.*\/requirements/);

    // Check active class
    const navItem = page.locator('[data-testid="nav-requirements"]');
    await expect(navItem).toHaveClass(/nav-item--active/);

    // Dashboard should not be active
    const dashboardNav = page.locator('[data-testid="nav-dashboard"]');
    await expect(dashboardNav).not.toHaveClass(/nav-item--active/);
  });

  test('should preserve layout during navigation', async ({ page }) => {
    // Navigate through pages and verify layout
    const pages = ['requirements', 'solutions', 'decisions', 'phases', 'artifacts', 'dashboard'];

    for (const pageName of pages) {
      await page.locator(`[data-testid="nav-${pageName}"]`).click();
      await page.waitForURL(new RegExp(`.*/${pageName}`));

      // Header should always be visible
      await expect(page.locator('[data-testid="app-header"]')).toBeVisible();

      // Sidebar should always be visible
      await expect(page.locator('[data-testid="app-sidebar"]')).toBeVisible();

      // Main content should always be visible
      await expect(page.locator('[data-testid="main-content"]')).toBeVisible();
    }

    // Final screenshot showing all navigation works
    await page.screenshot({ path: screenshotPath('nav-complete.png') });
  });
});
