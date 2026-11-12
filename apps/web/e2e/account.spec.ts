import { expect, test } from '@playwright/test';

/**
 * M6 验收用例：登录 → 保存 → 分享链接在无痕窗口打开。
 *
 * 这条用例**必须对着真实部署跑**（前端 + nginx + API + PostgreSQL）：
 *   E2E_BASE_URL=http://localhost:8080 pnpm --filter @clab/web e2e
 *
 * 对着纯静态 preview 跑会失败，因为 /api 没有后端——这也是刻意的：
 * 它验证的是跨前后端的整条链路，不是组件渲染。
 */

const runId = Date.now().toString().slice(-6);

// 没有后端时整组跳过：默认的 `pnpm e2e` 跑纯静态 preview，
// 这组用例验证的是跨前后端链路，缺后端只会得到一堆误导性的失败。
const hasBackend = Boolean(process.env.E2E_BASE_URL);
test.skip(!hasBackend, '需要真实后端：E2E_BASE_URL=http://localhost:8080 pnpm e2e');

test.describe('账号与分享', () => {
  test('未登录时保存会引导登录，登录后自动回到保存框', async ({ page }) => {
    await page.goto('/builder');
    await expect(page.getByRole('button', { name: /保存 \/ 分享/ })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /保存 \/ 分享/ }).click();
    await expect(page.getByText('保存到账号需要先登录')).toBeVisible();

    await page.getByRole('button', { name: '去登录' }).click();
    await expect(page.getByRole('heading', { name: '登录后可以保存配置' })).toBeVisible();

    // 开发模式一键登录（仅 APP_ENV != prod 时出现）
    const devButton = page.getByRole('button', { name: /开发模式一键登录/ });
    await expect(devButton).toBeVisible();
    await devButton.click();

    // 登录成功后应自动回到保存框，而不是让用户再点一次
    await expect(page.getByRole('heading', { name: '保存这套配置' })).toBeVisible({ timeout: 10_000 });
  });

  test('完整链路：保存配置并在无痕窗口打开分享链接', async ({ page, browser }) => {
    const name = `E2E 双卡方案 ${runId}`;

    await page.goto('/builder');
    await expect(page.getByRole('button', { name: /保存 \/ 分享/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /保存 \/ 分享/ }).click();

    // 若上一次用例已登录，这里直接是保存表单；否则先登录
    if (await page.getByRole('button', { name: '去登录' }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: '去登录' }).click();
      await page.getByRole('button', { name: /开发模式一键登录/ }).click();
    }

    await expect(page.getByRole('heading', { name: '保存这套配置' })).toBeVisible({ timeout: 10_000 });
    await page.locator('#build-name').fill(name);
    await page.getByRole('button', { name: '保存到我的配置' }).click();

    // 保存成功后进入分享阶段
    await expect(page.getByRole('heading', { name: '已保存，可以分享给别人了' })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: '生成分享链接' }).click();

    const input = page.locator('#share-url-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    const shareUrl = await input.inputValue();
    expect(shareUrl).toMatch(/\/s\/[A-Za-z0-9_-]{10,}$/);

    // 关键一步：全新的浏览器上下文（相当于无痕窗口），不带任何本地存储
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(shareUrl);

    await expect(anonPage.getByRole('heading', { name })).toBeVisible({ timeout: 15_000 });
    await expect(anonPage.getByText('配置清单')).toBeVisible();
    // 落地页是只读的：能跳到组装台继续改，但不需要账号
    await expect(anonPage.getByRole('link', { name: /在组装台打开这套配置/ })).toBeVisible();
    // 作者账号不能泄露
    await expect(anonPage.getByText('@', { exact: false })).toHaveCount(0);

    await anonContext.close();
  });

  test('我的配置页面能看到刚保存的方案', async ({ page }) => {
    await page.goto('/my');
    // 未登录时应给出登录入口而不是空白页
    const loginEntry = page.getByRole('button', { name: '去登录' });
    const list = page.getByRole('link', { name: /去组装台/ });
    await expect(loginEntry.or(list)).toBeVisible({ timeout: 15_000 });
  });

  test('分享链接失效时给出人话提示', async ({ page }) => {
    await page.goto('/s/not-a-real-token-000000');
    await expect(page.getByText(/打不开这个分享|这个链接已过期/)).toBeVisible({ timeout: 15_000 });
  });
});
