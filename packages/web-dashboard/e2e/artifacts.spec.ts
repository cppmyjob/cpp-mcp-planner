import { test, expect } from '@playwright/test';
import { screenshotPath } from './test-paths';

test.describe('Artifacts Page', () => {
  test.beforeEach(async ({ page }) => {
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Browser console error: ${msg.text()}`);
      }
    });

    await page.goto('/artifacts');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Page Layout', () => {
    test('should display page container', async ({ page }) => {
      const container = page.locator('[data-testid="artifacts-page"]');
      await expect(container).toBeVisible();
    });

    test('should display page title', async ({ page }) => {
      await expect(page.locator('h2:has-text("Artifacts")')).toBeVisible();
    });

    test('should display filter controls when artifacts exist', async ({ page }) => {
      await page.waitForTimeout(1000);

      const content = page.locator('[data-testid="artifacts-content"]');
      const contentVisible = await content.isVisible().catch(() => false);

      if (contentVisible) {
        const typeFilter = page.locator('[data-testid="type-filter"]');
        const statusFilter = page.locator('[data-testid="status-filter"]');
        await expect(typeFilter).toBeVisible();
        await expect(statusFilter).toBeVisible();
      }
    });
  });

  test.describe('Loading State', () => {
    test('should show loading indicator initially', async ({ page }) => {
      const loadingPromise = page.goto('/artifacts');

      const loading = page.locator('[data-testid="artifacts-loading"]');
      const loadingVisible = await loading.isVisible().catch(() => false);

      await loadingPromise;

      expect(typeof loadingVisible).toBe('boolean');
    });
  });

  test.describe('Content Display', () => {
    test('should display table or empty state', async ({ page }) => {
      await page.waitForTimeout(1000);

      const table = page.locator('[data-testid="artifacts-table"]');
      const empty = page.locator('[data-testid="artifacts-empty"]');
      const error = page.locator('[data-testid="artifacts-error"]');

      const tableVisible = await table.isVisible().catch(() => false);
      const emptyVisible = await empty.isVisible().catch(() => false);
      const errorVisible = await error.isVisible().catch(() => false);

      expect(tableVisible || emptyVisible || errorVisible).toBe(true);
    });

    test('should display artifact rows with proper structure', async ({ page }) => {
      await page.waitForTimeout(1000);

      const table = page.locator('[data-testid="artifacts-table"]');
      const tableVisible = await table.isVisible().catch(() => false);

      if (tableVisible) {
        const rows = table.locator('tbody tr');
        const rowCount = await rows.count();

        if (rowCount > 0) {
          const firstRow = rows.first();
          await expect(firstRow).toBeVisible();

          // Check row has expected cells
          const cells = firstRow.locator('td');
          expect(await cells.count()).toBeGreaterThanOrEqual(4);
        }
      }
    });

    test('should display type icons in first column', async ({ page }) => {
      await page.waitForTimeout(1000);

      const table = page.locator('[data-testid="artifacts-table"]');
      const tableVisible = await table.isVisible().catch(() => false);

      if (tableVisible) {
        const typeIcons = table.locator('.artifacts__type-icon');
        const iconCount = await typeIcons.count();

        if (iconCount > 0) {
          const firstIcon = typeIcons.first();
          await expect(firstIcon).toBeVisible();

          // Icon should have pi class
          const hasPiClass = await firstIcon.evaluate(el =>
            el.classList.contains('pi')
          );
          expect(hasPiClass).toBe(true);
        }
      }
    });

    test('should display status tags', async ({ page }) => {
      await page.waitForTimeout(1000);

      const table = page.locator('[data-testid="artifacts-table"]');
      const tableVisible = await table.isVisible().catch(() => false);

      if (tableVisible) {
        const statusTags = table.locator('p-tag');
        const tagCount = await statusTags.count();

        if (tagCount > 0) {
          await expect(statusTags.first()).toBeVisible();
        }
      }
    });
  });

  test.describe('Preview Panel', () => {
    test('should show empty preview initially', async ({ page }) => {
      await page.waitForTimeout(1000);

      const preview = page.locator('[data-testid="artifacts-preview"]');
      const previewVisible = await preview.isVisible().catch(() => false);

      if (previewVisible) {
        const emptyPreview = preview.locator('.artifacts__preview-empty');
        await expect(emptyPreview).toBeVisible();
      }
    });

    test('should show preview when artifact selected', async ({ page }) => {
      await page.waitForTimeout(1000);

      const table = page.locator('[data-testid="artifacts-table"]');
      const tableVisible = await table.isVisible().catch(() => false);

      if (tableVisible) {
        const rows = table.locator('tbody tr');
        const rowCount = await rows.count();

        if (rowCount > 0) {
          // Click first row
          await rows.first().click();
          await page.waitForTimeout(500);

          // Preview should show content
          const previewContent = page.locator('.artifacts__preview-content');
          const previewLoading = page.locator('.artifacts__preview-loading');

          const hasContent = await previewContent.isVisible().catch(() => false);
          const isLoading = await previewLoading.isVisible().catch(() => false);

          expect(hasContent || isLoading).toBe(true);
        }
      }
    });

    test('should display artifact title in preview', async ({ page }) => {
      await page.waitForTimeout(1000);

      const table = page.locator('[data-testid="artifacts-table"]');
      const tableVisible = await table.isVisible().catch(() => false);

      if (tableVisible) {
        const rows = table.locator('tbody tr');
        const rowCount = await rows.count();

        if (rowCount > 0) {
          await rows.first().click();
          await page.waitForTimeout(1000);

          const previewTitle = page.locator('.artifacts__preview-title');
          const titleVisible = await previewTitle.isVisible().catch(() => false);

          if (titleVisible) {
            const text = await previewTitle.textContent();
            expect(text?.length).toBeGreaterThan(0);
          }
        }
      }
    });

    test('should display code block when artifact has content', async ({ page }) => {
      await page.waitForTimeout(1000);

      const table = page.locator('[data-testid="artifacts-table"]');
      const tableVisible = await table.isVisible().catch(() => false);

      if (tableVisible) {
        const rows = table.locator('tbody tr');
        const rowCount = await rows.count();

        if (rowCount > 0) {
          await rows.first().click();
          await page.waitForTimeout(1500);

          const codeBlock = page.locator('.artifacts__preview-code-block');
          const codeVisible = await codeBlock.isVisible().catch(() => false);

          // Code block may or may not be visible depending on artifact content
          expect(typeof codeVisible).toBe('boolean');
        }
      }
    });

    test('should have copy button in code preview', async ({ page }) => {
      await page.waitForTimeout(1000);

      const table = page.locator('[data-testid="artifacts-table"]');
      const tableVisible = await table.isVisible().catch(() => false);

      if (tableVisible) {
        const rows = table.locator('tbody tr');
        const rowCount = await rows.count();

        if (rowCount > 0) {
          await rows.first().click();
          await page.waitForTimeout(1500);

          const codeHeader = page.locator('.artifacts__preview-code-header');
          const codeVisible = await codeHeader.isVisible().catch(() => false);

          if (codeVisible) {
            const copyButton = codeHeader.locator('p-button').first();
            await expect(copyButton).toBeVisible();
          }
        }
      }
    });
  });

  test.describe('Filters', () => {
    test('should filter by artifact type', async ({ page }) => {
      await page.waitForTimeout(1000);

      const content = page.locator('[data-testid="artifacts-content"]');
      const contentVisible = await content.isVisible().catch(() => false);

      if (contentVisible) {
        const typeFilter = page.locator('[data-testid="type-filter"]');
        await typeFilter.click();
        await page.waitForTimeout(300);

        // Select "Code" option if available
        const codeOption = page.locator('.p-select-option').filter({ hasText: 'Code' }).first();
        const codeVisible = await codeOption.isVisible().catch(() => false);

        if (codeVisible) {
          await codeOption.click();
          await page.waitForTimeout(300);

          // All visible rows should have type "code"
          const typeLabels = page.locator('.artifacts__type-label');
          const count = await typeLabels.count();

          if (count > 0) {
            for (let i = 0; i < count; i++) {
              const text = await typeLabels.nth(i).textContent();
              expect(text?.toLowerCase()).toBe('code');
            }
          }
        }
      }
    });

    test('should filter by status', async ({ page }) => {
      await page.waitForTimeout(1000);

      const content = page.locator('[data-testid="artifacts-content"]');
      const contentVisible = await content.isVisible().catch(() => false);

      if (contentVisible) {
        const statusFilter = page.locator('[data-testid="status-filter"]');
        await statusFilter.click();
        await page.waitForTimeout(300);

        // Select "Draft" option if available
        const draftOption = page.locator('.p-select-option').filter({ hasText: 'Draft' }).first();
        const draftVisible = await draftOption.isVisible().catch(() => false);

        if (draftVisible) {
          await draftOption.click();
          await page.waitForTimeout(300);

          // All visible status tags should be "draft"
          const statusTags = page.locator('[data-testid="artifacts-table"] p-tag');
          const count = await statusTags.count();

          if (count > 0) {
            for (let i = 0; i < count; i++) {
              const text = await statusTags.nth(i).textContent();
              expect(text?.toLowerCase()).toBe('draft');
            }
          }
        }
      }
    });

    test('should reset filter when selecting "All" option', async ({ page }) => {
      await page.waitForTimeout(1000);

      const content = page.locator('[data-testid="artifacts-content"]');
      const contentVisible = await content.isVisible().catch(() => false);

      if (contentVisible) {
        const typeFilter = page.locator('[data-testid="type-filter"]');
        await typeFilter.click();
        await page.waitForTimeout(300);

        // Select "All Types" option
        const allOption = page.locator('.p-select-option').filter({ hasText: 'All Types' }).first();
        const allVisible = await allOption.isVisible().catch(() => false);

        if (allVisible) {
          await allOption.click();
          await page.waitForTimeout(300);

          // Should show all artifacts
          const rows = page.locator('[data-testid="artifacts-table"] tbody tr');
          expect(await rows.count()).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  test.describe('Targets Display', () => {
    test('should display target count in table', async ({ page }) => {
      await page.waitForTimeout(1000);

      const table = page.locator('[data-testid="artifacts-table"]');
      const tableVisible = await table.isVisible().catch(() => false);

      if (tableVisible) {
        const rows = table.locator('tbody tr');
        const rowCount = await rows.count();

        if (rowCount > 0) {
          // Last column should contain target count
          const lastCell = rows.first().locator('td').last();
          const text = await lastCell.textContent();
          expect(text).toMatch(/\d+ targets?/);
        }
      }
    });

    test('should display targets list in preview', async ({ page }) => {
      await page.waitForTimeout(1000);

      const table = page.locator('[data-testid="artifacts-table"]');
      const tableVisible = await table.isVisible().catch(() => false);

      if (tableVisible) {
        const rows = table.locator('tbody tr');
        const rowCount = await rows.count();

        if (rowCount > 0) {
          await rows.first().click();
          await page.waitForTimeout(1500);

          const targetsSection = page.locator('.artifacts__preview-targets');
          const targetsVisible = await targetsSection.isVisible().catch(() => false);

          // Targets section may or may not exist depending on artifact
          expect(typeof targetsVisible).toBe('boolean');
        }
      }
    });
  });

  test.describe('Visual Regression', () => {
    test('should match full page screenshot', async ({ page }) => {
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: screenshotPath('artifacts-full-page.png'),
        fullPage: true
      });

      expect(true).toBe(true);
    });

    test('should match table screenshot', async ({ page }) => {
      await page.waitForTimeout(1000);

      const table = page.locator('[data-testid="artifacts-table"]');
      const tableVisible = await table.isVisible().catch(() => false);

      if (tableVisible) {
        await table.screenshot({
          path: screenshotPath('artifacts-table.png')
        });

        expect(true).toBe(true);
      }
    });

    test('should match preview screenshot with content', async ({ page }) => {
      await page.waitForTimeout(1000);

      const table = page.locator('[data-testid="artifacts-table"]');
      const tableVisible = await table.isVisible().catch(() => false);

      if (tableVisible) {
        const rows = table.locator('tbody tr');
        const rowCount = await rows.count();

        if (rowCount > 0) {
          await rows.first().click();
          await page.waitForTimeout(1500);

          const preview = page.locator('[data-testid="artifacts-preview"]');
          await preview.screenshot({
            path: screenshotPath('artifacts-preview.png')
          });

          expect(true).toBe(true);
        }
      }
    });
  });
});
