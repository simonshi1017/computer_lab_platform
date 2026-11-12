import { defineConfig, devices } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 本机复用已下载的 Chromium。
 *
 * @playwright/test 每个版本会锁定一个浏览器 revision，缓存里版本对不上时
 * 会要求重新下载几百 MB。这里优先探测本地已有版本，找不到才退回默认行为
 * （CI 上通常是 `playwright install` 装好的标准路径）。
 */
function localChromium(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  const cache = join(process.env.HOME ?? '', 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return undefined;

  const dirs = readdirSync(cache)
    .filter((dir) => dir.startsWith('chromium-') && !dir.includes('headless'))
    .sort()
    .reverse();

  const platforms = ['chrome-mac-arm64', 'chrome-mac', 'chrome-linux'];
  for (const dir of dirs) {
    for (const platform of platforms) {
      const bin = join(
        cache,
        dir,
        platform,
        'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      );
      if (existsSync(bin)) return bin;

      // Linux 布局没有 .app 包装
      const plain = join(cache, dir, 'chrome-linux', 'chrome');
      if (existsSync(plain)) return plain;
    }
  }
  return undefined;
}

const executablePath = localChromium();
const launchOptions = executablePath ? { executablePath } : {};

/**
 * 默认跑本地 preview（纯静态、不依赖后端）。
 * 需要验证「登录 → 保存 → 分享」这类跨前后端的链路时，指向真实部署：
 *   E2E_BASE_URL=http://localhost:8080 pnpm --filter @clab/web e2e
 */
const externalBase = process.env.E2E_BASE_URL;
const baseURL = externalBase ?? 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 6_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions } }],
  // 指向外部部署时不再自己起 preview：那个地址上已经有 nginx 在服务
  webServer: externalBase
    ? undefined
    : {
        command: 'npx vite preview --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
