import type { Catalog, ModelSpec } from '../src/types.js';

/**
 * 测试用最小目录。
 * 数值与原型 data.js 对齐，方便黄金用例和原型逐条对拍。
 */

export const MODELS = {
  qwen7b: {
    id: 'qwen25-7b',
    name: 'Qwen2.5-7B',
    vendor: '阿里云',
    arch: 'Dense 稠密',
    paramsB: 7.6,
    layers: 28,
    hiddenDim: 3584,
    ctxMax: 32768,
  },
  qwen14b: {
    id: 'qwen25-14b',
    name: 'Qwen2.5-14B',
    vendor: '阿里云',
    arch: 'Dense 稠密',
    paramsB: 14.7,
    layers: 48,
    hiddenDim: 5120,
    ctxMax: 32768,
  },
  qwen32b: {
    id: 'qwen25-32b',
    name: 'Qwen2.5-32B',
    vendor: '阿里云',
    arch: 'Dense 稠密',
    paramsB: 32.5,
    layers: 64,
    hiddenDim: 5120,
    ctxMax: 32768,
  },
  llama70b: {
    id: 'llama33-70b',
    name: 'Llama-3.3-70B',
    vendor: 'Meta',
    arch: 'Dense 稠密',
    paramsB: 70.6,
    layers: 80,
    hiddenDim: 8192,
    ctxMax: 131072,
  },
  custom27b: {
    id: 'custom-27b',
    name: '自定义 27B',
    vendor: '自定义',
    arch: '按同尺寸中位数估算',
    paramsB: 27,
    layers: 64,
    hiddenDim: 5120,
    ctxMax: 131072,
  },
} satisfies Record<string, ModelSpec>;

export const CATALOG: Catalog = {
  gpus: [
    { id: 'rtx3060', name: 'RTX 3060 12G', vendor: 'NVIDIA', gpuClass: '消费级', vramGb: 12, bandwidth: 360, tdpW: 170, priceCny: 2000 },
    { id: 'rtx4070tis', name: 'RTX 4070 Ti SUPER 16G', vendor: 'NVIDIA', gpuClass: '消费级', vramGb: 16, bandwidth: 672, tdpW: 285, priceCny: 6500 },
    { id: 'rtx3090', name: 'RTX 3090 24G', vendor: 'NVIDIA', gpuClass: '消费级', vramGb: 24, bandwidth: 936, tdpW: 350, priceCny: 7000 },
    { id: 'rtx4090', name: 'RTX 4090 24G', vendor: 'NVIDIA', gpuClass: '消费级', vramGb: 24, bandwidth: 1008, tdpW: 450, priceCny: 15000 },
    { id: 'rtx5090', name: 'RTX 5090 32G', vendor: 'NVIDIA', gpuClass: '消费级', vramGb: 32, bandwidth: 1792, tdpW: 575, priceCny: 20000 },
    { id: 'a6000', name: 'RTX A6000 48G', vendor: 'NVIDIA', gpuClass: '专业卡', vramGb: 48, bandwidth: 768, tdpW: 300, priceCny: 30000 },
    { id: 'h100-80', name: 'H100 80G', vendor: 'NVIDIA', gpuClass: '数据中心', vramGb: 80, bandwidth: 3350, tdpW: 700, priceCny: 250000 },
    { id: 'rx7900xtx', name: 'Radeon RX 7900 XTX 24G', vendor: 'AMD', gpuClass: '消费级', vramGb: 24, bandwidth: 960, tdpW: 355, priceCny: 7000 },
  ],
  cpus: [
    { id: 'r5-7600', name: 'Ryzen 5 7600', cores: '6 核 12 线程', socket: 'AM5', tdpW: 65, priceCny: 1400 },
    { id: 'r9-7950x', name: 'Ryzen 9 7950X', cores: '16 核 32 线程', socket: 'AM5', tdpW: 170, priceCny: 3800 },
    { id: 'i9-14900k', name: 'i9-14900K', cores: '24 核 32 线程', socket: 'LGA1700', tdpW: 253, priceCny: 4300 },
    { id: 'xeon-4410y', name: 'Xeon Silver 4410Y', cores: '12 核 24 线程', socket: 'LGA4677', tdpW: 150, priceCny: 5200 },
  ],
  mobos: [
    { id: 'b650', name: 'B650 主板', socket: 'AM5', gpuSlots: 1, ramSlots: 4, tdpW: 20, priceCny: 1200 },
    { id: 'x670e', name: 'X670E 主板', socket: 'AM5', gpuSlots: 2, ramSlots: 4, tdpW: 25, priceCny: 2800 },
    { id: 'wrx90', name: 'WRX90 工作站主板', socket: 'sTR5', gpuSlots: 4, ramSlots: 8, tdpW: 35, priceCny: 6800 },
  ],
  rams: [
    { id: 'ram32', name: '32GB DDR5', capacityGb: 32, tdpW: 8, priceCny: 600 },
    { id: 'ram64', name: '64GB DDR5', capacityGb: 64, tdpW: 12, priceCny: 1200 },
    { id: 'ram128', name: '128GB DDR5', capacityGb: 128, tdpW: 18, priceCny: 2400 },
    { id: 'ram256', name: '256GB ECC RDIMM', capacityGb: 256, tdpW: 24, priceCny: 5200 },
  ],
  psus: [
    { id: 'psu650', name: '650W 金牌', watt: 650, priceCny: 450 },
    { id: 'psu850', name: '850W 金牌', watt: 850, priceCny: 700 },
    { id: 'psu1000', name: '1000W 金牌', watt: 1000, priceCny: 900 },
    { id: 'psu1300', name: '1300W 白金', watt: 1300, priceCny: 1600 },
    { id: 'psu1600', name: '1600W 钛金', watt: 1600, priceCny: 2800 },
    { id: 'psu2000', name: '2000W 白金', watt: 2000, priceCny: 3800 },
    { id: 'psu3200', name: '双 1600W 冗余电源', watt: 3200, priceCny: 5200 },
  ],
  storages: [
    { id: 'ssd1t', name: '1TB NVMe', capacityTb: 1, tdpW: 6, priceCny: 450 },
    { id: 'ssd2t', name: '2TB NVMe', capacityTb: 2, tdpW: 7, priceCny: 800 },
    { id: 'ssd4t', name: '4TB NVMe', capacityTb: 4, tdpW: 8, priceCny: 1600 },
  ],
  coolings: [
    { id: 'air', name: '风冷塔式散热', priceCny: 200, noiseDb: 42, capacityW: 200 },
    { id: 'aio240', name: '240 一体水冷', priceCny: 500, noiseDb: 36, capacityW: 280 },
    { id: 'aio360', name: '360 一体水冷', priceCny: 900, noiseDb: 32, capacityW: 400 },
    { id: 'turbine', name: '机箱风道 + 涡轮', priceCny: 1200, noiseDb: 55, capacityW: 800 },
  ],
};

/** 原型里的「均衡推荐版」 */
export const BALANCE_BUILD = {
  gpuIds: ['rtx4070tis'],
  cpuId: 'r9-7950x',
  moboId: 'x670e',
  ramIds: ['ram64', 'ram64'],
  psuId: 'psu1000',
  storageIds: ['ssd2t'],
  coolingId: 'aio360',
};
