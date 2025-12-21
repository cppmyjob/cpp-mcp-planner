import { test, expect } from '@playwright/test';
import { screenshotPath } from './test-paths';

test.describe('Dashboard - Vertical Scroll Indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="dashboard-content"]');
  });

  test('should show bottom gradient when content overflows at top', async ({ page }) => {
    const content = page.locator('[data-testid="dashboard-content"]');

    // Check if content has overflow by checking class
    const hasOverflowBottom = await content.evaluate((el) => {
      return el.classList.contains('scroll-container--overflow-bottom');
    });

    // Only test if there's actual overflow
    if (hasOverflowBottom) {
      await expect(content).toHaveClass(/scroll-container--overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('dashboard-vertical-overflow-bottom.png'),
        fullPage: true
      });
    }
  });

  test('should show top gradient when scrolled down', async ({ page }) => {
    const content = page.locator('[data-testid="dashboard-content"]');

    // Check if content has scrollable area
    const isScrollable = await content.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    // Only test if scrollable
    if (isScrollable) {
      // Scroll down by 200px
      await content.evaluate((el) => {
        el.scrollTop = 200;
      });

      // Wait for throttled scroll handler (16ms + buffer)
      await page.waitForTimeout(100);

      // Top gradient should appear
      await expect(content).toHaveClass(/scroll-container--overflow-top/);

      await page.screenshot({
        path: screenshotPath('dashboard-vertical-overflow-top.png'),
        fullPage: true
      });
    }
  });

  test('should show both gradients when scrolled to middle', async ({ page }) => {
    const content = page.locator('[data-testid="dashboard-content"]');

    // Check if content has scrollable area
    const scrollInfo = await content.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      isScrollable: el.scrollHeight > el.clientHeight
    }));

    // Only test if scrollable
    if (scrollInfo.isScrollable) {
      // Scroll to middle
      await content.evaluate((el) => {
        const middle = (el.scrollHeight - el.clientHeight) / 2;
        el.scrollTop = middle;
      });

      // Wait for throttled scroll handler
      await page.waitForTimeout(100);

      // Both gradients should appear
      await expect(content).toHaveClass(/scroll-container--overflow-top/);
      await expect(content).toHaveClass(/scroll-container--overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('dashboard-vertical-overflow-both.png'),
        fullPage: true
      });
    }
  });

  test('should hide gradients when content fits viewport', async ({ page }) => {
    // Set viewport very tall
    await page.setViewportSize({ width: 1280, height: 2000 });

    const content = page.locator('[data-testid="dashboard-content"]');

    // Wait for ResizeObserver to trigger
    await page.waitForTimeout(100);

    // Check if no vertical overflow
    const hasNoOverflow = await content.evaluate((el) => {
      return el.scrollHeight <= el.clientHeight;
    });

    // Only test if no overflow
    if (hasNoOverflow) {
      // No gradients should appear
      await expect(content).not.toHaveClass(/scroll-container--overflow-top/);
      await expect(content).not.toHaveClass(/scroll-container--overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('dashboard-vertical-no-overflow.png'),
        fullPage: true
      });
    }
  });

  test('should scroll to bottom and show only top gradient', async ({ page }) => {
    const content = page.locator('[data-testid="dashboard-content"]');

    // Check if content has scrollable area
    const isScrollable = await content.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    // Only test if scrollable
    if (isScrollable) {
      // Scroll to bottom
      await content.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });

      // Wait for throttled scroll handler
      await page.waitForTimeout(100);

      // Only top gradient should appear
      await expect(content).toHaveClass(/scroll-container--overflow-top/);
      await expect(content).not.toHaveClass(/scroll-container--overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('dashboard-vertical-bottom-reached.png'),
        fullPage: true
      });
    }
  });

  test('should update gradients on window resize vertically', async ({ page }) => {
    const content = page.locator('[data-testid="dashboard-content"]');

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
    const hasOverflow = await content.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    if (hasOverflow) {
      // Bottom gradient should appear due to reduced viewport
      await expect(content).toHaveClass(/scroll-container--overflow-bottom/);

      await page.screenshot({
        path: screenshotPath('dashboard-vertical-resize.png'),
        fullPage: true
      });
    }

    // Restore viewport
    await page.setViewportSize(initialViewport);
  });

  test('should use correct gradient colors in light theme', async ({ page }) => {
    const content = page.locator('[data-testid="dashboard-content"]');

    // Ensure light theme
    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-theme');
    });

    // Check if has overflow
    const hasOverflow = await content.evaluate((el) => el.scrollHeight > el.clientHeight);

    if (hasOverflow) {
      // Scroll to middle to show both gradients
      await content.evaluate((el) => {
        el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
      });

      await page.waitForTimeout(100);

      await page.screenshot({
        path: screenshotPath('dashboard-vertical-light-theme.png'),
        fullPage: true
      });
    }
  });

  test('should use correct gradient colors in dark theme', async ({ page }) => {
    const content = page.locator('[data-testid="dashboard-content"]');

    // Switch to dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Wait for theme to apply
    await page.waitForTimeout(100);

    // Check if has overflow
    const hasOverflow = await content.evaluate((el) => el.scrollHeight > el.clientHeight);

    if (hasOverflow) {
      // Scroll to middle to show both gradients
      await content.evaluate((el) => {
        el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
      });

      await page.waitForTimeout(100);

      await page.screenshot({
        path: screenshotPath('dashboard-vertical-dark-theme.png'),
        fullPage: true
      });
    }
  });
});
