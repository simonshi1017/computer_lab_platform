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

test('三种视图：机箱 / 拓扑 / 时序可以互相切换', async ({ page }) => {
  await page.goto('/builder');
  await page.locator('.preset-btn').filter({ hasText: '均衡推荐版' }).click();

  // 拓扑：六类节点齐全，结论里必须点到 PCIe 或显存
  await page.getByRole('button', { name: '硬件拓扑' }).click();
  await expect(page.locator('.topo-svg')).toBeVisible();
  await expect(page.locator('.topo-node')).toHaveCount(6);
  await expect(page.locator('.topo-foot')).toContainText('供电余量');

  // 时序：有曲线、有首字延迟
  await page.getByRole('button', { name: '推理时序' }).click();
  await expect(page.locator('.timeline-svg')).toBeVisible();
  await expect(page.locator('.timeline-foot')).toContainText('首字延迟');
  await expect(page.locator('.timeline-svg path[stroke="var(--accent)"]')).toBeVisible();

  // 切回机箱，拖拽区域还在（视图切换不能把机箱弄丢）
  await page.getByRole('button', { name: '实体机箱' }).click();
  await expect(page.locator('.chassis-svg')).toBeVisible();
  await expect(page.locator('.slot')).not.toHaveCount(0);
});

test('英文态下拓扑与时序也没有中文', async ({ page }) => {
  await page.goto('/builder?lang=en', { waitUntil: 'networkidle' });
  await page.locator('.preset-btn').first().click();

  for (const view of ['Topology', 'Inference timeline']) {
    await page.getByRole('button', { name: view }).click();
    const text = await page.locator('.board-col').innerText();
    const chinese = text.match(/[\u3400-\u9fff]+/g) ?? [];
    expect(chinese, `${view} still renders Chinese: ${chinese.slice(0, 5).join(' / ')}`).toEqual([]);
  }
});
