/**
 * 动态文案英文模板（含 ${…} 插值的中文句子）。
 *
 * key 是源码里的中文模板串原文（保留 ${…}），值里用 {0} {1}… 对应
 * dynamicKey() 归一化后的可变片段顺序。中文标点留在 key 里，不进译文。
 * 生成与覆盖率检查：scripts/gen-content-dict.mjs。
 */
export default {
  "${mobo.name} 只有 ${mobo.gpuSlots} 个卡槽，你放了 ${stats.gpus.length} 张。": "{0}has only{1}slots, but you installed{2}GPUs.",
  "${stats.cooling.name} 满载约 ${stats.cooling.noiseDb}dB，建议换 360 水冷或更大机箱。": "{0}is about{1}at full load — consider a{2}mm AIO liquid cooler or a larger chassis.",
  "${stats.cpu.name} 是 ${stats.cpu.socket} 插槽，${mobo.name} 是 ${mobo.socket}，装不上，换其中一件。": "{0}uses an{1}socket, but{2}is{3}— they will not fit. Replace one of them.",
  "${stats.gpus.length} 卡": "{0}GPU(s)",
  "${stats.mobo.gpuSlots} 卡槽 · ${stats.mobo.ramSlots} 内存槽": "{0}GPU slots{1}RAM slots",
  "${tps} tokens/s 偏慢，读起来会一顿一顿，长文生成会比较煎熬。": "{0}is slow — generation stutters and long text feels painful.",
  "${tps} tokens/s 比人阅读速度快，交互体验接近在线服务。": "{0}is faster than reading speed, close to an online service.",
  "先确认系统认到了 ${stats.gpus.length} 张卡。驱动装错版本是最常见的坑，装完必须能看到显存。": "First confirm the system sees{0}GPU(s). A wrong driver version is the most common pitfall — after installing, VRAM must show up.",
  "内存槽已插满（${slotLimit} 条），换成单条更大的内存": "All RAM slots are full ({0}sticks) — switch to fewer, larger sticks.",
  "加一个${quieter.name}，压住长时间满载": "Add {0}to handle sustained full load.",
  "占用 ${need.total.toFixed(1)} / ${stats.vramGb}GB，剩 ${Math.round(headroom * 100)}%，长对话很稳。": "Using{0}, with{1}headroom — stable for long conversations.",
  "可压 ${stats.cooling.capacityW}W · ${stats.cooling.noiseDb}dB": "Handles up to{0}",
  "合计 ${stats.ramGb}GB": "Total{0}",
  "合计 ${stats.vramGb}GB 显存": "Total{0}VRAM",
  "多卡并行要求每张卡放等大的分片，实际可用显存按最小那张算：${stats.vramGb}GB，而不是 ${stats.gpus\n        .reduce((sum, gpu) => sum + gpu.vramGb, 0)\n        .toFixed(0)}GB。": "Multi-GPU sharding requires equal slices, so usable VRAM follows the smallest card:{0}, not{1}.",
  "总价 ${Math.round(stats.priceCny)} 元，预算 ${Math.round(budget)} 元，超 ${Math.round(stats.priceCny - budget)} 元。": "Total cost{0}yuan, budget{1}yuan, over by{2}yuan.",
  "把上下文从 ${contextTokens / 1024}K 降到 4K": "Reduce context from{0}to{1}",
  "换 ${needed}W 电源，别让电源长期满载": "Switch to{0}PSU instead of running the current one at full load.",
  "整机约 ${stats.powerW}W，电源只有 ${psu.watt}W，建议 ≥ ${Math.ceil((stats.powerW * 1.3) / 50) * 50}W。": "System draws about{0}, PSU is only{1}, recommended{2}.",
  "权重 ${need.weights.toFixed(1)}GB，建议内存 ≥ ${(need.weights * 1.5).toFixed(0)}GB，你现在 ${stats.ramGb}GB。": "Weights{0}, recommend RAM{1}, you have{2}.",
  "目标是在 ${fmtCtx(ctx)} 上下文下稳定输出。先问一句短的，确认不出错再压长文本。": "Aim for stable output at{0}context. Start with a short prompt, then move to longer text.",
  "约 ${tpsToChars(tps)} 字/秒": "About{0}chars{1}sec",
  "约 ${tps} tokens/s，读起来会一顿一顿的。": "About{0}— generation will stutter.",
  "缺 ${fmtGb(need.total - stats.vramGb)}G": "Short by{0}",
  "缺少：${missing.join(', ')}。补齐后就能开始评估。": "Missing:{0}Add them to start the evaluation.",
  "负载 ${Math.round((stats.powerW / stats.psu.watt) * 100)}%": "Load{0}",
  "负载约 ${Math.round(psuLoad * 100)}%，长期高负载建议换成 ${Math.ceil((stats.powerW * 1.3) / 50) * 50}W。": "Load about{0}— for sustained high load, switch to{1}.",
  "这套要 ${needed}W，目录里最大只有 ${maxAvailable}W——减一张卡，或换服务器电源方案": "This build needs{0}, but the catalog maximum is{1}Drop a GPU or use a server PSU solution.",
  "需要 ${need.total.toFixed(1)}GB，你只有 ${stats.vramGb}GB。少 ${(need.total - stats.vramGb).toFixed(1)}GB。": "Needs{0}, you have{1}— short by{2}.",
  "内存 ${part.name}": "RAM{0}",
  "散热 ${part.name}": "Cooling{0}",
  "显卡 ${part.name}": "GPU{0}",
  "电源 ${part.name}": "PSU{0}",
  "硬盘 ${part.name}": "Storage{0}",
  "空 PCIe ${index + 1}": "Empty{0}",
  "空内存槽 DIMM${index + 1}": "Empty RAM slot{0}",
  "空盘位 ${index + 1}": "Empty drive bay{0}",
};
