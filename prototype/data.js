/* =========================================================
   Compute Lab — 静态数据集
   说明：价格、功耗、带宽为公开参数的估算中位数，仅用于教学演示
   ========================================================= */

const DATA = {
  models: [
    {
      id: 'qwen25-7b', name: 'Qwen2.5-7B', cn: '通义千问 7B', family: '通义千问',
      vendor: '阿里云', vendorEn: 'Alibaba Cloud', origin: '中国',
      arch: 'Dense 稠密', params: 7.6, layers: 28, hidden: 3584, ctxMax: 32768,
      license: 'Apache-2.0', release: '2024-09', langs: '中文 / 英文 / 29 种语言',
      tag: '入门首选', color: '#6C8CFF',
      scenes: ['日常问答', '文本摘要', '轻量代码', '本地知识库'],
      strong: '中文理解与指令跟随在同尺寸里很突出，32K 上下文，工具链和微调版本最多。',
      weak: '多步推理容易断链，长文细节召回一般，不适合当「专家」用。',
      hwHint: '一张 12–16GB 显卡，整机 ¥6,000 起',
      metaphor: '像一个刚毕业的实习生：知识面不错，反应快，但遇到特别专业的问题会露怯。',
      real: '一台 24GB 显卡的台式机就能流畅跑起来，是最多人「第一次成功」的模型。',
      mistake: '很多人以为 7B 就是「70 亿个汉字」，其实是 76 亿个数字参数，跟文字数量没关系。'
    },
    {
      id: 'llama31-8b', name: 'Llama-3.1-8B', cn: '羊驼 3.1 8B', family: 'Llama',
      vendor: 'Meta', vendorEn: 'Meta AI', origin: '美国',
      arch: 'Dense 稠密', params: 8.0, layers: 32, hidden: 4096, ctxMax: 131072,
      license: 'Llama 3.1 社区许可', release: '2024-07', langs: '英文 / 多语种',
      tag: '超长上下文', color: '#3DE0C0',
      scenes: ['英文写作', 'Agent 工具调用', '研究基线', '长文档问答'],
      strong: '英文能力和函数调用非常稳，128K 上下文，学术界与开源社区的事实基线。',
      weak: '中文表达偏书面、成语和文化语境弱，直接拿去写中文文案会「翻译腔」。',
      hwHint: '一张 16GB 显卡；开满 128K 需要 24GB 以上',
      metaphor: '像一个能一口气读完一本小说还记住细节的助理。',
      real: '12.8 万 token 的上下文，相当于一次能读进去约 20 万字中文。',
      mistake: '上下文开得越大，显存吃得越多。不是免费的自助餐。'
    },
    {
      id: 'qwen25-14b', name: 'Qwen2.5-14B', cn: '通义千问 14B', family: '通义千问',
      vendor: '阿里云', vendorEn: 'Alibaba Cloud', origin: '中国',
      arch: 'Dense 稠密', params: 14.7, layers: 48, hidden: 5120, ctxMax: 32768,
      license: 'Apache-2.0', release: '2024-09', langs: '中文 / 英文 / 多语种',
      tag: '性价比甜点', color: '#A9BBFF',
      scenes: ['代码生成', '结构化抽取', '客服问答', '报告撰写'],
      strong: '中文与代码的平衡点，INT4 后 16GB 卡就能舒服跑，是本地私有化的甜点尺寸。',
      weak: '超过 16K 上下文后显存吃紧，复杂推理仍不如 32B。',
      hwHint: '一张 16GB 显卡（INT4），整机 ¥13,000 左右',
      metaphor: '像一个有三年经验的工程师：比实习生靠谱，又没到专家的架子。',
      real: 'INT4 量化后约 7GB 权重，一张 16GB 卡跑得很舒服。',
      mistake: '「14B 一定比 7B 聪明一倍」是错的，能力提升是渐进的，不是线性的。'
    },
    {
      id: 'qwen25-32b', name: 'Qwen2.5-32B', cn: '通义千问 32B', family: '通义千问',
      vendor: '阿里云', vendorEn: 'Alibaba Cloud', origin: '中国',
      arch: 'Dense 稠密', params: 32.5, layers: 64, hidden: 5120, ctxMax: 32768,
      license: 'Apache-2.0', release: '2024-09', langs: '中文 / 英文 / 多语种',
      tag: '本地旗舰', color: '#FFB454',
      scenes: ['复杂推理', '长文档分析', '代码重构', '企业知识库'],
      strong: '本地能跑的「准专家」档位，中文推理质量接近闭源中杯，可完全私有化。',
      weak: 'FP16 要 65GB 以上；24GB 卡只能 INT4 且上下文要砍，速度明显变慢。',
      hwHint: '48GB 显存起步，或 24GB 卡 + INT4 + 8K 上下文',
      metaphor: '像一个资深专家：能处理复杂推理，但需要更大的办公室（显存）。',
      real: 'INT4 约 15GB，FP16 约 65GB。想舒服跑，建议 48GB 显存起步。',
      mistake: '以为 24GB 卡能随便跑 32B，实际开了 8K 上下文就爆显存。'
    },
    {
      id: 'ds-r1-32b', name: 'DeepSeek-R1-Distill-32B', cn: '深度求索 R1 蒸馏 32B', family: 'DeepSeek-R1',
      vendor: '深度求索', vendorEn: 'DeepSeek', origin: '中国',
      arch: 'Dense 稠密（蒸馏）', params: 32.8, layers: 64, hidden: 5120, ctxMax: 65536,
      license: 'MIT', release: '2025-01', langs: '中文 / 英文',
      tag: '强推理', color: '#5BC8FF',
      scenes: ['数学推理', '代码调试', '逻辑分析', '教学讲解'],
      strong: '会显式输出「思考过程」，数学和代码推理明显强于同尺寸通用模型。',
      weak: '输出冗长、首字延迟高、token 消耗大；简单问答反而显得啰嗦。',
      hwHint: '48GB 显存，或 24GB 卡 INT4 + 4K 上下文',
      metaphor: '一个会在草稿纸上反复验算的理科生，答案更稳，但写得更慢。',
      real: '会先输出一大段「思考过程」，所以同样的 token 预算下，实际回答更短。',
      mistake: '以为它更快 —— 推理模型通常更慢，因为要先「想」。'
    },
    {
      id: 'llama33-70b', name: 'Llama-3.3-70B', cn: '羊驼 3.3 70B', family: 'Llama',
      vendor: 'Meta', vendorEn: 'Meta AI', origin: '美国',
      arch: 'Dense 稠密', params: 70.6, layers: 80, hidden: 8192, ctxMax: 131072,
      license: 'Llama 3.3 社区许可', release: '2024-12', langs: '英文 / 多语种',
      tag: '大模型门槛', color: '#FF5C6C',
      scenes: ['高质量写作', '多语言翻译', '复杂 Agent', '企业级应用'],
      strong: '70B 档位综合能力最强之一，多语言和长文写作质量接近商用 API。',
      weak: 'INT4 也要 40GB 显存，个人硬件成本高、速度慢，更适合团队/机房。',
      hwHint: '双卡 48GB，或单卡 80GB；整机 ¥60,000 起',
      metaphor: '一个真正的专家团队，但你需要一间会议室才能让他们坐下。',
      real: 'INT4 约 40GB，FP16 约 140GB。个人一般用双卡 48GB 或云端。',
      mistake: '以为「量化到 INT4 就能单卡跑」，实际上 KV Cache 和开销才是压垮骆驼的稻草。'
    }
  ],

  gpus: [
    {
      id: 'rtx3060', name: 'RTX 3060 12G', vendor: 'NVIDIA', arch: 'Ampere', klass: '消费级',
      vram: 12, vramType: 'GDDR6', bus: '192-bit', bw: 360, tdp: 170, price: 2000,
      power: '1×8pin', length: '242mm', recPsu: 550, note: '最便宜的 12GB 入场券',
      scene: '入门学习、7B 量化推理、小规模知识库'
    },
    {
      id: 'rtx4060ti16', name: 'RTX 4060 Ti 16G', vendor: 'NVIDIA', arch: 'Ada Lovelace', klass: '消费级',
      vram: 16, vramType: 'GDDR6', bus: '128-bit', bw: 288, tdp: 165, price: 3300,
      power: '1×8pin', length: '245mm', recPsu: 550, note: '显存大但带宽窄',
      scene: '14B 量化、显存焦虑型用户、低功耗静音机'
    },
    {
      id: 'rtx4070tis', name: 'RTX 4070 Ti SUPER 16G', vendor: 'NVIDIA', arch: 'Ada Lovelace', klass: '消费级',
      vram: 16, vramType: 'GDDR6X', bus: '256-bit', bw: 672, tdp: 285, price: 6500,
      power: '1×16pin', length: '305mm', recPsu: 700, note: '16G 里带宽最均衡',
      scene: '14B 流畅推理、游戏与推理两用、均衡装机'
    },
    {
      id: 'rtx4080s', name: 'RTX 4080 SUPER 16G', vendor: 'NVIDIA', arch: 'Ada Lovelace', klass: '消费级',
      vram: 16, vramType: 'GDDR6X', bus: '256-bit', bw: 736, tdp: 320, price: 8000,
      power: '1×16pin', length: '310mm', recPsu: 750, note: '游戏与推理两用',
      scene: '高速 14B 推理、视频生成、创意工作流'
    },
    {
      id: 'rtx3090', name: 'RTX 3090 24G', vendor: 'NVIDIA', arch: 'Ampere', klass: '消费级',
      vram: 24, vramType: 'GDDR6X', bus: '384-bit', bw: 936, tdp: 350, price: 7000,
      power: '2×8pin', length: '313mm', recPsu: 750, note: '二手性价比之王',
      scene: '32B INT4、双卡扩展、预算有限但要大显存'
    },
    {
      id: 'rtx4090', name: 'RTX 4090 24G', vendor: 'NVIDIA', arch: 'Ada Lovelace', klass: '消费级',
      vram: 24, vramType: 'GDDR6X', bus: '384-bit', bw: 1008, tdp: 450, price: 15000,
      power: '1×16pin', length: '336mm', recPsu: 850, note: '个人单卡天花板',
      scene: '32B INT4 主力机、高频本地开发、多模态实验'
    },
    {
      id: 'rtx5090', name: 'RTX 5090 32G', vendor: 'NVIDIA', arch: 'Blackwell', klass: '消费级',
      vram: 32, vramType: 'GDDR7', bus: '512-bit', bw: 1792, tdp: 575, price: 20000,
      power: '1×16pin', length: '304mm', recPsu: 1000, note: '新一代单卡旗舰',
      scene: '32B 舒适推理、长上下文、高吞吐个人工作站'
    },
    {
      id: 'a6000', name: 'RTX A6000 48G', vendor: 'NVIDIA', arch: 'Ampere', klass: '专业卡',
      vram: 48, vramType: 'GDDR6', bus: '384-bit', bw: 768, tdp: 300, price: 30000,
      power: '1×8pin', length: '267mm', recPsu: 700, note: '大显存低功耗',
      scene: '70B INT4 单卡、静音工作站、长期满载'
    },
    {
      id: 'rtx6000ada', name: 'RTX 6000 Ada 48G', vendor: 'NVIDIA', arch: 'Ada Lovelace', klass: '专业卡',
      vram: 48, vramType: 'GDDR6', bus: '384-bit', bw: 960, tdp: 300, price: 55000,
      power: '1×8pin', length: '267mm', recPsu: 700, note: '专业卡里的全能选手',
      scene: '70B INT4 高性能、企业设计/推理一体机'
    },
    {
      id: 'l40s', name: 'L40S 48G', vendor: 'NVIDIA', arch: 'Ada Lovelace', klass: '数据中心',
      vram: 48, vramType: 'GDDR6', bus: '384-bit', bw: 864, tdp: 350, price: 60000,
      power: '1×8pin', length: '267mm', recPsu: 800, note: '机房标准配置',
      scene: '企业推理节点、多卡并行、7×24 运行'
    },
    {
      id: 'a100', name: 'A100 80G', vendor: 'NVIDIA', arch: 'Ampere', klass: '数据中心',
      vram: 80, vramType: 'HBM2e', bus: '5120-bit', bw: 2039, tdp: 400, price: 100000,
      power: '8pin / SXM', length: '267mm', recPsu: 800, note: '训练推理通吃',
      scene: '70B FP16、微调训练、多卡集群'
    },
    {
      id: 'h100', name: 'H100 80G', vendor: 'NVIDIA', arch: 'Hopper', klass: '数据中心',
      vram: 80, vramType: 'HBM3', bus: '5120-bit', bw: 3350, tdp: 700, price: 250000,
      power: '8pin / SXM', length: '267mm', recPsu: 1200, note: '当前算力天花板',
      scene: '大模型训练、超高吞吐推理、科研集群'
    },
    {
      id: 'rx7900xtx', name: 'Radeon RX 7900 XTX 24G', vendor: 'AMD', arch: 'RDNA 3', klass: '消费级',
      vram: 24, vramType: 'GDDR6', bus: '384-bit', bw: 960, tdp: 355, price: 7000,
      power: '2×8pin', length: '287mm', recPsu: 800, note: '显存便宜，ROCm 生态受限',
      scene: '32B INT4 实验、愿意折腾 ROCm 的用户'
    },
    {
      id: 'mi210', name: 'Instinct MI210 64G', vendor: 'AMD', arch: 'CDNA 2', klass: '数据中心',
      vram: 64, vramType: 'HBM2e', bus: '4096-bit', bw: 1638, tdp: 300, price: 60000,
      power: '8pin', length: '267mm', recPsu: 700, note: '需服务器准系统',
      scene: '企业私有化部署、大显存低功耗场景'
    }
  ],

  cpus: [
    { id: 'r5-7600', name: 'Ryzen 5 7600', vendor: 'AMD', cores: '6 核 12 线程', tdp: 65, price: 1400, scene: '单卡入门、日常使用' },
    { id: 'i5-14600k', name: 'i5-14600K', vendor: 'Intel', cores: '14 核 20 线程', tdp: 125, price: 2000, scene: '单卡中端、兼顾游戏' },
    { id: 'r9-7950x', name: 'Ryzen 9 7950X', vendor: 'AMD', cores: '16 核 32 线程', tdp: 170, price: 3800, scene: '双卡、数据预处理密集' },
    { id: 'i9-14900k', name: 'i9-14900K', vendor: 'Intel', cores: '24 核 32 线程', tdp: 253, price: 4300, scene: '高主频、加载大模型快' },
    { id: 'xeon-4410y', name: 'Xeon Silver 4410Y', vendor: 'Intel', cores: '12 核 24 线程', tdp: 150, price: 5200, scene: '多卡服务器、ECC 内存' }
  ],

  mobos: [
    { id: 'b650', name: 'B650 主板', vendor: '华硕 / 技嘉', slots: 1, ramSlots: 4, tdp: 20, price: 1200, note: '单卡入门' },
    { id: 'x670e', name: 'X670E 主板', vendor: '华硕 / 微星', slots: 2, ramSlots: 4, tdp: 25, price: 2800, note: '双卡 x8/x8' },
    { id: 'wr90', name: 'WRX90 工作站主板', vendor: '华硕 Pro WS', slots: 4, ramSlots: 8, tdp: 35, price: 6800, note: '四卡并行' }
  ],

  rams: [
    { id: 'ram32', name: '32GB DDR5', cap: 32, tdp: 8, price: 600 },
    { id: 'ram64', name: '64GB DDR5', cap: 64, tdp: 12, price: 1200 },
    { id: 'ram128', name: '128GB DDR5', cap: 128, tdp: 18, price: 2400 },
    { id: 'ram256', name: '256GB ECC RDIMM', cap: 256, tdp: 24, price: 5200 }
  ],

  psus: [
    { id: 'psu650', name: '650W 金牌', watt: 650, price: 450 },
    { id: 'psu850', name: '850W 金牌', watt: 850, price: 700 },
    { id: 'psu1000', name: '1000W 金牌', watt: 1000, price: 900 },
    { id: 'psu1300', name: '1300W 白金', watt: 1300, price: 1600 },
    { id: 'psu1600', name: '1600W 钛金', watt: 1600, price: 2800 },
    { id: 'psu2000', name: '2000W 白金', watt: 2000, price: 3800 },
    { id: 'psu3200', name: '双 1600W 冗余电源', watt: 3200, price: 5200 }
  ],

  storages: [
    { id: 'ssd1t', name: '1TB NVMe', cap: 1, tdp: 6, price: 450 },
    { id: 'ssd2t', name: '2TB NVMe', cap: 2, tdp: 7, price: 800 },
    { id: 'ssd4t', name: '4TB NVMe', cap: 4, tdp: 8, price: 1600 }
  ],

  coolings: [
    { id: 'air', name: '风冷塔式散热', tdp: 0, price: 200, noise: 42, note: '安静度一般' },
    { id: 'aio240', name: '240 一体水冷', tdp: 0, price: 500, noise: 36, note: '均衡' },
    { id: 'aio360', name: '360 一体水冷', tdp: 0, price: 900, noise: 32, note: '压得住高功耗' },
    { id: 'turbine', name: '机箱风道 + 涡轮', tdp: 0, price: 1200, noise: 55, note: '多卡必备但很吵' }
  ],

  glossary: [
    { t: '参数量', en: 'Parameters', plain: '模型「脑子里有多少个旋钮」。旋钮越多，能记住的规律越复杂。', pro: '神经网络中可训练权重的总数，单位通常为 B（十亿）。7B 表示 70 亿个参数。', myth: '参数量不等于知识量，也不等于一定更聪明。' },
    { t: '显存', en: 'VRAM', plain: '显卡自己的「桌面」。模型和对话内容都得摊在这张桌子上，桌子不够大就摆不下。', pro: 'GPU 板载的高速显存，承载模型权重、KV Cache、激活值与框架开销。', myth: '显存越大不代表越快，带宽才决定生成速度。' },
    { t: '量化', en: 'Quantization', plain: '把一本精装厚书压缩成口袋书：内容还在，细节略损失，但能塞进更小的包。', pro: '将权重从 FP16 降精度到 INT8 / INT4，显存占用约降为 1/2 与 1/4。', myth: 'INT4 不是「免费午餐」，复杂推理任务上会有可感知的掉点。' },
    { t: 'KV Cache', en: 'Key-Value Cache', plain: '聊天时模型用来「记住前面说过什么」的草稿纸，聊得越长，草稿纸越厚。', pro: '推理时缓存历史 token 的 Key/Value 张量，随上下文长度线性增长。', myth: '上下文开大一倍，KV Cache 也差不多翻倍，不是固定开销。' },
    { t: '上下文长度', en: 'Context Window', plain: '模型一次能「记住」多少内容，像工作时摊在桌上的资料总量。', pro: '单次推理可处理的最大 token 数，含输入与输出。', myth: '标称 128K 不代表 128K 时效果一样好，中间内容容易「丢失」。' },
    { t: 'TDP', en: 'Thermal Design Power', plain: '这个部件满负荷时会发多少热，直接决定你的电费和风扇噪音。', pro: '散热设计功耗，单位瓦特。整机功耗约为各部件 TDP 之和 × 1.2。', myth: '电源瓦数越大越费电 —— 错，实际耗电取决于负载。' },
    { t: 'tokens/s', en: 'Tokens per second', plain: '模型每秒能「说」多少个字，是最直观的快慢指标。', pro: '解码阶段的生成速率。1 个中文词约 0.6–1.5 个 token。', myth: '首字延迟和生成速度是两件事，前者取决于预填充。' },
    { t: 'PCIe', en: 'Peripheral Component Interconnect Express', plain: '主板上的「高速公路」，显卡、硬盘都跑在这条路上。', pro: 'CPU 与外设的串行总线标准。多卡推理时 PCIe 带宽会影响并行效率。', myth: '单卡推理几乎跑不满 PCIe 4.0 x16，不必为它过度加钱。' },
    { t: 'FP16 / INT4', en: 'Data Type', plain: '数字用几位来存。位数越少，占地方越小，精度越低。', pro: 'FP16 每参数 2 字节，INT8 为 1 字节，INT4 为 0.5 字节。', myth: '不是所有模型都能无损量化到 INT4。' },
    { t: 'Ollama', en: 'Local LLM Runtime', plain: '一个「一键装模型」的工具，像应用商店，装完就能聊。', pro: '轻量本地推理运行时，支持 GGUF 量化格式与模型拉取。', myth: '装完 Ollama 不等于装完模型，还要 pull。' },
    { t: 'MoE', en: 'Mixture of Experts', plain: '不是所有人都干活：每次只叫醒最懂的那几个专家，省力但总知识量大。', pro: '混合专家架构，总参数大但每 token 只激活部分专家，显存占用仍按总参数算。', myth: 'MoE 推理更省算力，但显存并不会省，全部专家都要装进去。' },
    { t: 'ROCm', en: 'Radeon Open Compute', plain: 'AMD 显卡的「CUDA 平替」，能用，但很多工具还没适配好。', pro: 'AMD 的开放计算平台，生态成熟度低于 CUDA，量化与推理框架支持有限。', myth: 'AMD 卡显存便宜不代表总成本低，踩坑时间也是成本。' }
  ],

  lessons: [
    { id: 1, name: '模型入门', q: '模型是什么？参数量、上下文、能力分别代表什么？', out: '选一个「我的第一个模型」', status: 'done' },
    { id: 2, name: '显存与算力', q: '为什么需要显卡？显存怎么算？量化是什么？', out: '完成一次显存估算', status: 'done' },
    { id: 3, name: '硬件认知', q: '显卡、CPU、内存、电源各自干什么？怎么选？', out: '认识 6 大部件', status: 'current' },
    { id: 4, name: '服务器组装', q: '如何搭一台能跑模型的本地服务器？', out: '保存一套配置 + 评估报告', status: 'locked' },
    { id: 5, name: '部署实战', q: '从装系统到跑出第一个模型', out: '生成部署行动清单', status: 'locked' }
  ],

  presets: {
    save: {
      name: '省钱入门版', desc: '能跑 7B/14B，先跑起来再说',
      gpus: ['rtx3060'], cpu: 'r5-7600', mobo: 'b650', rams: ['ram32', 'ram32'],
      psu: 'psu650', storages: ['ssd1t'], cooling: 'air', model: 'qwen25-7b', quant: 'int4', ctx: 8192
    },
    balance: {
      name: '均衡推荐版', desc: '14B 舒适、32B 勉强，性价比最优',
      gpus: ['rtx4070tis'], cpu: 'r9-7950x', mobo: 'x670e', rams: ['ram64', 'ram64'],
      psu: 'psu1000', storages: ['ssd2t'], cooling: 'aio360', model: 'qwen25-14b', quant: 'int4', ctx: 8192
    },
    perf: {
      name: '性能进阶版', desc: '32B 流畅，70B 可试，一步到位',
      gpus: ['rtx5090'], cpu: 'i9-14900k', mobo: 'x670e', rams: ['ram128', 'ram128'],
      psu: 'psu1300', storages: ['ssd2t', 'ssd4t'], cooling: 'aio360', model: 'qwen25-32b', quant: 'int4', ctx: 16384
    }
  }
};
