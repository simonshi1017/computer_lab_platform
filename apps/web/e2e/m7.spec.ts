import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * M7 验收：价格可追溯、分享卡片能下载、埋点真的发出了。
 *
 * 同样需要真实后端：
 *   E2E_BASE_URL=http://localhost:8080 pnpm --filter @clab/web e2e m7.spec.ts
 */

const hasBackend = Boolean(process.env.E2E_BASE_URL);
test.skip(!hasBackend, '需要真实后端：E2E_BASE_URL=http://localhost:8080 pnpm e2e');

async function adminToken(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/v1/auth/dev-login', {
    data: { email: 'e2e-m7@clab.local', nickname: 'E2E' },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).accessToken as string;
}

test.describe('M7 数据自动化', () => {
  test('显卡卡片能说清价格是哪来的', async ({ page }) => {
    await page.goto('/hardware');
    // 价格下面必须有一行来源/时间，而不是只有一个光秃秃的数字
    const provenance = page.getByText(/(京东|目录估算价|线下|报价单|人工录入|天猫|淘宝)/).first();
    await expect(provenance).toBeVisible({ timeout: 15_000 });
  });

  test('显卡详情里显示采集时间与陈旧提示', async ({ page }) => {
    await page.goto('/hardware?gpu=rtx4090');
    await expect(page.getByText('价格来源：')).toBeVisible({ timeout: 15_000 });
  });

  test('分享落地页可以下载 1200×630 的分享图', async ({ page, request }) => {
    const token = await adminToken(request);
    const created = await request.post('/api/v1/builds', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: 'M7 卡片用例',
        state: {
          build: {
            gpuIds: ['rtx4090'],
            cpuId: 'r5-7600',
            moboId: 'b650',
            ramIds: ['ram32'],
            psuId: 'psu1000',
            storageIds: ['ssd1t'],
            coolingId: 'aio240',
          },
          modelId: 'qwen25-14b',
          quant: 'int4',
          ctx: 8192,
          budget: 30000,
          prices: { rtx4090: 13299, 'r5-7600': 1500, b650: 900, ram32: 400, psu1000: 700, ssd1t: 500, aio240: 260 },
        },
        evaluation: {
          score: 82,
          grade: 'A',
          tps: 41,
          headroom: 0.7,
          need: { total: 11.9 },
          stats: { priceCny: 17559, vramGb: 24, powerW: 820, elecMonthlyCny: 295 },
          dimensions: [
            { key: 'compat', label: '兼容', score: 90, weight: 30, hint: '' },
            { key: 'perf', label: '性能', score: 80, weight: 25, hint: '' },
            { key: 'cost', label: '成本', score: 70, weight: 15, hint: '' },
            { key: 'thermo', label: '功耗', score: 75, weight: 15, hint: '' },
            { key: 'expand', label: '扩展', score: 78, weight: 10, hint: '' },
            { key: 'match', label: '匹配', score: 88, weight: 5, hint: '' },
          ],
          risks: [],
          suggestions: [],
        },
      },
    });
    expect(created.status()).toBe(201);
    const buildId = (await created.json()).id as number;

    const share = await request.post('/api/v1/share', {
      headers: { Authorization: `Bearer ${token}` },
      data: { buildId },
    });
    const token2 = (await share.json()).token as string;

    await page.goto(`/s/${token2}`);
    await expect(page.getByRole('heading', { name: 'M7 卡片用例' })).toBeVisible({ timeout: 15_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: /下载分享图/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);

    // 单价用的是保存时的快照（¥13,299），不是今天的目录价
    await expect(page.getByText('¥13,299')).toBeVisible();
  });

  test('埋点确实上报到了后端', async ({ page, request }) => {
    const token = await adminToken(request);

    await page.goto('/models');
    // 等 flush 的 600ms 防抖 + 一次网络往返
    await page.waitForTimeout(1600);

    const response = await request.get('/api/v1/stats/overview?days=1', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.totals.pv).toBeGreaterThan(0);
    expect(Array.isArray(body.topEvents)).toBeTruthy();
    expect(body.topEvents.some((event: { name: string }) => event.name === 'page_view')).toBeTruthy();
  });
});
