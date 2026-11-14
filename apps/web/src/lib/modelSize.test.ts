import { describe, expect, it } from 'vitest';
import { MODELS_LIST } from '@/data';
import { modelSizeLabel } from './modelSize';

describe('modelSizeLabel', () => {
  it('从名字里取业内通行的尺寸，不被小数点骗到', () => {
    expect(modelSizeLabel({ name: 'Qwen2.5-14B-Instruct', paramsB: 14.7 })).toBe('14B');
    expect(modelSizeLabel({ name: 'Qwen3.5-9B', paramsB: 9 })).toBe('9B');
  });

  it('MoE 取总参数，不取激活参数', () => {
    expect(modelSizeLabel({ name: 'Qwen3.5-35B-A3B', paramsB: 35 })).toBe('35B');
    expect(modelSizeLabel({ name: 'Qwen3.8-2.4T-A95B', paramsB: 2400 })).toBe('2.4T');
  });

  it('名字里没有尺寸时，按 paramsB 换算，千位以上用 T', () => {
    expect(modelSizeLabel({ name: 'Kimi-K3', paramsB: 2780 })).toBe('2.8T');
    expect(modelSizeLabel({ name: 'Kimi-K2.7-Code', paramsB: 1000 })).toBe('1T');
    expect(modelSizeLabel({ name: 'GLM-5.3-Flash', paramsB: 320 })).toBe('320B');
  });

  it('整个目录的标签都是短的，不会把徽标撑破', () => {
    for (const model of MODELS_LIST) {
      const label = modelSizeLabel(model);
      expect(label.length, `${model.id} 的标签 ${label} 太长`).toBeLessThanOrEqual(5);
      // 所有尺寸标签都必须带单位，且不能出现激活参数的影子（A95B → 95B）
      expect(label, `${model.id} 的标签 ${label} 看着像激活参数`).toMatch(/^[\d.]+(B|T)$/);
    }
  });
});
