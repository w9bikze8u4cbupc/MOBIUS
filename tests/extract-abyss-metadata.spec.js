import { test, expect } from '@playwright/test';

test('Extract Abyss metadata', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page
    .getByPlaceholder('Paste BGG URL')
    .fill('https://boardgamegeek.com/boardgame/155987/abyss');
  await page.getByRole('button', { name: 'Extract Metadata' }).click();
  await expect(page.getByText('Abyss')).toBeVisible({ timeout: 15000 });
});
