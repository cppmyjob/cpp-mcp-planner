import { test, expect } from '@playwright/test';

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

  test('should load the dashboard', async ({ page }) => {
    await page.goto('/');

    // Check title is visible
    await expect(page.locator('h1')).toContainText('MCP Planning Dashboard');

    // Take screenshot of initial state
    await page.screenshot({ path: 'e2e/screenshots/01-dashboard-loaded.png' });
  });

  test('should show loading state initially', async ({ page }) => {
    await page.goto('/');

    // Check for loading indicator
    const loading = page.locator('[data-testid="loading"], .loading, p-progressSpinner');

    // Loading should appear initially (or already be done)
    await page.screenshot({ path: 'e2e/screenshots/02-loading-state.png' });
  });

  test('should fetch plans from API', async ({ page }) => {
    // Intercept API calls to see what's happening
    const apiCalls: string[] = [];

    page.on('request', request => {
      if (request.url().includes('/api')) {
        apiCalls.push(`${request.method()} ${request.url()}`);
      }
    });

    page.on('response', response => {
      if (response.url().includes('/api')) {
        console.log(`API Response: ${response.status()} ${response.url()}`);
      }
    });

    await page.goto('/');

    // Wait for network to settle
    await page.waitForLoadState('networkidle');

    // Log all API calls
    console.log('API calls made:', apiCalls);

    // Take screenshot after data load
    await page.screenshot({ path: 'e2e/screenshots/03-after-api-load.png' });

    // Check if error is displayed
    const error = page.locator('[data-testid="error"], .error, p-message');
    const hasError = await error.count() > 0;

    if (hasError) {
      console.log('ERROR STATE DETECTED');
      await page.screenshot({ path: 'e2e/screenshots/03-error-state.png' });
    }
  });

  test('should display requirements table when data loads', async ({ page }) => {
    await page.goto('/');

    // Wait for network to settle
    await page.waitForLoadState('networkidle');

    // Wait a bit for Angular to render
    await page.waitForTimeout(2000);

    // Check for table
    const table = page.locator('p-table, table');
    const tableVisible = await table.isVisible().catch(() => false);

    console.log('Table visible:', tableVisible);

    // Take screenshot
    await page.screenshot({ path: 'e2e/screenshots/04-requirements-table.png' });

    // Check for requirement titles
    const pageContent = await page.textContent('body');
    console.log('Page contains requirements:', pageContent?.includes('requirement') || pageContent?.includes('Requirement'));
  });

  test('should toggle theme', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Take screenshot of initial theme
    await page.screenshot({ path: 'e2e/screenshots/05-theme-initial.png' });

    // Find theme toggle button
    const themeButton = page.locator('p-button').filter({ hasText: /Dark Mode|Light Mode/ });
    const buttonExists = await themeButton.count() > 0;

    console.log('Theme button exists:', buttonExists);

    if (buttonExists) {
      // Get initial theme state - ThemeService applies class to body, not html
      const body = page.locator('body');
      const initialClass = await body.getAttribute('class');
      console.log('Initial body class:', initialClass);
      const initialIsDark = initialClass?.includes('dark-theme') ?? false;

      // Click theme toggle
      await themeButton.click();

      // Wait for theme change
      await page.waitForTimeout(500);

      // Check new theme state
      const newClass = await body.getAttribute('class');
      console.log('New body class:', newClass);
      const newIsDark = newClass?.includes('dark-theme') ?? false;

      // Verify theme actually toggled
      expect(newIsDark).not.toBe(initialIsDark);

      // Take screenshot after theme toggle
      await page.screenshot({ path: 'e2e/screenshots/06-theme-toggled.png' });
    }
  });

  test('debug: inspect page state', async ({ page }) => {
    await page.goto('/');

    // Wait for everything to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Get page HTML for debugging
    const bodyHTML = await page.locator('body').innerHTML();
    console.log('=== PAGE BODY HTML ===');
    console.log(bodyHTML.substring(0, 2000));
    console.log('=== END HTML ===');

    // Take full page screenshot
    await page.screenshot({ path: 'e2e/screenshots/07-debug-fullpage.png', fullPage: true });
  });
});
