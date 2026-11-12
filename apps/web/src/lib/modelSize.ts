/**
 * 模型尺寸标签。
 *
 * 为什么不用 paramsB 取整：Qwen2.5-14B 的实际参数量是 14.7B，
 * 取整会显示成「15B」，和卡片标题里的「14B」自相矛盾，用户会以为数据错了。
 * 所以优先从模型名里取业内通行的尺寸标签，取不到才退回参数四舍五入。
 */

interface Sized {
  name: string;
  paramsB: number;
}

export function modelSizeLabel(model: Sized): string {
  // 注意 Qwen2.5-14B 这种名字：第一个 \d+[.]?\d*B 会命中 14B，不会误取 2.5
  const hit = /(\d+(?:\.\d+)?)B(?![a-zA-Z])/.exec(model.name);
  if (hit) return `${hit[1]}B`;
  return `${Math.round(model.paramsB)}B`;
}
