import { test, expect } from '@playwright/test';
import { screenshotPath } from './test-paths';

test.describe('Cross-page checks after padding fixes', () => {
  test('Dashboard should work correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for dashboard to load
    await page.waitForSelector('[data-testid="dashboard-page"]', { timeout: 10000 });

    // Take screenshot
    await page.screenshot({ path: screenshotPath('dashboard-padding-check.png'), fullPage: true });

    // Verify dashboard is visible
    const dashboard = page.locator('[data-testid="dashboard-page"]');
    await expect(dashboard).toBeVisible();

    console.log('✅ Dashboard works correctly');
  });

  test('Phases should work correctly', async ({ page }) => {
    await page.goto('/phases');
    await page.waitForLoadState('networkidle');

    // Wait for phases page to load
    await page.waitForSelector('[data-testid="phases-page"]', { timeout: 10000 });

    // Take screenshot
    await page.screenshot({ path: screenshotPath('phases-padding-check.png'), fullPage: true });

    // Verify phases page is visible
    const phases = page.locator('[data-testid="phases-page"]');
    await expect(phases).toBeVisible();

    console.log('✅ Phases page works correctly');
  });

  test('Requirements should work correctly', async ({ page }) => {
    await page.goto('/requirements');
    await page.waitForLoadState('networkidle');

    // Wait for requirements page to load
    await page.waitForSelector('[data-testid="requirements-page"]', { timeout: 10000 });

    // Take screenshot
    await page.screenshot({ path: screenshotPath('requirements-padding-check.png'), fullPage: true });

    // Verify requirements page is visible
    const requirements = page.locator('[data-testid="requirements-page"]');
    await expect(requirements).toBeVisible();

    console.log('✅ Requirements page works correctly');
  });

  test('Solutions should work correctly', async ({ page }) => {
    await page.goto('/solutions');
    await page.waitForLoadState('networkidle');

    // Wait for solutions page to load
    await page.waitForSelector('[data-testid="solutions-page"]', { timeout: 10000 });

    // Take screenshot
    await page.screenshot({ path: screenshotPath('solutions-padding-check.png'), fullPage: true });

    // Verify solutions page is visible
    const solutions = page.locator('[data-testid="solutions-page"]');
    await expect(solutions).toBeVisible();

    console.log('✅ Solutions page works correctly');
  });

  test('Decisions should work correctly', async ({ page }) => {
    await page.goto('/decisions');
    await page.waitForLoadState('networkidle');

    // Wait for decisions page to load
    await page.waitForSelector('[data-testid="decisions-page"]', { timeout: 10000 });

    // Take screenshot
    await page.screenshot({ path: screenshotPath('decisions-padding-check.png'), fullPage: true });

    // Verify decisions page is visible
    const decisions = page.locator('[data-testid="decisions-page"]');
    await expect(decisions).toBeVisible();

    console.log('✅ Decisions page works correctly');
  });

  test('Artifacts should work correctly', async ({ page }) => {
    await page.goto('/artifacts');
    await page.waitForLoadState('networkidle');

    // Wait for artifacts page to load
    await page.waitForSelector('[data-testid="artifacts-page"]', { timeout: 10000 });

    // Take screenshot
    await page.screenshot({ path: screenshotPath('artifacts-padding-check.png'), fullPage: true });

    // Verify artifacts page is visible
    const artifacts = page.locator('[data-testid="artifacts-page"]');
    await expect(artifacts).toBeVisible();

    console.log('✅ Artifacts page works correctly');
  });
});
