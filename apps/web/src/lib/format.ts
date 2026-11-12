/** 千分位价格，不带 ¥ —— 符号交给调用方，方便拼「¥12,800 起」 */
export function fmtNum(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

export function fmtPrice(value: number): string {
  return `¥${fmtNum(value)}`;
}

/** 大额价格压缩显示：12.8 万 */
export function fmtPriceShort(value: number): string {
  if (value >= 10000) {
    const wan = value / 10000;
    return `¥${wan >= 10 ? Math.round(wan) : wan.toFixed(1)}万`;
  }
  return fmtPrice(value);
}

/** 显存保留一位小数，够用且不啰嗦 */
export function fmtGb(value: number): string {
  return `${value.toFixed(1)}`;
}

export function fmtPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** tokens/s 换算成「每秒几个汉字」，中文场景约 0.9 */
export function tpsToChars(tps: number): number {
  return Math.round(tps * 0.9);
}

/** 上下文长度显示：8192 → 8K，131072 → 128K */
export function fmtCtx(tokens: number): string {
  return `${Math.round(tokens / 1024)}K`;
}

/**
 * 显卡名简化：只去掉容量后缀，保留品牌与型号。
 * 之前连「RTX」也去掉了，结果列表里只剩「3060」「4070 Ti」，
 * 用户分不清是 RTX 还是别的系列——省下的 4 个字符不值。
 */
export function shortGpuName(name: string): string {
  const stripped = name.replace(/ \d+GB?$/, '');
  return stripped.length > 18 ? `${stripped.slice(0, 17)}…` : stripped;
}
