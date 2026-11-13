import { expect, test } from '@playwright/test';

/**
 * 多语种回归：切换器、URL 参数、<html lang> 与关键 UI 文案。
 * 内容数据（模型描述等）仍为中文，是下一批要双语化的部分，所以不断言「全页无中文」。
 */
test('language switch keeps locale across reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '切换语言' }).click();

  await page.waitForURL(/lang=en/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('link', { name: /Build my server/ })).toBeVisible();
  await expect(page.locator('.sidebar').getByText('Model Catalog')).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('link', { name: /Build my server/ })).toBeVisible();

  // 切回中文，URL 上的 lang 参数应当被清掉
  await page.getByRole('button', { name: 'Switch language' }).click();
  await page.waitForURL((url) => !url.searchParams.has('lang'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('link', { name: /开始组装我的服务器/ })).toBeVisible();
});
