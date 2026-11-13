/**
 * 生成 apps/web/src/i18n/{en.data,en.dynamic}.ts 并报告未翻译文案。
 *
 * 数据源：
 *   scripts/content-en.mjs       —— 静态文案（中文原文 → 英文），按来源分组手工校对
 *   scripts/content-dynamic.mjs  —— 动态模板（中文模板串 → 英文模板串），保留 {n} 占位
 *
 * 待翻清单由源码实时扫描得出，所以中文文案一改，这里立刻报缺失，不会静默漏翻。
 * 用法：node scripts/gen-content-dict.mjs [--report]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const TARGETS = [
  'packages/data/src',
  'packages/engine/src',
  'apps/web/src/pages/ManualPage.tsx',
  'apps/web/src/pages/HomePage.tsx',
  'apps/web/src/pages/HardwarePage.tsx',
  'apps/web/src/components/builder/EvalPanel.tsx',
  'apps/web/src/components/builder/PartPalette.tsx',
  'apps/web/src/components/builder/MetricsBar.tsx',
  'apps/web/src/components/chassis/slots.tsx',
  'apps/web/src/components/recommend/TierCard.tsx',
  'apps/web/src/hooks/usePrices.ts',
];
const HAS_CN = /[\u3400-\u9fff]/;

/** 与 apps/web/src/i18n/index.ts::dynamicKey 保持完全一致 */
function dynamicKey(text) {
  const values = [];
  const key = text.replace(/[^\u3400-\u9fff\u3000-\u303f\uff00-\uffef]+/g, (chunk) => {
    values.push(chunk);
    return `{${values.length - 1}}`;
  });
  return { key, values };
}

function* walk(target) {
  const abs = join(ROOT, target);
  const st = statSync(abs, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isFile()) {
    if (/\.tsx?$/.test(target)) yield target;
    return;
  }
  for (const name of readdirSync(abs).sort()) {
    if (['node_modules', 'dist', 'test', '__pycache__'].includes(name)) continue;
    yield* walk(join(target, name));
  }
}

const uiDict = ['apps/web/src/i18n/en.ts', 'apps/web/src/i18n/en.generated.ts']
  .map((f) => readFileSync(join(ROOT, f), 'utf8'))
  .join('\n');
const uiKeys = new Set([...uiDict.matchAll(/^\s*['"]((?:[^'"\\]|\\.)*)['"]\s*:/gm)].map((m) => m[1]));

/** 开发期断言 / zod 校验消息不会出现在页面上 */
function isInternal(text, file) {
  if (/^\[(data|engine|presets)\]/.test(text)) return true;
  if (/\/schema\.ts$/.test(file)) return true;
  if (/\/index\.ts$/.test(file) && /重复|不连续|带不动|低于|校验失败/.test(text)) return true;
  return false;
}

const staticKeys = new Set();
const dynamicSources = new Map(); // 源码模板串 -> 出现位置
for (const file of new Set(TARGETS.flatMap((t) => [...walk(t)]))) {
  const code = readFileSync(join(ROOT, file), 'utf8');
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    let text = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateExpression(node)) text = node.getText(sf).slice(1, -1);
    if (text && HAS_CN.test(text) && !isInternal(text, file)) {
      if (text.includes('${')) {
        // 多行嵌套模板串的 getText() 已包含内部表达式；再往下遍历会把
        // 同一句拆成好几条伪模板（三元分支、t() 字面量等），这里直接收口，
        // 但要把内部 t("中文") 的字面量补进静态清单。
        const collectLiterals = (n) => {
          if (ts.isStringLiteral(n) && HAS_CN.test(n.text) && !uiKeys.has(n.text)) staticKeys.add(n.text);
          else ts.forEachChild(n, collectLiterals);
        };
        ts.forEachChild(node, collectLiterals);
        // 中文只出现在 t() 字面量里时（例如 ollama 命令里的中文 prompt），
        // 整串不需要翻译，片段已由 t() 各自处理。
        const bare = text.replace(/['"][^'"]*[\u3400-\u9fff][^'"]*['"]/g, '');
        if (HAS_CN.test(bare)) {
          if (!dynamicSources.has(text)) dynamicSources.set(text, new Set());
          dynamicSources.get(text).add(relative(ROOT, join(ROOT, file)));
        }
        return;
      } else if (!uiKeys.has(text)) {
        staticKeys.add(text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const { default: CONTENT_EN } = await import('./content-en.mjs');
const { default: CONTENT_DYNAMIC } = await import('./content-dynamic.mjs');

const missingStatic = [...staticKeys].filter((k) => CONTENT_EN[k] === undefined).sort();
const dynamicEntries = new Map();
const missingDynamic = [];
for (const src of [...dynamicSources.keys()].sort()) {
  const key = dynamicKey(src).key;
  const en = CONTENT_DYNAMIC[src];
  if (en === undefined) missingDynamic.push(src);
  else dynamicEntries.set(key, en);
}

/** 字典里手写了但源码已不存在的条目，提示清理 */
const staleStatic = Object.keys(CONTENT_EN).filter((k) => !staticKeys.has(k) && !uiKeys.has(k));
const staleDynamic = Object.keys(CONTENT_DYNAMIC).filter((k) => !dynamicSources.has(k));

const quote = (s) => JSON.stringify(s);
const banner = (what) => `// 自动生成，请勿手改 —— 源：scripts/content-${what}.mjs，生成：scripts/gen-content-dict.mjs\n`;

if (!process.argv.includes('--report')) {
  const dataBody = Object.entries(CONTENT_EN)
    .filter(([k]) => staticKeys.has(k))
    .sort(([a], [b]) => a.localeCompare(b, 'zh'))
    .map(([k, v]) => `  ${quote(k)}: ${quote(v)},`)
    .join('\n');
  writeFileSync(
    join(ROOT, 'apps/web/src/i18n/en.data.ts'),
    `${banner('en')}\n/** 内容数据英文文案：模型 / 显卡 / 部件 / 术语 / 关卡 / 内核建议 */\nexport const EN_DATA: Record<string, string> = {\n${dataBody}\n};\n`,
  );
  const dynBody = [...dynamicEntries]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  ${quote(k)}: ${quote(v)},`)
    .join('\n');
  writeFileSync(
    join(ROOT, 'apps/web/src/i18n/en.dynamic.ts'),
    `${banner('dynamic')}\n/** 动态文案英文模板；key 由 dynamicKey() 归一化，{n} 对应原文里的非中文片段 */\nexport const EN_DYNAMIC: Record<string, string> = {\n${dynBody}\n};\n`,
  );
}

console.log(`static: ${staticKeys.size} total, ${missingStatic.length} missing, ${staleStatic.length} stale`);
console.log(`dynamic: ${dynamicSources.size} total, ${missingDynamic.length} missing, ${staleDynamic.length} stale`);
if (missingStatic.length) {
  console.log('\n--- missing static ---');
  missingStatic.forEach((k) => console.log(k));
}
if (missingDynamic.length) {
  console.log('\n--- missing dynamic ---');
  missingDynamic.forEach((k) => console.log(k));
}
if (staleStatic.length) console.log('\n--- stale static ---\n' + staleStatic.join('\n'));
if (staleDynamic.length) console.log('\n--- stale dynamic ---\n' + staleDynamic.join('\n'));
if (missingStatic.length || missingDynamic.length) process.exitCode = 1;
