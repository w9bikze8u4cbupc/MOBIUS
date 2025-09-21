// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('QA Gating', () => {
  test.describe('when REACT_APP_QA_LABELS is true', () => {
    test.beforeEach(async ({ page }) => {
      // Set up environment to show the DevTestPage and enable QA labels
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

    test('should show DebugChips when QA labels are enabled', async ({ page }) => {
      // Click the "Call Health" button to populate debug info
      const healthButton = page.getByRole('button', { name: 'Call Health' });
      await healthButton.click();
      
      // Wait for the request to complete
      await page.waitForTimeout(1000);
      
      // Check that DebugChips are visible
      const debugChips = page.locator('[data-testid="debug-chips"]');
      await expect(debugChips).toBeVisible();
    });

    test('should display request information in DebugChips', async ({ page }) => {
      // Click the "Call Health" button to populate debug info
      const healthButton = page.getByRole('button', { name: 'Call Health' });
      await healthButton.click();
      
      // Wait for the request to complete
      await page.waitForTimeout(1000);
      
      // Check that DebugChips contain expected information
      const debugChips = page.locator('[data-testid="debug-chips"]');
      const chipText = await debugChips.textContent();
      
      // Should contain requestId, latency, and source information
      expect(chipText).toContain('requestId');
      expect(chipText).toContain('latency');
      expect(chipText).toContain('source');
    });
  });

  test.describe('when REACT_APP_QA_LABELS is false', () => {
    test.beforeEach(async ({ page }) => {
      // Set up environment to show the DevTestPage but disable QA labels
      await page.addInitScript(() => {
        window.process = { 
          env: { 
            REACT_APP_SHOW_DEV_TEST: 'true',
            REACT_APP_QA_LABELS: 'false'
          } 
        };
      });
      
      // Navigate to the app
      await page.goto('http://localhost:3001');
    });

    test('should not show DebugChips when QA labels are disabled', async ({ page }) => {
      // Click the "Call Health" button
      const healthButton = page.getByRole('button', { name: 'Call Health' });
      await healthButton.click();
      
      // Wait for the request to complete
      await page.waitForTimeout(1000);
      
      // Check that DebugChips are not visible
      const debugChips = page.locator('[data-testid="debug-chips"]');
      await expect(debugChips).not.toBeVisible();
    });
  });
});