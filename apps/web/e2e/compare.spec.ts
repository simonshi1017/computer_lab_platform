import { expect, test } from '@playwright/test';

/**
 * 方案对比：同一目标下最多三套并排，可导出 CSV。
 * 断言的是「用户能验证的事实」：列数、最优高亮、导出文件内容。
 */
test('默认三套预设并排，指标行齐全', async ({ page }) => {
  await page.goto('/compare', { waitUntil: 'networkidle' });

  await expect(page.locator('.compare-table thead th')).toHaveCount(4); // 指标 + 3 套
  await expect(page.locator('.compare-table')).toContainText('整机价格');
  await expect(page.locator('.compare-table')).toContainText('解码速度');
  await expect(page.locator('.compare-table')).toContainText('显存余量');

  // 价格越低越好：省錢版这一格必须是高亮
  const cheapest = page.locator('tr[data-row="price"] td').first();
  await expect(cheapest).toHaveAttribute('data-best', 'true');
});

test('勾选上限为三套，取消后列数同步变化', async ({ page }) => {
  await page.goto('/compare', { waitUntil: 'networkidle' });

  // 取消一套 → 2 列
  await page.locator('.compare-option[data-active="true"]').first().click();
  await expect(page.locator('.compare-table thead th')).toHaveCount(3);

  // 再选两套（含一个场景）→ 回到 3 列
  await page.locator('.compare-option').nth(5).click();
  await page.locator('.compare-option').nth(6).click();
  await expect(page.locator('.compare-table thead th')).toHaveCount(4);

  // 第 4 套不能选中（上限），而且会给出禁用态
  const extra = page.locator('.compare-option[data-disabled="true"]').first();
  await expect(extra).toHaveCount(1);
  await extra.click({ force: true });
  await expect(page.locator('.compare-table thead th')).toHaveCount(4);
});

test('导出的 CSV 带目标行与本行指标', async ({ page }) => {
  await page.goto('/compare', { waitUntil: 'networkidle' });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 CSV' }).click(),
  ]);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8');

  expect(csv).toContain('目标：');
  expect(csv).toContain('指标');
  expect(csv).toContain('整机价格');
  // BOM 必须在，否则 Excel 打开是乱码
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(download.suggestedFilename()).toMatch(/^clab-compare-.*\.csv$/);
});

test('英文态对比页没有中文', async ({ page }) => {
  await page.goto('/compare?lang=en', { waitUntil: 'networkidle' });
  const text = await page.locator('body').innerText();
  const chinese = text.match(/[\u3400-\u9fff]+/g) ?? [];
  expect(chinese, `compare page still renders Chinese: ${chinese.slice(0, 5).join(' / ')}`).toEqual([]);
  await expect(page.locator('.compare-table')).toContainText('Total VRAM');
});
