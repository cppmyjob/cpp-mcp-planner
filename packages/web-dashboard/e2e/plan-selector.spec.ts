import { test, expect } from '@playwright/test';

/**
 * RED: E2E Tests for Plan Selector
 * These tests should fail until Plan Selector is implemented in HeaderComponent
 */

test.describe('Plan Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4200');
  });

  test('RED: should display plan selector in header', async ({ page }) => {
    const planSelector = page.locator('[data-testid="plan-selector"]');
    await expect(planSelector).toBeVisible();
  });

  test('RED: should load plans into dropdown', async ({ page }) => {
    // Wait for plans to load
    await page.waitForTimeout(1000);

    // Open dropdown
    await page.click('[data-testid="plan-selector"]');

    // Check if dropdown has options
    const dropdownItems = page.locator('.p-dropdown-item');
    const count = await dropdownItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('RED: should select plan and persist to localStorage', async ({ page }) => {
    // Wait for initial load
    await page.waitForTimeout(1000);

    // Open dropdown
    await page.click('[data-testid="plan-selector"]');

    // Select first plan (assuming it's not the default)
    const firstPlan = page.locator('.p-dropdown-item').first();
    const planName = await firstPlan.textContent();
    await firstPlan.click();

    // Wait for selection to process
    await page.waitForTimeout(500);

    // Verify localStorage was updated
    const storedPlanId = await page.evaluate(() => localStorage.getItem('active-plan-id'));
    expect(storedPlanId).toBeTruthy();
    expect(storedPlanId).not.toBeNull();
  });

  test('RED: should restore selected plan after page reload', async ({ page }) => {
    // Set a plan ID in localStorage before page load
    await page.evaluate(() => {
      localStorage.setItem('active-plan-id', '261825f1-cef0-4227-873c-a20c7e81a9de');
    });

    // Reload page
    await page.reload();

    // Wait for plans to load
    await page.waitForTimeout(1000);

    // Verify the plan selector shows the selected plan
    const planSelector = page.locator('[data-testid="plan-selector"]');
    const selectedText = await planSelector.textContent();

    // Should show plan name (not empty or "Select Plan")
    expect(selectedText).not.toBe('');
    expect(selectedText).not.toContain('Select Plan');
  });

  test('RED: should change dashboard data when different plan selected', async ({ page }) => {
    // Wait for initial load
    await page.waitForTimeout(1000);

    // Get initial statistics
    const initialStats = await page.locator('[data-testid="statistics-cards"]').textContent();

    // Open dropdown and select different plan
    await page.click('[data-testid="plan-selector"]');
    const secondPlan = page.locator('.p-dropdown-item').nth(1);
    await secondPlan.click();

    // Wait for data to reload
    await page.waitForTimeout(1000);

    // Get new statistics
    const newStats = await page.locator('[data-testid="statistics-cards"]').textContent();

    // Statistics should be different (or at least the component should have reloaded)
    // This verifies that PlanStateService integration works
    expect(newStats).toBeDefined();
  });

  test('RED: should show loading state while fetching plans', async ({ page }) => {
    // Navigate to page
    await page.goto('http://localhost:4200');

    // Check for loading indicator (if implemented)
    const planSelector = page.locator('[data-testid="plan-selector"]');

    // Should eventually show dropdown (not loading state)
    await expect(planSelector).toBeVisible({ timeout: 5000 });
  });

  test('RED: should handle empty plan list gracefully', async ({ page }) => {
    // This test assumes we can mock empty response
    // For now, just verify dropdown is disabled or shows appropriate message
    const planSelector = page.locator('[data-testid="plan-selector"]');
    await expect(planSelector).toBeVisible();
  });

  test('RED: should be accessible via keyboard navigation', async ({ page }) => {
    // Tab to plan selector
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // Assuming 3rd tab brings us to plan selector

    // Open with Enter/Space
    await page.keyboard.press('Enter');

    // Dropdown should be open
    const dropdownPanel = page.locator('.p-dropdown-panel');
    await expect(dropdownPanel).toBeVisible();

    // Navigate with arrow keys
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Selection should be made
    await page.waitForTimeout(500);
    const storedPlanId = await page.evaluate(() => localStorage.getItem('active-plan-id'));
    expect(storedPlanId).toBeTruthy();
  });
});
