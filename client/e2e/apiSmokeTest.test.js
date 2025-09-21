// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('API Smoke Test', () => {
  test.beforeEach(async ({ page }) => {
    // Set up environment to show the DevTestPage with QA labels enabled
    await page.addInitScript(() => {
      window.process = { 
        env: { 
          REACT_APP_SHOW_DEV_TEST: 'true',
          REACT_APP_QA_LABELS: 'true'
        } 
      };
    });
    
    // Navigate to the app
    await page.goto('http://localhost:3001');
  });

  test('should handle successful API call with toast and debug info', async ({ page }) => {
    // Click the "Call Health" button
    const healthButton = page.getByRole('button', { name: 'Call Health' });
    await healthButton.click();
    
    // Wait for the request to complete
    await page.waitForTimeout(1000);
    
    // Check for success toast
    const successToast = page.locator('[data-testid="toast-success"]');
    await expect(successToast).toBeVisible();
    const toastText = await successToast.textContent();
    expect(toastText).toContain('Health OK');
    
    // Check for DebugChips
    const debugChips = page.locator('[data-testid="debug-chips"]');
    await expect(debugChips).toBeVisible();
    
    // Check that DebugChips contain request information
    const chipText = await debugChips.textContent();
    expect(chipText).toContain('requestId');
    expect(chipText).toContain('latency');
    expect(chipText).toContain('source');
  });

  test('should handle 413 error with proper toast deduplication', async ({ page }) => {
    // Click the "Call Oversize (413)" button
    const oversizeButton = page.getByRole('button', { name: 'Call Oversize (413)' });
    await oversizeButton.click();
    
    // Wait for the request to complete
    await page.waitForTimeout(1000);
    
    // Check for error toast
    const errorToast = page.locator('[data-testid="toast-error"]');
    await expect(errorToast).toBeVisible();
    const toastText = await errorToast.textContent();
    expect(toastText).toContain('too large');
    
    // Click the button again to test deduplication
    await oversizeButton.click();
    await page.waitForTimeout(1000);
    
    // Check that only one error toast is visible
    const errorToasts = await page.locator('[data-testid="toast-error"]').all();
    expect(errorToasts.length).toBe(1);
  });

  test('should handle network error with proper toast deduplication', async ({ page }) => {
    // Click the "Call Network Fail" button
    const networkFailButton = page.getByRole('button', { name: 'Call Network Fail' });
    await networkFailButton.click();
    
    // Wait for the request to complete
    await page.waitForTimeout(2000);
    
    // Check for error toast
    const errorToast = page.locator('[data-testid="toast-error"]');
    await expect(errorToast).toBeVisible();
    const toastText = await errorToast.textContent();
    expect(toastText).toContain('Network error');
    
    // Click the button again to test deduplication
    await networkFailButton.click();
    await page.waitForTimeout(2000);
    
    // Check that only one error toast is visible
    const errorToasts = await page.locator('[data-testid="toast-error"]').all();
    expect(errorToasts.length).toBe(1);
  });

  test('should handle rapid repeated clicks with deduplication', async ({ page }) => {
    // Click the "Call Network Fail" button multiple times rapidly
    const networkFailButton = page.getByRole('button', { name: 'Call Network Fail' });
    
    // Click the button 5 times rapidly
    for (let i = 0; i < 5; i++) {
      await networkFailButton.click();
    }
    
    // Wait for all requests to complete
    await page.waitForTimeout(3000);
    
    // Check that only one error toast is visible
    const errorToasts = await page.locator('[data-testid="toast-error"]').all();
    expect(errorToasts.length).toBe(1);
  });
});