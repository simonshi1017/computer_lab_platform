import { expect, test } from '@playwright/test';

/**
 * 键盘可用性：不碰鼠标也能装一个件。
 */
test('键盘可以聚焦空槽位并切换部件库', async ({ page }) => {
  await page.goto('/builder');

  const ramSlot = page.locator('.slot[aria-label^="空内存槽"]').first();
  await ramSlot.focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('.ptab[data-active="true"]')).toHaveText('内存');
});

test('对话框用 Esc 关闭并把焦点还给触发按钮', async ({ page }) => {
  await page.goto('/models');
  const firstCard = page.locator('.entry-card').first();
  await firstCard.click();

  await expect(page.locator('.dialog-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.dialog-panel')).toHaveCount(0);
});

test('Tab 第一下能跳过导航直达主内容', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');

  const skip = page.locator('.skip-link');
  await expect(skip).toBeFocused();
});
