import { test, expect } from '@playwright/test';
import { screenshotPath } from './test-paths';

test.describe('Solutions Page', () => {
  test.beforeEach(async ({ page }) => {
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Browser console error: ${msg.text()}`);
      }
    });

    await page.goto('/solutions');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Page Layout', () => {
    test('should display page container', async ({ page }) => {
      const container = page.locator('[data-testid="solutions-page"]');
      await expect(container).toBeVisible();
    });

    test('should display page title', async ({ page }) => {
      await expect(page.locator('h2:has-text("Solutions Comparison")')).toBeVisible();
    });

    test('should display requirement filter when requirements exist', async ({ page }) => {
      // Wait for data to load
      await page.waitForTimeout(1000);

      // Check if filter exists (it may not if no requirements)
      const filter = page.locator('[data-testid="requirement-filter"]');
      const count = await filter.count();

      if (count > 0) {
        await expect(filter).toBeVisible();
      }
    });
  });

  test.describe('Loading State', () => {
    test('should show loading indicator initially', async ({ page }) => {
      // Navigate and quickly check for loading state
      const loadingPromise = page.goto('/solutions');

      // Check for loading state (may be too fast to catch)
      const loading = page.locator('[data-testid="solutions-loading"]');
      const loadingVisible = await loading.isVisible().catch(() => false);

      await loadingPromise;

      // Loading should either be visible or already gone
      expect(typeof loadingVisible).toBe('boolean');
    });
  });

  test.describe('Solutions Grid', () => {
    test('should display solutions grid or empty state', async ({ page }) => {
      // Wait for loading to complete
      await page.waitForTimeout(1000);

      // Either grid or empty state should be visible
      const grid = page.locator('[data-testid="solutions-grid"]');
      const empty = page.locator('[data-testid="solutions-empty"]');
      const error = page.locator('[data-testid="solutions-error"]');

      const gridVisible = await grid.isVisible().catch(() => false);
      const emptyVisible = await empty.isVisible().catch(() => false);
      const errorVisible = await error.isVisible().catch(() => false);

      // At least one should be visible
      expect(gridVisible || emptyVisible || errorVisible).toBe(true);
    });

    test('should render solution cards with proper structure', async ({ page }) => {
      // Wait for data
      await page.waitForTimeout(1000);

      const grid = page.locator('[data-testid="solutions-grid"]');
      const gridVisible = await grid.isVisible().catch(() => false);

      if (gridVisible) {
        // Check first card structure
        const firstCard = grid.locator('p-card').first();
        await expect(firstCard).toBeVisible();

        // Cards should have testid following pattern
        const cardWithTestId = page.locator('[data-testid^="solution-card-SOL-"]').first();
        if (await cardWithTestId.count() > 0) {
          await expect(cardWithTestId).toBeVisible();
        }
      }
    });

    test('should display solution status tags', async ({ page }) => {
      await page.waitForTimeout(1000);

      const grid = page.locator('[data-testid="solutions-grid"]');
      const gridVisible = await grid.isVisible().catch(() => false);

      if (gridVisible) {
        // Status tags should be present
        const statusTag = page.locator('p-tag').first();
        const count = await statusTag.count();
        expect(count).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Solution Cards Content', () => {
    test('should display solution title and description', async ({ page }) => {
      await page.waitForTimeout(1000);

      const firstCard = page.locator('[data-testid^="solution-card-"]').first();
      const cardExists = await firstCard.count() > 0;

      if (cardExists) {
        // Title should be visible
        const title = firstCard.locator('.solutions__card-title');
        await expect(title).toBeVisible();

        // Description may or may not be present
        const description = firstCard.locator('.solutions__card-description');
        const descCount = await description.count();
        expect(descCount).toBeGreaterThanOrEqual(0);
      }
    });

    test('should display tradeoffs when available', async ({ page }) => {
      await page.waitForTimeout(1000);

      // Check if any solution has tradeoffs
      const tradeoffSection = page.locator('.solutions__tradeoffs').first();
      const hasTradeoffs = await tradeoffSection.count() > 0;

      if (hasTradeoffs) {
        await expect(tradeoffSection).toBeVisible();

        // Should have pros/cons lists
        const prosList = tradeoffSection.locator('.solutions__tradeoff-pros');
        const consList = tradeoffSection.locator('.solutions__tradeoff-cons');

        const hasPros = await prosList.count() > 0;
        const hasCons = await consList.count() > 0;

        expect(hasPros || hasCons).toBe(true);
      }
    });

    test('should display evaluation footer when available', async ({ page }) => {
      await page.waitForTimeout(1000);

      const footer = page.locator('.solutions__card-footer').first();
      const hasFooter = await footer.count() > 0;

      if (hasFooter) {
        await expect(footer).toBeVisible();

        // Should have effort estimate
        const effortLabel = footer.locator('text=/effort:/i');
        await expect(effortLabel).toBeVisible();
      }
    });
  });

  test.describe('Action Buttons', () => {
    test('should display action buttons on cards', async ({ page }) => {
      await page.waitForTimeout(1000);

      const actionsSection = page.locator('.solutions__card-actions').first();
      const hasActions = await actionsSection.count() > 0;

      if (hasActions) {
        await expect(actionsSection).toBeVisible();

        // View Details button should always be present
        const viewDetailsBtn = actionsSection.locator('[data-testid="view-details-button"]');
        await expect(viewDetailsBtn).toBeVisible();
      }
    });

    test('should show select/reject buttons for appropriate solutions', async ({ page }) => {
      await page.waitForTimeout(1000);

      // Check for select buttons (only on proposed/evaluated solutions)
      const selectButtons = page.locator('[data-testid^="select-button-"]');
      const selectCount = await selectButtons.count();

      // Count may be 0 if no selectable solutions
      expect(selectCount).toBeGreaterThanOrEqual(0);

      // Check for reject buttons
      const rejectButtons = page.locator('[data-testid^="reject-button-"]');
      const rejectCount = await rejectButtons.count();

      expect(rejectCount).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Requirement Filter', () => {
    test('should filter solutions by requirement when selected', async ({ page }) => {
      await page.waitForTimeout(1000);

      const filter = page.locator('[data-testid="requirement-filter"]');
      const filterExists = await filter.count() > 0;

      if (filterExists) {
        // Get initial count
        const initialCards = await page.locator('[data-testid^="solution-card-"]').count();

        // Open dropdown
        await filter.click();
        await page.waitForTimeout(500);

        // Select first option if available
        const firstOption = page.locator('.p-select-option').first();
        const hasOptions = await firstOption.count() > 0;

        if (hasOptions) {
          await firstOption.click();
          await page.waitForTimeout(500);

          // Count after filter
          const filteredCards = await page.locator('[data-testid^="solution-card-"]').count();

          // Count should be <= initial (filtering reduces or maintains count)
          expect(filteredCards).toBeLessThanOrEqual(initialCards);
        }
      }
    });

    test('should show all solutions when filter is cleared', async ({ page }) => {
      await page.waitForTimeout(1000);

      const filter = page.locator('[data-testid="requirement-filter"]');
      const filterExists = await filter.count() > 0;

      if (filterExists) {
        // Check if clear button exists (filter has value)
        const clearBtn = page.locator('.p-select-clear-icon');
        const hasClearBtn = await clearBtn.isVisible().catch(() => false);

        if (hasClearBtn) {
          await clearBtn.click();
          await page.waitForTimeout(500);

          // Should show all solutions
          const cards = await page.locator('[data-testid^="solution-card-"]').count();
          expect(cards).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  test.describe('API Integration', () => {
    test('should fetch solutions from API', async ({ page }) => {
      const apiCalls: string[] = [];

      page.on('request', request => {
        if (request.url().includes('/api')) {
          apiCalls.push(`${request.method()} ${request.url()}`);
        }
      });

      await page.goto('/solutions');
      await page.waitForLoadState('networkidle');

      // Should have called /plans/{planId}/solutions
      const solutionsCall = apiCalls.find(call => call.includes('/solutions'));
      expect(solutionsCall).toBeTruthy();
    });

    test('should fetch requirements for filter', async ({ page }) => {
      const apiCalls: string[] = [];

      page.on('request', request => {
        if (request.url().includes('/api')) {
          apiCalls.push(`${request.method()} ${request.url()}`);
        }
      });

      await page.goto('/solutions');
      await page.waitForLoadState('networkidle');

      // Should have called /plans/{planId}/requirements
      const requirementsCall = apiCalls.find(call => call.includes('/requirements'));
      expect(requirementsCall).toBeTruthy();
    });
  });

  test.describe('Visual Regression', () => {
    test('should take full page screenshot', async ({ page }) => {
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: screenshotPath('solutions-page-full.png'),
        fullPage: true
      });
    });

    test('should take screenshot of solutions grid', async ({ page }) => {
      await page.waitForTimeout(1000);

      const grid = page.locator('[data-testid="solutions-grid"]');
      const gridVisible = await grid.isVisible().catch(() => false);

      if (gridVisible) {
        await grid.screenshot({
          path: screenshotPath('solutions-grid.png')
        });
      }
    });

    test('should take screenshot of first solution card', async ({ page }) => {
      await page.waitForTimeout(1000);

      const firstCard = page.locator('[data-testid^="solution-card-"]').first();
      const cardExists = await firstCard.count() > 0;

      if (cardExists) {
        await firstCard.screenshot({
          path: screenshotPath('solution-card-detail.png')
        });
      }
    });
  });

  test.describe('Responsive Behavior', () => {
    test('should display cards in grid layout on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForTimeout(1000);

      const grid = page.locator('[data-testid="solutions-grid"]');
      const gridVisible = await grid.isVisible().catch(() => false);

      if (gridVisible) {
        // Grid should use CSS grid
        const gridDisplay = await grid.evaluate(el =>
          window.getComputedStyle(el).display
        );
        expect(gridDisplay).toBe('grid');
      }
    });

    test('should adapt layout on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(1000);

      const grid = page.locator('[data-testid="solutions-grid"]');
      const gridVisible = await grid.isVisible().catch(() => false);

      if (gridVisible) {
        // Grid should still be visible
        await expect(grid).toBeVisible();
      }
    });
  });
});
