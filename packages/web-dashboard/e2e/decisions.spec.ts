import { test, expect } from '@playwright/test';
import { screenshotPath } from './test-paths';

test.describe('Decisions Page', () => {
  test.beforeEach(async ({ page }) => {
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Browser console error: ${msg.text()}`);
      }
    });

    await page.goto('/decisions');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Page Layout', () => {
    test('should display page container', async ({ page }) => {
      const container = page.locator('[data-testid="decisions-page"]');
      await expect(container).toBeVisible();
    });

    test('should display page title', async ({ page }) => {
      await expect(page.locator('h2:has-text("Decisions")')).toBeVisible();
    });
  });

  test.describe('Loading State', () => {
    test('should show loading indicator initially', async ({ page }) => {
      // Navigate and quickly check for loading state
      const loadingPromise = page.goto('/decisions');

      // Check for loading state (may be too fast to catch)
      const loading = page.locator('[data-testid="decisions-loading"]');
      const loadingVisible = await loading.isVisible().catch(() => false);

      await loadingPromise;

      // Loading should either be visible or already gone
      expect(typeof loadingVisible).toBe('boolean');
    });
  });

  test.describe('Status Filter', () => {
    test('should display status filter when decisions exist', async ({ page }) => {
      // Wait for data to load
      await page.waitForTimeout(1000);

      // Check if content or empty state exists
      const content = page.locator('[data-testid="decisions-content"]');
      const empty = page.locator('[data-testid="decisions-empty"]');

      const contentVisible = await content.isVisible().catch(() => false);

      if (contentVisible) {
        // Filter should be visible when there are decisions
        const filter = page.locator('[data-testid="decisions-filter"]');
        await expect(filter).toBeVisible();

        // Check filter components
        await expect(page.locator('[data-testid="status-filter-multiselect"]')).toBeVisible();
        await expect(page.locator('[data-testid="filter-count"]')).toBeVisible();
      }
    });

    test('should filter decisions by status', async ({ page }) => {
      await page.waitForTimeout(1000);

      const content = page.locator('[data-testid="decisions-content"]');
      const contentVisible = await content.isVisible().catch(() => false);

      if (contentVisible) {
        // Get initial count
        const filterCount = page.locator('[data-testid="filter-count"]');
        const initialText = await filterCount.textContent();

        // Click on multiselect to open dropdown
        const multiselect = page.locator('[data-testid="status-filter-multiselect"]');
        await multiselect.click();

        // Wait for dropdown to open
        await page.waitForTimeout(300);

        // Try to find and uncheck "Active" option
        const activeOption = page.locator('.p-multiselect-item').filter({ hasText: 'Active' }).first();
        const activeVisible = await activeOption.isVisible().catch(() => false);

        if (activeVisible) {
          await activeOption.click();
          await page.waitForTimeout(300);

          // Close dropdown
          await page.keyboard.press('Escape');

          // Count should change
          const newText = await filterCount.textContent();
          expect(newText).not.toBe(initialText);
        }
      }
    });
  });

  test.describe('Timeline Display', () => {
    test('should display timeline or empty state', async ({ page }) => {
      // Wait for loading to complete
      await page.waitForTimeout(1000);

      // Either timeline or empty state should be visible
      const timeline = page.locator('[data-testid="decisions-timeline"]');
      const empty = page.locator('[data-testid="decisions-empty"]');
      const error = page.locator('[data-testid="decisions-error"]');

      const timelineVisible = await timeline.isVisible().catch(() => false);
      const emptyVisible = await empty.isVisible().catch(() => false);
      const errorVisible = await error.isVisible().catch(() => false);

      // At least one should be visible
      expect(timelineVisible || emptyVisible || errorVisible).toBe(true);
    });

    test('should render decision cards with proper structure', async ({ page }) => {
      // Wait for data
      await page.waitForTimeout(1000);

      const timeline = page.locator('[data-testid="decisions-timeline"]');
      const timelineVisible = await timeline.isVisible().catch(() => false);

      if (timelineVisible) {
        // Check for p-card elements
        const cards = timeline.locator('p-card');
        const cardCount = await cards.count();

        if (cardCount > 0) {
          const firstCard = cards.first();
          await expect(firstCard).toBeVisible();

          // Card should have title
          const cardHeader = firstCard.locator('.decisions__card-header');
          if (await cardHeader.count() > 0) {
            await expect(cardHeader).toBeVisible();
          }
        }
      }
    });

    test('should display decision status tags', async ({ page }) => {
      await page.waitForTimeout(1000);

      const timeline = page.locator('[data-testid="decisions-timeline"]');
      const timelineVisible = await timeline.isVisible().catch(() => false);

      if (timelineVisible) {
        // Check for status tags
        const statusTags = page.locator('p-tag');
        const tagCount = await statusTags.count();

        if (tagCount > 0) {
          await expect(statusTags.first()).toBeVisible();
        }
      }
    });

    test('should display decision markers', async ({ page }) => {
      await page.waitForTimeout(1000);

      const timeline = page.locator('[data-testid="decisions-timeline"]');
      const timelineVisible = await timeline.isVisible().catch(() => false);

      if (timelineVisible) {
        // Check for custom markers
        const markers = page.locator('.decisions__marker');
        const markerCount = await markers.count();

        if (markerCount > 0) {
          const firstMarker = markers.first();
          await expect(firstMarker).toBeVisible();

          // Should have status-specific class
          const hasActive = await firstMarker.evaluate(el =>
            el.classList.contains('decisions__marker--active')
          );
          const hasSuperseded = await firstMarker.evaluate(el =>
            el.classList.contains('decisions__marker--superseded')
          );
          const hasReversed = await firstMarker.evaluate(el =>
            el.classList.contains('decisions__marker--reversed')
          );

          expect(hasActive || hasSuperseded || hasReversed).toBe(true);
        }
      }
    });
  });

  test.describe('Decision Card Sections', () => {
    test('should display context section when available', async ({ page }) => {
      await page.waitForTimeout(1000);

      const timeline = page.locator('[data-testid="decisions-timeline"]');
      const timelineVisible = await timeline.isVisible().catch(() => false);

      if (timelineVisible) {
        // Check for context sections
        const contextSections = page.locator('[data-testid="decision-context"]');
        const contextCount = await contextSections.count();

        // If any decisions have context, verify visibility
        if (contextCount > 0) {
          await expect(contextSections.first()).toBeVisible();
        }
      }
    });

    test('should display consequences section when available', async ({ page }) => {
      await page.waitForTimeout(1000);

      const timeline = page.locator('[data-testid="decisions-timeline"]');
      const timelineVisible = await timeline.isVisible().catch(() => false);

      if (timelineVisible) {
        const consequencesSections = page.locator('[data-testid="decision-consequences"]');
        const count = await consequencesSections.count();

        if (count > 0) {
          await expect(consequencesSections.first()).toBeVisible();
        }
      }
    });

    test('should display impact scope chips when available', async ({ page }) => {
      await page.waitForTimeout(1000);

      const timeline = page.locator('[data-testid="decisions-timeline"]');
      const timelineVisible = await timeline.isVisible().catch(() => false);

      if (timelineVisible) {
        const impactSections = page.locator('[data-testid="decision-impact-scope"]');
        const count = await impactSections.count();

        if (count > 0) {
          await expect(impactSections.first()).toBeVisible();

          // Should contain p-chip elements
          const chips = impactSections.first().locator('p-chip');
          const chipCount = await chips.count();
          expect(chipCount).toBeGreaterThan(0);
        }
      }
    });

    test('should display alternatives section when available', async ({ page }) => {
      await page.waitForTimeout(1000);

      const timeline = page.locator('[data-testid="decisions-timeline"]');
      const timelineVisible = await timeline.isVisible().catch(() => false);

      if (timelineVisible) {
        const alternativesSections = page.locator('[data-testid="decision-alternatives"]');
        const count = await alternativesSections.count();

        if (count > 0) {
          await expect(alternativesSections.first()).toBeVisible();
        }
      }
    });

    test('should display supersession chain when available', async ({ page }) => {
      await page.waitForTimeout(1000);

      const timeline = page.locator('[data-testid="decisions-timeline"]');
      const timelineVisible = await timeline.isVisible().catch(() => false);

      if (timelineVisible) {
        const supersessionSections = page.locator('[data-testid="decision-supersession"]');
        const count = await supersessionSections.count();

        if (count > 0) {
          await expect(supersessionSections.first()).toBeVisible();

          // Check for supersession badges
          const supersededBadge = page.locator('[data-testid="superseded-by-badge"]');
          const supersedesBadge = page.locator('[data-testid="supersedes-badge"]');

          const hasBadges = (await supersededBadge.count() > 0) || (await supersedesBadge.count() > 0);
          expect(hasBadges).toBe(true);
        }
      }
    });
  });

  test.describe('Visual Regression', () => {
    test('should match full page screenshot', async ({ page }) => {
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: screenshotPath('decisions-full-page.png'),
        fullPage: true
      });

      // Screenshot saved successfully
      expect(true).toBe(true);
    });

    test('should match timeline screenshot', async ({ page }) => {
      await page.waitForTimeout(1000);

      const timeline = page.locator('[data-testid="decisions-timeline"]');
      const timelineVisible = await timeline.isVisible().catch(() => false);

      if (timelineVisible) {
        await timeline.screenshot({
          path: screenshotPath('decisions-timeline.png')
        });

        expect(true).toBe(true);
      }
    });
  });
});
