// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Toast Deduplication', () => {
  test.beforeEach(async ({ page }) => {
    // Set up environment to show the DevTestPage
    await page.addInitScript(() => {
      window.process = { env: { REACT_APP_SHOW_DEV_TEST: 'true' } };
    });
    
    // Navigate to the app
    await page.goto('http://localhost:3001');
  });

  test('should show only one error toast for repeated network failures', async ({ page }) => {
    // Click the "Call Network Fail" button multiple times rapidly
    const networkFailButton = page.getByRole('button', { name: 'Call Network Fail' });
    
    // Click the button 3 times rapidly
    await networkFailButton.click();
    await networkFailButton.click();
    await networkFailButton.click();
    
    // Wait a bit for all requests to complete
    await page.waitForTimeout(2000);
    
    // Check that only one error toast is visible
    const errorToasts = await page.locator('[data-testid="toast-error"]').all();
    expect(errorToasts.length).toBe(1);
    
    // Verify the toast content
    const toastContent = await errorToasts[0].textContent();
    expect(toastContent).toContain('Network error');
  });

  test('should show only one error toast for repeated 413 errors', async ({ page }) => {
    // Click the "Call Oversize (413)" button multiple times rapidly
    const oversizeButton = page.getByRole('button', { name: 'Call Oversize (413)' });
    
    // Click the button 3 times rapidly
    await oversizeButton.click();
    await oversizeButton.click();
    await oversizeButton.click();
    
    // Wait a bit for all requests to complete
    await page.waitForTimeout(2000);
    
    // Check that only one error toast is visible
    const errorToasts = await page.locator('[data-testid="toast-error"]').all();
    expect(errorToasts.length).toBe(1);
    
    // Verify the toast content mentions file size
    const toastContent = await errorToasts[0].textContent();
    expect(toastContent).toContain('too large');
  });

  test('should show separate toasts for success and error', async ({ page }) => {
    // Click the "Call Health" button to trigger a success toast
    const healthButton = page.getByRole('button', { name: 'Call Health' });
    await healthButton.click();
    
    // Wait for the success toast
    await page.waitForTimeout(1000);
    
    // Click the "Call Network Fail" button to trigger an error toast
    const networkFailButton = page.getByRole('button', { name: 'Call Network Fail' });
    await networkFailButton.click();
    
    // Wait for the error toast
    await page.waitForTimeout(1000);
    
    // Check that both toasts are visible
    const successToasts = await page.locator('[data-testid="toast-success"]').all();
    const errorToasts = await page.locator('[data-testid="toast-error"]').all();
    
    expect(successToasts.length).toBe(1);
    expect(errorToasts.length).toBe(1);
  });
});