
import { t } from '@/i18n';/**
 * 分享卡片：把一套配置画成 1200×630 的 PNG。
 *
 * 为什么用 canvas 而不是服务端渲染：
 * - 服务端渲染中文要装字体（Noto Sans CJK 镜像 +200MB），冷启动慢；
 * - 卡片内容全部来自前端已有的 evaluation，服务端还得再算一遍；
 * - 前端渲染是 0 网络往返，点一下就有。
 *
 * 尺寸用 1200×630 是 Open Graph 的标准比，微信/企微/钉钉的预览图都按这个裁。
 *
 * 两个真实约束：
 * 1. **中文字体必须等就绪**：`document.fonts.ready` 之前画，canvas 会回退到
 *    默认字体，导出的图里汉字变成方块或字重不对。
 * 2. **不要依赖 devicePixelRatio 缩放**：导出尺寸是固定的社交图，
 *    按屏幕 dpr 放大会得到 2 倍大的文件，微信还会二次压缩。
 */

export interface ShareCardData {
  title: string;
  modelName: string;
  quant: string;
  ctxLabel: string;
  score: number;
  grade: string;
  priceCny: number;
  vramGb: number;
  /** 这套配置跑目标模型需要多少显存 */
  needGb: number;
  /** 显存余量比例，负数表示放不下 */
  headroom: number;
  tps: number;
  gpus: string[];
  /** 其余部件的一句话摘要，例如 ["CPU R5 7600", "主板 B650"] */
  parts: string[];
  author?: string | null;
  date: string;
  footer: string;
}

const W = 1200;
const H = 630;

const INK = '#131722';
const INK_2 = '#4B5567';
const INK_3 = '#7C879C';
const LINE = '#E4E8F0';
const ACCENT = '#4F6FFF';
const GOOD = '#0C8046';
const SURFACE = '#FFFFFF';
const BG = '#F5F7FC';

const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  // 半径必须收敛到短边的一半。否则画「细长条」（比如 560×10 的进度条）时，
  // 99 的半径会把形状拽成一个大圆弧，还会盖住旁边的文字。
  const radius = Math.max(0, Math.min(r, h / 2, w / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/** 从「RTX 4090 × 2」这种文案里取出数量，用于机箱上点亮几张卡 */
function countOf(text: string): number {
  const match = text.match(/×\s*(\d+)/);
  return match ? Number(match[1]) : 1;
}

/** 显存占用条：比再写一行数字更能说明「这套配置松不松」 */
function drawMemoryBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  needGb: number,
  vramGb: number,
  headroom: number,
): void {
  const h = 10;
  const ratio = vramGb > 0 ? Math.min(1, needGb / vramGb) : 0;
  const overflow = needGb > vramGb;

  ctx.fillStyle = '#EDF1F9';
  roundRect(ctx, x, y, w, h, 99);
  ctx.fill();

  ctx.fillStyle = overflow ? '#DC2626' : ACCENT;
  ctx.globalAlpha = overflow ? 0.9 : 0.55;
  roundRect(ctx, x, y, Math.max(6, w * ratio), h, 99);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = INK_3;
  ctx.font = `400 12px ${FONT}`;
  ctx.fillText(
    `显存需求 ${needGb.toFixed(1)}G / 可用 ${vramGb.toFixed(0)}G · ` +
      (overflow ? `还差 ${(needGb - vramGb).toFixed(1)}G` : `余量 ${Math.round(headroom * 100)}%`),
    x,
    y - 9,
  );
}

function money(value: number): string {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

/** 画一个极简主机剪影：四根显卡、一块主板、一个电源。比放插图省事且不糊。 */
function drawChassis(ctx: CanvasRenderingContext2D, x: number, y: number, litCount: number): void {
  const w = 190;
  const h = 286;

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.fillStyle = '#FBFCFE';
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.stroke();

  // 主板
  ctx.fillStyle = '#EDF1F9';
  roundRect(ctx, x + 16, y + 18, 112, 172, 8);
  ctx.fill();

  // 显卡：4 个横条，按实际张数点亮
  const lit = Math.min(4, Math.max(0, litCount));
  for (let i = 0; i < 4; i += 1) {
    const barY = y + 34 + i * 38;
    ctx.fillStyle = i < lit ? ACCENT : '#E6EAF3';
    ctx.globalAlpha = i < lit ? 0.85 : 1;
    roundRect(ctx, x + 24, barY, 150, 22, 6);
    ctx.fill();
    ctx.globalAlpha = 0.9;
  }

  // 电源仓
  ctx.fillStyle = '#E6EAF3';
  roundRect(ctx, x + 16, y + 202, 112, 64, 8);
  ctx.fill();

  // 前面板进风
  ctx.strokeStyle = '#D8DEE9';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + w - 20, y + 44 + i * 20);
    ctx.lineTo(x + w - 8, y + 44 + i * 20);
    ctx.stroke();
  }
  ctx.restore();
}

export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  // 字体没就绪就画，中文会掉到系统默认字重，导出的图看起来「不像这个站」
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.dataset.gpuCount = String(data.gpus.length);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(t("当前浏览器不支持 canvas"));

  // 背景
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 180, -80, 40, W - 180, -80, 620);
  glow.addColorStop(0, 'rgba(79,111,255,0.16)');
  glow.addColorStop(1, 'rgba(79,111,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 卡片主体
  const pad = 48;
  ctx.fillStyle = SURFACE;
  ctx.shadowColor = 'rgba(19,23,34,0.08)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 28);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const left = pad + 44;
  const top = pad + 44;
  const contentWidth = W - pad * 2 - 88 - 176 - 40;

  // 品牌
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ACCENT;
  roundRect(ctx, left, top, 30, 30, 9);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('C', left + 15, top + 21);

  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `650 17px ${FONT}`;
  ctx.fillText(t("算力实验室"), left + 42, top + 21);
  // 必须在 17px 的字体下量宽度：先改字号再量，量出来是缩小的，两段文字会叠在一起
  const brandWidth = ctx.measureText(t("算力实验室")).width;
  ctx.fillStyle = INK_3;
  ctx.font = `400 13px ${FONT}`;
  ctx.fillText('Compute Lab', left + 42 + brandWidth + 12, top + 20);

  // 标题
  ctx.fillStyle = INK;
  ctx.font = `700 40px ${FONT}`;
  const title = ellipsis(ctx, data.title, contentWidth);
  ctx.fillText(title, left, top + 96);

  // 模型与参数
  const sub = `${data.modelName} · ${data.quant.toUpperCase()} · ${data.ctxLabel} 上下文`;
  ctx.fillStyle = INK_2;
  ctx.font = `400 17px ${FONT}`;
  ctx.fillText(ellipsis(ctx, sub, contentWidth), left, top + 132);

  // 指标块
  const statsTop = top + 168;
  const blocks = [
    { label: t("综合评分"), value: `${data.score}`, unit: data.grade === '—' ? t("未评分") : `${data.grade} 级`, tone: GOOD },
    { label: t("整机参考价"), value: money(data.priceCny), unit: '', tone: INK },
    { label: t("可用显存"), value: `${data.vramGb.toFixed(0)}G`, unit: `约 ${Math.round(data.tps)} tok/s`, tone: INK },
  ];
  const blockW = (contentWidth - 20) / 3;
  blocks.forEach((block, index) => {
    const bx = left + index * (blockW + 10);
    ctx.fillStyle = '#FAFBFE';
    roundRect(ctx, bx, statsTop, blockW, 96, 14);
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = INK_3;
    ctx.font = `400 12.5px ${FONT}`;
    ctx.fillText(block.label, bx + 16, statsTop + 26);

    ctx.fillStyle = block.tone;
    ctx.font = `700 27px ${FONT}`;
    ctx.fillText(block.value, bx + 16, statsTop + 64);
    // 同样先量后改字号，否则单位会盖在数字上（48G 和「约 38 tok/s」会挤成「484」）
    const valueWidth = ctx.measureText(block.value).width;

    if (block.unit) {
      ctx.fillStyle = INK_3;
      ctx.font = `400 12.5px ${FONT}`;
      ctx.fillText(block.unit, bx + 16 + valueWidth + 9, statsTop + 63);
    }
  });

  // 显卡与其余部件
  const gpuLine = data.gpus.length > 0 ? `显卡：${data.gpus.join(' + ')}` : t("显卡：未选");
  ctx.fillStyle = INK_2;
  ctx.font = `400 15px ${FONT}`;
  ctx.fillText(ellipsis(ctx, gpuLine, contentWidth), left, statsTop + 142);

  if (data.parts.length > 0) {
    ctx.fillStyle = INK_3;
    ctx.font = `400 13.5px ${FONT}`;
    ctx.fillText(ellipsis(ctx, data.parts.join(' · '), contentWidth), left, statsTop + 168);
  }

  // 显存占用条：留白处放一条真正有信息量的东西，比堆文字有用
  drawMemoryBar(ctx, left, statsTop + 206, contentWidth, data.needGb, data.vramGb, data.headroom);

  // 机箱示意
  drawChassis(ctx, W - pad - 44 - 190, top + 52, data.gpus.reduce((sum, item) => sum + countOf(item), 0));

  // 分隔线 + 页脚
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, H - pad - 62);
  ctx.lineTo(W - pad - 44, H - pad - 62);
  ctx.stroke();

  ctx.fillStyle = INK_3;
  ctx.font = `400 12.5px ${FONT}`;
  ctx.fillText(data.footer, left, H - pad - 36);

  const meta = [data.author ? `分享自 ${data.author}` : null, data.date].filter(Boolean).join(' · ');
  ctx.textAlign = 'right';
  ctx.fillStyle = INK_3;
  ctx.fillText(meta, W - pad - 44, H - pad - 36);
  ctx.textAlign = 'left';

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(t("图片生成失败")));
    }, 'image/png');
  });
}

export function cardFileName(title: string): string {
  // 文件名里带配置名，用户存下来一眼能认出来；去掉 Windows 不允许的字符
  const safe = title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 40);
  return `算力配置-${safe}.png`;
}

export async function downloadShareCard(data: ShareCardData): Promise<void> {
  const blob = await renderShareCard(data);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = cardFileName(data.title);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 立刻 revoke 会让部分浏览器来不及下载，延迟一点更稳
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
