import { expect, test } from '@playwright/test';

/** 临时截图脚本（不参与 CI）。 */
test('capture M7 screens', async ({ page, request }) => {
  test.skip(!process.env.E2E_BASE_URL, '需要真实后端');
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1) 显卡列表：价格来源
  await page.goto('/hardware');
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/clab-shots/m7-hardware.png' });

  // 2) 详情
  await page.goto('/hardware?gpu=rtx4090');
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/clab-shots/m7-gpu-dialog.png' });

  // 3) 造一条分享，截图落地页 + 下载卡片
  const login = await request.post('/api/v1/auth/dev-login', {
    data: { email: 'shot@clab.local', nickname: '产品经理' },
  });
  const token = (await login.json()).accessToken as string;
  const created = await request.post('/api/v1/builds', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: '双 4090 跑 Qwen2.5-14B',
      state: {
        build: {
          gpuIds: ['rtx4090', 'rtx4090'],
          cpuId: 'r5-7600',
          moboId: 'b650',
          ramIds: ['ram32'],
          psuId: 'psu1000',
          storageIds: ['ssd1t'],
          coolingId: 'aio240',
        },
        modelId: 'qwen38-27b',
        quant: 'int4',
        ctx: 8192,
        budget: 30000,
        prices: { rtx4090: 13299, 'r5-7600': 1500, b650: 900, ram32: 400, psu1000: 700, ssd1t: 500, aio240: 260 },
      },
      evaluation: {
        score: 86,
        grade: 'A',
        tps: 38.4,
        headroom: 0.68,
        need: { total: 11.9 },
        stats: { priceCny: 30358, vramGb: 48, powerW: 980, elecMonthlyCny: 353 },
        dimensions: [
          { key: 'compat', label: '兼容', score: 92, weight: 30, hint: '' },
          { key: 'perf', label: '性能', score: 88, weight: 25, hint: '' },
          { key: 'cost', label: '成本', score: 72, weight: 15, hint: '' },
          { key: 'thermo', label: '功耗', score: 70, weight: 15, hint: '' },
          { key: 'expand', label: '扩展', score: 80, weight: 10, hint: '' },
          { key: 'match', label: '匹配', score: 94, weight: 5, hint: '' },
        ],
        risks: [{ level: 'warn', title: '双卡要 1200W 电源', desc: '当前 1000W 偏紧，建议升级' }],
        suggestions: [],
      },
    },
  });
  const buildId = (await created.json()).id as number;
  const share = await request.post('/api/v1/share', {
    headers: { Authorization: `Bearer ${token}` },
    data: { buildId },
  });
  const shareToken = (await share.json()).token as string;

  await page.goto(`/s/${shareToken}`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/clab-shots/m7-landing.png', fullPage: true });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /下载分享图/ }).click(),
  ]);
  await download.saveAs('/tmp/clab-shots/m7-card.png');

  // 4) 看板：需要管理员登录态，直接把 dev-login 拿到的 token 注进 localStorage
  const tokens = await login.json();
  await page.addInitScript(
    (payload) => {
      localStorage.setItem('clab.auth.v1', JSON.stringify(payload));
    },
    { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: tokens.user },
  );
  await page.goto('/stats');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '/tmp/clab-shots/m7-stats.png', fullPage: true });

  expect(true).toBe(true);
});
