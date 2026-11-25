import { test, expect } from '@playwright/test';

test('Games Backlog toont het kluisinstelscherm zonder browserfouten', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle('Games Backlog');
  await expect(page.locator('#screen-setup')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#form-setup-new button[type="submit"]')).toHaveText('Kluis aanmaken');
  await expect(page.locator('[data-app-name]').first()).toHaveText('Games Backlog');

  await page.locator('[data-setup-tab="link"]').click();
  await expect(page.locator('#form-setup-link')).toBeVisible();
  await expect(page.locator('#form-setup-link input[name="token"]')).toBeVisible();
  await page.locator('[data-setup-tab="new"]').click();
  await expect(page.locator('#form-setup-new')).toBeVisible();

  expect(pageErrors).toEqual([]);
});
