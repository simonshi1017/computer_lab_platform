import { expect, test } from '@playwright/test';

/**
 * M9 场景实验室回归。
 *
 * 重点不是「页面能打开」，而是任务卡必须真的连着计算器：一键载入后
 * 全部步骤自动打勾，把配置拆坏勾要立刻消失。否则任务卡就退化成一个
 * 自己点自己勾的 checklist，失去教学校验的意义。
 */

test('scenario library lists six labs and filters by difficulty', async ({ page }) => {
  await page.goto('/scenarios', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-scenario]')).toHaveCount(6);

  await page.getByRole('button', { name: '挑战' }).click();
  await expect(page.locator('article[data-scenario]')).toHaveCount(2);
  await expect(page.locator('[data-scenario="team-api"]')).toBeVisible();
  await expect(page.locator('[data-scenario="finetune"]')).toBeVisible();

  await page.getByRole('button', { name: '全部场景' }).click();
  await expect(page.locator('article[data-scenario]')).toHaveCount(6);
});

test('starting a lab loads its preset and checks every step automatically', async ({ page }) => {
  await page.goto('/scenarios', { waitUntil: 'networkidle' });
  await page.locator('[data-scenario="rag-kb"] a.btn-primary').click();

  await expect(page).toHaveURL(/scenario=rag-kb/);
  const card = page.locator('.lab-card[data-scenario="rag-kb"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('实验完成');
  await expect(card.locator('.lab-step[data-done="true"]')).toHaveCount(5);

  // 预置配置确实被灌进了组装台：32K 上下文 + 双卡
  await expect(page.locator('#builder-ctx')).toHaveValue('32768');
});

test('breaking the build unchecks the matching steps', async ({ page }) => {
  await page.goto('/builder?scenario=local-chat', { waitUntil: 'networkidle' });
  const card = page.locator('.lab-card[data-scenario="local-chat"]');
  await expect(card.locator('.lab-step[data-done="true"]')).toHaveCount(5);

  await page.getByRole('button', { name: '清空机箱' }).click();
  await expect(card.locator('[data-step="gpu"]')).toHaveAttribute('data-done', 'false');
  await expect(card.locator('[data-step="headroom"]')).toHaveAttribute('data-done', 'false');
  await expect(card.locator('[data-step="complete"]')).toHaveAttribute('data-done', 'false');
  await expect(card).not.toContainText('实验完成');
});

test('exiting a lab hides the task card and clears the URL parameter', async ({ page }) => {
  await page.goto('/builder?scenario=budget', { waitUntil: 'networkidle' });
  await expect(page.locator('.lab-card')).toBeVisible();

  await page.getByRole('button', { name: '退出实验' }).click();
  await expect(page.locator('.lab-card')).toHaveCount(0);
  await expect(page).not.toHaveURL(/scenario=/);
});

test('English mode renders scenario library and task card without Chinese', async ({ page }) => {
  for (const path of ['/scenarios?lang=en', '/builder?scenario=rag-kb&lang=en']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    const text = await page.locator('body').innerText();
    const chinese = text.match(/[\u3400-\u9fff]+/g) ?? [];
    expect(chinese, `${path} still renders Chinese: ${chinese.slice(0, 5).join(' / ')}`).toEqual([]);
  }
  await expect(page.locator('.lab-card')).toContainText('Lab complete');
});
