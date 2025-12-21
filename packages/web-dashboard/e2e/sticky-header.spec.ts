import { test, expect } from '@playwright/test';

test.describe('Kanban Sticky Header', () => {
  test('column headers should remain visible when scrolling cards', async ({ page }) => {
    await page.goto('/requirements');
    await page.waitForLoadState('networkidle');

    // Wait for kanban board to load
    await page.waitForSelector('[data-testid="requirements-kanban"]', { timeout: 10000 });

    // Take screenshot of initial state
    await page.screenshot({ path: 'screenshots/sticky-header-before-scroll.png', fullPage: true });

    // Get the draft column elements
    const draftColumn = page.locator('[data-testid="kanban-column-draft"]');
    const header = draftColumn.locator('[data-testid="column-header-draft"]');
    const cardsContainer = draftColumn.locator('.kanban-column__cards');

    // Verify header exists
    await expect(header).toBeVisible();

    // Get header position before scroll
    const headerBoundsBefore = await header.boundingBox();
    console.log('Header position before scroll:', headerBoundsBefore);

    // Scroll the CARDS CONTAINER down (not the column)
    await cardsContainer.evaluate((el) => {
      el.scrollTop = 200;
    });

    // Wait a bit for scroll to complete
    await page.waitForTimeout(300);

    // Take screenshot after scroll
    await page.screenshot({ path: 'screenshots/sticky-header-after-scroll.png', fullPage: true });

    // Get header position after scroll
    const headerBoundsAfter = await header.boundingBox();
    console.log('Header position after scroll:', headerBoundsAfter);

    // The header Y position should be the same (not moving)
    if (headerBoundsBefore && headerBoundsAfter) {
      const yDiff = Math.abs(headerBoundsAfter.y - headerBoundsBefore.y);
      console.log('Y position difference:', yDiff);

      // Header should stay in place - small tolerance for rendering
      expect(yDiff).toBeLessThan(5);
    }

    // Verify header is still visible
    await expect(header).toBeVisible();

    // Verify the cards container has scrolled (scrollTop > 0)
    const scrollTop = await cardsContainer.evaluate((el) => el.scrollTop);
    console.log('Cards container scrollTop after scroll:', scrollTop);
    expect(scrollTop).toBeGreaterThan(0);
  });

  test('analyze scroll containers', async ({ page }) => {
    await page.goto('/requirements');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="requirements-kanban"]', { timeout: 10000 });

    // Analyze kanban and column heights
    const analysis = await page.evaluate(() => {
      const requirements = document.querySelector('.requirements') as HTMLElement;
      const kanban = document.querySelector('.requirements__kanban') as HTMLElement;
      const column = document.querySelector('.kanban-column') as HTMLElement;
      const cards = document.querySelector('.kanban-column__cards') as HTMLElement;

      const getInfo = (el: HTMLElement | null, name: string) => {
        if (!el) return { name, exists: false };
        const styles = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          name,
          height: styles.height,
          maxHeight: styles.maxHeight,
          overflow: styles.overflow,
          overflowY: styles.overflowY,
          computedHeight: rect.height,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        };
      };

      return {
        requirements: getInfo(requirements, '.requirements'),
        kanban: getInfo(kanban, '.requirements__kanban'),
        column: getInfo(column, '.kanban-column'),
        cards: getInfo(cards, '.kanban-column__cards'),
      };
    });

    console.log('=== SCROLL CONTAINER ANALYSIS ===');
    console.log(JSON.stringify(analysis, null, 2));

    // Verify cards container has overflow
    const cardsContainer = await page.locator('.kanban-column__cards').first();
    const overflow = await cardsContainer.evaluate(el => window.getComputedStyle(el).overflowY);
    expect(overflow).toBe('auto');
  });

  test('check bottom spacing and last card visibility', async ({ page }) => {
    await page.goto('/requirements');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="requirements-kanban"]', { timeout: 10000 });

    // Get the draft column and cards container
    const draftColumn = page.locator('[data-testid="kanban-column-draft"]');
    const cardsContainer = draftColumn.locator('.kanban-column__cards');

    // Scroll cards container to the very bottom
    await cardsContainer.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    // Wait for scroll to complete
    await page.waitForTimeout(300);

    // Take screenshot of bottom state
    await page.screenshot({ path: 'screenshots/sticky-header-bottom-scroll.png', fullPage: true });

    // Analyze bottom spacing
    const bottomAnalysis = await cardsContainer.evaluate((el) => {
      const cards = el.querySelectorAll('.requirement-card');
      const lastCard = cards[cards.length - 1] as HTMLElement;

      if (!lastCard) return null;

      const containerRect = el.getBoundingClientRect();
      const lastCardRect = lastCard.getBoundingClientRect();

      return {
        containerBottom: containerRect.bottom,
        lastCardBottom: lastCardRect.bottom,
        spaceAfterLastCard: containerRect.bottom - lastCardRect.bottom,
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        isScrolledToBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
      };
    });

    console.log('=== BOTTOM SCROLL ANALYSIS ===');
    console.log(JSON.stringify(bottomAnalysis, null, 2));
  });
});
