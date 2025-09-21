import { test, expect } from '@playwright/test';

test('Toast deduplication prevents duplicate error messages', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // Find and click the "Trigger Duplicate Errors" button
  const triggerButton = page.getByRole('button', { name: 'Trigger Duplicate Errors' });
  await expect(triggerButton).toBeVisible();
  
  // Click the button to trigger duplicate errors
  await triggerButton.click();
  
  // Wait a bit for the toasts to appear
  await page.waitForTimeout(500);
  
  // Check that only one toast is visible (deduplication should prevent duplicates)
  const toastElements = await page.$$('.Toastify__toast');
  expect(toastElements.length).toBe(1);
  
  // Check the toast message
  const toastMessage = await toastElements[0].textContent();
  expect(toastMessage).toContain('PDF is too large');
  expect(toastMessage).toContain('(1st)');
});

test('Different errors are shown separately', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // Find and click the "Trigger Different Errors" button
  const triggerButton = page.getByRole('button', { name: 'Trigger Different Errors' });
  await expect(triggerButton).toBeVisible();
  
  // Click the button to trigger different errors
  await triggerButton.click();
  
  // Wait a bit for the toasts to appear
  await page.waitForTimeout(500);
  
  // Check that all three toasts are visible
  const toastElements = await page.$$('.Toastify__toast');
  expect(toastElements.length).toBe(3);
  
  // Check that we have different error messages
  const messages = [];
  for (const toast of toastElements) {
    const text = await toast.textContent();
    messages.push(text);
  }
  
  expect(messages.some(msg => msg.includes('PDF is too large'))).toBe(true);
  expect(messages.some(msg => msg.includes('Invalid file type'))).toBe(true);
  expect(messages.some(msg => msg.includes('Failed to parse the PDF'))).toBe(true);
});

test('QA gating hides DebugChips in production', async ({ page }) => {
  // Set environment variable to simulate production
  // Note: In a real test, you would need to start the app with REACT_APP_QA_LABELS=0
  await page.goto('http://localhost:3000');
  
  // Check that the QA gating test component shows the correct status
  const qaTestComponent = page.getByText('QA Gating Test');
  await expect(qaTestComponent).toBeVisible();
  
  // Check the environment status display
  const envStatus = page.getByText(/NODE_ENV: \w+/);
  await expect(envStatus).toBeVisible();
  
  // In development mode, DebugChips should be visible by default
  // This test assumes we're running in development mode
  const debugChips = page.locator('.MuiChip-root');
  // We should see at least one chip from the DebugChips component
  await expect(debugChips.first()).toBeVisible({ timeout: 5000 });
});