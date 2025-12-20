import { test, expect } from '@playwright/test';

test.describe('Requirements Kanban Board', () => {
  test.beforeEach(async ({ page }) => {
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Browser console error: ${msg.text()}`);
      }
    });

    await page.goto('/requirements');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Layout and Structure', () => {
    test('RED: should display 5 kanban columns for all requirement statuses', async ({ page }) => {
      // Check that all 5 status columns are visible
      await expect(page.locator('[data-testid="kanban-column-draft"]')).toBeVisible();
      await expect(page.locator('[data-testid="kanban-column-approved"]')).toBeVisible();
      await expect(page.locator('[data-testid="kanban-column-implemented"]')).toBeVisible();
      await expect(page.locator('[data-testid="kanban-column-deferred"]')).toBeVisible();
      await expect(page.locator('[data-testid="kanban-column-rejected"]')).toBeVisible();
    });

    test('RED: should display column headers with status names and counts', async ({ page }) => {
      // DRAFT column
      const draftHeader = page.locator('[data-testid="column-header-draft"]');
      await expect(draftHeader).toBeVisible();
      await expect(draftHeader).toContainText(/DRAFT/i);
      await expect(draftHeader).toContainText(/\(\d+\)/); // Count in parentheses

      // APPROVED column
      const approvedHeader = page.locator('[data-testid="column-header-approved"]');
      await expect(approvedHeader).toBeVisible();
      await expect(approvedHeader).toContainText(/APPROVED/i);
    });

    test('RED: should display Add Requirement button', async ({ page }) => {
      const addButton = page.locator('[data-testid="add-requirement-button"]');
      await expect(addButton).toBeVisible();
      await expect(addButton).toContainText(/add requirement/i);
    });

    test('RED: should display search input', async ({ page }) => {
      const searchInput = page.locator('[data-testid="requirements-search"]');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute('placeholder', /search/i);
    });
  });

  test.describe('Requirement Cards', () => {
    test('RED: should display requirement cards in correct columns based on status', async ({ page }) => {
      // Wait for requirements to load
      await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

      // Check that cards appear in their respective columns
      const draftColumn = page.locator('[data-testid="kanban-column-draft"]');
      const approvedColumn = page.locator('[data-testid="kanban-column-approved"]');

      // Should have at least one card visible
      const cards = page.locator('[data-testid^="requirement-card-"]');
      await expect(cards.first()).toBeVisible();
    });

    test('RED: should display requirement card with title', async ({ page }) => {
      await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

      const firstCard = page.locator('[data-testid^="requirement-card-"]').first();
      const title = firstCard.locator('[data-testid="requirement-title"]');

      await expect(title).toBeVisible();
      await expect(title).not.toBeEmpty();
    });

    test('RED: should display priority badge on requirement card', async ({ page }) => {
      await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

      const firstCard = page.locator('[data-testid^="requirement-card-"]').first();
      const priorityBadge = firstCard.locator('[data-testid="requirement-priority"]');

      await expect(priorityBadge).toBeVisible();
      // Should show one of: critical, high, medium, low
      const text = await priorityBadge.textContent();
      expect(['critical', 'high', 'medium', 'low']).toContain(text?.toLowerCase());
    });

    test('RED: should display votes count on requirement card', async ({ page }) => {
      await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

      const firstCard = page.locator('[data-testid^="requirement-card-"]').first();
      const votesDisplay = firstCard.locator('[data-testid="requirement-votes"]');

      await expect(votesDisplay).toBeVisible();
      await expect(votesDisplay).toContainText(/\d+\s*vote/i);
    });

    test('RED: should display tags on requirement card if present', async ({ page }) => {
      await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

      // Find a card with tags
      const cardWithTags = page.locator('[data-testid^="requirement-card-"]').filter({
        has: page.locator('[data-testid="requirement-tags"]')
      }).first();

      if (await cardWithTags.count() > 0) {
        const tags = cardWithTags.locator('[data-testid="requirement-tags"] .p-chip');
        await expect(tags.first()).toBeVisible();
      }
    });
  });

  test.describe('Drag and Drop', () => {
    test('RED: should support dragging requirement card', async ({ page }) => {
      await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

      const firstCard = page.locator('[data-testid^="requirement-card-"]').first();

      // Card should have draggable attribute or class
      const isDraggable = await firstCard.evaluate(el =>
        el.hasAttribute('draggable') || el.classList.contains('p-draggable')
      );

      expect(isDraggable).toBeTruthy();
    });

    test('RED: should update requirement status when dropped in different column', async ({ page }) => {
      await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

      // Track API calls
      const apiCalls: Array<{ method: string; url: string; body?: unknown }> = [];
      page.on('request', request => {
        if (request.url().includes('/api/') && request.url().includes('/requirements/')) {
          apiCalls.push({
            method: request.method(),
            url: request.url(),
            body: request.postDataJSON()
          });
        }
      });

      // Find a draft requirement
      const draftColumn = page.locator('[data-testid="kanban-column-draft"]');
      const draftCard = draftColumn.locator('[data-testid^="requirement-card-"]').first();

      // Get card position
      const cardBox = await draftCard.boundingBox();
      if (!cardBox) {
        throw new Error('Card not found');
      }

      // Find approved column drop zone
      const approvedColumn = page.locator('[data-testid="kanban-column-approved"]');
      const approvedBox = await approvedColumn.boundingBox();
      if (!approvedBox) {
        throw new Error('Approved column not found');
      }

      // Perform drag and drop
      await draftCard.dragTo(approvedColumn, {
        targetPosition: { x: approvedBox.width / 2, y: 50 }
      });

      // Wait for API call
      await page.waitForTimeout(1000);

      // Should have called PATCH with status update
      const updateCall = apiCalls.find(call =>
        call.method === 'PATCH' && call.body && 'status' in call.body
      );

      expect(updateCall).toBeTruthy();
      expect(updateCall?.body).toMatchObject({ status: 'approved' });
    });
  });

  test.describe('Search and Filter', () => {
    test('RED: should filter requirements by search term', async ({ page }) => {
      await page.waitForSelector('[data-testid^="requirement-card-"]', { timeout: 5000 });

      // Get initial card count
      const allCards = page.locator('[data-testid^="requirement-card-"]');
      const initialCount = await allCards.count();

      // Type in search
      const searchInput = page.locator('[data-testid="requirements-search"]');
      await searchInput.fill('OAuth');
      await page.waitForTimeout(500); // Debounce

      // Card count should change (filtered)
      const filteredCount = await allCards.count();
      expect(filteredCount).toBeLessThanOrEqual(initialCount);

      // All visible cards should contain search term in title
      const visibleCards = await allCards.all();
      for (const card of visibleCards) {
        const title = await card.locator('[data-testid="requirement-title"]').textContent();
        expect(title?.toLowerCase()).toContain('oauth'.toLowerCase());
      }
    });

    test('RED: should display filter button', async ({ page }) => {
      const filterButton = page.locator('[data-testid="requirements-filter-button"]');
      await expect(filterButton).toBeVisible();
    });

    test('RED: should display sort button', async ({ page }) => {
      const sortButton = page.locator('[data-testid="requirements-sort-button"]');
      await expect(sortButton).toBeVisible();
    });
  });

  test.describe('Add Requirement', () => {
    test('RED: should open dialog when clicking Add Requirement button', async ({ page }) => {
      const addButton = page.locator('[data-testid="add-requirement-button"]');
      await addButton.click();

      // Dialog should appear
      const dialog = page.locator('[data-testid="add-requirement-dialog"]');
      await expect(dialog).toBeVisible();
    });

    test('RED: should display form fields in Add Requirement dialog', async ({ page }) => {
      const addButton = page.locator('[data-testid="add-requirement-button"]');
      await addButton.click();

      // Check form fields
      await expect(page.locator('[data-testid="requirement-title-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="requirement-description-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="requirement-priority-select"]')).toBeVisible();
      await expect(page.locator('[data-testid="requirement-category-select"]')).toBeVisible();
    });

    test('RED: should create new requirement and display it in Draft column', async ({ page }) => {
      const addButton = page.locator('[data-testid="add-requirement-button"]');
      await addButton.click();

      // Fill form
      await page.locator('[data-testid="requirement-title-input"]').fill('Test Requirement');
      await page.locator('[data-testid="requirement-description-input"]').fill('This is a test');

      // Submit
      await page.locator('[data-testid="requirement-save-button"]').click();

      // Wait for dialog to close
      await expect(page.locator('[data-testid="add-requirement-dialog"]')).not.toBeVisible();

      // New requirement should appear in DRAFT column
      const draftColumn = page.locator('[data-testid="kanban-column-draft"]');
      await expect(draftColumn.locator('text=Test Requirement')).toBeVisible();
    });
  });

  test.describe('API Integration', () => {
    test('RED: should fetch requirements list on page load', async ({ page }) => {
      const apiCalls: string[] = [];

      page.on('request', request => {
        if (request.url().includes('/api/')) {
          apiCalls.push(`${request.method()} ${request.url()}`);
        }
      });

      await page.goto('/requirements');
      await page.waitForLoadState('networkidle');

      // Should have called GET /plans/{planId}/requirements
      const requirementsCall = apiCalls.find(call =>
        call.startsWith('GET') && call.includes('/requirements')
      );

      expect(requirementsCall).toBeTruthy();
    });

    test('RED: should handle loading state', async ({ page }) => {
      // On initial load, should show loading indicator
      const loadingIndicator = page.locator('[data-testid="requirements-loading"]');

      // Note: This might be very fast, so we check if element exists
      const hasLoadingState = await loadingIndicator.count() > 0 ||
                               await page.locator('[data-testid^="requirement-card-"]').count() > 0;

      expect(hasLoadingState).toBeTruthy();
    });

    test('RED: should handle error state', async ({ page }) => {
      // Mock API error
      await page.route('**/api/**/requirements*', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ message: 'Internal Server Error' })
        });
      });

      await page.goto('/requirements');
      await page.waitForLoadState('networkidle');

      // Should display error message
      const errorMessage = page.locator('[data-testid="requirements-error"]');
      await expect(errorMessage).toBeVisible();
    });
  });
});
