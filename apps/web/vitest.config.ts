import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 单元测试配置（与 vite.config.ts 分开）。
 *
 * 关键一条是 exclude：`e2e/**` 里是 Playwright 用例，文件后缀同样是 .spec.ts，
 * vitest 默认的 include 会把它一起收进来，然后因为 `page` 未定义而整批失败。
 * 两个 runner 必须靠目录分离，不能靠文件名约定。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    passWithNoTests: true,
  },
});
