import { test, expect } from '@playwright/test';
import { screenshotPath } from './test-paths';

test.describe('MCP Planning Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Browser console error: ${msg.text()}`);
      }
    });

    // Listen for network failures
    page.on('requestfailed', request => {
      console.log(`Request failed: ${request.url()} - ${request.failure()?.errorText}`);
    });
  });

  test('should load the dashboard with layout shell', async ({ page }) => {
    await page.goto('/');

    // Check header is visible
    const header = page.locator('[data-testid="app-header"]');
    await expect(header).toBeVisible();

    // Check title in header
    await expect(page.locator('.header__title')).toContainText('MCP Planning Dashboard');

    // Check sidebar is visible
    const sidebar = page.locator('[data-testid="app-sidebar"]');
    await expect(sidebar).toBeVisible();

    // Check main content area
    const mainContent = page.locator('[data-testid="main-content"]');
    await expect(mainContent).toBeVisible();

    // Take screenshot of layout
    await page.screenshot({ path: screenshotPath('01-dashboard-loaded.png') });
  });

  test('should toggle theme', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Take screenshot of initial theme
    await page.screenshot({ path: screenshotPath('05-theme-initial.png') });

    // Get initial theme
    const html = page.locator('html');
    const initialClass = await html.getAttribute('class');
    const initialIsDark = initialClass?.includes('dark-theme') ?? false;

    // Find and click theme toggle button
    const themeButton = page.locator('[data-testid="theme-toggle"]');
    await expect(themeButton).toBeVisible();
    await themeButton.click();

    // Wait for theme change
    await page.waitForTimeout(300);

    // Check theme toggled
    const newClass = await html.getAttribute('class');
    const newIsDark = newClass?.includes('dark-theme') ?? false;
    expect(newIsDark).not.toBe(initialIsDark);

    // Take screenshot after toggle
    await page.screenshot({ path: screenshotPath('06-theme-toggled.png') });
  });

  test('should toggle sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Get initial sidebar width
    const sidebar = page.locator('[data-testid="app-sidebar"]');
    await expect(sidebar).toBeVisible();
    const initialBox = await sidebar.boundingBox();

    // Click sidebar toggle
    const sidebarToggle = page.locator('[data-testid="sidebar-toggle"]');
    await sidebarToggle.click();

    // Wait for animation
    await page.waitForTimeout(300);

    // Check sidebar collapsed
    const newBox = await sidebar.boundingBox();
    expect(newBox?.width).toBeLessThan(initialBox?.width ?? 999);

    // Take screenshot of collapsed state
    await page.screenshot({ path: screenshotPath('sidebar-collapsed.png') });
  });

  test('should display navigation items in sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check navigation items
    await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-requirements"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-solutions"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-decisions"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-phases"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-artifacts"]')).toBeVisible();
  });

  test('should fetch plans from API', async ({ page }) => {
    const apiCalls: string[] = [];

    page.on('request', request => {
      if (request.url().includes('/api')) {
        apiCalls.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Log API calls
    console.log('API calls made:', apiCalls);

    // Should have made plans request
    const plansCall = apiCalls.find(call => call.includes('/plans'));
    expect(plansCall).toBeTruthy();

    // Take screenshot
    await page.screenshot({ path: screenshotPath('03-after-api-load.png') });
  });

  test('debug: inspect page state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Take full page screenshot
    await page.screenshot({ path: screenshotPath('07-debug-fullpage.png'), fullPage: true });
  });
});
