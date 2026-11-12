import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../src/index.js';

describe('engine 骨架', () => {
  it('能正常导出', () => {
    expect(typeof ENGINE_VERSION).toBe('string');
  });
});
