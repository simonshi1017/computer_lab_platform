import { expect, test } from '@playwright/test';

/**
 * 主链路二：模型详情 → 配置推荐。
 */
test('从模型详情能直接跳到推荐并拿到三档方案', async ({ page }) => {
  await page.goto('/models?model=qwen38-27b');

  await expect(page.locator('#model-dialog-title')).toContainText('通义千问');
  await page.getByRole('button', { name: /看要买什么硬件/ }).click();

  await expect(page).toHaveURL(/\/recommend\?model=qwen38-27b/);
  await expect(page.locator('.tier-card')).toHaveCount(3);

  // 每档都有价格、显卡、载入按钮
  for (const card of await page.locator('.tier-card').all()) {
    await expect(card.locator('.tier-price')).toContainText('¥');
    await expect(card.locator('.tier-gpu')).toBeVisible();
    await expect(card.locator('.tier-foot button')).toBeEnabled();
  }

  // CPU 与主板必须同插槽（防止再推出 Ryzen 插 B760）
  const cpuText = await page.locator('.tier-card').first().locator('.bom-row').nth(1).innerText();
  const moboText = await page.locator('.tier-card').first().locator('.bom-row').nth(2).innerText();
  if (cpuText.includes('Ryzen')) expect(moboText).toMatch(/B650|X670E|TRX50|WRX90/);
  if (cpuText.includes('Core i')) expect(moboText).toMatch(/B760|C741/);
});

test('自定义参数量能算出结果并可载入组装台', async ({ page }) => {
  await page.goto('/recommend');
  await page.selectOption('#rec-model', 'custom');
  await page.fill('#rec-params', '27');

  await expect(page.locator('.rec-summary')).toContainText('20.5');
  await expect(page.locator('.tier-card')).toHaveCount(3);

  await page.locator('.tier-card').first().locator('.tier-foot button').click();
  await expect(page).toHaveURL(/\/builder/);
  await expect(page.locator('#builder-model')).toHaveValue('custom');
  await expect(page.locator('#builder-model')).toContainText('自定义 27B');
});

test('不可行的模型给出解释与补救，而不是空白', async ({ page }) => {
  await page.goto('/recommend');
  await page.selectOption('#rec-model', 'custom');
  await page.fill('#rec-params', '1000');
  await page.locator('.seg button', { hasText: 'FP16' }).click();

  await expect(page.locator('.tier-card')).toHaveCount(0);
  await expect(page.getByText('当前条件下没有可行方案')).toBeVisible();
  await expect(page.getByRole('button', { name: '量化降到 INT4' })).toBeVisible();
});
