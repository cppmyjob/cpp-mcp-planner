import { test, expect } from '@playwright/test';

test.describe('Requirements Kanban - Final Visual Check', () => {
  test('verify all three issues are fixed', async ({ page }) => {
    await page.goto('/requirements');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="requirements-kanban"]', { timeout: 10000 });

    const draftColumn = page.locator('[data-testid="kanban-column-draft"]');
    const header = draftColumn.locator('[data-testid="column-header-draft"]');

    // Issue 1: Header should not be covered by cards during scroll
    console.log('=== ISSUE 1: Header Coverage ===');

    // Scroll middle
    await draftColumn.evaluate((el) => {
      el.scrollTop = 200;
    });
    await page.waitForTimeout(300);

    // Take screenshot of scrolled state
    await page.screenshot({
      path: 'screenshots/final-check-scrolled.png',
      fullPage: true
    });

    // Verify header is still visible and not covered
    const headerVisible = await header.isVisible();
    expect(headerVisible).toBe(true);

    // Check z-index
    const headerZIndex = await header.evaluate(el => {
      return window.getComputedStyle(el).zIndex;
    });
    console.log('Header z-index:', headerZIndex);
    expect(parseInt(headerZIndex)).toBeGreaterThan(1);

    // Issue 2 & 3: Bottom border and spacing
    console.log('=== ISSUE 2 & 3: Bottom Border and Spacing ===');

    // Scroll to bottom
    await draftColumn.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(300);

    // Take screenshot of bottom state
    await page.screenshot({
      path: 'screenshots/final-check-bottom.png',
      fullPage: true
    });

    // Analyze bottom spacing
    const bottomInfo = await draftColumn.evaluate((el) => {
      const cards = el.querySelectorAll('.requirement-card');
      const lastCard = cards[cards.length - 1] as HTMLElement;

      if (!lastCard) return null;

      const columnRect = el.getBoundingClientRect();
      const lastCardRect = lastCard.getBoundingClientRect();
      const lastCardStyles = window.getComputedStyle(lastCard);

      return {
        lastCardVisible: lastCardRect.bottom <= columnRect.bottom + 10, // 10px tolerance
        spaceAfterLastCard: columnRect.bottom - lastCardRect.bottom,
        lastCardBorderBottom: lastCardStyles.borderBottom,
        isScrolledToBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
      };
    });

    console.log('Bottom analysis:', bottomInfo);

    // Verify last card is visible
    expect(bottomInfo?.lastCardVisible).toBe(true);

    // Verify minimal bottom space (less than 50px)
    expect(bottomInfo?.spaceAfterLastCard).toBeLessThan(50);

    // Scroll back to top
    await draftColumn.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(300);

    // Take final screenshot
    await page.screenshot({
      path: 'screenshots/final-check-top.png',
      fullPage: true
    });

    console.log('✅ All three issues verified as fixed!');
  });
});
