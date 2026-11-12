import type { CoolingRecord, CpuRecord, MoboRecord, PsuRecord, RamRecord, StorageRecord } from './types.js';

/**
 * 除显卡之外的六大部件。
 *
 * 这些部件在组装台里是「配角」，但选错会直接让整机跑不起来：
 * CPU 太弱拖慢加载、主板槽位不够插不了双卡、电源带不动会跳闸。
 */

const UPDATED_AT = '2026-11';
const SOURCE_CPU = 'https://www.amd.com/en/products/processors.html';
const SOURCE_PSU = 'https://www.clearesult.com/80plus';
const SOURCE_COOL = 'https://www.coolermaster.com/';

export const CPUS: CpuRecord[] = [
  { id: 'r5-7600', name: 'Ryzen 5 7600', vendor: 'AMD', cores: '6 核 12 线程', socket: 'AM5', tdpW: 65, priceCny: 1400, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'r7-7700', name: 'Ryzen 7 7700', vendor: 'AMD', cores: '8 核 16 线程', socket: 'AM5', tdpW: 65, priceCny: 2000, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'r9-7950x', name: 'Ryzen 9 7950X', vendor: 'AMD', cores: '16 核 32 线程', socket: 'AM5', tdpW: 170, priceCny: 3800, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'i5-14600k', name: 'Core i5-14600K', vendor: 'Intel', cores: '14 核 20 线程', socket: 'LGA1700', tdpW: 181, priceCny: 2200, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'i9-14900k', name: 'Core i9-14900K', vendor: 'Intel', cores: '24 核 32 线程', socket: 'LGA1700', tdpW: 253, priceCny: 4300, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'xeon-4410y', name: 'Xeon Silver 4410Y', vendor: 'Intel', cores: '12 核 24 线程', socket: 'LGA4677', tdpW: 150, priceCny: 5200, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'tr-7960x', name: 'Threadripper 7960X', vendor: 'AMD', cores: '24 核 48 线程', socket: 'sTR5', tdpW: 350, priceCny: 12000, source: SOURCE_CPU, updatedAt: UPDATED_AT },
];

export const MOBOS: MoboRecord[] = [
  { id: 'b760', name: 'B760 主板', chipset: 'B760', socket: 'LGA1700', gpuSlots: 1, ramSlots: 4, tdpW: 20, priceCny: 1100, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'b650', name: 'B650 主板', chipset: 'B650', socket: 'AM5', gpuSlots: 1, ramSlots: 4, tdpW: 20, priceCny: 1200, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'x670e', name: 'X670E 主板', chipset: 'X670E', socket: 'AM5', gpuSlots: 2, ramSlots: 4, tdpW: 25, priceCny: 2800, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'trx50', name: 'TRX50 工作站主板', chipset: 'TRX50', socket: 'sTR5', gpuSlots: 2, ramSlots: 4, tdpW: 30, priceCny: 4800, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'wrx90', name: 'WRX90 工作站主板', chipset: 'WRX90', socket: 'sTR5', gpuSlots: 4, ramSlots: 8, tdpW: 35, priceCny: 6800, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  // 服务器平台：Xeon 是 LGA4677，没有这块板就永远配不出 Intel 多卡方案
  { id: 'c741', name: 'C741 服务器主板', chipset: 'C741', socket: 'LGA4677', gpuSlots: 4, ramSlots: 8, tdpW: 45, priceCny: 9800, source: SOURCE_CPU, updatedAt: UPDATED_AT },
];

export const RAMS: RamRecord[] = [
  { id: 'ram32', name: '32GB DDR5', kind: 'DDR5 单条', capacityGb: 32, tdpW: 8, priceCny: 600, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'ram64', name: '64GB DDR5', kind: 'DDR5 单条', capacityGb: 64, tdpW: 12, priceCny: 1200, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'ram128', name: '128GB DDR5', kind: 'DDR5 单条', capacityGb: 128, tdpW: 18, priceCny: 2400, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'ram256', name: '256GB ECC RDIMM', kind: 'DDR5 ECC 服务器内存', capacityGb: 256, tdpW: 24, priceCny: 5200, source: SOURCE_CPU, updatedAt: UPDATED_AT },
];

export const PSUS: PsuRecord[] = [
  { id: 'psu650', name: '650W 金牌', level: '80PLUS 金牌', watt: 650, priceCny: 450, source: SOURCE_PSU, updatedAt: UPDATED_AT },
  { id: 'psu850', name: '850W 金牌', level: '80PLUS 金牌', watt: 850, priceCny: 700, source: SOURCE_PSU, updatedAt: UPDATED_AT },
  { id: 'psu1000', name: '1000W 金牌', level: '80PLUS 金牌', watt: 1000, priceCny: 900, source: SOURCE_PSU, updatedAt: UPDATED_AT },
  { id: 'psu1300', name: '1300W 白金', level: '80PLUS 白金', watt: 1300, priceCny: 1600, source: SOURCE_PSU, updatedAt: UPDATED_AT },
  { id: 'psu1600', name: '1600W 钛金', level: '80PLUS 钛金', watt: 1600, priceCny: 2800, source: SOURCE_PSU, updatedAt: UPDATED_AT },
  { id: 'psu2000', name: '2000W 白金', level: '80PLUS 白金', watt: 2000, priceCny: 3800, source: SOURCE_PSU, updatedAt: UPDATED_AT },
  { id: 'psu3200', name: '双 1600W 冗余电源', level: '双电源冗余', watt: 3200, priceCny: 5200, source: SOURCE_PSU, updatedAt: UPDATED_AT },
];

export const STORAGES: StorageRecord[] = [
  { id: 'ssd1t', name: '1TB NVMe', kind: 'PCIe 4.0 NVMe', capacityTb: 1, tdpW: 6, priceCny: 450, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'ssd2t', name: '2TB NVMe', kind: 'PCIe 4.0 NVMe', capacityTb: 2, tdpW: 7, priceCny: 800, source: SOURCE_CPU, updatedAt: UPDATED_AT },
  { id: 'ssd4t', name: '4TB NVMe', kind: 'PCIe 4.0 NVMe', capacityTb: 4, tdpW: 8, priceCny: 1600, source: SOURCE_CPU, updatedAt: UPDATED_AT },
];

/**
 * 散热能力用 capacityW 表达「能压住多少瓦发热」。
 * 这个字段是 M1 引入的硬约束：散热能力不够，评估会直接扣分并给出换散热建议。
 */
export const COOLINGS: CoolingRecord[] = [
  { id: 'air', name: '风冷塔式散热', kind: '风冷', priceCny: 200, noiseDb: 42, capacityW: 200, source: SOURCE_COOL, updatedAt: UPDATED_AT },
  { id: 'aio240', name: '240 一体水冷', kind: '水冷', priceCny: 500, noiseDb: 36, capacityW: 280, source: SOURCE_COOL, updatedAt: UPDATED_AT },
  { id: 'aio360', name: '360 一体水冷', kind: '水冷', priceCny: 900, noiseDb: 32, capacityW: 400, source: SOURCE_COOL, updatedAt: UPDATED_AT },
  { id: 'turbine', name: '机箱风道 + 涡轮', kind: '风道方案', priceCny: 1200, noiseDb: 55, capacityW: 800, source: SOURCE_COOL, updatedAt: UPDATED_AT },
];
