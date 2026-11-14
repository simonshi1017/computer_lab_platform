import { expect, test } from '@playwright/test';

/**
 * 内容数据双语回归（M8-P1 建立，M9 扩充到场景实验室）。
 *
 * UI 文案、数据层内容、计算内核输出与说明书模板串都收进同一套字典。
 * 这条用例的价值就是「英文态不许再漏中文」——新增页面（如 /scenarios）
 * 或新文案一旦忘了翻译，会在这里直接失败，而不是等用户截图反馈。
 */
const PATHS = ['/', '/path', '/glossary', '/models', '/hardware', '/recommend', '/scenarios', '/compare', '/builder', '/manual'];

test('English mode has no Chinese text anywhere', async ({ page }) => {
  for (const path of PATHS) {
    await page.goto(`${path}?lang=en`, { waitUntil: 'networkidle' });
    const text = await page.locator('body').innerText();
    const chinese = text.match(/[\u3400-\u9fff]+/g) ?? [];
    expect(chinese, `${path} still renders Chinese: ${chinese.slice(0, 5).join(' / ')}`).toEqual([]);
  }
});

test('content records are localized, not just the chrome', async ({ page }) => {
  await page.goto('/models?lang=en', { waitUntil: 'networkidle' });
  await expect(page.getByText('Qwen3.5 · 9B').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('通义千问');

  await page.goto('/glossary?lang=en', { waitUntil: 'networkidle' });
  await expect(page.getByText('Context Window').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('上下文窗口');

  await page.goto('/path?lang=en', { waitUntil: 'networkidle' });
  await expect(page.locator('body')).not.toContainText('模型入门');
});

test('Chinese mode keeps original content untouched', async ({ page }) => {
  await page.goto('/models', { waitUntil: 'networkidle' });
  await expect(page.getByText('通义千问 3.5 · 9B').first()).toBeVisible();
  await page.goto('/glossary', { waitUntil: 'networkidle' });
  await expect(page.getByText('上下文窗口').first()).toBeVisible();
});
