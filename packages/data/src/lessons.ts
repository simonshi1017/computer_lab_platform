import type { LessonRecord } from './types.js';

/**
 * 5 关学习路径。
 *
 * 每关不是「看一段动画」，而是一个必须留下输出物的任务：
 * 选一个模型、交一份估算、搭一套配置、出一份说明书。
 * 没有输出物就不算学会——这是产品的教学底线。
 */

export const LESSONS: LessonRecord[] = [
  {
    id: 'l1',
    level: 1,
    title: '模型入门',
    question: '模型是什么？参数、上下文、能力分别代表什么？',
    output: '选一个「我的第一个模型」，并说清为什么选它',
    points: [
      '参数量 = 有多少个可调旋钮，决定「要多大显存」',
      '上下文 = 一次能记住多少，决定「能读多长的文档」',
      '参数量不等于能力，语种与训练数据同样关键',
      'Dense 与 MoE：一个全员上班，一个分科室干活',
    ],
    links: [
      { label: '模型百科', to: '/models' },
      { label: '概念词典 · 参数量', to: '/glossary' },
    ],
  },
  {
    id: 'l2',
    level: 2,
    title: '显存与算力',
    question: '为什么跑模型要显卡？显存到底怎么算？',
    output: '完成一次显存估算：给定模型 + 量化 + 上下文，算出需要多少 GB',
    points: [
      '显存 = 权重 + KV Cache + 框架开销 + 安全余量',
      '量化把每个参数从 2 字节压到 0.5 字节，但 KV Cache 不跟着降',
      '上下文越长，KV Cache 越大，而且是不成比例地吃',
      '带宽决定速度，容量只决定装不装得下',
    ],
    links: [
      { label: '模型百科 · 显存估算器', to: '/models' },
      { label: '概念词典 · KV Cache', to: '/glossary' },
    ],
  },
  {
    id: 'l3',
    level: 3,
    title: '硬件认知',
    question: '显卡、CPU、内存、电源各自干什么？怎么选？',
    output: '认识六大部件，能说出每个部件「选错的后果」',
    points: [
      '显卡：决定能不能跑、跑多快，是唯一不能省钱的部件',
      'CPU 与内存：影响模型加载与数据准备，太弱会拖后腿',
      '主板：决定能插几张卡、几根内存',
      '电源与散热：决定能不能稳定长跑，选小会跳闸',
    ],
    links: [
      { label: '硬件百科', to: '/hardware' },
      { label: '概念词典 · TDP', to: '/glossary' },
    ],
  },
  {
    id: 'l4',
    level: 4,
    title: '服务器组装',
    question: '如何搭一台能跑模型的本地服务器？',
    output: '保存一套完整配置，拿到六维评估报告',
    points: [
      '先定目标模型，再倒推显存，最后选卡',
      '混插不同型号显卡时，可用显存按最小那张算',
      '电源要 ≥ 整机功耗 × 1.3，不是刚好够',
      '显存留 20% 余量，吃满会在长对话时崩',
    ],
    links: [
      { label: 'DIY 组装台', to: '/builder' },
      { label: '配置推荐', to: '/recommend' },
    ],
  },
  {
    id: 'l5',
    level: 5,
    title: '部署实战',
    question: '从装系统到跑出第一个模型，要几步？',
    output: '生成一份能照着做的部署行动清单',
    points: [
      '装系统 → 装驱动 → 装运行时（Ollama / vLLM）→ 拉模型 → 测通',
      '先跑最小的量化版本验证链路，再换大模型',
      'Ollama 适合单机验证，多人并发要换 vLLM',
      '用固定 prompt 做基线测试，别只看「能出字」',
    ],
    links: [
      { label: '我的说明书', to: '/manual' },
      { label: '概念词典 · Ollama', to: '/glossary' },
    ],
  },
];
