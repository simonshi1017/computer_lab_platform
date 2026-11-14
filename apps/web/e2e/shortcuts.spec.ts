import { expect, test } from '@playwright/test';

/**
 * 交互打磨：快捷键、状态栏、悬停读数、反馈入口。
 * 这些是「用起来顺手」的东西，最容易在改动中被悄悄弄坏。
 */
test('? 打开快捷键面板，Esc 关闭', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('键盘快捷键');
  await expect(dialog).toContainText('全局搜索');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('状态栏也能打开快捷键面板', async ({ page }) => {
  await page.goto('/models', { waitUntil: 'networkidle' });

  await expect(page.locator('.statusbar-page')).toContainText('模型百科');
  await page.locator('.statusbar-hint').click();
  await expect(page.getByRole('dialog')).toContainText('跳转（先按 g）');
});

test('g 前缀跳转生效，但不会在输入框里抢键', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  await page.keyboard.press('g');
  await page.keyboard.press('m');
  await expect(page).toHaveURL(/\/models$/);

  // 在输入框里打 gm 不应该跳转（用搜索框：number 输入框根本打不进字母）
  await page.goto('/models', { waitUntil: 'networkidle' });
  const search = page.locator('input[aria-label="搜索模型"]');
  await search.click();
  await page.keyboard.type('gm');
  await expect(page).toHaveURL(/\/models$/);
  await expect(search).toHaveValue('gm');
});

test('反馈弹窗能提交并给出确认', async ({ page }) => {
  await page.goto('/glossary', { waitUntil: 'networkidle' });

  await page.locator('.statusbar-link').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('反馈问题');

  await dialog.locator('textarea').fill('27B 模型在 4090 上为什么只剩 3.5G 余量？');
  await dialog.getByRole('button', { name: '提交反馈' }).click();
  await expect(dialog).toContainText('已收到');
});

test('时序图悬停给出读数', async ({ page }) => {
  await page.goto('/builder?scenario=rag-kb', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '推理时序' }).click();

  const svg = page.locator('.timeline-svg');
  await expect(svg).toBeVisible();
  const box = await svg.boundingBox();
  if (!box) throw new Error('timeline svg has no box');

  // 720 高的默认视口里，中间栏会滚动：取靠上的位置，保证命中图内
  await page.mouse.move(box.x + box.width * 0.6, box.y + 40);
  const tip = page.locator('[data-testid="timeline-hover"]');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('显存');

  // 移出后读数消失，不留残影
  await page.mouse.move(box.x + box.width + 40, box.y + box.height + 40);
  await expect(tip).toHaveCount(0);
});

test('英文态状态栏与快捷键面板没有中文', async ({ page }) => {
  await page.goto('/models?lang=en', { waitUntil: 'networkidle' });
  await expect(page.locator('.statusbar')).not.toContainText('规则化估算');

  await page.keyboard.press('?');
  const text = await page.getByRole('dialog').innerText();
  const chinese = text.match(/[\u3400-\u9fff]+/g) ?? [];
  expect(chinese, `shortcut dialog still renders Chinese: ${chinese.slice(0, 5).join(' / ')}`).toEqual([]);
});
