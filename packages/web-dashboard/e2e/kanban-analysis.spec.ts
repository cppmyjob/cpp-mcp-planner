import { test, expect } from '@playwright/test';
import { screenshotPath } from './test-paths';

test.describe('Kanban Board Visual Analysis', () => {
  test('capture kanban board screenshot for analysis', async ({ page }) => {
    await page.goto('/requirements');
    await page.waitForLoadState('networkidle');

    // Wait for requirements to load
    await page.waitForSelector('[data-testid^="requirement-card-"], [data-testid="requirements-loading"], [data-testid="kanban-column-draft"]', { timeout: 10000 });

    // Take full page screenshot
    await page.screenshot({
      path: screenshotPath('kanban-current-state.png'),
      fullPage: true
    });

    // Take individual column screenshots
    const columns = ['draft', 'approved', 'implemented', 'deferred', 'rejected'];
    for (const status of columns) {
      const column = page.locator(`[data-testid="kanban-column-${status}"]`);
      if (await column.isVisible()) {
        await column.screenshot({
          path: screenshotPath(`kanban-column-${status}.png`)
        });
      }
    }

    // Take first card screenshot if exists
    const firstCard = page.locator('[data-testid^="requirement-card-"]').first();
    if (await firstCard.count() > 0) {
      await firstCard.screenshot({
        path: screenshotPath('kanban-card-detail.png')
      });
    }

    // Output current implementation details
    console.log('=== KANBAN BOARD ANALYSIS ===');

    // Check what's visible on cards
    const cards = await page.locator('[data-testid^="requirement-card-"]').all();
    console.log(`Total cards found: ${cards.length}`);

    for (let i = 0; i < Math.min(cards.length, 3); i++) {
      const card = cards[i];
      console.log(`\n--- Card ${i + 1} ---`);

      // Check for REQ-ID
      const hasReqId = await card.locator('text=/REQ-\\d+/').count() > 0;
      console.log(`Has REQ-ID visible: ${hasReqId}`);

      // Check priority position
      const priorityInHeader = await card.locator('.requirement-card__header [data-testid="requirement-priority"]').count() > 0;
      const priorityInFooter = await card.locator('.requirement-card__footer [data-testid="requirement-priority"]').count() > 0;
      console.log(`Priority in header: ${priorityInHeader}`);
      console.log(`Priority in footer: ${priorityInFooter}`);

      // Check for "Covered by SOL-XXX"
      const hasCoveredBy = await card.locator('text=/Covered by SOL-/').count() > 0;
      console.log(`Has "Covered by SOL" info: ${hasCoveredBy}`);

      // Check for votes
      const votes = await card.locator('[data-testid="requirement-votes"]').textContent();
      console.log(`Votes display: ${votes}`);

      // Check for tags
      const tagsCount = await card.locator('.p-chip').count();
      console.log(`Tags count: ${tagsCount}`);
    }

    expect(true).toBe(true); // Test always passes - it's for analysis
  });
});
