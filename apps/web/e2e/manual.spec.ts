import { expect, test } from '@playwright/test';

/**
 * 主链路三：组装 → 生成说明书。
 */
test('说明书包含配置清单与可执行的部署命令', async ({ page }) => {
  await page.goto('/builder');
  await page.locator('.preset-btn').filter({ hasText: '均衡推荐版' }).click();
  await page.locator('.eval-foot button.btn-primary').click();

  await expect(page).toHaveURL(/\/manual/);
  await expect(page.locator('.manual-doc')).toContainText('配置清单');
  await expect(page.locator('.manual-doc')).toContainText('风险与注意事项');

  // 5 个部署步骤，第一步的代码块要能照着敲
  await expect(page.locator('.manual-steps > li')).toHaveCount(5);
  await expect(page.locator('.step-code').first()).toContainText('lsb_release');

  // 拉模型那一步必须是该模型真实的 Ollama tag
  await expect(page.locator('.step-code').nth(3)).toContainText('qwen2.5:14b-instruct-q4_K_M');

  // 成本对比表要有三档用量
  await expect(page.locator('.manual-table').nth(1).locator('tbody tr')).toHaveCount(3);
});

test('说明书里的估算值都带免责说明', async ({ page }) => {
  await page.goto('/manual');
  await expect(page.locator('.manual-foot')).toContainText('估算值');
  await expect(page.locator('.manual-foot')).toContainText('数据更新时间');
});
