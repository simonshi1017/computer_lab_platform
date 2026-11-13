#!/usr/bin/env node
/**
 * UI 文案外置工具（一次性 codemod，可反复运行，幂等）。
 *
 *   node scripts/i18n-codemod.mjs check   # 列出未外置 / 未翻译的中文，不改文件
 *   node scripts/i18n-codemod.mjs apply   # 把组件函数内的中文包成 t()，并注入 import
 *
 * 设计要点：
 * 1. 用 TypeScript AST 定位节点，但用「原文区间替换」写回，格式与注释完全保留；
 * 2. 只处理函数体内的字符串。模块级常量（navigation.ts / lib/presets.ts 之类）
 *    在模块加载时求值，切换语言不会重算，必须在消费处手工调 t()；
 * 3. JSX 文本保留前后空白，中间的中文包成 {t('…')}；
 * 4. JSX 属性 title="…" 包成 title={t("…")}；
 * 5. 已在 t() 里的、import 路径、对象 key、类型字面量一律跳过。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC = join(ROOT, 'apps/web/src');
const EN_FILES = [join(SRC, 'i18n/en.ts'), join(SRC, 'i18n/en.generated.ts')];
const MODE = process.argv[2] ?? 'check';
const HAS_CN = /[\u3400-\u9fff]/;
// navigation.ts 的 group/label 同时是筛选逻辑的键，只能在消费处翻译，整文件手工维护
const SKIP_FILES = new Set(['navigation.ts']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full.endsWith('/i18n')) continue;
      walk(full, out);
    } else if (['.ts', '.tsx'].includes(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function quoted(value) {
  return JSON.stringify(value);
}

function literalValue(raw) {
  try {
    // raw 是源码里完整的字符串/无插值模板串字面量，求值得到运行时的字符串
    return Function(`return ${raw};`)();
  } catch {
    return null;
  }
}

const normalize = (value) => String(value).replace(/\s+/g, ' ').trim();

function translatedKeys() {
  const keys = new Set();
  for (const file of EN_FILES) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (ts.isPropertyAssignment(node) && (ts.isStringLiteral(node.name) || ts.isNoSubstitutionTemplateLiteral(node.name))) {
        keys.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return keys;
}

function isFunction(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function analyze(file) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const insideKeys = new Set();
  const moduleLevel = new Set();

  const skip = (node) => {
    const p = node.parent;
    if (!p) return true;
    // 中文同时被当作状态值/筛选值时不能翻译，否则英文态比较会失效
    if (
      ts.isBinaryExpression(p) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
      ].includes(p.operatorToken.kind)
    ) return true;
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'useState') return true;
    // 行内标了 i18n-key 的常量是「逻辑值」，只在渲染处 t()
    const at = node.getStart(sf);
    const lineStart = text.lastIndexOf('\n', at) + 1;
    const lineEndRaw = text.indexOf('\n', at);
    const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
    if (/i18n-key/.test(text.slice(lineStart, lineEnd))) return true;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportEqualsDeclaration(p)) return true;
    if (
      (ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) ||
       ts.isMethodSignature(p) || ts.isPropertyDeclaration(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p)) &&
      p.name === node
    ) return true;
    if (ts.isLiteralTypeNode(p)) return true;
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && ['t', 'tList', 'track'].includes(p.expression.text)) return true;
    if (ts.isJsxAttribute(p) && p.name === node) return true;
    if (ts.isCallExpression(p) && ts.isImportKeyword(p.expression)) return true;
    return false;
  };

  const visit = (node, fnDepth) => {
    const depth = fnDepth + (isFunction(node) ? 1 : 0);

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const raw = node.getText(sf);
      const value = literalValue(raw);
      if (typeof value === 'string' && HAS_CN.test(value)) {
        const key = normalize(value);
        // 已经是 t('…') 的参数：收集 key，但不再包一层
        const p = node.parent;
        const alreadyWrapped =
          ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 't';
        if (alreadyWrapped || skip(node)) {
          if (alreadyWrapped) insideKeys.add(key);
          else if (depth === 0) moduleLevel.add(key);
        } else {
          // 模块级文案（预设名、筛选标签、页面元信息）也会翻译：
          // 切换语言走整页重载，模块会按新 locale 重新初始化
          const isJsxAttr = ts.isJsxAttribute(p) && p.initializer === node;
          const replacement = isJsxAttr ? `{t(${quoted(key)})}` : `t(${quoted(key)})`;
          edits.push({ start: node.getStart(sf), end: node.getEnd(), text: replacement });
          insideKeys.add(key);
          if (depth === 0) moduleLevel.add(key);
        }
      }
    } else if (ts.isJsxText(node)) {
      const full = node.getFullText(sf);
      if (HAS_CN.test(full)) {
        const key = normalize(full);
        if (key) {
          const match = full.match(/^(\s*)([\s\S]*?)(\s*)$/);
          const lead = match?.[1] ?? '';
          const trail = match?.[3] ?? '';
          edits.push({
            start: node.getFullStart(),
            end: node.getEnd(),
            text: `${lead}{t(${quoted(key)})}${trail}`,
          });
          insideKeys.add(key);
          if (depth === 0) moduleLevel.add(key);
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, depth));
  };
  visit(sf, 0);

  return { text, sf, edits, insideKeys, moduleLevel };
}

function applyEdits(result, file) {
  const { text, sf, edits } = result;
  if (!edits.length) return false;
  const hasImport = sf.statements.some(
    (s) => ts.isImportDeclaration(s) && s.moduleSpecifier.getText(sf).includes('@/i18n'),
  );
  if (!hasImport) {
    const imports = sf.statements.filter(ts.isImportDeclaration);
    const at = imports.length ? imports[imports.length - 1].end : 0;
    edits.push({ start: at, end: at, text: `\nimport { t } from '@/i18n';` });
  }
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  let last = Infinity;
  for (const edit of edits) {
    if (edit.end > last) continue; // 重叠区间，跳过（保险）
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    last = edit.start;
  }
  writeFileSync(file, out);
  return true;
}

const files = walk(SRC);
const known = translatedKeys();
const allKeys = new Set();
const moduleKeys = new Set();
let changedFiles = 0;
let totalEdits = 0;

for (const file of files) {
  if (SKIP_FILES.has(basename(file))) continue;
  const result = analyze(file);
  result.insideKeys.forEach((k) => allKeys.add(k));
  result.moduleLevel.forEach((k) => moduleKeys.add(k));
  if (MODE === 'apply' && result.edits.length) {
    if (applyEdits(result, file)) {
      changedFiles += 1;
      totalEdits += result.edits.length;
    }
  }
}

const missing = [...allKeys].filter((k) => !known.has(k)).sort();
console.log(`mode=${MODE} files=${files.length} changed=${changedFiles} edits=${totalEdits}`);
console.log(`keys in t(): ${allKeys.size} | translated: ${allKeys.size - missing.length} | missing: ${missing.length}`);
console.log(`module-level Chinese (needs manual t() at call site): ${moduleKeys.size}`);
if (MODE === 'check') {
  console.log('\n--- module-level keys ---');
  moduleKeys.forEach((k) => console.log(`  ${k}`));
}
if (missing.length) {
  console.log('\n--- missing EN translations ---');
  missing.forEach((k) => console.log(`  ${JSON.stringify(k)}: '',`));
}
