import { test } from '@playwright/test';

/** 临时截图脚本（不参与 CI）：用于人工过一眼新页面的视觉。 */
test('capture new screens', async ({ page }) => {
  test.skip(!process.env.E2E_BASE_URL, '需要真实后端');
  await page.setViewportSize({ width: 1440, height: 980 });

  await page.goto('/builder');
  await page.getByRole('button', { name: /保存 \/ 分享/ }).click({ timeout: 15000 });
  await page.getByRole('button', { name: '去登录' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/clab-shots/login.png' });

  await page.getByRole('button', { name: /开发模式一键登录/ }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/clab-shots/save.png' });

  await page.locator('#build-name').fill('双 4090 跑 Qwen2.5-14B');
  await page.getByRole('button', { name: '保存到我的配置' }).click();
  await page.getByRole('button', { name: '生成分享链接' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/clab-shots/share-dialog.png' });

  const url = await page.locator('#share-url-input').inputValue();

  await page.goto(url);
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/clab-shots/landing.png', fullPage: true });

  await page.goto('/my');
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/clab-shots/my.png', fullPage: true });

  await page.goto('/builder');
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/clab-shots/builder-toolbar.png' });
});
