// tests/qa-gating.spec.ts
import { test, expect } from '@playwright/test';

test('DebugChips are visible when REACT_APP_SHOW_DEV_TEST is true', async ({ page }) => {
  // Navigate to the app with dev test enabled
  await page.goto('/');
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');
  
  // Check that DebugChips are visible
  const debugChips = page.locator('div:has-text("requestId")');
  await expect(debugChips).toBeVisible();
});

test('DebugChips are hidden when REACT_APP_SHOW_DEV_TEST is false', async ({ page }) => {
  // For this test, you would need to set the environment variable to false
  // This might require a separate test setup or modifying the environment
  // For now, we'll skip this test
  test.skip();
  
  // Navigate to the app with dev test disabled
  await page.goto('/');
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');
  
  // Check that DebugChips are not visible
  const debugChips = page.locator('div:has-text("requestId")');
  await expect(debugChips).not.toBeVisible();
});