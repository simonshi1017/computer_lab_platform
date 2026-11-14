/**
 * 模型尺寸标签。
 *
 * 为什么不用 paramsB 取整：Qwen3.5-35B-A3B 的名字里 35B 是总参数，取整没问题；
 * 但 Qwen3.8-2.4T-A95B 同时有「2.4T」和「A95B」，正则先撞上 A95B 就会把
 * 激活参数当总参数印在徽标上（显示 95B，实际 2.4T）。所以先把 A…B 这段
 * 激活标记剔掉，再按 T → B 的顺序取；都取不到才退回 paramsB。
 */

interface Sized {
  name: string;
  paramsB: number;
}

/** 参数量到千位就换单位，避免徽标里塞四位数字 */
function formatParams(paramsB: number): string {
  if (paramsB >= 1000) {
    const trillions = paramsB / 1000;
    return `${Number.isInteger(trillions) ? trillions : trillions.toFixed(1)}T`;
  }
  return `${Math.round(paramsB)}B`;
}

export function modelSizeLabel(model: Sized): string {
  // A95B / A3B 是「每个 token 激活多少」，不是总参数量
  const cleaned = model.name.replace(/A\d+(?:\.\d+)?B/g, '').replace(/-A\d+(?![.\d])/g, '');

  // 注意 Qwen2.5-14B 这种名字：第一个 \d+[.]?\d*B 会命中 14B，不会误取 2.5
  const trillion = /(\d+(?:\.\d+)?)T(?![a-zA-Z])/.exec(cleaned);
  if (trillion) return `${trillion[1]}T`;

  const billion = /(\d+(?:\.\d+)?)B(?![a-zA-Z])/.exec(cleaned);
  if (billion) return `${billion[1]}B`;

  return formatParams(model.paramsB);
}
