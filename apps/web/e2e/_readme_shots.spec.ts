import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';

/**
 * 生成 README 用的效果图（不参与 CI，需显式指向真实部署）：
 *
 *   E2E_BASE_URL=http://localhost:8080 \
 *     pnpm --filter @clab/web exec playwright test e2e/_readme_shots.spec.ts
 *
 * 输出到仓库根 docs/screenshots/。视口固定 1440×960、强制浅色主题，
 * 保证两版 README 里的截图构图一致。
 */
const LANG_EN = process.env.SHOT_LANG === 'en';
const OUT_DIR = join(process.cwd(), LANG_EN ? '../../docs/screenshots/en' : '../../docs/screenshots');

/** 有些页要先切到某个视图再截：按钮文案随语言变化，这里集中映射 */
const VIEW_LABEL = {
  topo: { zh: '硬件拓扑', en: 'Topology' },
  timeline: { zh: '推理时序', en: 'Inference timeline' },
} as const;

interface Shot {
  file: string;
  path: string;
  height?: number;
  /** 截图前要点的分段控件 */
  view?: keyof typeof VIEW_LABEL;
  /** 截图前先套一套预设，避免空机箱 */
  preset?: string;
  /** 截图前按 ? 打开快捷键面板 */
  dialog?: 'shortcuts';
}

const SHOTS: Shot[] = [
  { file: '01-home.png', path: '/' },
  // 12 个模型排四行，960 会截掉最后一行
  { file: '02-models.png', path: '/models', height: LANG_EN ? 1420 : 1200 },
  { file: '03-hardware.png', path: '/hardware' },
  { file: '04-recommend.png', path: '/recommend' },
  { file: '05-builder.png', path: '/builder' },
  { file: '06-manual.png', path: '/manual' },
  // 英文文案更长、卡片标题会换行，视口要再高一些才能收进底部说明条
  { file: '07-scenarios.png', path: '/scenarios', height: LANG_EN ? 1400 : 1200 },
  { file: '08-lab.png', path: '/builder?scenario=rag-kb' },
  { file: '09-topology.png', path: '/builder', preset: '均衡推荐版', view: 'topo' },
  { file: '10-timeline.png', path: '/builder', preset: '均衡推荐版', view: 'timeline' },
  // 对比表有十余行指标，960 会截掉下半截
  { file: '11-compare.png', path: '/compare', height: LANG_EN ? 1280 : 1220 },
  { file: '12-shortcuts.png', path: '/models', dialog: 'shortcuts' },
];

test('capture README screenshots', async ({ page }) => {
  test.skip(!process.env.E2E_BASE_URL, '需要 E2E_BASE_URL 指向真实部署');
  mkdirSync(OUT_DIR, { recursive: true });

  // 平台默认浅色；清掉本地可能残留的 dark，避免截图主题漂移
  await page.addInitScript(() => {
    localStorage.setItem('clab.theme', 'light');
  });
  await page.setViewportSize({ width: 1440, height: 960 });

  for (const shot of SHOTS) {
    // 路径本身可能带 query（例如 /builder?scenario=…），不能无脑拼 ?
    const sep = shot.path.includes('?') ? '&' : '?';
    // 场景库是两行卡片，960 高度会截掉第二行的按钮，单独给它更高视口
    await page.setViewportSize({ width: 1440, height: shot.height ?? 960 });
    await page.goto(LANG_EN ? `${shot.path}${sep}lang=en` : shot.path, { waitUntil: 'domcontentloaded' });
    // 等字体、懒加载路由与入场动画稳定
    await page.waitForTimeout(1200);
    if (shot.preset) {
      await page.locator('.preset-btn').filter({ hasText: LANG_EN ? 'Balanced recommendation' : shot.preset }).first().click();
      await page.waitForTimeout(500);
    }
    if (shot.view) {
      await page.getByRole('button', { name: LANG_EN ? VIEW_LABEL[shot.view].en : VIEW_LABEL[shot.view].zh }).click();
      await page.waitForTimeout(400);
    }
    if (shot.dialog === 'shortcuts') {
      await page.keyboard.press('?');
      await page.waitForTimeout(350);
    }
    await page.screenshot({ path: join(OUT_DIR, shot.file) });
  }
});
