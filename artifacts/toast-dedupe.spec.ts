// tests/toast-dedupe.spec.ts
import { test, expect } from '@playwright/test';

test('toast messages are deduplicated for repeated errors', async ({ page }) => {
  // Navigate to the app
  await page.goto('/');
  
  // Enable dev test page if needed
  // This assumes you have a way to enable the DevTestPage
  // You might need to adjust this based on your actual implementation
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');
  
  // Find and click the "Run Extract Metadata" button twice quickly
  const extractButton = page.locator('button:has-text("Run Extract Metadata")');
  await extractButton.click();
  await extractButton.click();
  
  // Wait a bit for potential duplicate toasts
  await page.waitForTimeout(1000);
  
  // Count the number of toast elements
  const toasts = await page.locator('.Toastify__toast').count();
  
  // Expect only one toast visible due to deduplication
  expect(toasts).toBe(1);
});

test('toast messages appear for successful operations', async ({ page }) => {
  // Navigate to the app
  await page.goto('/');
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');
  
  // Find and click the "Run Web Search" button
  const searchButton = page.locator('button:has-text("Run Web Search")');
  await searchButton.click();
  
  // Wait for toast to appear
  await page.waitForSelector('.Toastify__toast', { timeout: 10000 });
  
  // Check that a success toast is visible
  const successToast = page.locator('.Toastify__toast--success');
  await expect(successToast).toBeVisible();
});