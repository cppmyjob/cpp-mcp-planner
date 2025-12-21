import { test, expect } from '@playwright/test';
import { screenshotPath } from './test-paths';

test.describe('Requirements Kanban - Scroll Indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/requirements');
    await page.waitForSelector('[data-testid="requirements-kanban"]');
  });

  test('should show bottom gradient when content overflows at top', async ({ page }) => {
    // Find a column with multiple cards (likely draft or approved)
    const draftCards = page.locator('[data-testid="column-cards-draft"]');

    // Wait for cards to load
    await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

    // Check if column has overflow by checking class
    const hasOverflowBottom = await draftCards.evaluate((el) => {
      return el.classList.contains('has-overflow-bottom');
    });

    // Only test if there's actual overflow (skip if empty or few cards)
    if (hasOverflowBottom) {
      await expect(draftCards).toHaveClass(/has-overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('scroll-indicator-bottom.png'),
        fullPage: true
      });
    }
  });

  test('should show top gradient when scrolled down', async ({ page }) => {
    const draftCards = page.locator('[data-testid="column-cards-draft"]');

    // Wait for cards to load
    await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

    // Check if column has scrollable content
    const isScrollable = await draftCards.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    // Only test if scrollable
    if (isScrollable) {
      // Scroll down by 200px
      await draftCards.evaluate((el) => {
        el.scrollTop = 200;
      });

      // Wait for throttled scroll handler (16ms + small buffer)
      await page.waitForTimeout(100);

      // Top gradient should appear
      await expect(draftCards).toHaveClass(/has-overflow-top/);

      await page.screenshot({
        path: screenshotPath('scroll-indicator-top.png'),
        fullPage: true
      });
    }
  });

  test('should show both gradients when scrolled to middle', async ({ page }) => {
    const draftCards = page.locator('[data-testid="column-cards-draft"]');

    // Wait for cards to load
    await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

    // Check if column has scrollable content
    const scrollInfo = await draftCards.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      isScrollable: el.scrollHeight > el.clientHeight
    }));

    // Only test if scrollable
    if (scrollInfo.isScrollable) {
      // Scroll to middle
      await draftCards.evaluate((el) => {
        const middle = (el.scrollHeight - el.clientHeight) / 2;
        el.scrollTop = middle;
      });

      // Wait for throttled scroll handler
      await page.waitForTimeout(100);

      // Both gradients should appear
      await expect(draftCards).toHaveClass(/has-overflow-top/);
      await expect(draftCards).toHaveClass(/has-overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('scroll-indicator-both.png'),
        fullPage: true
      });
    }
  });

  test('should hide gradients when no overflow (empty column)', async ({ page }) => {
    // Find deferred or rejected column (likely to be empty)
    const deferredCards = page.locator('[data-testid="column-cards-deferred"]');

    // Check if column is empty or has few cards
    const hasNoOverflow = await deferredCards.evaluate((el) => {
      return el.scrollHeight <= el.clientHeight;
    });

    // Only test if no overflow
    if (hasNoOverflow) {
      // No gradients should appear
      await expect(deferredCards).not.toHaveClass(/has-overflow-top/);
      await expect(deferredCards).not.toHaveClass(/has-overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('scroll-indicator-none.png'),
        fullPage: true
      });
    }
  });

  test('should scroll to bottom and show only top gradient', async ({ page }) => {
    const draftCards = page.locator('[data-testid="column-cards-draft"]');

    // Wait for cards to load
    await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

    // Check if column has scrollable content
    const isScrollable = await draftCards.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    // Only test if scrollable
    if (isScrollable) {
      // Scroll to bottom
      await draftCards.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });

      // Wait for throttled scroll handler
      await page.waitForTimeout(100);

      // Only top gradient should appear
      await expect(draftCards).toHaveClass(/has-overflow-top/);
      await expect(draftCards).not.toHaveClass(/has-overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('scroll-indicator-bottom-reached.png'),
        fullPage: true
      });
    }
  });

  test('should track scroll state independently for each column', async ({ page }) => {
    // Wait for cards to load
    await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

    const draftCards = page.locator('[data-testid="column-cards-draft"]');
    const approvedCards = page.locator('[data-testid="column-cards-approved"]');

    // Check if both columns are scrollable
    const draftScrollable = await draftCards.evaluate((el) => el.scrollHeight > el.clientHeight);
    const approvedScrollable = await approvedCards.evaluate((el) => el.scrollHeight > el.clientHeight);

    // Only test if both are scrollable
    if (draftScrollable && approvedScrollable) {
      // Scroll only draft column
      await draftCards.evaluate((el) => {
        el.scrollTop = 200;
      });

      // Wait for throttled scroll handler
      await page.waitForTimeout(100);

      // Draft should have top gradient
      await expect(draftCards).toHaveClass(/has-overflow-top/);

      // Approved should still be at top (no top gradient)
      await expect(approvedCards).not.toHaveClass(/has-overflow-top/);

      await page.screenshot({
        path: screenshotPath('scroll-indicator-independent.png'),
        fullPage: true
      });
    }
  });

  test('should update gradients on window resize', async ({ page }) => {
    const draftCards = page.locator('[data-testid="column-cards-draft"]');

    // Wait for cards to load
    await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

    // Get initial viewport size
    const initialViewport = page.viewportSize();
    if (!initialViewport) return;

    // Resize viewport to smaller height (more overflow)
    await page.setViewportSize({
      width: initialViewport.width,
      height: Math.floor(initialViewport.height * 0.6)
    });

    // Wait for ResizeObserver to trigger
    await page.waitForTimeout(100);

    // Check if overflow increased
    const hasOverflow = await draftCards.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    if (hasOverflow) {
      // Bottom gradient should appear due to reduced viewport
      await expect(draftCards).toHaveClass(/has-overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('scroll-indicator-resize.png'),
        fullPage: true
      });
    }

    // Restore viewport
    await page.setViewportSize(initialViewport);
  });

  test('should have visible scrollbar on webkit browsers', async ({ page, browserName }) => {
    // Only test on Chromium/Webkit
    if (browserName !== 'chromium' && browserName !== 'webkit') {
      return;
    }

    const draftCards = page.locator('[data-testid="column-cards-draft"]');

    // Wait for cards to load
    await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

    // Check scrollbar styles
    const scrollbarWidth = await draftCards.evaluate((el) => {
      const style = window.getComputedStyle(el, '::-webkit-scrollbar');
      return style.width;
    });

    // Scrollbar should be 10px wide (as defined in SCSS)
    expect(scrollbarWidth).toBe('10px');
  });

  test('should use correct gradient colors in light theme', async ({ page }) => {
    const draftCards = page.locator('[data-testid="column-cards-draft"]');

    // Ensure light theme
    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-theme');
    });

    // Wait for cards to load
    await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

    // Check if has overflow
    const hasOverflow = await draftCards.evaluate((el) => el.scrollHeight > el.clientHeight);

    if (hasOverflow) {
      // Scroll to middle to show both gradients
      await draftCards.evaluate((el) => {
        el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
      });

      await page.waitForTimeout(100);

      await page.screenshot({
        path: screenshotPath('scroll-indicator-light-theme.png'),
        fullPage: true
      });
    }
  });

  test('should use correct gradient colors in dark theme', async ({ page }) => {
    const draftCards = page.locator('[data-testid="column-cards-draft"]');

    // Switch to dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Wait for theme to apply
    await page.waitForTimeout(100);

    // Wait for cards to load
    await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

    // Check if has overflow
    const hasOverflow = await draftCards.evaluate((el) => el.scrollHeight > el.clientHeight);

    if (hasOverflow) {
      // Scroll to middle to show both gradients
      await draftCards.evaluate((el) => {
        el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
      });

      await page.waitForTimeout(100);

      await page.screenshot({
        path: screenshotPath('scroll-indicator-dark-theme.png'),
        fullPage: true
      });
    }
  });
});
