import { test } from '@playwright/test';

test('debug header z-index issue', async ({ page }) => {
  await page.goto('/requirements');
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-testid="requirements-kanban"]', { timeout: 10000 });

  const draftColumn = page.locator('[data-testid="kanban-column-draft"]');

  // Scroll middle
  await draftColumn.evaluate((el) => {
    el.scrollTop = 200;
  });
  await page.waitForTimeout(500);

  // Analyze the stacking context
  const analysis = await page.evaluate(() => {
    const header = document.querySelector('.kanban-column__header') as HTMLElement;
    const firstCard = document.querySelector('.requirement-card') as HTMLElement;
    const column = document.querySelector('.kanban-column') as HTMLElement;

    const getStyles = (el: HTMLElement, name: string) => {
      const styles = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        name,
        position: styles.position,
        zIndex: styles.zIndex,
        background: styles.background,
        top: styles.top,
        rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
        parent: el.parentElement?.className,
      };
    };

    return {
      header: getStyles(header, 'header'),
      firstCard: getStyles(firstCard, 'firstCard'),
      column: getStyles(column, 'column'),
    };
  });

  console.log('=== Z-INDEX DEBUG ===');
  console.log(JSON.stringify(analysis, null, 2));

  // Take annotated screenshot
  await page.screenshot({
    path: 'screenshots/debug-header-zindex.png',
    fullPage: true
  });
});
