import { test, expect } from '@playwright/test';
import { screenshotPath } from './test-paths';

test.describe('Requirements Kanban - Horizontal Scroll Indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/requirements');
    await page.waitForSelector('[data-testid="requirements-kanban"]');
  });

  test('should show right gradient when content overflows at left edge', async ({ page }) => {
    const kanban = page.locator('[data-testid="requirements-kanban"]');

    // Wait for columns to load
    await page.waitForSelector('[data-testid^="kanban-column-"]', { timeout: 5000 });

    // Check if kanban has horizontal overflow
    const hasOverflowRight = await kanban.evaluate((el) => {
      return el.classList.contains('scroll-container--overflow-right');
    });

    // Only test if there's actual overflow (5 columns should overflow on narrow screens)
    if (hasOverflowRight) {
      await expect(kanban).toHaveClass(/scroll-container--overflow-right/);

      await page.screenshot({
        path: screenshotPath('requirements-horizontal-overflow-right.png'),
        fullPage: true
      });
    }
  });

  test('should show left gradient when scrolled right', async ({ page }) => {
    const kanban = page.locator('[data-testid="requirements-kanban"]');

    // Wait for columns to load
    await page.waitForSelector('[data-testid^="kanban-column-"]', { timeout: 5000 });

    // Check if kanban has horizontal scrollable content
    const isScrollable = await kanban.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });

    // Only test if scrollable
    if (isScrollable) {
      // Scroll right by 300px
      await kanban.evaluate((el) => {
        el.scrollLeft = 300;
      });

      // Wait for throttled scroll handler (16ms + buffer)
      await page.waitForTimeout(100);

      // Left gradient should appear
      await expect(kanban).toHaveClass(/scroll-container--overflow-left/);

      await page.screenshot({
        path: screenshotPath('requirements-horizontal-overflow-left.png'),
        fullPage: true
      });
    }
  });

  test('should show both gradients when scrolled to middle horizontally', async ({ page }) => {
    const kanban = page.locator('[data-testid="requirements-kanban"]');

    // Wait for columns to load
    await page.waitForSelector('[data-testid^="kanban-column-"]', { timeout: 5000 });

    // Check if horizontally scrollable
    const scrollInfo = await kanban.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      isScrollable: el.scrollWidth > el.clientWidth
    }));

    // Only test if scrollable
    if (scrollInfo.isScrollable) {
      // Scroll to horizontal middle
      await kanban.evaluate((el) => {
        const middle = (el.scrollWidth - el.clientWidth) / 2;
        el.scrollLeft = middle;
      });

      // Wait for throttled scroll handler
      await page.waitForTimeout(100);

      // Both gradients should appear
      await expect(kanban).toHaveClass(/scroll-container--overflow-left/);
      await expect(kanban).toHaveClass(/scroll-container--overflow-right/);

      await page.screenshot({
        path: screenshotPath('requirements-horizontal-overflow-both.png'),
        fullPage: true
      });
    }
  });

  test('should hide gradients when viewport is wide enough', async ({ page }) => {
    // Set viewport very wide
    await page.setViewportSize({ width: 2000, height: 800 });

    const kanban = page.locator('[data-testid="requirements-kanban"]');

    // Wait for columns to load
    await page.waitForSelector('[data-testid^="kanban-column-"]', { timeout: 5000 });

    // Wait for ResizeObserver to trigger
    await page.waitForTimeout(100);

    // Check if no horizontal overflow
    const hasNoOverflow = await kanban.evaluate((el) => {
      return el.scrollWidth <= el.clientWidth;
    });

    // Only test if no overflow
    if (hasNoOverflow) {
      // No gradients should appear
      await expect(kanban).not.toHaveClass(/scroll-container--overflow-left/);
      await expect(kanban).not.toHaveClass(/scroll-container--overflow-right/);

      await page.screenshot({
        path: screenshotPath('requirements-horizontal-no-overflow.png'),
        fullPage: true
      });
    }
  });

  test('should scroll to right edge and show only left gradient', async ({ page }) => {
    const kanban = page.locator('[data-testid="requirements-kanban"]');

    // Wait for columns to load
    await page.waitForSelector('[data-testid^="kanban-column-"]', { timeout: 5000 });

    // Check if horizontally scrollable
    const isScrollable = await kanban.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });

    // Only test if scrollable
    if (isScrollable) {
      // Scroll to right edge
      await kanban.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });

      // Wait for throttled scroll handler
      await page.waitForTimeout(100);

      // Only left gradient should appear
      await expect(kanban).toHaveClass(/scroll-container--overflow-left/);
      await expect(kanban).not.toHaveClass(/scroll-container--overflow-right/);

      await page.screenshot({
        path: screenshotPath('requirements-horizontal-right-edge.png'),
        fullPage: true
      });
    }
  });

  test('should update gradients on window resize horizontally', async ({ page }) => {
    const kanban = page.locator('[data-testid="requirements-kanban"]');

    // Wait for columns to load
    await page.waitForSelector('[data-testid^="kanban-column-"]', { timeout: 5000 });

    // Get initial viewport size
    const initialViewport = page.viewportSize();
    if (!initialViewport) return;

    // Resize viewport to smaller width (more horizontal overflow)
    await page.setViewportSize({
      width: Math.floor(initialViewport.width * 0.6),
      height: initialViewport.height
    });

    // Wait for ResizeObserver to trigger
    await page.waitForTimeout(100);

    // Check if overflow increased
    const hasOverflow = await kanban.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });

    if (hasOverflow) {
      // Right gradient should appear due to reduced viewport
      await expect(kanban).toHaveClass(/scroll-container--overflow-right/);

      await page.screenshot({
        path: screenshotPath('requirements-horizontal-resize.png'),
        fullPage: true
      });
    }

    // Restore viewport
    await page.setViewportSize(initialViewport);
  });
});
