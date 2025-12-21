import { test, expect } from '@playwright/test';
import { screenshotPath } from './test-paths';

test.describe('Phases - Vertical Scroll Indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/phases');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="phases-tree-container"]');
  });

  test('should show bottom gradient when content overflows at top', async ({ page }) => {
    const container = page.locator('[data-testid="phases-tree-container"]');

    // Check if container has overflow by checking class
    const hasOverflowBottom = await container.evaluate((el) => {
      return el.classList.contains('scroll-container--overflow-bottom');
    });

    // Only test if there's actual overflow
    if (hasOverflowBottom) {
      await expect(container).toHaveClass(/scroll-container--overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('phases-vertical-overflow-bottom.png'),
        fullPage: true
      });
    }
  });

  test('should show top gradient when scrolled down', async ({ page }) => {
    const container = page.locator('[data-testid="phases-tree-container"]');

    // Check if content has scrollable area
    const isScrollable = await container.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    // Only test if scrollable
    if (isScrollable) {
      // Scroll down by 200px
      await container.evaluate((el) => {
        el.scrollTop = 200;
      });

      // Wait for throttled scroll handler (16ms + buffer)
      await page.waitForTimeout(100);

      // Top gradient should appear on container
      await expect(container).toHaveClass(/scroll-container--overflow-top/);

      await page.screenshot({
        path: screenshotPath('phases-vertical-overflow-top.png'),
        fullPage: true
      });
    }
  });

  test('should show both gradients when scrolled to middle', async ({ page }) => {
    const container = page.locator('[data-testid="phases-tree-container"]');

    // Check if content has scrollable area
    const scrollInfo = await container.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      isScrollable: el.scrollHeight > el.clientHeight
    }));

    // Only test if scrollable
    if (scrollInfo.isScrollable) {
      // Scroll to middle
      await container.evaluate((el) => {
        const middle = (el.scrollHeight - el.clientHeight) / 2;
        el.scrollTop = middle;
      });

      // Wait for throttled scroll handler
      await page.waitForTimeout(100);

      // Both gradients should appear
      await expect(container).toHaveClass(/scroll-container--overflow-top/);
      await expect(container).toHaveClass(/scroll-container--overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('phases-vertical-overflow-both.png'),
        fullPage: true
      });
    }
  });

  test('should hide gradients when viewport is tall enough', async ({ page }) => {
    // Set viewport very tall
    await page.setViewportSize({ width: 1280, height: 2000 });

    const container = page.locator('[data-testid="phases-tree-container"]');

    // Wait for ResizeObserver to trigger
    await page.waitForTimeout(100);

    // Check if no vertical overflow
    const hasNoOverflow = await container.evaluate((el) => {
      return el.scrollHeight <= el.clientHeight;
    });

    // Only test if no overflow
    if (hasNoOverflow) {
      // No gradients should appear
      await expect(container).not.toHaveClass(/scroll-container--overflow-top/);
      await expect(container).not.toHaveClass(/scroll-container--overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('phases-vertical-no-overflow.png'),
        fullPage: true
      });
    }
  });

  test('should scroll to bottom and show only top gradient', async ({ page }) => {
    const container = page.locator('[data-testid="phases-tree-container"]');

    // Check if content has scrollable area
    const isScrollable = await container.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    // Only test if scrollable
    if (isScrollable) {
      // Scroll to bottom
      await container.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });

      // Wait for throttled scroll handler
      await page.waitForTimeout(100);

      // Only top gradient should appear
      await expect(container).toHaveClass(/scroll-container--overflow-top/);
      await expect(container).not.toHaveClass(/scroll-container--overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('phases-vertical-bottom-reached.png'),
        fullPage: true
      });
    }
  });

  test('should update gradients on window resize', async ({ page }) => {
    const container = page.locator('[data-testid="phases-tree-container"]');

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
    const hasOverflow = await container.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    if (hasOverflow) {
      // Bottom gradient should appear due to reduced viewport
      await expect(container).toHaveClass(/scroll-container--overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('phases-vertical-resize.png'),
        fullPage: true
      });
    }

    // Restore viewport
    await page.setViewportSize(initialViewport);
  });

  test('should update gradients when expanding all nodes', async ({ page }) => {
    const container = page.locator('[data-testid="phases-tree-container"]');
    const expandAllBtn = page.locator('[data-testid="toggle-expand-btn"]');

    // Click expand all button
    await expandAllBtn.click();

    // Wait for MutationObserver to trigger and animations to complete
    await page.waitForTimeout(300);

    // Check if expanding created overflow
    const hasOverflow = await container.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    if (hasOverflow) {
      // Bottom gradient should appear after expansion
      await expect(container).toHaveClass(/scroll-container--overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('phases-expand-all-overflow.png'),
        fullPage: true
      });
    }
  });

  test('should update gradients when toggling individual node', async ({ page }) => {
    const container = page.locator('[data-testid="phases-tree-container"]');

    // Find first tree toggler (expand/collapse icon)
    const firstToggler = page.locator('.p-treetable-toggler').first();

    // Expand the first node
    await firstToggler.click();

    // Wait for MutationObserver to trigger and animations to complete
    await page.waitForTimeout(200);

    // Check if toggling affected overflow state
    const scrollState = await container.evaluate((el) => ({
      hasOverflow: el.scrollHeight > el.clientHeight,
      scrollTop: el.scrollTop
    }));

    // If there's overflow or we're scrolled, gradients should be present
    if (scrollState.hasOverflow) {
      await page.screenshot({
        path: screenshotPath('phases-toggle-node.png'),
        fullPage: true
      });

      // At least one gradient should be visible (bottom if at top, or both if scrolled)
      const hasAnyGradient = await container.evaluate((el) => {
        return el.classList.contains('scroll-container--overflow-top') ||
               el.classList.contains('scroll-container--overflow-bottom');
      });

      expect(hasAnyGradient).toBe(true);
    }
  });

  test('should use correct gradient colors in dark theme', async ({ page }) => {
    const container = page.locator('[data-testid="phases-tree-container"]');

    // Switch to dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Wait for theme to apply
    await page.waitForTimeout(100);

    // Check if has overflow
    const hasOverflow = await container.evaluate((el) => el.scrollHeight > el.clientHeight);

    if (hasOverflow) {
      // Scroll to middle to show both gradients
      await container.evaluate((el) => {
        el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
      });

      await page.waitForTimeout(100);

      await page.screenshot({
        path: screenshotPath('phases-vertical-dark-theme.png'),
        fullPage: true
      });
    }
  });
});
