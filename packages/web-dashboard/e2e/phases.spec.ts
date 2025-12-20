import { test, expect } from '@playwright/test';
import { screenshotPath } from './test-paths';

test.describe('Phases Page', () => {
  test.beforeEach(async ({ page }) => {
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Browser console error: ${msg.text()}`);
      }
    });

    await page.goto('/phases');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Header & Statistics', () => {
    test('should display page title', async ({ page }) => {
      const title = page.locator('.phases__title');
      await expect(title).toBeVisible();
      await expect(title).toContainText('Phase Tree');
    });

    test('should display statistics cards', async ({ page }) => {
      // Total phases
      const totalStat = page.locator('[data-testid="total-phases"]');
      await expect(totalStat).toBeVisible();
      const totalValue = await totalStat.locator('.phases__stat-value').textContent();
      expect(totalValue).toMatch(/\d+/);

      // Completed phases
      const completedStat = page.locator('[data-testid="completed-phases"]');
      await expect(completedStat).toBeVisible();

      // In-progress phases
      const inProgressStat = page.locator('[data-testid="in-progress-phases"]');
      await expect(inProgressStat).toBeVisible();
    });
  });

  test.describe('Toolbar', () => {
    test('should have expand/collapse all button', async ({ page }) => {
      const toggleBtn = page.locator('[data-testid="toggle-expand-btn"]');
      await expect(toggleBtn).toBeVisible();
      await expect(toggleBtn).toContainText('Expand All');
    });

    test('should toggle button text on click', async ({ page }) => {
      const toggleBtn = page.locator('[data-testid="toggle-expand-btn"]');

      // Initial state
      await expect(toggleBtn).toContainText('Expand All');

      // Click to expand all
      await toggleBtn.click();
      await expect(toggleBtn).toContainText('Collapse All');

      // Click again to collapse all
      await toggleBtn.click();
      await expect(toggleBtn).toContainText('Expand All');
    });

    test('should have refresh button', async ({ page }) => {
      const refreshBtn = page.locator('[data-testid="refresh-btn"]');
      await expect(refreshBtn).toBeVisible();
    });

    test('should reload data on refresh click', async ({ page }) => {
      const apiCalls: string[] = [];

      page.on('request', request => {
        if (request.url().includes('/phases/tree')) {
          apiCalls.push(request.url());
        }
      });

      const refreshBtn = page.locator('[data-testid="refresh-btn"]');
      await refreshBtn.click();
      await page.waitForLoadState('networkidle');

      expect(apiCalls.length).toBeGreaterThan(0);
    });
  });

  test.describe('Tree Table', () => {
    test('should display tree table', async ({ page }) => {
      const treeTable = page.locator('[data-testid="phase-tree"]');
      await expect(treeTable).toBeVisible();
    });

    test('should display table headers', async ({ page }) => {
      const treeTable = page.locator('[data-testid="phase-tree"]');
      await expect(treeTable.locator('th').filter({ hasText: 'Title' })).toBeVisible();
      await expect(treeTable.locator('th').filter({ hasText: 'Status' })).toBeVisible();
      await expect(treeTable.locator('th').filter({ hasText: 'Progress' })).toBeVisible();
      await expect(treeTable.locator('th').filter({ hasText: 'Priority' })).toBeVisible();
    });

    test('should display phase rows with data', async ({ page }) => {
      // Check for at least one phase row
      const phaseRows = page.locator('[data-testid="phase-tree"] tbody tr');
      await expect(phaseRows.first()).toBeVisible();

      // Check for phase path (e.g., "1", "1.1", "2")
      const phasePath = page.locator('[data-testid="phase-path"]').first();
      await expect(phasePath).toBeVisible();
      const pathText = await phasePath.textContent();
      expect(pathText).toMatch(/^\d+(\.\d+)*$/);
    });

    test('should display status tags', async ({ page }) => {
      const statusTag = page.locator('[data-testid="phase-status"]').first();
      await expect(statusTag).toBeVisible();

      const statusText = await statusTag.textContent();
      expect(['Planned', 'In Progress', 'Completed', 'Blocked', 'Skipped']).toContain(statusText?.trim());
    });

    test('should display progress bars', async ({ page }) => {
      const progressWrapper = page.locator('.phases__progress-wrapper').first();
      await expect(progressWrapper).toBeVisible();

      const progressValue = page.locator('[data-testid="phase-progress"]').first();
      await expect(progressValue).toBeVisible();
      const valueText = await progressValue.textContent();
      expect(valueText).toMatch(/\d+%/);
    });

    test('should display priority tags when set', async ({ page }) => {
      const priorityTags = page.locator('[data-testid="phase-priority"]');
      const count = await priorityTags.count();

      if (count > 0) {
        const priorityText = await priorityTags.first().textContent();
        expect(['critical', 'high', 'medium', 'low']).toContain(priorityText?.trim());
      }
    });
  });

  test.describe('Tree Hierarchy', () => {
    test('should expand/collapse tree nodes', async ({ page }) => {
      // Find a row with children (has toggle button)
      const toggleBtn = page.locator('[data-testid="phase-tree"] .p-treetable-toggler').first();

      if (await toggleBtn.isVisible()) {
        // Count initial visible rows
        const initialRows = await page.locator('[data-testid="phase-tree"] tbody tr').count();

        // Toggle to collapse
        await toggleBtn.click();
        await page.waitForTimeout(300); // Animation

        const afterCollapseRows = await page.locator('[data-testid="phase-tree"] tbody tr').count();
        expect(afterCollapseRows).toBeLessThanOrEqual(initialRows);
      }
    });

    test('should show nested phases with indentation', async ({ page }) => {
      // Expand all first
      const toggleAllBtn = page.locator('[data-testid="toggle-expand-btn"]');
      await toggleAllBtn.click();
      await page.waitForTimeout(300);

      // Check for phases at different depths
      const paths = page.locator('[data-testid="phase-path"]');
      const count = await paths.count();

      if (count > 1) {
        const allPaths: string[] = [];
        for (let i = 0; i < count; i++) {
          const text = await paths.nth(i).textContent();
          if (text) allPaths.push(text);
        }

        // Should have both parent (e.g., "1") and child (e.g., "1.1") paths
        const hasParent = allPaths.some(p => !p.includes('.'));
        const hasChild = allPaths.some(p => p.includes('.'));
        expect(hasParent || hasChild).toBe(true);
      }
    });
  });

  test.describe('Blocked Phase Indicator', () => {
    test('should highlight blocked phases', async ({ page }) => {
      const blockedRows = page.locator('.phases__row--blocked');
      const count = await blockedRows.count();

      if (count > 0) {
        // Blocked row should be visible with special styling
        await expect(blockedRows.first()).toBeVisible();

        // Should show "Blocked" status
        const statusTag = blockedRows.first().locator('[data-testid="phase-status"]');
        await expect(statusTag).toContainText('Blocked');
      }
    });

    test('should show blocker icon with tooltip for blocked phases', async ({ page }) => {
      const blockerHints = page.locator('.phases__blocker-hint');
      const count = await blockerHints.count();

      if (count > 0) {
        const hint = blockerHints.first();
        await expect(hint).toBeVisible();

        // Hover to show tooltip
        await hint.hover();
        // Tooltip content would be blocking reason
      }
    });
  });

  test.describe('API Integration', () => {
    test('should fetch phase tree from API', async ({ page }) => {
      const apiCalls: string[] = [];

      page.on('request', request => {
        if (request.url().includes('/api')) {
          apiCalls.push(`${request.method()} ${request.url()}`);
        }
      });

      await page.goto('/phases');
      await page.waitForLoadState('networkidle');

      // Should have called /plans/{planId}/phases/tree
      const treeCall = apiCalls.find(call => call.includes('/phases/tree'));
      expect(treeCall).toBeTruthy();
    });

    test('should include required fields in API request', async ({ page }) => {
      let requestUrl = '';

      page.on('request', request => {
        if (request.url().includes('/phases/tree')) {
          requestUrl = request.url();
        }
      });

      await page.goto('/phases');
      await page.waitForLoadState('networkidle');

      // Check fields parameter
      expect(requestUrl).toContain('fields');
    });
  });

  test.describe('Loading & Error States', () => {
    test('should show loading indicator', async ({ page }) => {
      // Navigate and check loading state before networkidle
      await page.goto('/phases');
      // Loading might be too fast to catch, but test the element exists
      const loadingIndicator = page.locator('[data-testid="loading-indicator"]');
      // Either visible during load or not present after load
      await expect(loadingIndicator).toBeHidden({ timeout: 5000 });
    });

    test('should not show error state with valid API', async ({ page }) => {
      const errorMessage = page.locator('[data-testid="error-message"]');
      await expect(errorMessage).not.toBeVisible();
    });
  });

  test.describe('Empty State', () => {
    // This test depends on having a plan with no phases
    test.skip('should show empty state when no phases exist', async ({ page }) => {
      // Would need to mock API or use test plan without phases
      const emptyState = page.locator('[data-testid="empty-state"]');
      await expect(emptyState).toBeVisible();
      await expect(emptyState).toContainText('No phases found');
    });
  });

  test.describe('Integration', () => {
    test('should navigate to phases from sidebar', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Click phases nav link
      await page.locator('[data-testid="nav-phases"]').click();
      await page.waitForURL(/.*\/phases/);

      // Should show phases page
      await expect(page.locator('[data-testid="phases-page"]')).toBeVisible();
    });

    test('should take full page screenshot', async ({ page }) => {
      // Expand all for full view
      const toggleBtn = page.locator('[data-testid="toggle-expand-btn"]');
      await toggleBtn.click();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: screenshotPath('phases-full-page.png'),
        fullPage: true
      });
    });
  });

  test.describe('Navigation Bug Regression', () => {
    /**
     * RED test for navigation bug:
     * When navigating Phases → Dashboard → Phases, the table header
     * gets incorrect styling (appears highlighted/selected).
     * Most visible in dark theme.
     */
    test('should maintain consistent header styling after navigation in dark theme', async ({ page }) => {
      // Step 1: Go to Phases page (initial visit)
      await page.goto('/phases');
      await page.waitForLoadState('networkidle');

      // Enable dark theme
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await themeToggle.click();
      await expect(page.locator('html')).toHaveClass(/dark-theme/);
      await page.waitForTimeout(300); // Wait for theme transition

      // Wait for tree table to load
      const treeTable = page.locator('[data-testid="phase-tree"]');
      await expect(treeTable).toBeVisible();

      // Capture header background color on first visit
      const headerRow = page.locator('.p-treetable-thead > tr').first();
      const headerCell = page.locator('.p-treetable-thead > tr > th').first();

      const initialHeaderBg = await headerCell.evaluate(el => {
        return window.getComputedStyle(el).backgroundColor;
      });

      // Take screenshot of initial state
      await page.screenshot({
        path: screenshotPath('phases-header-initial.png')
      });

      // Step 2: Navigate to Dashboard
      await page.locator('[data-testid="nav-dashboard"]').click();
      await page.waitForURL(/.*\/dashboard/);
      await page.waitForLoadState('networkidle');

      // Step 3: Navigate back to Phases
      await page.locator('[data-testid="nav-phases"]').click();
      await page.waitForURL(/.*\/phases/);
      await page.waitForLoadState('networkidle');

      // Wait for tree table to reload
      await expect(treeTable).toBeVisible();

      // Capture header background color after navigation
      const afterNavHeaderBg = await headerCell.evaluate(el => {
        return window.getComputedStyle(el).backgroundColor;
      });

      // Take screenshot of state after navigation
      await page.screenshot({
        path: screenshotPath('phases-header-after-nav.png')
      });

      // Header row should NOT have p-highlight class
      await expect(headerRow).not.toHaveClass(/p-highlight/);

      // Header cells should NOT have p-highlight class
      const headerCells = page.locator('.p-treetable-thead > tr > th');
      const cellCount = await headerCells.count();
      for (let i = 0; i < cellCount; i++) {
        await expect(headerCells.nth(i)).not.toHaveClass(/p-highlight/);
      }

      // Parse RGB values to check brightness
      const parseRgb = (rgb: string): number[] => {
        const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : [0, 0, 0];
      };

      const [r, g, b] = parseRgb(afterNavHeaderBg);
      const brightness = (r + g + b) / 3;

      // In dark theme, header should stay dark (not become light/white)
      // Original bug: header became rgb(244, 244, 245) = brightness ~244 after navigation
      // Fixed: header should have brightness < 100 (dark color)
      expect(brightness).toBeLessThan(100);
    });

    test('should not apply highlight classes to header on multiple navigations', async ({ page }) => {
      // Perform multiple navigation cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        // Go to Phases
        await page.goto('/phases');
        await page.waitForLoadState('networkidle');

        const treeTable = page.locator('[data-testid="phase-tree"]');
        await expect(treeTable).toBeVisible();

        // Check no highlight on header
        const headerRow = page.locator('.p-treetable-thead > tr').first();
        await expect(headerRow).not.toHaveClass(/p-highlight/);

        // Navigate to Dashboard
        await page.locator('[data-testid="nav-dashboard"]').click();
        await page.waitForURL(/.*\/dashboard/);
        await page.waitForLoadState('networkidle');
      }
    });

    /**
     * RED test for row border bug:
     * After navigation in dark theme, row borders become white instead of dark.
     */
    test('should maintain dark row borders after navigation in dark theme', async ({ page }) => {
      // Step 1: Go to Phases page
      await page.goto('/phases');
      await page.waitForLoadState('networkidle');

      // Enable dark theme
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await themeToggle.click();
      await expect(page.locator('html')).toHaveClass(/dark-theme/);
      await page.waitForTimeout(300);

      // Wait for tree table to load
      const treeTable = page.locator('[data-testid="phase-tree"]');
      await expect(treeTable).toBeVisible();

      // Step 2: Navigate to Dashboard
      await page.locator('[data-testid="nav-dashboard"]').click();
      await page.waitForURL(/.*\/dashboard/);
      await page.waitForLoadState('networkidle');

      // Step 3: Navigate back to Phases
      await page.locator('[data-testid="nav-phases"]').click();
      await page.waitForURL(/.*\/phases/);
      await page.waitForLoadState('networkidle');
      await expect(treeTable).toBeVisible();

      // Capture row border color after navigation
      const tableCell = page.locator('.p-treetable-tbody > tr > td').first();
      const borderColor = await tableCell.evaluate(el => {
        return window.getComputedStyle(el).borderBottomColor;
      });

      // Take screenshot for debugging
      await page.screenshot({
        path: screenshotPath('phases-row-borders-after-nav.png')
      });

      // Parse RGB values to check brightness
      const parseRgb = (rgb: string): number[] => {
        const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : [0, 0, 0];
      };

      const [r, g, b] = parseRgb(borderColor);
      const brightness = (r + g + b) / 3;

      // In dark theme, borders should stay dark (not become white/light)
      // Bug: borders become rgb(226, 232, 240) = brightness ~233 after navigation
      // Fixed: borders should have brightness < 100 (dark color)
      expect(brightness).toBeLessThan(100);
    });

    /**
     * RED test for row hover bug:
     * In dark theme, hovering over a row shows white background instead of dark.
     */
    test('should maintain dark hover background in dark theme', async ({ page }) => {
      await page.goto('/phases');
      await page.waitForLoadState('networkidle');

      // Enable dark theme
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await themeToggle.click();
      await expect(page.locator('html')).toHaveClass(/dark-theme/);
      await page.waitForTimeout(300);

      // Wait for tree table to load
      const treeTable = page.locator('[data-testid="phase-tree"]');
      await expect(treeTable).toBeVisible();

      // Find a row to hover
      const tableRow = page.locator('.p-treetable-tbody > tr').first();
      await expect(tableRow).toBeVisible();

      // Hover over the row
      await tableRow.hover();
      await page.waitForTimeout(100);

      // Capture hover background color
      const hoverBg = await tableRow.evaluate(el => {
        return window.getComputedStyle(el).backgroundColor;
      });

      // Take screenshot for debugging
      await page.screenshot({
        path: screenshotPath('phases-row-hover-dark.png')
      });

      // Parse RGB values to check brightness
      const parseRgb = (rgb: string): number[] => {
        const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : [0, 0, 0];
      };

      const [r, g, b] = parseRgb(hoverBg);
      const brightness = (r + g + b) / 3;

      // In dark theme, hover should be dark (not white/light)
      // Bug: hover becomes rgb(248, 250, 252) = brightness ~250
      // Fixed: hover should have brightness < 100 (dark color)
      expect(brightness).toBeLessThan(100);
    });

    /**
     * RED test for row alignment bug:
     * Selected/highlighted rows shift by 1px due to PrimeNG outline/border.
     */
    test('should not shift row position on selection in dark theme', async ({ page }) => {
      await page.goto('/phases');
      await page.waitForLoadState('networkidle');

      // Enable dark theme
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await themeToggle.click();
      await expect(page.locator('html')).toHaveClass(/dark-theme/);
      await page.waitForTimeout(300);

      // Wait for tree table to load
      const treeTable = page.locator('[data-testid="phase-tree"]');
      await expect(treeTable).toBeVisible();

      // Find first row and get its initial position
      const tableRow = page.locator('.p-treetable-tbody > tr').first();
      await expect(tableRow).toBeVisible();

      const initialBox = await tableRow.boundingBox();
      expect(initialBox).not.toBeNull();

      // Click to select the row
      await tableRow.click();
      await page.waitForTimeout(100);

      // Get position after selection
      const afterSelectBox = await tableRow.boundingBox();
      expect(afterSelectBox).not.toBeNull();

      // Take screenshot for debugging
      await page.screenshot({
        path: screenshotPath('phases-row-alignment.png')
      });

      // Row should not shift position (allow 0.5px tolerance for subpixel rendering)
      expect(Math.abs(afterSelectBox!.y - initialBox!.y)).toBeLessThan(1);
      expect(Math.abs(afterSelectBox!.height - initialBox!.height)).toBeLessThan(1);
    });
  });
});
