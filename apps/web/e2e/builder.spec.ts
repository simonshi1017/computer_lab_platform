import { expect, test } from '@playwright/test';

/**
 * 主链路一：组装 → 评估。
 * 断言的是「用户能看到什么」，不是内部状态——这套配置应该拿到 A 级。
 */
test('选预设后能得到完整评估', async ({ page }) => {
  await page.goto('/builder');

  await page.locator('.preset-btn').filter({ hasText: '均衡推荐版' }).click();

  // 评分与等级
  await expect(page.locator('.eval-head')).toContainText('A 级');
  await expect(page.locator('.eval-head')).toContainText('可以跑');

  // 六维雷达出现了六个维度
  await expect(page.locator('.eval-block').first().locator('.grid.grid-cols-3 > div')).toHaveCount(6);

  // 指标条有显存 / 内存 / 功耗 / 价格 / 电费
  await expect(page.locator('.metric')).toHaveCount(5);
  await expect(page.locator('.metric').first()).toContainText('32');

  // 机箱里该有：显卡 1 + CPU 1 + 主板 1 + 内存 2 + 电源 1 + 硬盘 1 + 散热 1 = 8 件
  await expect(page.locator('.slot.filled')).toHaveCount(8);
});

test('换成跑不动的模型会出现红线错误与补救建议', async ({ page }) => {
  await page.goto('/builder');
  await page.locator('.preset-btn').filter({ hasText: '均衡推荐版' }).click();
  await page.selectOption('#builder-model', 'qwen38-max');

  await expect(page.locator('.eval-head')).toContainText('跑不动');
  await expect(page.locator('.eval-block').nth(1)).toContainText('显存放不下');
  // 必须给出可点的下一步，而不是只报错
  await expect(page.locator('.suggest-btn').first()).toBeVisible();
});

test('清空机箱后是温和提示而不是报错', async ({ page }) => {
  await page.goto('/builder');
  await page.getByRole('button', { name: '清空机箱' }).click();

  await expect(page.locator('.eval-head')).toContainText('还差核心部件');
  await expect(page.locator('.suggest-btn').first()).toContainText('一键载入');
});
