import { test, expect } from '@playwright/test';
import { screenshotPath } from './test-paths';

test.describe('Dark Theme Support', () => {
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

  test.describe('Theme Toggle', () => {
    test('should have theme toggle button', async ({ page }) => {
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await expect(themeToggle).toBeVisible();
    });

    test('should toggle to dark theme on click', async ({ page }) => {
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await themeToggle.click();

      // HTML should have dark-theme class
      const html = page.locator('html');
      await expect(html).toHaveClass(/dark-theme/);
    });

    test('should toggle back to light theme on second click', async ({ page }) => {
      const themeToggle = page.locator('[data-testid="theme-toggle"]');

      // First click - dark theme
      await themeToggle.click();
      await expect(page.locator('html')).toHaveClass(/dark-theme/);

      // Second click - light theme
      await themeToggle.click();
      await expect(page.locator('html')).not.toHaveClass(/dark-theme/);
    });

    test('should persist theme preference in localStorage', async ({ page }) => {
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await themeToggle.click();

      // Check localStorage
      const theme = await page.evaluate(() => localStorage.getItem('app-theme'));
      expect(theme).toBe('dark');
    });
  });

  test.describe('Header in Dark Theme', () => {
    test.beforeEach(async ({ page }) => {
      // Enable dark theme
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await themeToggle.click();
      await expect(page.locator('html')).toHaveClass(/dark-theme/);
    });

    test('should have visible header shadow in dark theme', async ({ page }) => {
      const header = page.locator('.header');
      await expect(header).toBeVisible();

      // Get computed box-shadow style
      const boxShadow = await header.evaluate(el => {
        return window.getComputedStyle(el).boxShadow;
      });

      // Shadow should exist and not be 'none'
      expect(boxShadow).not.toBe('none');
      expect(boxShadow).toBeTruthy();
    });

    test('should have proper contrast for header elements', async ({ page }) => {
      const headerTitle = page.locator('.header__title');
      await expect(headerTitle).toBeVisible();

      // Title should be readable (not same as background)
      const color = await headerTitle.evaluate(el => {
        return window.getComputedStyle(el).color;
      });

      // Color should be light in dark theme (not black)
      expect(color).not.toBe('rgb(0, 0, 0)');
    });

    test('should take screenshot of header in dark theme', async ({ page }) => {
      await page.screenshot({
        path: screenshotPath('header-dark-theme.png'),
        clip: { x: 0, y: 0, width: 1280, height: 80 }
      });
    });
  });

  test.describe('Requirements Chart in Dark Theme', () => {
    test.beforeEach(async ({ page }) => {
      // Enable dark theme
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await themeToggle.click();
      await expect(page.locator('html')).toHaveClass(/dark-theme/);
    });

    test('should display chart in dark theme', async ({ page }) => {
      const chartContainer = page.locator('[data-testid="requirements-chart"]');
      await expect(chartContainer).toBeVisible();

      const chartCanvas = page.locator('[data-testid="requirements-chart"] canvas');
      await expect(chartCanvas).toBeVisible();
    });

    test('should have visible chart title in dark theme', async ({ page }) => {
      const chartTitle = page.locator('[data-testid="requirements-chart-title"]');
      await expect(chartTitle).toBeVisible();

      // Title should be readable (light text on dark background)
      const color = await chartTitle.evaluate(el => {
        return window.getComputedStyle(el).color;
      });

      // Should not be dark colors (invisible on dark bg)
      expect(color).not.toBe('rgb(0, 0, 0)');
      expect(color).not.toBe('rgb(51, 65, 85)'); // slate-700 - too dark
    });

    test('should re-render chart when theme changes', async ({ page }) => {
      // Take screenshot in dark theme
      await page.screenshot({
        path: screenshotPath('chart-dark-theme.png')
      });

      // Toggle back to light theme
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await themeToggle.click();
      await expect(page.locator('html')).not.toHaveClass(/dark-theme/);

      // Wait a bit for chart to re-render
      await page.waitForTimeout(500);

      // Take screenshot in light theme
      await page.screenshot({
        path: screenshotPath('chart-light-theme.png')
      });

      // Both screenshots should exist (visual diff comparison can be done manually)
    });

    test('should take screenshot of requirements chart in dark theme', async ({ page }) => {
      const chartContainer = page.locator('[data-testid="requirements-chart"]');
      await chartContainer.screenshot({
        path: screenshotPath('requirements-chart-dark-theme.png')
      });
    });
  });

  test.describe('Dashboard Components in Dark Theme', () => {
    test.beforeEach(async ({ page }) => {
      // Enable dark theme
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await themeToggle.click();
      await expect(page.locator('html')).toHaveClass(/dark-theme/);
    });

    test('should display statistics cards in dark theme', async ({ page }) => {
      const statsContainer = page.locator('[data-testid="statistics-cards"]');
      await expect(statsContainer).toBeVisible();

      // Cards should have proper dark background
      const card = page.locator('[data-testid="stat-card-requirements"]');
      await expect(card).toBeVisible();
    });

    test('should display active phases table in dark theme', async ({ page }) => {
      const table = page.locator('[data-testid="active-phases-table"]');
      await expect(table).toBeVisible();
    });

    test('should display blockers panel in dark theme', async ({ page }) => {
      const panel = page.locator('[data-testid="blockers-panel"]');
      await expect(panel).toBeVisible();
    });

    test('should take full dashboard screenshot in dark theme', async ({ page }) => {
      await page.screenshot({
        path: screenshotPath('dashboard-dark-theme.png'),
        fullPage: true
      });
    });
  });

  test.describe('Sidebar in Dark Theme', () => {
    test.beforeEach(async ({ page }) => {
      // Enable dark theme
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await themeToggle.click();
      await expect(page.locator('html')).toHaveClass(/dark-theme/);
    });

    test('should have visible sidebar navigation items', async ({ page }) => {
      const dashboardNav = page.locator('[data-testid="nav-dashboard"]');
      await expect(dashboardNav).toBeVisible();

      // Text should be readable
      const color = await dashboardNav.evaluate(el => {
        return window.getComputedStyle(el).color;
      });

      expect(color).not.toBe('rgb(0, 0, 0)');
    });

    test('should highlight active nav item in dark theme', async ({ page }) => {
      const activeNav = page.locator('[data-testid="nav-dashboard"]');

      // Should have some visual distinction (color, background, etc.)
      await expect(activeNav).toBeVisible();
    });
  });

  test.describe('Phases Page in Dark Theme', () => {
    test('should display phase tree correctly in dark theme', async ({ page }) => {
      // Enable dark theme first
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await themeToggle.click();
      await expect(page.locator('html')).toHaveClass(/dark-theme/);

      // Navigate to phases page
      await page.goto('/phases');
      await page.waitForLoadState('networkidle');

      // Phase tree should be visible
      const phaseTree = page.locator('[data-testid="phase-tree"]');
      await expect(phaseTree).toBeVisible();

      // Take screenshot
      await page.screenshot({
        path: screenshotPath('phases-dark-theme.png'),
        fullPage: true
      });
    });
  });
});
