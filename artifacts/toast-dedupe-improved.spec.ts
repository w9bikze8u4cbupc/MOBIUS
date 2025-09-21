// tests/toast-dedupe.spec.ts
import { test, expect } from '@playwright/test';

test('toast messages are deduplicated for repeated errors', async ({ page }) => {
  // Navigate to the app
  await page.goto('/');
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');
  
  // Find and click the "Run Extract Metadata" button twice quickly
  const extractButton = page.getByTestId('run-extract-metadata');
  await extractButton.click();
  await extractButton.click();
  
  // Wait a bit for potential duplicate toasts
  await page.waitForTimeout(1000);
  
  // Count the number of toast elements
  const toasts = await page.locator('[data-qa="toast"]').count();
  
  // Expect only one toast visible due to deduplication
  expect(toasts).toBe(1);
  
  // Capture screenshot for artifact upload
  await page.screenshot({ path: 'test-results/toast-dedupe-result.png' });
});

test('toast messages appear for successful operations', async ({ page }) => {
  // Navigate to the app
  await page.goto('/');
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');
  
  // Find and click the "Run Web Search" button
  const searchButton = page.getByTestId('run-web-search');
  await searchButton.click();
  
  // Wait for toast to appear
  await page.waitForSelector('[data-qa="toast"]', { timeout: 10000 });
  
  // Check that a success toast is visible
  const successToast = page.locator('[data-qa="toast"].success');
  await expect(successToast).toBeVisible();
  
  // Capture screenshot for artifact upload
  await page.screenshot({ path: 'test-results/toast-success-result.png' });
});

test('concurrent requests are deduplicated', async ({ page }) => {
  // Navigate to the app
  await page.goto('/');
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');
  
  // Find the "Run Extract Metadata" button
  const extractButton = page.getByTestId('run-extract-metadata');
  
  // Click the button multiple times rapidly
  await Promise.all([
    extractButton.click(),
    extractButton.click(),
    extractButton.click()
  ]);
  
  // Wait a bit for potential duplicate toasts
  await page.waitForTimeout(1500);
  
  // Count the number of toast elements
  const toasts = await page.locator('[data-qa="toast"]').count();
  
  // Expect only one toast visible due to deduplication
  expect(toasts).toBe(1);
  
  // Capture screenshot for artifact upload
  await page.screenshot({ path: 'test-results/toast-concurrent-dedupe-result.png' });
});