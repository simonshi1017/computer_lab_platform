/* =========================================================
   Compute Lab — 交互逻辑
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const fmt = (n) => new Intl.NumberFormat('zh-CN').format(Math.round(n));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const byId = (list, id) => list.find((x) => x.id === id);
const M = (id) => byId(DATA.models, id);
const G = (id) => byId(DATA.gpus, id);
const C = (id) => byId(DATA.cpus, id);
const MB = (id) => byId(DATA.mobos, id);
const R = (id) => byId(DATA.rams, id);
const P = (id) => byId(DATA.psus, id);
const S = (id) => byId(DATA.storages, id);
const CL = (id) => byId(DATA.coolings, id);

/* 当前目标模型：内置库 or 自定义参数 */
function curModel() {
  if (state.modelId === 'custom') return state.customModel || customModel(27);
  return M(state.modelId);
}

/* ---------------- state ---------------- */
const state = {
  view: 'home',
  build: { gpus: [], cpu: null, mobo: null, rams: [], psu: null, storages: [], cooling: null },
  modelId: 'qwen25-7b',
  quant: 'int4',
  ctx: 8192,
  budget: 25000,
  compare: [],
  customModel: null,
  paletteTab: 'gpu',
  modelFilter: 'all',
  gpuFilter: 'all',
  budgetFilter: 'all'
};

/* ---------------- 计算模型 ---------------- */
const BYTES = { fp16: 2, int8: 1, int4: 0.5 };
const GB = 1024 ** 3;

function weightGB(params, quant) {
  return (params * BYTES[quant] * 1e9) / GB;
}
function kvGB(model, ctx, quant) {
  const kvDim = Math.round(model.hidden / 4); // GQA 近似：KV 头维度约为隐藏维度的 1/4
  const bytes = quant === 'fp16' ? 2 : 2;
  return (2 * model.layers * kvDim * ctx * 1 * bytes) / 1e9;
}
function vramNeed(model, quant, ctx) {
  const w = weightGB(model.params, quant);
  const kv = kvGB(model, ctx, quant);
  const raw = w + kv;
  const overhead = raw * 0.12;
  const margin = (raw + overhead) * 0.2;
  return { weights: w, kv, overhead, margin, total: raw + overhead + margin };
}

function buildStats() {
  const b = state.build;
  const gpus = b.gpus.map(G);
  const cpu = b.cpu ? C(b.cpu) : null;
  const mobo = b.mobo ? MB(b.mobo) : null;
  const rams = b.rams.map(R);
  const psu = b.psu ? P(b.psu) : null;
  const storages = b.storages.map(S);
  const cooling = b.cooling ? CL(b.cooling) : null;

  const vramRaw = gpus.reduce((a, x) => a + x.vram, 0);
  // 混插不同型号显卡时，多卡并行按最小那张卡切分分片
  const mixed = gpus.length > 1 && new Set(gpus.map((g) => g.id)).size > 1;
  const vram = mixed ? Math.min(...gpus.map((g) => g.vram)) * gpus.length : vramRaw;
  const ramGB = rams.reduce((a, x) => a + x.cap, 0);
  const tdpList = [
    ...gpus.map((g) => g.tdp),
    cpu ? cpu.tdp : 0,
    mobo ? mobo.tdp : 0,
    ...rams.map((r) => r.tdp),
    ...storages.map((s) => s.tdp)
  ];
  const power = Math.round(tdpList.reduce((a, x) => a + x, 0) * 1.2);
  const price =
    gpus.reduce((a, x) => a + x.price, 0) +
    (cpu ? cpu.price : 0) +
    (mobo ? mobo.price : 0) +
    rams.reduce((a, x) => a + x.price, 0) +
    (psu ? psu.price : 0) +
    storages.reduce((a, x) => a + x.price, 0) +
    (cooling ? cooling.price : 0);
  const elec = (power / 1000) * 8 * 30 * 0.6;

  return { gpus, cpu, mobo, rams, psu, storages, cooling, vram, ramGB, power, price, elec, mixed };
}

function estimateTps(model, gpus, quant, ctx) {
  if (!gpus.length) return 0;
  const w = weightGB(model.params, quant);
  const bw = gpus.reduce((a, g) => a + g.bw, 0) * (gpus.length > 1 ? 0.78 : 1);
  let tps = (bw * 0.5) / Math.max(w, 0.6);
  const ctxPenalty = 1 - clamp(ctx / model.ctxMax, 0, 1) * 0.22;
  tps *= ctxPenalty;
  return clamp(Math.round(tps), 1, 220);
}

/* ---------------- 评估 ---------------- */
function evaluate() {
  const b = state.build;
  const s = buildStats();
  const model = curModel();
  const need = vramNeed(model, state.quant, state.ctx);
  const empty = { empty: true, dims: [], risks: [], suggests: [], score: 0, grade: '—', tps: 0, need, stats: s, model };

  const hasCore = s.gpus.length && s.cpu && s.psu && s.mobo;
  if (!hasCore) {
    const missing = [];
    if (!s.gpus.length) missing.push('显卡');
    if (!s.cpu) missing.push('CPU');
    if (!s.mobo) missing.push('主板');
    if (!s.psu) missing.push('电源');
    const risks = [{ level: 'info', title: '还差几个核心部件', desc: `缺少：${missing.join('、')}。补齐后就能开始评估。` }];
    return { ...empty, risks, suggests: [{ label: '一键载入「均衡推荐版」跑通流程', action: 'preset:balance' }] };
  }

  const headroom = s.vram ? (s.vram - need.total) / s.vram : -1;
  const psuLoad = s.psu ? s.power / s.psu.watt : 0;
  let tps = estimateTps(model, s.gpus, state.quant, state.ctx);
  if (need.total > s.vram) tps = 0;

  /* --- 兼容性 30% --- */
  let compat = 100;
  const risks = [];
  if (need.total > s.vram) {
    compat -= 62;
    risks.push({ level: 'err', title: '显存放不下这个模型', desc: `需要 ${need.total.toFixed(1)}GB，你只有 ${s.vram}GB。少 ${(need.total - s.vram).toFixed(1)}GB。` });
  } else if (headroom < 0.1) {
    compat -= 12;
    risks.push({ level: 'warn', title: '显存余量不到 10%', desc: '能跑，但长对话可能突然中断。建议留 20% 余量。' });
  }
  if (s.psu.watt < s.power * 1.05) {
    compat -= 42;
    risks.push({ level: 'err', title: '电源带不动', desc: `整机约 ${s.power}W，电源只有 ${s.psu.watt}W，建议 ≥ ${Math.ceil((s.power * 1.3) / 50) * 50}W。` });
  } else if (s.psu.watt < s.power * 1.25) {
    compat -= 10;
    risks.push({ level: 'warn', title: '电源余量偏紧', desc: `负载约 ${Math.round(psuLoad * 100)}%，长期高负载建议换成 ${Math.ceil((s.power * 1.3) / 50) * 50}W。` });
  }
  if (s.mobo.slots < s.gpus.length) {
    compat -= 30;
    risks.push({ level: 'err', title: '主板插不下这么多卡', desc: `${s.mobo.name} 只有 ${s.mobo.slots} 个卡槽，你放了 ${s.gpus.length} 张。` });
  } else if (s.gpus.length > 1 && s.mobo.id === 'b650') {
    compat -= 8;
    risks.push({ level: 'warn', title: '多卡跑在 x8 甚至 x4 上', desc: '入门主板拆分通道后带宽有限，双卡效率会打折。' });
  }
  if (s.ramGB < need.weights * 1.2) {
    compat -= 22;
    risks.push({ level: 'err', title: '系统内存不够加载', desc: `权重 ${need.weights.toFixed(1)}GB，建议内存 ≥ ${(need.weights * 1.5).toFixed(0)}GB，你现在 ${s.ramGB}GB。` });
  } else if (s.ramGB < need.weights * 1.5) {
    compat -= 8;
    risks.push({ level: 'warn', title: '加载会比较慢', desc: '内存低于权重 1.5 倍时，加载阶段容易触发磁盘交换。' });
  }
  if (!s.cooling) {
    compat -= 10;
    risks.push({ level: 'warn', title: '还没选散热方案', desc: '高功耗显卡长时间满载，机箱风道必须规划好。' });
  }
  if (s.mixed) {
    compat -= 8;
    risks.push({ level: 'warn', title: '混插了不同型号的显卡', desc: `多卡并行要求每张卡放等大的分片，实际可用显存按最小那张算：${s.vram}GB，而不是 ${s.gpus.reduce((a, g) => a + g.vram, 0)}GB。` });
  }
  compat = clamp(compat, 0, 100);

  /* --- 性能 25% --- */
  let perf = clamp(26 + tps * 0.55 + headroom * 26, 0, 100);
  if (need.total > s.vram) perf = Math.min(perf, 22);
  if (tps < 6 && need.total <= s.vram) risks.push({ level: 'warn', title: '生成速度偏慢', desc: `约 ${tps} tokens/s，读起来会一顿一顿的。` });

  /* --- 成本 15% --- */
  const ratio = s.price / state.budget;
  let cost;
  if (ratio <= 0.85) cost = 100 - ratio * 8;
  else if (ratio <= 1) cost = 92 - (ratio - 0.85) * 300;
  else cost = Math.max(18, 47 - (ratio - 1) * 90);
  if (ratio > 1) risks.push({ level: 'warn', title: '超出预算', desc: `总价 ${fmt(s.price)} 元，预算 ${fmt(state.budget)} 元，超 ${fmt(s.price - state.budget)} 元。` });

  /* --- 功耗与散热 15% --- */
  let thermo;
  if (psuLoad > 0.92) thermo = 26;
  else if (psuLoad > 0.8) thermo = 58;
  else if (psuLoad >= 0.55) thermo = 94;
  else if (psuLoad >= 0.4) thermo = 84;
  else thermo = 70;
  if (s.cooling && s.cooling.noise >= 50) {
    thermo -= 18;
    risks.push({ level: 'warn', title: '噪声可能比较明显', desc: `${s.cooling.name} 满载约 ${s.cooling.noise}dB，建议换 360 水冷或更大机箱。` });
  }
  if (s.power > 900) thermo -= 10;
  thermo = clamp(thermo, 0, 100);

  /* --- 扩展性 10% --- */
  const freeGpuSlots = Math.max(0, (s.mobo.slots || 0) - s.gpus.length);
  const freeRamSlots = Math.max(0, 4 - s.rams.length);
  let expand = 35 + freeGpuSlots * 18 + freeRamSlots * 7 + (psuLoad < 0.6 ? 12 : 0);
  expand = clamp(expand, 0, 100);

  /* --- 学习匹配 5% --- */
  let match = 78;
  if (need.total <= s.vram * 0.85 && s.price <= state.budget) match = 96;
  if (need.total > s.vram) match = 40;
  if (s.price > state.budget * 1.3) match -= 18;
  match = clamp(match, 0, 100);

  const dims = [
    { key: '兼容性', v: compat, w: 0.3, hint: '能装在一起吗？' },
    { key: '性能', v: perf, w: 0.25, hint: '跑得动吗？快不快？' },
    { key: '成本', v: cost, w: 0.15, hint: '贵不贵？' },
    { key: '功耗散热', v: thermo, w: 0.15, hint: '会不会吵/热？' },
    { key: '扩展性', v: expand, w: 0.1, hint: '以后还能升级吗？' },
    { key: '学习匹配', v: match, w: 0.05, hint: '适合你现在吗？' }
  ];
  const score = Math.round(dims.reduce((a, d) => a + d.v * d.w, 0));
  const grade = score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D';

  /* --- 建议 --- */
  const suggests = [];
  if (need.total > s.vram) {
    if (state.quant !== 'int4') suggests.push({ label: `量化降到 INT4，显存占用省一半`, action: 'quant:int4' });
    if (state.ctx > 4096) suggests.push({ label: `把上下文从 ${state.ctx / 1024}K 降到 4K`, action: 'ctx:4096' });
    suggests.push({ label: '换成显存更大的显卡（+1 张或上一档）', action: 'goto:hardware' });
  } else if (headroom < 0.2) {
    suggests.push({ label: '把上下文降到 4K，留出 20% 余量', action: 'ctx:4096' });
  }
  if (s.psu.watt < s.power * 1.3) suggests.push({ label: `换 ${Math.ceil((s.power * 1.3) / 50) * 50}W 电源，别让电源长期满载`, action: 'psu:auto' });
  if (s.ramGB < need.weights * 1.5) suggests.push({ label: '内存加到权重 1.5 倍以上，加载更快', action: 'ram:auto' });
  if (!s.cooling) suggests.push({ label: '加一个 360 水冷，压住长时间满载', action: 'cooling:aio360' });
  if (s.price > state.budget) suggests.push({ label: '看看「省钱入门版」，同样能跑 7B', action: 'preset:save' });
  if (!suggests.length) suggests.push({ label: '这套已经很均衡了，去生成说明书并开始部署', action: 'manual' });

  if (headroom >= 0.2 && need.total <= s.vram) {
    risks.push({ level: 'ok', title: '显存余量充足', desc: `占用 ${need.total.toFixed(1)} / ${s.vram}GB，剩 ${(headroom * 100).toFixed(0)}%，长对话很稳。` });
  }

  return { dims, score, grade, risks, suggests, tps, need, stats: s, model };
}

/* ---------------- 雷达图 ---------------- */
function radarSVG(dims) {
  const cx = 112, cy = 106, r = 74;
  const n = 6;
  const pt = (i, radius) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
  };
  let grid = '';
  [0.25, 0.5, 0.75, 1].forEach((k) => {
    const pts = Array.from({ length: n }, (_, i) => pt(i, r * k).map((v) => v.toFixed(1)).join(',')).join(' ');
    grid += `<polygon class="rd-grid" points="${pts}"/>`;
  });
  let axes = '';
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(i, r);
    axes += `<line class="rd-axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }
  let labels = '';
  const anchors = ['middle', 'start', 'start', 'middle', 'end', 'end'];
  dims.forEach((d, i) => {
    const [x, y] = pt(i, r + 19);
    const v = d ? d.v : 0;
    labels += `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anchors[i]}" font-size="10" fill="var(--text-2)" font-family="Inter,PingFang SC,sans-serif">${d ? d.key : ''}</text>`;
    labels += `<text x="${x.toFixed(1)}" y="${(y + 14).toFixed(1)}" text-anchor="${anchors[i]}" font-size="9.5" fill="#6C8CFF" font-family="JetBrains Mono,monospace">${d ? Math.round(v) : ''}</text>`;
  });
  const poly = dims.length
    ? dims.map((d, i) => pt(i, (r * Math.max(d.v, 3)) / 100).map((v) => v.toFixed(1)).join(',')).join(' ')
    : '';
  return `<svg width="224" height="212" viewBox="0 0 224 212">
    <defs><radialGradient id="rg" cx="50%" cy="50%"><stop offset="0%" stop-color="#6C8CFF" stop-opacity=".55"/><stop offset="100%" stop-color="#3DE0C0" stop-opacity=".18"/></radialGradient></defs>
    ${grid}${axes}
    ${poly ? `<polygon class="rd-poly" points="${poly}" fill="url(#rg)"/>` : ''}
    ${dims.map((d, i) => { const [x, y] = pt(i, (r * Math.max(d.v, 3)) / 100); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#fff" stroke="#6C8CFF" stroke-width="1.5"/>`; }).join('')}
    ${labels}
  </svg>`;
}

/* ---------------- 视图切换 ---------------- */
const TITLES = {
  home: ['学习', '知识地图'], path: ['学习', '学习路径'], glossary: ['学习', '概念词典'],
  models: ['探索', '模型百科'], hardware: ['探索', '硬件百科'],
  recommend: ['实战', '配置推荐'], builder: ['实战', 'DIY 组装台'], manual: ['实战', '我的说明书']
};

function go(view) {
  state.view = view;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  const [a, b] = TITLES[view] || ['', ''];
  $('#crumb').innerHTML = `<span>${a}</span><span class="sep">/</span><b>${b}</b>`;
  $('#views').scrollTop = 0;
  if (view === 'manual') renderManual();
  if (view === 'recommend') renderRecommend();
}

/* ---------------- 渲染：学习路径 ---------------- */
function renderPath() {
  const wrap = $('#lessonList');
  wrap.innerHTML = DATA.lessons.map((l) => {
    const cfg = l.status === 'done' ? { badge: 'badge-ok', text: '已完成', op: .25 }
      : l.status === 'current' ? { badge: 'badge-info', text: '进行中', op: 1 }
        : { badge: 'badge-mute', text: '未解锁', op: .5 };
    const icon = l.status === 'done' ? 'i-check' : l.status === 'current' ? 'i-play' : 'i-lock';
    return `<div class="card pad" style="display:flex;gap:16px;align-items:center;opacity:${l.status === 'locked' ? .62 : 1}">
      <div style="width:42px;height:42px;border-radius:12px;flex:0 0 42px;display:grid;place-items:center;
        background:${l.status === 'current' ? 'linear-gradient(135deg,#6C8CFF,#3DE0C0)' : l.status === 'done' ? 'rgba(61,220,132,.1)' : 'var(--surface-2)'};
        border:1px solid ${l.status === 'current' ? 'transparent' : l.status === 'done' ? 'rgba(61,220,132,.24)' : 'var(--border)'};
        color:${l.status === 'current' ? '#06111A' : l.status === 'done' ? '#6FE9A5' : 'var(--text-3)'}">
        <svg width="17" height="17"><use href="#${icon}"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:9px">
          <span class="mono" style="font-size:10.5px;color:var(--text-3)">LEVEL ${l.id}</span>
          <b style="font-size:14.5px;font-weight:620">${l.name}</b>
          <span class="badge ${cfg.badge}">${cfg.text}</span>
        </div>
        <div style="font-size:12.5px;color:var(--text-2);margin-top:3px">${l.q}</div>
        <div style="font-size:11.5px;color:var(--text-3);margin-top:4px">
          输出物 · <span style="color:var(--accent-ink)">${l.out}</span>
        </div>
      </div>
      <button class="btn ${l.status === 'current' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-go="${l.id === 4 ? 'builder' : l.status === 'locked' ? 'noop' : 'path'}">
        ${l.status === 'done' ? '复习' : l.status === 'current' ? '继续学习' : '未解锁'}
      </button>
    </div>`;
  }).join('');
}

/* ---------------- 渲染：模型 ---------------- */
const MODEL_FILTERS = [
  { id: 'all', label: '全部' }, { id: 'small', label: '7–8B 入门' },
  { id: 'mid', label: '14B 甜点' }, { id: 'large', label: '32B 旗舰' }, { id: 'xl', label: '70B 门槛' }
];
function modelPass(m) {
  if (state.modelFilter === 'small') return m.params < 10;
  if (state.modelFilter === 'mid') return m.params >= 10 && m.params < 20;
  if (state.modelFilter === 'large') return m.params >= 20 && m.params < 50;
  if (state.modelFilter === 'xl') return m.params >= 50;
  return true;
}
function renderModels() {
  $('#modelFilters').innerHTML = MODEL_FILTERS.map((f) =>
    `<button class="chip ${state.modelFilter === f.id ? 'active' : ''}" data-mfilter="${f.id}">${f.label}</button>`
  ).join('');
  $('#modelGrid').innerHTML = DATA.models.filter(modelPass).map((m) => {
    const need4 = vramNeed(m, 'int4', 8192).total;
    return `<div class="card model-card" data-model="${m.id}">
      <div class="top">
        <div class="model-sigil" style="color:${m.color}">${m.params.toFixed(0)}B</div>
        <div style="flex:1;min-width:0">
          <h4 title="${m.name}">${m.name}</h4>
          <div class="fam">${m.vendor} · ${m.arch}</div>
        </div>
        <span class="badge badge-info">${m.tag}</span>
      </div>
      <div class="model-meta">
        <div><div class="k">参数</div><div class="v">${m.params}B</div></div>
        <div><div class="k">上下文</div><div class="v">${Math.round(m.ctxMax / 1024)}K</div></div>
        <div><div class="k">INT4 需</div><div class="v">${need4.toFixed(1)}G</div></div>
      </div>
      <div class="tag-row" style="margin-top:10px">${m.scenes.slice(0, 3).map((s) => `<span class="tag-chip">${s}</span>`).join('')}</div>
      <div class="quote clamp2">${m.strong}</div>
    </div>`;
  }).join('');
}

/* ---------------- 渲染：硬件 ---------------- */
const GPU_FILTERS = [{ id: 'all', label: '全部' }, { id: '消费级', label: '消费级' }, { id: '专业卡', label: '专业卡' }, { id: '数据中心', label: '数据中心' }];
const BUDGET_FILTERS = [{ id: 'all', label: '不限预算' }, { id: 'low', label: '≤ ¥5,000' }, { id: 'mid', label: '¥5,000–15,000' }, { id: 'high', label: '≥ ¥15,000' }];

function renderHardware() {
  $('#gpuFilters').innerHTML =
    GPU_FILTERS.map((f) => `<button class="chip ${state.gpuFilter === f.id ? 'active' : ''}" data-gfilter="${f.id}">${f.label}</button>`).join('') +
    `<span style="width:1px;height:20px;background:var(--border);margin:0 6px"></span>` +
    BUDGET_FILTERS.map((f) => `<button class="chip ${state.budgetFilter === f.id ? 'active' : ''}" data-bfilter="${f.id}">${f.label}</button>`).join('');

  const list = DATA.gpus.filter((g) => {
    if (state.gpuFilter !== 'all' && g.klass !== state.gpuFilter) return false;
    if (state.budgetFilter === 'low') return g.price <= 5000;
    if (state.budgetFilter === 'mid') return g.price > 5000 && g.price < 15000;
    if (state.budgetFilter === 'high') return g.price >= 15000;
    return true;
  });

  $('#gpuGrid').innerHTML = list.map((g) => {
    const fits = DATA.models.filter((m) => vramNeed(m, 'int4', 8192).total <= g.vram * 0.92);
    const sizeOf = (m) => (m.name.match(/(\d+(?:\.\d+)?)B/) || [, m.params.toFixed(0)])[1];
    const fit = fits.length
      ? `<span class="badge badge-ok" title="按 INT4 · 8K 上下文估算">最大 ${sizeOf(fits[fits.length - 1])}B</span>`
      : `<span class="badge badge-err">放不下 7B</span>`;
    return `<div class="card gpu-card" data-gpu="${g.id}" style="cursor:pointer">
      <div class="gpu-head">
        <div class="gpu-chip"><svg><use href="#i-cpu"/></svg></div>
        <div style="flex:1;min-width:0">
          <div class="gpu-name" title="${g.name}">${g.name}</div>
          <div class="gpu-class">${g.vendor} · ${g.arch} · ${g.klass}</div>
        </div>
      </div>
      <div class="gpu-specs">
        <div><div class="k">显存</div><div class="v">${g.vram}G</div></div>
        <div><div class="k">带宽</div><div class="v">${g.bw}</div></div>
        <div><div class="k">功耗</div><div class="v">${g.tdp}W</div></div>
      </div>
      <div class="gpu-foot">
        <div>
          <div class="price">¥${fmt(g.price)}</div>
          <div style="font-size:10px;color:var(--text-3)">参考价 · 估算</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          ${fit}
          <button class="btn btn-soft btn-sm" data-addgpu="${g.id}">装机</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const parts = [
    { icon: 'i-cpu', t: 'CPU', d: '负责数据预处理与模型加载，不直接决定生成速度，但太弱会拖慢加载。', n: DATA.cpus.length },
    { icon: 'i-board', t: '主板', d: '决定你能插几张卡、几条内存。多卡必须看 PCIe 通道拆分。', n: DATA.mobos.length },
    { icon: 'i-ram', t: '内存', d: '不是显存。模型权重先读进内存再进显存，建议 ≥ 权重 1.5 倍。', n: DATA.rams.length },
    { icon: 'i-psu', t: '电源', d: '按整机功耗 ×1.3 选。功率大不代表更费电，只代表供得上。', n: DATA.psus.length },
    { icon: 'i-fan', t: '散热', d: '决定噪音与降频。多卡高功耗场景，风道比单个风扇更重要。', n: DATA.coolings.length }
  ];
  $('#partGrid').innerHTML = parts.map((p) => `
    <div class="card pad" style="cursor:default">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div class="rec-icon"><svg><use href="#${p.icon}"/></svg></div>
        <div style="font-size:13.5px;font-weight:620">${p.t}</div>
        <span class="badge badge-mute" style="margin-left:auto">${p.n} 款</span>
      </div>
      <div style="font-size:12px;color:var(--text-2);line-height:1.6">${p.d}</div>
    </div>`).join('');
}

/* ---------------- 渲染：组装台 ---------------- */
const PALETTE_TABS = [
  { id: 'gpu', label: '显卡' }, { id: 'cpu', label: 'CPU' }, { id: 'mobo', label: '主板' },
  { id: 'ram', label: '内存' }, { id: 'psu', label: '电源' }, { id: 'storage', label: '存储' }, { id: 'cooling', label: '散热' }
];

function renderPalette() {
  $('#paletteTabs').innerHTML = PALETTE_TABS.map((t) =>
    `<button class="ptab ${state.paletteTab === t.id ? 'active' : ''}" data-ptab="${t.id}">${t.label}</button>`
  ).join('');

  const items = {
    gpu: DATA.gpus.map((g) => ({ id: g.id, kind: 'gpu', t: g.name.replace('RTX ', '').replace('Radeon ', '').replace('Instinct ', ''), s: `${g.vram}GB · ${g.bw}GB/s · ¥${fmt(g.price)}`, tag: g.klass })),
    cpu: DATA.cpus.map((c) => ({ id: c.id, kind: 'cpu', t: c.name, s: `${c.cores} · ${c.tdp}W · ¥${fmt(c.price)}` })),
    mobo: DATA.mobos.map((m) => ({ id: m.id, kind: 'mobo', t: m.name, s: `${m.slots} 卡槽 · ${m.ramSlots} 内存 · ¥${fmt(m.price)}` })),
    ram: DATA.rams.map((r) => ({ id: r.id, kind: 'ram', t: r.name, s: `${r.cap}GB · ¥${fmt(r.price)}` })),
    psu: DATA.psus.map((p) => ({ id: p.id, kind: 'psu', t: p.name, s: `${p.watt}W · ¥${fmt(p.price)}` })),
    storage: DATA.storages.map((s) => ({ id: s.id, kind: 'storage', t: s.name, s: `${s.cap}TB · ¥${fmt(s.price)}` })),
    cooling: DATA.coolings.map((c) => ({ id: c.id, kind: 'cooling', t: c.name, s: `¥${fmt(c.price)} · 约 ${c.noise}dB` }))
  }[state.paletteTab];

  $('#paletteBody').innerHTML = items.map((it) => `
    <div class="pitem" draggable="true" data-kind="${it.kind}" data-id="${it.id}">
      <div class="t">${it.t}${it.tag ? `<span class="tag">${it.tag}</span>` : ''}</div>
      <div class="s">${it.s}</div>
    </div>`).join('');
}

/* =========================================================
   机箱实体示意图（开盖侧视）
   ========================================================= */
const HW = {
  pcb: '#16332A', pcbEdge: '#2E5C4B', plate: '#0F131C', edge: '#3B465C',
  metal: '#8E99AC', ink: '#CBD5E5', dim: '#64708A', slot: '#070B12'
};

function fanBlades(cx, cy, r) {
  const blades = [];
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 * Math.PI) / 180;
    const a2 = a + 0.62;
    const x1 = cx + Math.cos(a) * r * 0.22;
    const y1 = cy + Math.sin(a) * r * 0.22;
    const x2 = cx + Math.cos(a2) * r * 0.86;
    const y2 = cy + Math.sin(a2) * r * 0.86;
    const cx1 = cx + Math.cos(a + 0.31) * r * 0.82;
    const cy1 = cy + Math.sin(a + 0.31) * r * 0.82;
    blades.push(`M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx1.toFixed(1)},${cy1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
  }
  return `<g class="fan-blades"><path d="${blades.join(' ')}" fill="none" stroke="rgba(186,200,224,.55)" stroke-width="1.5" stroke-linecap="round"/></g>`;
}

function fan(cx, cy, r, spin = true) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0A0E16" stroke="#39415A" stroke-width="1"/>
    ${spin ? fanBlades(cx, cy, r) : ''}
    <circle cx="${cx}" cy="${cy}" r="${Math.max(2.4, r * 0.2)}" fill="#39415A"/>`;
}

function rmBtn(key, x, y) {
  return `<g class="rm" data-rm="${key}">
    <circle cx="${x}" cy="${y}" r="8.5" fill="#0B0F16" stroke="#4A5568" stroke-width="1"/>
    <path d="M${x - 3} ${y - 3} l6 6 M${x + 3} ${y - 3} l-6 6" stroke="#CBD5E5" stroke-width="1.4" stroke-linecap="round"/>
  </g>`;
}

function chassisSVG(b, s) {
  const gpus = b.gpus.map(G);
  const cpu = b.cpu ? C(b.cpu) : null;
  const psu = b.psu ? P(b.psu) : null;
  const cool = b.cooling ? CL(b.cooling) : null;
  const mobo = b.mobo ? MB(b.mobo) : null;
  const rams = b.rams.map(R);
  const storages = b.storages.map(S);
  const o = [];

  o.push(`<defs>
    <linearGradient id="hwShell" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#343C50"/><stop offset="100%" stop-color="#191E2B"/>
    </linearGradient>
    <linearGradient id="hwGpu" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3B4460"/><stop offset="100%" stop-color="#1D2432"/>
    </linearGradient>
    <linearGradient id="hwPsu" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2B3244"/><stop offset="100%" stop-color="#151A24"/>
    </linearGradient>
    <linearGradient id="hwRad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2A3244"/><stop offset="100%" stop-color="#1A2030"/>
    </linearGradient>
  </defs>`);

  /* ---------- 机箱外壳 ---------- */
  o.push(`<rect x="12" y="8" width="656" height="600" rx="20" fill="url(#hwShell)" stroke="#4A5470" stroke-width="1.5"/>`);
  o.push(`<rect x="26" y="22" width="628" height="572" rx="12" fill="${HW.plate}" stroke="#232A39" stroke-width="1"/>`);
  o.push(`<rect x="28" y="24" width="26" height="568" rx="7" fill="#1B2231" stroke="#2B3346"/>
    <circle cx="41" cy="50" r="4.2" fill="#3DDC84" opacity=".9"/>
    <circle cx="41" cy="50" r="7" fill="none" stroke="rgba(61,220,132,.28)"/>
    <rect x="35" y="68" width="12" height="3.2" rx="1.6" fill="#39415A"/>
    <rect x="35" y="76" width="12" height="3.2" rx="1.6" fill="#39415A"/>
    <rect x="33" y="96" width="16" height="440" rx="4" fill="rgba(108,140,255,.05)" stroke="#242C3C"/>
    <path d="M37 120 H45 M37 240 H45 M37 360 H45 M37 480 H45" stroke="#2A3244" stroke-width="2"/>`);
  [[34, 30], [646, 30], [34, 586], [646, 586]].forEach(([x, y]) => {
    o.push(`<circle cx="${x}" cy="${y}" r="3" fill="#5A657F"/><path d="M${x - 2} ${y} h4" stroke="#0F131C" stroke-width="1"/>`);
  });

  /* ---------- 顶部散热冷排 ---------- */
  o.push(`<g class="slot ${cool ? 'filled' : ''}" data-slot="cooling" data-accept="cooling">
    ${cool
      ? `<rect x="56" y="34" width="548" height="54" rx="8" fill="url(#hwRad)" stroke="#4A5470" stroke-width="1.2"/>
         <rect x="56" y="34" width="548" height="54" rx="8" fill="none" stroke="rgba(255,255,255,.06)"/>
         ${[0, 1, 2].map((i) => fan(118 + i * 150, 61, 21)).join('')}
         <text x="596" y="52" text-anchor="end" font-size="11.5" fill="${HW.ink}">${cool.name}</text>
         <text x="596" y="67" text-anchor="end" font-size="10" fill="${HW.dim}">${cool.noise}dB</text>`
      : `<rect x="56" y="34" width="548" height="54" rx="8" fill="rgba(108,140,255,.04)" stroke="#3B465C" stroke-dasharray="7 5"/>
         <text x="330" y="66" text-anchor="middle" font-size="12.5" fill="${HW.dim}">散热冷排 · 拖入或点击</text>`}
  </g>`);

  /* ---------- 主板 ---------- */
  o.push(`<g class="slot ${mobo ? 'filled' : ''}" data-slot="mobo" data-accept="mobo">
    ${mobo
      ? `<rect x="60" y="96" width="460" height="414" rx="9" fill="${HW.pcb}" stroke="${HW.pcbEdge}" stroke-width="1.3"/>
         <rect x="60" y="96" width="460" height="414" rx="9" fill="none" stroke="rgba(255,255,255,.05)"/>
         ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${92 + i * 58} 108 V498" stroke="rgba(190,255,220,.045)" stroke-width="1"/>`).join('')}
         ${[[76, 112], [504, 112], [76, 494], [504, 494], [290, 300]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="none" stroke="#4A7A66" stroke-width="1.2"/>`).join('')}
         <rect x="88" y="214" width="74" height="26" rx="3" fill="#24382F" stroke="#3E5C4F"/>
         ${[0, 1, 2, 3, 4, 5].map((k) => `<path d="M${96 + k * 11} 218 V236" stroke="#335145" stroke-width="2"/>`).join('')}
         <rect x="418" y="398" width="86" height="66" rx="5" fill="#24382F" stroke="#3E5C4F"/>
         <path d="M424 410 h74 M424 422 h74 M424 434 h74 M424 446 h74" stroke="#335145" stroke-width="1.6"/>
         <rect x="492" y="128" width="17" height="76" rx="2" fill="#1E2B26" stroke="#3E5C4F"/>
         ${Array.from({ length: 8 }, (_, k) => `<rect x="495" y="${133 + k * 9}" width="11" height="5" rx="1" fill="rgba(190,255,220,.18)"/>`).join('')}
         <rect x="300" y="176" width="150" height="11" rx="2" fill="#0E1F1A" stroke="#3E5C4F"/>
         <rect x="306" y="179" width="138" height="5" rx="1" fill="rgba(190,255,220,.1)"/>
         <text x="300" y="172" font-size="7.5" fill="rgba(190,255,220,.4)">M.2 NVMe</text>
         ${[[300, 128], [320, 128], [340, 128], [470, 300], [470, 316], [470, 332]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.2" fill="#1B2A24" stroke="#3E5C4F"/>`).join('')}
         <text x="74" y="503" font-size="10" fill="rgba(190,255,220,.5)">${mobo.name}</text>`
      : `<rect x="60" y="96" width="460" height="414" rx="9" fill="rgba(108,140,255,.035)" stroke="#3B465C" stroke-dasharray="7 5"/>
         <text x="402" y="192" text-anchor="middle" font-size="13" fill="${HW.dim}">主板 · 先装底板</text>
         <text x="402" y="212" text-anchor="middle" font-size="10.5" fill="#4C576C">所有部件都插在它上面</text>`}
    <rect class="hit" x="60" y="96" width="460" height="414" rx="9"/>
    ${mobo ? rmBtn('mobo', 512, 104) : ''}
  </g>`);

  /* ---------- CPU + 插槽 ---------- */
  o.push(`<g class="slot ${cpu ? 'filled' : ''}" data-slot="cpu" data-accept="cpu">
    ${cpu
      ? `<rect x="86" y="120" width="80" height="80" rx="4" fill="#20283A" stroke="#4A5470"/>
         <rect x="94" y="128" width="64" height="64" rx="3" fill="#8C97AC" stroke="#B9C4D6" stroke-width="1.2"/>
         <rect x="94" y="128" width="64" height="64" rx="3" fill="url(#hwGpu)" opacity=".18"/>
         <text x="126" y="157" text-anchor="middle" font-size="9.5" fill="#1A1F2B" font-weight="700">CPU</text>
         <text x="126" y="170" text-anchor="middle" font-size="9" fill="#2B3244">${cpu.name.split(' ')[0]}</text>
         <text x="126" y="214" text-anchor="middle" font-size="10" fill="${HW.dim}">${cpu.cores}</text>`
      : `<rect x="86" y="120" width="80" height="80" rx="4" fill="#0C1119" stroke="#3B465C" stroke-dasharray="6 4"/>
         <rect x="94" y="128" width="64" height="64" rx="2" fill="none" stroke="#2E3648"/>
         <path d="M94 128 l10 0 M94 128 l0 10" stroke="#4C576C" stroke-width="1.4"/>
         <text x="126" y="167" text-anchor="middle" font-size="12" fill="${HW.dim}">CPU</text>`}
    <rect class="hit" x="84" y="118" width="84" height="84" rx="5"/>
    ${cpu ? rmBtn('cpu', 158, 128) : ''}
  </g>`);

  /* ---------- 内存 ---------- */
  for (let i = 0; i < 4; i++) {
    const r = rams[i];
    const x = 204 + i * 24;
    o.push(`<g class="slot ${r ? 'filled' : ''}" data-slot="ram${i}" data-accept="ram">
      ${r
        ? `<rect x="${x}" y="122" width="15" height="176" rx="3" fill="#2A3450" stroke="#54608A"/>
           <rect x="${x + 2}" y="128" width="11" height="164" rx="2" fill="#3C4A6E"/>
           ${[0, 1, 2, 3].map((k) => `<rect x="${x + 3}" y="${140 + k * 38}" width="9" height="26" rx="1.5" fill="rgba(255,255,255,.07)"/>`).join('')}
           <text transform="rotate(-90 ${x + 7.5} 244)" x="${x + 7.5}" y="244" text-anchor="middle" font-size="10.5" fill="#C9D6F0">${r.cap}G</text>
           <rect x="${x}" y="298" width="15" height="4" rx="2" fill="#6C8CFF" opacity=".7"/>`
        : `<rect x="${x}" y="122" width="15" height="176" rx="3" fill="#0A0E16" stroke="#33405A"/>
           <rect x="${x + 1.5}" y="126" width="12" height="168" rx="2" fill="none" stroke="#232C3E"/>
           <text transform="rotate(-90 ${x + 7.5} 226)" x="${x + 7.5}" y="226" text-anchor="middle" font-size="9.5" fill="#4C576C">DIMM${i + 1}</text>`}
      <rect class="hit" x="${x - 3}" y="118" width="21" height="184" rx="4"/>
      ${r ? rmBtn('ram' + i, x + 18, 128) : ''}
    </g>`);
  }

  /* ---------- 显卡 ---------- */
  const NV = '#76B900', AMD = '#ED1C24';
  for (let i = 0; i < 4; i++) {
    const g = gpus[i];
    const y = 316 + i * 48;
    if (g) {
      const led = g.vendor === 'AMD' ? AMD : NV;
      const short = g.name.replace('RTX ', '').replace('Radeon ', '').replace(' SUPER', 'S').replace('Ti SUPER', 'TiS');
      o.push(`<g class="slot filled" data-slot="gpu${i}" data-accept="gpu">
        <rect x="64" y="${y + 13}" width="96" height="9" rx="2" fill="#05080D" stroke="#2E3648"/>
        <rect x="70" y="${y}" width="332" height="38" rx="6" fill="url(#hwGpu)" stroke="#5A6580" stroke-width="1.2"/>
        <rect x="70" y="${y}" width="332" height="38" rx="6" fill="none" stroke="rgba(255,255,255,.07)"/>
        ${fan(104, y + 19, 11.5)}${fan(140, y + 19, 11.5)}${fan(176, y + 19, 11.5)}
        <rect x="204" y="${y + 8}" width="2.5" height="22" rx="1.2" fill="${led}" opacity=".9"/>
        <text x="217" y="${y + 16}" font-size="12" font-weight="600" fill="${HW.ink}">${short}</text>
        <text x="217" y="${y + 30}" font-size="9.5" fill="${HW.dim}">${g.vram}GB · ${g.bw}GB/s · ${g.tdp}W</text>
        <rect x="70" y="${y + 34}" width="332" height="4" rx="2" fill="#0B0F16"/>
        <rect class="hit" x="66" y="${y - 4}" width="340" height="46" rx="8"/>
        ${rmBtn('gpu' + i, 396, y + 5)}
      </g>`);
    } else {
      o.push(`<g class="slot" data-slot="gpu${i}" data-accept="gpu">
        <rect x="64" y="${y + 13}" width="96" height="9" rx="2" fill="#05080D" stroke="#2E3648"/>
        <rect x="66" y="${y + 1}" width="336" height="36" rx="6" fill="rgba(108,140,255,.03)" stroke="#3B465C" stroke-dasharray="6 5"/>
        <text x="284" y="${y + 24}" text-anchor="middle" font-size="11.5" fill="${HW.dim}">PCIe ${i + 1} · 空槽</text>
        <rect class="hit" x="62" y="${y - 4}" width="344" height="46" rx="8"/>
      </g>`);
    }
  }

  /* ---------- 电源 ---------- */
  o.push(`<g class="slot ${psu ? 'filled' : ''}" data-slot="psu" data-accept="psu">
    ${psu
      ? `<rect x="60" y="522" width="204" height="56" rx="7" fill="url(#hwPsu)" stroke="#4A5470" stroke-width="1.2"/>
         ${fan(100, 550, 19, false)}
         <text x="132" y="546" font-size="13" font-weight="600" fill="${HW.ink}">${psu.watt}W</text>
         <text x="132" y="561" font-size="10" fill="${HW.dim}">${(psu.name.match(/[^\dW\s]+$/) || ['金牌'])[0]}</text>`
      : `<rect x="60" y="522" width="204" height="56" rx="7" fill="rgba(108,140,255,.035)" stroke="#3B465C" stroke-dasharray="6 5"/>
         <text x="162" y="556" text-anchor="middle" font-size="11.5" fill="${HW.dim}">电源 · 拖入或点击</text>`}
    <rect class="hit" x="58" y="520" width="208" height="60" rx="8"/>
    ${psu ? rmBtn('psu', 252, 530) : ''}
  </g>`);

  /* ---------- 硬盘位 ---------- */
  for (let i = 0; i < 2; i++) {
    const st = storages[i];
    const y = 130 + i * 52;
    o.push(`<g class="slot ${st ? 'filled' : ''}" data-slot="storage${i}" data-accept="storage">
      ${st
        ? `<rect x="548" y="${y}" width="88" height="42" rx="5" fill="#232B3C" stroke="#4A5470"/>
           <rect x="552" y="${y + 3}" width="80" height="36" rx="3" fill="#2E3850"/>
           <text x="592" y="${y + 19}" text-anchor="middle" font-size="11.5" font-weight="600" fill="${HW.ink}">${st.cap}TB</text>
           <text x="592" y="${y + 32}" text-anchor="middle" font-size="9.5" fill="${HW.dim}">NVMe</text>
           <circle cx="630" cy="${y + 7}" r="2" fill="#3DDC84"/>`
        : `<rect x="548" y="${y}" width="88" height="42" rx="5" fill="rgba(108,140,255,.03)" stroke="#3B465C" stroke-dasharray="5 4"/>
           <text x="592" y="${y + 25}" text-anchor="middle" font-size="10.5" fill="${HW.dim}">SSD ${i + 1}</text>`}
      <rect class="hit" x="546" y="${y - 3}" width="92" height="48" rx="6"/>
      ${st ? rmBtn('storage' + i, 640, y + 4) : ''}
    </g>`);
  }

  /* ---------- 走线槽 + 机身铭牌 ---------- */
  o.push(`<path d="M536 108 V500" stroke="#1E2533" stroke-width="3" stroke-linecap="round"/>`);

  return o.join('\n');
}

function renderChassis() {
  const b = state.build;
  const s = buildStats();

  $('#chassisSvg').innerHTML = chassisSVG(b, s);

  // presets
  $('#presetRow').innerHTML = Object.entries(DATA.presets).map(([k, p]) =>
    `<button class="preset-btn" data-preset="${k}"><span class="n">${p.name}</span><span class="p">${p.desc.split('，')[0]}</span></button>`
  ).join('');

  // metrics
  $('#m-vram').textContent = s.vram;
  $('#m-ram').textContent = s.ramGB;
  $('#m-power').textContent = s.power;
  $('#m-price').textContent = fmt(s.price);
  $('#m-elec').textContent = fmt(s.elec);

  const led = $('#chassisLed');
  const st = $('#chassisStatus');
  const filled = b.gpus.length + (b.cpu ? 1 : 0) + (b.mobo ? 1 : 0) + (b.psu ? 1 : 0) + b.rams.length;
  led.style.background = filled === 0 ? '#5F6B7F' : '#3DDC84';
  st.textContent = filled === 0 ? '待装机' : `${filled} 个部件已就位`;
}

/* ---------------- 评估面板 ---------------- */
let simTimer = null;
function renderEval() {
  const r = evaluate();
  const need = r.need;

  // charts
  const dims = r.dims;
  $('#radar').innerHTML = radarSVG(dims.length ? dims : []);
  const arc = $('#scoreArc');
  const circ = 201;
  arc.style.strokeDashoffset = String(circ - (circ * r.score) / 100);
  $('#scoreGrade').textContent = r.grade;
  $('#scoreGrade').style.color = r.score >= 80 ? '#6FE9A5' : r.score >= 60 ? '#FFC879' : r.score > 0 ? '#FF8A95' : 'var(--text-3)';

  if (r.empty) {
    $('#scoreTitle').textContent = '还没有配置';
    $('#scoreDesc').textContent = '拖入部件后，这里会给出总评分和一句话结论。';
  } else {
    const fits = need.total <= r.stats.vram;
    $('#scoreTitle').textContent = `${r.score} 分 · ${r.grade} 级`;
    $('#scoreDesc').textContent = fits
      ? `这套配置适合 ${r.model.name}（${state.quant.toUpperCase()} · ${state.ctx / 1024}K），显存占用 ${need.total.toFixed(1)}/${r.stats.vram}GB。`
      : `这套配置跑 ${r.model.name} 会爆显存：需要 ${need.total.toFixed(1)}GB，只有 ${r.stats.vram}GB。`;
  }

  // risks
  const iconMap = { err: 'i-alert', warn: 'i-alert', ok: 'i-check', info: 'i-info' };
  const clsMap = { err: 'r-err', warn: 'r-warn', ok: 'r-ok', info: '' };
  $('#riskList').innerHTML = r.risks.length
    ? r.risks.map((x) => `<div class="risk ${clsMap[x.level]}"><div class="ic"><svg><use href="#${iconMap[x.level]}"/></svg></div><div><b>${x.title}</b><br/><span>${x.desc}</span></div></div>`).join('')
    : `<div class="risk r-ok"><div class="ic"><svg><use href="#i-check"/></svg></div><div><span>没有发现明显问题。</span></div></div>`;

  $('#suggestWrap').innerHTML = r.suggests.map((s) =>
    `<button class="suggest-btn" data-act="${s.action}">${s.label}<span class="plus">+</span></button>`
  ).join('');

  // sim
  $('#simTps').textContent = r.tps ? r.tps : '—';
  $('#simChars').textContent = r.tps ? Math.round(r.tps * 0.9) : '—';
  $('#simModel').textContent = r.empty ? '未选择模型' : `${r.model.name} · ${state.quant.toUpperCase()} · ${state.ctx / 1024}K`;

  runSim(r);
}

function runSim(r) {
  clearTimeout(simTimer);
  const el = $('#termText');
  if (r.empty) { el.textContent = '等待配置…'; return; }
  const fits = r.need.total <= r.stats.vram;
  const head = fits
    ? `已加载 ${r.model.name}，显存 ${r.need.total.toFixed(1)}/${r.stats.vram}GB`
    : `显存不足，加载失败（需 ${r.need.total.toFixed(1)}GB / 有 ${r.stats.vram}GB）`;
  const body = fits
    ? '你好，我是运行在你本地显卡上的模型。现在这行字，是按照你配置的速度一个字一个字打出来的。'
    : '试试降低量化、减少上下文，或者换一张显存更大的卡。';
  const text = `${head}\n> ${body}`;

  let i = 0;
  const speed = clamp(r.tps * 0.9, 4, 120);
  const step = () => {
    if (i >= text.length) return;
    i++;
    el.textContent = text.slice(0, i);
    simTimer = setTimeout(step, Math.max(10, 1000 / speed));
  };
  el.textContent = '';
  step();
}

/* ---------------- 组装操作 ---------------- */
function addPart(kind, id) {
  const b = state.build;
  if (kind === 'gpu') {
    const maxSlots = b.mobo ? MB(b.mobo).slots : 4;
    if (b.gpus.length >= Math.min(4, maxSlots)) {
      toast(b.mobo ? `当前主板只有 ${maxSlots} 个卡槽，插不下了` : '最多先放 4 张卡');
      return;
    }
    b.gpus.push(id);
  } else if (kind === 'ram') {
    if (b.rams.length >= 4) { toast('内存插槽已满（4 条）'); return; }
    b.rams.push(id);
  } else if (kind === 'storage') {
    if (b.storages.length >= 2) { toast('硬盘位已满（2 个）'); return; }
    b.storages.push(id);
  } else {
    b[kind] = id;
    if (kind === 'mobo' && b.gpus.length > MB(id).slots) {
      b.gpus = b.gpus.slice(0, MB(id).slots);
      toast('主板卡槽变少，多余的显卡已移除');
    }
  }
  refreshBuilder();
}

function removeSlot(key) {
  const b = state.build;
  if (key.startsWith('gpu')) b.gpus.splice(+key.slice(3), 1);
  else if (key.startsWith('ram')) b.rams.splice(+key.slice(3), 1);
  else if (key.startsWith('storage')) b.storages.splice(+key.slice(7), 1);
  else b[key] = null;
  refreshBuilder();
}

function refreshBuilder() {
  renderChassis();
  renderEval();
  saveBuild();
}

function applyPreset(key, silent) {
  const p = DATA.presets[key];
  if (!p) return;
  state.build = {
    gpus: [...p.gpus], cpu: p.cpu, mobo: p.mobo, rams: [...p.rams],
    psu: p.psu, storages: [...p.storages], cooling: p.cooling
  };
  state.modelId = p.model;
  state.quant = p.quant;
  state.ctx = p.ctx;
  refreshBuilder();
  if (!silent) toast(`已载入「${p.name}」`);
}

/* ---------------- toast ---------------- */
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<svg width="14" height="14" style="color:var(--good-ink)"><use href="#i-check"/></svg>${msg}`;
  $('#toastWrap').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; el.style.transition = '.24s'; }, 2000);
  setTimeout(() => el.remove(), 2300);
}

/* ---------------- 弹窗 ---------------- */
const mask = $('#mask');
function openModal(html) {
  $('#modalBody').innerHTML = html;
  mask.classList.add('show');
}
function closeModal() { mask.classList.remove('show'); }
mask.addEventListener('click', (e) => { if (e.target === mask) closeModal(); });

function modelModal(id) {
  const m = M(id);
  if (!m) return;
  if (state.ctx > m.ctxMax) state.ctx = m.ctxMax;
  const q = state.quant;
  const need = vramNeed(m, q, state.ctx);
  const tps1 = estimateTps(m, [G('rtx4090')], q, state.ctx);
  openModal(`
    <div class="modal-head">
      <div class="model-sigil" style="color:${m.color};width:44px;height:44px;flex:0 0 44px">${m.params.toFixed(0)}B</div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <h3 style="font-size:17px;font-weight:650;letter-spacing:-.02em">${m.name}</h3>
          <span class="badge badge-info">${m.tag}</span>
        </div>
        <div class="vendor-line" style="margin-top:3px">
          <span class="vendor-dot"></span>${m.vendor} · ${m.arch} · ${m.release} 发布
        </div>
      </div>
      <button class="close-x" onclick="closeModal()"><svg width="14" height="14"><use href="#i-close"/></svg></button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:14px">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:6px">生活化比喻</div>
        <div style="font-size:12.5px;line-height:1.65;color:var(--text)">${m.metaphor}</div>
      </div>
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:14px">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:6px">真实数字</div>
        <div style="font-size:12.5px;line-height:1.65;color:var(--text)">${m.real}</div>
      </div>
    </div>

    <div class="spec-grid" style="margin-bottom:14px">
      <div><div class="k">厂商</div><div class="v">${m.vendor}</div></div>
      <div><div class="k">架构</div><div class="v">${m.arch}</div></div>
      <div><div class="k">许可证</div><div class="v">${m.license}</div></div>
      <div><div class="k">语言</div><div class="v" style="font-size:11px">${m.langs}</div></div>
      <div><div class="k">参数量</div><div class="v mono">${m.params}B</div></div>
      <div><div class="k">网络层数</div><div class="v mono">${m.layers} 层</div></div>
      <div><div class="k">隐藏维度</div><div class="v mono">${m.hidden}</div></div>
      <div><div class="k">最大上下文</div><div class="v mono">${Math.round(m.ctxMax / 1024)}K</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
      <div style="padding:13px 14px;border-radius:12px;background:rgba(61,220,132,.06);border:1px solid rgba(61,220,132,.2)">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--good-ink);margin-bottom:5px">擅长</div>
        <div style="font-size:12px;line-height:1.65;color:var(--text-2)">${m.strong}</div>
      </div>
      <div style="padding:13px 14px;border-radius:12px;background:rgba(255,180,84,.06);border:1px solid rgba(255,180,84,.2)">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--warn-ink);margin-bottom:5px">不适合</div>
        <div style="font-size:12px;line-height:1.65;color:var(--text-2)">${m.weak}</div>
      </div>
    </div>

    <div style="margin-bottom:16px">
      <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:7px">典型使用场景</div>
      <div class="tag-row">${m.scenes.map((s) => `<span class="tag-chip">${s}</span>`).join('')}</div>
    </div>

    <div style="border:1px solid var(--border);border-radius:14px;padding:16px;background:linear-gradient(180deg,rgba(108,140,255,.06),transparent)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div style="font-size:12.5px;font-weight:600">显存估算器</div>
        <div class="seg" id="qSeg">
          ${['fp16', 'int8', 'int4'].map((x) => `<button data-q="${x}" class="${q === x ? 'active' : ''}">${x.toUpperCase()}</button>`).join('')}
        </div>
      </div>
      <div class="big-vram"><span class="n mono" id="vramNum">${need.total.toFixed(1)}</span><span style="color:var(--text-2);font-size:12px">GB 显存需求 <span class="est">估算</span></span></div>
      <div class="slider-row">
        <label>上下文</label>
        <input type="range" id="ctxRange" min="2048" max="${m.ctxMax}" step="2048" value="${state.ctx}" />
        <span class="slider-val mono" id="ctxVal">${(state.ctx / 1024).toFixed(0)}K</span>
      </div>
      <div class="breakdown" id="bd">
        ${bdRows(need)}
      </div>
      <div style="margin-top:12px;font-size:11.5px;color:var(--text-2);display:flex;gap:14px;flex-wrap:wrap">
        <span>RTX 4090 上约 <b class="mono" style="color:var(--warn-ink)">${tps1}</b> tokens/s</span>
        <span>≈ <b class="mono" style="color:var(--warn-ink)">${Math.round(tps1 * 0.9)}</b> 字/秒</span>
        <span style="color:var(--text-3)">推荐硬件：${m.hwHint}</span>
      </div>
    </div>

    <div style="margin-top:14px;padding:12px 14px;border-radius:12px;background:rgba(255,180,84,.07);border:1px solid rgba(255,180,84,.22)">
      <div style="font-size:11px;letter-spacing:.06em;color:var(--warn-ink);margin-bottom:4px">常见误区</div>
      <div style="font-size:12px;color:var(--text-2);line-height:1.6">${m.mistake}</div>
    </div>

    <div style="display:flex;gap:8px;margin-top:18px">
      <button class="btn btn-primary" style="flex:1" id="recFromModel">看它需要什么配置 →</button>
      <button class="btn btn-ghost" id="useModel">去组装台</button>
      <button class="btn btn-ghost" id="cmpModel">对比</button>
    </div>
  `);

  $('#qSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-q]');
    if (!b) return;
    state.quant = b.dataset.q;
    $$('#qSeg button').forEach((x) => x.classList.toggle('active', x === b));
    updateEstimator(m);
  });
  $('#ctxRange').addEventListener('input', (e) => {
    state.ctx = +e.target.value;
    $('#ctxVal').textContent = `${Math.round(state.ctx / 1024)}K`;
    updateEstimator(m);
  });
  $('#useModel').addEventListener('click', () => {
    state.modelId = m.id;
    state.customModel = null;
    closeModal(); go('builder'); refreshBuilder();
    toast(`已把 ${m.name} 设为组装台目标模型`);
  });
  $('#recFromModel').addEventListener('click', () => {
    recState.modelId = m.id;
    closeModal(); go('recommend');
    toast(`已按 ${m.name} 生成配置建议`);
  });
  $('#cmpModel').addEventListener('click', () => {
    if (!state.compare.includes(m.id)) state.compare.push(m.id);
    $('#cmpCount').textContent = state.compare.length;
    toast(`已加入对比（${state.compare.length}/3）`);
  });
}

function bdRows(n) {
  const rows = [['权重', n.weights], ['KV Cache', n.kv], ['框架开销', n.overhead], ['安全余量', n.margin]];
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return rows.map(([k, v]) => `<div class="bd-row"><span class="nm">${k}</span>
    <span class="bd-bar"><i style="width:${(v / max) * 100}%"></i></span>
    <span class="vl mono">${v.toFixed(2)}G</span></div>`).join('');
}

function updateEstimator(m) {
  const n = vramNeed(m, state.quant, state.ctx);
  $('#vramNum').textContent = n.total.toFixed(1);
  $('#bd').innerHTML = bdRows(n);
  const tps = estimateTps(m, [G('rtx4090')], state.quant, state.ctx);
  const w = $('#modalBody').querySelectorAll('b.mono');
  if (w[0]) w[0].textContent = tps;
  if (w[1]) w[1].textContent = Math.round(tps * 0.9);
}

function termModal(t) {
  const item = DATA.glossary.find((x) => x.t === t);
  if (!item) return;
  openModal(`
    <div class="modal-head">
      <div style="flex:1">
        <div style="display:flex;align-items:baseline;gap:8px">
          <h3 style="font-size:17px;font-weight:650">${item.t}</h3>
          <span class="mono" style="font-size:10.5px;color:var(--text-3)">${item.en}</span>
        </div>
      </div>
      <button class="close-x" onclick="closeModal()"><svg width="14" height="14"><use href="#i-close"/></svg></button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="padding:14px;border-radius:12px;background:var(--accent-soft);border:1px solid rgba(108,140,255,.24)">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-ink);margin-bottom:5px">一句话</div>
        <div style="font-size:13px;line-height:1.65">${item.plain}</div>
      </div>
      <div style="padding:14px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border)">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:5px">专业解释</div>
        <div style="font-size:12.5px;line-height:1.7;color:var(--text-2)">${item.pro}</div>
      </div>
      <div style="padding:14px;border-radius:12px;background:rgba(255,180,84,.07);border:1px solid rgba(255,180,84,.22)">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--warn-ink);margin-bottom:5px">常见误区</div>
        <div style="font-size:12.5px;line-height:1.65;color:var(--text-2)">${item.myth}</div>
      </div>
    </div>`);
}

/* ---------------- 词典 ---------------- */
function renderGlossary(q = '') {
  const list = DATA.glossary.filter((g) => !q || g.t.includes(q) || g.en.toLowerCase().includes(q.toLowerCase()) || g.plain.includes(q));
  $('#termGrid').innerHTML = list.map((g) => `
    <div class="card term-card" data-term="${g.t}">
      <h4>${g.t} <span class="en">${g.en}</span></h4>
      <p>${g.plain}</p>
    </div>`).join('') || `<div style="color:var(--text-3);font-size:13px">没有找到「${q}」，换个说法试试。</div>`;
}

/* ---------------- 说明书 ---------------- */
function renderManual() {
  const s = buildStats();
  const r = evaluate();
  const model = curModel();
  const n = vramNeed(model, state.quant, state.ctx);
  const fits = n.total <= s.vram;
  const rows = [
    ['显卡', s.gpus.map((g) => `${g.name} ×${s.gpus.length}`).join(' / ') || '—', s.gpus.length ? `¥${fmt(s.gpus.reduce((a, x) => a + x.price, 0))}` : '—'],
    ['CPU', s.cpu ? s.cpu.name : '—', s.cpu ? `¥${fmt(s.cpu.price)}` : '—'],
    ['主板', s.mobo ? s.mobo.name : '—', s.mobo ? `¥${fmt(s.mobo.price)}` : '—'],
    ['内存', s.rams.length ? `${s.ramGB}GB（${s.rams.length} 条）` : '—', s.rams.length ? `¥${fmt(s.rams.reduce((a, x) => a + x.price, 0))}` : '—'],
    ['电源', s.psu ? s.psu.name : '—', s.psu ? `¥${fmt(s.psu.price)}` : '—'],
    ['存储', s.storages.length ? s.storages.map((x) => x.name).join(' + ') : '—', s.storages.length ? `¥${fmt(s.storages.reduce((a, x) => a + x.price, 0))}` : '—'],
    ['散热', s.cooling ? s.cooling.name : '—', s.cooling ? `¥${fmt(s.cooling.price)}` : '—']
  ];

  $('#manualBody').innerHTML = `
    <div class="manual-head">
      <div class="kicker">Compute Lab · Personal Report</div>
      <h2>我的第一台本地算力服务器说明书</h2>
      <div style="font-size:12px;color:var(--text-3)">生成于 ${new Date().toLocaleDateString('zh-CN')} · 所有数据为教学估算值</div>
    </div>

    <div class="manual-section">
      <h3><span class="idx">01</span>我的目标</h3>
      <div class="card pad" style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
        <div><div style="font-size:10.5px;color:var(--text-3)">目标模型</div><div style="font-size:14px;font-weight:600;margin-top:3px">${model.name}</div></div>
        <div><div style="font-size:10.5px;color:var(--text-3)">量化方式</div><div class="mono" style="font-size:14px;font-weight:600;margin-top:3px">${state.quant.toUpperCase()}</div></div>
        <div><div style="font-size:10.5px;color:var(--text-3)">上下文长度</div><div class="mono" style="font-size:14px;font-weight:600;margin-top:3px">${state.ctx / 1024}K</div></div>
      </div>
    </div>

    <div class="manual-section">
      <h3><span class="idx">02</span>配置清单</h3>
      <div class="card" style="padding:6px 10px 10px">
        <table class="spec">
          <thead><tr><th>部件</th><th>型号</th><th style="text-align:right">参考价</th></tr></thead>
          <tbody>${rows.map(([a, b, c]) => `<tr><td style="color:var(--text-2)">${a}</td><td>${b}</td><td class="mono" style="text-align:right">${c}</td></tr>`).join('')}
          <tr><td style="font-weight:600">合计</td><td></td><td class="mono" style="text-align:right;font-weight:700;color:var(--accent-ink)">¥${fmt(s.price)}</td></tr></tbody>
        </table>
      </div>
    </div>

    <div class="manual-section">
      <h3><span class="idx">03</span>性能预估</h3>
      <div class="card pad" style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
        <div><div style="font-size:10.5px;color:var(--text-3)">能否运行</div><div style="font-size:14px;font-weight:700;margin-top:3px;color:${fits ? '#6FE9A5' : '#FF8A95'}">${fits ? '可以' : '不行'}</div></div>
        <div><div style="font-size:10.5px;color:var(--text-3)">显存占用</div><div class="mono" style="font-size:14px;font-weight:600;margin-top:3px">${n.total.toFixed(1)}/${s.vram}G</div></div>
        <div><div style="font-size:10.5px;color:var(--text-3)">生成速度</div><div class="mono" style="font-size:14px;font-weight:600;margin-top:3px;color:var(--warn-ink)">${r.tps || '—'} t/s</div></div>
        <div><div style="font-size:10.5px;color:var(--text-3)">综合评级</div><div class="mono" style="font-size:14px;font-weight:700;margin-top:3px">${r.grade}</div></div>
      </div>
    </div>

    <div class="manual-section">
      <h3><span class="idx">04</span>成本</h3>
      <div class="card pad" style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
        <div><div style="font-size:10.5px;color:var(--text-3)">硬件总价</div><div class="mono" style="font-size:18px;font-weight:700;margin-top:2px">¥${fmt(s.price)}</div></div>
        <div><div style="font-size:10.5px;color:var(--text-3)">月电费</div><div class="mono" style="font-size:18px;font-weight:700;margin-top:2px">¥${fmt(s.elec)}</div></div>
        <div><div style="font-size:10.5px;color:var(--text-3)">对比云 API</div><div style="font-size:12px;color:var(--text-2);margin-top:5px;line-height:1.5">按每月 200 万 token 估算，云 API 约 ¥60–200，本地更适合长期高频使用。</div></div>
      </div>
    </div>

    <div class="manual-section">
      <h3><span class="idx">05</span>风险与注意事项</h3>
      <div class="risk-list">${r.risks.map((x) => `<div class="risk ${x.level === 'err' ? 'r-err' : x.level === 'warn' ? 'r-warn' : 'r-ok'}"><div class="ic"><svg><use href="#i-alert"/></svg></div><div><b>${x.title}</b><br/><span>${x.desc}</span></div></div>`).join('') || '<div class="risk r-ok"><div class="ic"><svg><use href="#i-check"/></svg></div><div><span>暂无风险项。</span></div></div>'}</div>
    </div>

    <div class="manual-section">
      <h3><span class="idx">06</span>下一步行动清单</h3>
      <div class="card pad steps-list">
        ${[
          ['装系统', '推荐 Ubuntu 22.04 LTS，显卡驱动用官方仓库版本。', ''],
          ['装驱动', '确认 nvidia-smi 能正常输出显卡型号与显存。', 'nvidia-smi'],
          ['装 Ollama', '一行命令完成安装，它会自动常驻后台。', 'curl -fsSL https://ollama.com/install.sh | sh'],
          ['拉模型', `按你选的量化档位拉取模型。`, `ollama pull ${model.name.toLowerCase().replace(/[^a-z0-9.\-]/g, '')}`],
          ['跑第一句', '启动对话，观察首字延迟与生成速度是否符合预估。', `ollama run ${model.name.toLowerCase().replace(/[^a-z0-9.\-]/g, '')}`]
        ].map(([t, d, c], i) => `<div class="step-item"><div class="num">${i + 1}</div><div class="body"><b>${t}</b><span>${d}</span>${c ? `<div class="cmd">${c}</div>` : ''}</div></div>`).join('')}
      </div>
    </div>

    <div style="font-size:11px;color:var(--text-3);line-height:1.7;padding-top:14px;border-top:1px solid var(--border)">
      免责声明：本说明书中的所有性能、功耗、价格为基于公开参数的规则化估算，仅用于教学演示，不构成采购建议。实际表现受驱动版本、模型实现、环境温度等因素影响。
    </div>

    <div style="display:flex;gap:8px;margin-top:22px">
      <button class="btn btn-primary" onclick="window.print()"><svg><use href="#i-download"/></svg>导出 / 打印</button>
      <button class="btn btn-ghost" data-go="builder">回到组装台</button>
    </div>
  `;
}

/* =========================================================
   配置推荐引擎：模型 → 硬件
   ========================================================= */
const recState = { modelId: 'qwen25-14b', customParams: 27, quant: 'int4', ctx: 32768, budget: 25000, pref: 'balance' };
let lastTiers = [];

function customModel(p) {
  const params = clamp(Number(p) || 7, 0.5, 500);
  let layers = 28, hidden = 3584;
  if (params > 8 && params <= 16) { layers = 48; hidden = 5120; }
  else if (params > 16 && params <= 40) { layers = 64; hidden = 5120; }
  else if (params > 40 && params <= 90) { layers = 80; hidden = 8192; }
  else if (params > 90) { layers = 96; hidden = 8192; }
  return {
    id: 'custom', name: `自定义 ${params}B 模型`, cn: `自定义 ${params}B`, family: '自定义',
    vendor: '自定义参数', vendorEn: 'Custom', origin: '—',
    arch: '按同尺寸中位数估算', params, layers, hidden, ctxMax: 131072,
    license: '—', release: '—', langs: '—',
    tag: '自定义', color: '#6C8CFF',
    scenes: ['按你的场景'], strong: '参数由你输入，层数与隐藏维度按同尺寸模型的中位数估算，结果精度有限。',
    weak: '真实显存还受架构、GQA 分组数、是否 MoE 影响，建议以上机实测为准。',
    hwHint: '见下方推荐配置',
    metaphor: '不知道型号没关系，只要告诉我「多少 B」，就能算出大概要多大显存。',
    real: `按 ${params}B、Dense 架构估算，权重占 ${weightGB(params, recState.quant).toFixed(1)}GB（${recState.quant.toUpperCase()}）。`,
    mistake: '同样是 30B，MoE 和 Dense 的显存占用、速度完全不是一回事。'
  };
}

function recModelObj() {
  return recState.modelId === 'custom' ? customModel(recState.customParams) : M(recState.modelId);
}

function pickRam(target) {
  const sizes = [128, 64, 32];
  let left = target, out = [];
  while (left > 0 && out.length < 4) {
    const s = sizes.find((x) => x <= left) || 32;
    out.push('ram' + s);
    left -= s;
  }
  return out.length ? out : ['ram32'];
}

function makeBuild(g, count, model, need) {
  const vram = g.vram * count;
  if (need.total > vram * 0.92) return null;
  const headroom = (vram - need.total) / vram;
  const moboId = count === 1 ? 'b650' : count === 2 ? 'x670e' : 'wr90';
  const mobo = MB(moboId);
  if (mobo.slots < count) return null;
  const cpuId = count >= 3 ? 'xeon-4410y' : (count === 2 || g.tdp >= 350) ? 'r9-7950x' : 'r5-7600';
  const cpu = C(cpuId);
  const ramIds = pickRam(Math.max(32, Math.ceil((need.weights * 1.5) / 32) * 32));
  const rams = ramIds.map(R);
  const storage = need.weights > 30 ? S('ssd4t') : need.weights > 12 ? S('ssd2t') : S('ssd1t');
  const ramTdp = rams.reduce((a, r) => a + r.tdp, 0);
  const power = Math.round((g.tdp * count + cpu.tdp + mobo.tdp + ramTdp + storage.tdp) * 1.2);
  const psu = DATA.psus.find((p) => p.watt >= power * 1.3) || DATA.psus[DATA.psus.length - 1];
  // 电源真的带不动就直接淘汰，不给「理论可行、实际跳闸」的方案
  if (psu.watt < power * 1.05) return null;
  const cooling = count >= 2 ? CL('turbine') : g.tdp >= 400 ? CL('aio360') : g.tdp >= 250 ? CL('aio240') : CL('air');
  const price = g.price * count + cpu.price + mobo.price + rams.reduce((a, r) => a + r.price, 0) + psu.price + storage.price + cooling.price;
  const tps = estimateTps(model, Array(count).fill(g), recState.quant, recState.ctx);
  // AMD 走 ROCm，实际可用吞吐打九折，避免推荐时只看纸面带宽
  const etps = Math.round(tps * (g.vendor === 'AMD' ? 0.9 : 1));
  return { key: `${g.id}-${count}`, gpu: g, count, cpu, mobo, ramIds, rams, psu, storage, cooling, vram, headroom, power, price, tps, etps };
}

const byValue = (a, b) => valueScore(b) - valueScore(a);

/* 性价比：能力/价格，同时对「显存严重过配」扣分，避免推荐 4 张卡跑 7B */
function valueScore(b) {
  const waste = Math.max(0, b.headroom - 0.45);
  const cap = 1 - Math.min(waste, 0.45) * 1.2;
  const eco = b.gpu.vendor === 'AMD' ? 0.85 : 1;
  return ((b.etps || b.tps) / Math.pow(b.price / 1000, 0.62)) * Math.max(cap, 0.35) * eco;
}

function computeTiers(model, need) {
  const all = [];
  DATA.gpus.forEach((g) => {
    for (let c = 1; c <= 4; c++) {
      const b = makeBuild(g, c, model, need);
      if (b) all.push(b);
    }
  });
  if (!all.length) return { tiers: [] };

  const budget = recState.budget;
  const within22 = all.filter((b) => b.price <= budget * 2.2);
  // 可行方案不足 3 套时放开价格上限，保证三档不重复
  const pool = within22.length >= 3 ? within22 : all;

  const byPrice = [...pool].sort((a, b) => a.price - b.price);
  const used = new Set();
  const take = (list) => {
    const hit = list.find((x) => !used.has(x.key));
    if (hit) { used.add(hit.key); return hit; }
    return null;
  };

  // 省钱：最便宜；但两卡以内只贵 15% 时优先少卡
  const rawCheap = byPrice[0];
  const simple = byPrice.filter((b) => b.count <= 2 && b.price <= rawCheap.price * 1.08);
  const save = take(simple.length ? simple : byPrice) || rawCheap;

  // 均衡：预算 1.3 倍内、余量合理的性价比最高者
  const inBudget = pool.filter((b) => b.price <= budget * 1.3 && b.headroom >= 0.12 && b.headroom <= 0.75);
  const valueSorted = [...(inBudget.length ? inBudget : pool.filter((b) => b.headroom >= 0.12))].sort(byValue);
  let bal = take(valueSorted);
  let balName = '均衡推荐版';
  let balDesc = '性能够用、价格合理，多数人闭眼选';
  if (!bal) {
    const rest = byPrice.filter((b) => !used.has(b.key));
    if (rest.length) {
      bal = rest[0]; used.add(bal.key);
      balName = '加钱提速版';
      balDesc = '这个预算内没有更好的均衡解，加预算换速度';
    } else {
      bal = byPrice[0];
    }
  }

  // 性能：预算 1.6 倍内最快；同时不越过「最便宜方案 2.4 倍」，避免推出百万级配置
  const perfCap = Math.max(budget * 2.2, save.price * 1.8);
  // 性能档必须真的比均衡档快，否则宁可不给，也不推荐「更贵更慢」的方案
  const perfPool = pool.filter((b) => b.price <= perfCap && (b.etps || b.tps) >= ((bal.etps || bal.tps) * 1.05));
  const perf = take([...perfPool].sort((a, b) => ((b.etps || b.tps) - (a.etps || a.tps)) || (a.price - b.price)));

  const quietPool = pool.filter((b) => b.cooling.noise <= 36);
  const quiet = [...(quietPool.length ? quietPool : pool)].sort(byValue)[0] || bal;

  const mid = recState.pref === 'quiet'
    ? { ...quiet, name: '静音优先版', desc: '水冷 + 低功耗卡，长时间开着不吵' }
    : { ...bal, name: balName, desc: balDesc };

  // 去重：只保留真正不同的方案，不足三档时如实告知
  const tiers = [];
  const seen = new Set();
  const push = (b, name, desc) => {
    if (!b || seen.has(b.key)) return;
    seen.add(b.key);
    tiers.push({ ...b, name, desc });
  };
  push(save, '省钱入门版', '刚好跑得动，先把模型点起来');
  push(mid, mid.name, mid.desc);
  push(perf, '性能进阶版', '速度快、留足余量，长期主力');

  const prefPick = recState.pref === 'save' ? save : recState.pref === 'perf' ? perf : recState.pref === 'quiet' ? quiet : bal;
  tiers.forEach((t) => { t.picked = prefPick && t.key === prefPick.key; });
  if (!tiers.some((t) => t.picked) && tiers.length) tiers[0].picked = true;
  return { tiers, limited: tiers.length < 3 };
}

function tierCard(t, i) {
  const load = Math.round((t.power / t.psu.watt) * 100);
  const chars = Math.round(t.tps * 0.9);
  return `<div class="card tier-card ${t.picked ? 'picked' : ''}">
    <div class="tier-head">
      <div class="tier-name">${t.name}</div>
      <div class="tier-desc">${t.desc}</div>
      <div class="tier-price">¥${fmt(t.price)}<small>整机估算</small></div>
    </div>
    <div class="tier-body">
      <div class="tier-gpu">
        ${t.gpu.name} × ${t.count}
        <span class="vendor ${t.gpu.vendor === 'AMD' ? 'amd' : ''}">${t.gpu.vendor}</span>
      </div>
      <div class="bom-list">
        <div class="bom-row"><span class="k">CPU</span><span class="v">${t.cpu.name}</span><span class="p">¥${fmt(t.cpu.price)}</span></div>
        <div class="bom-row"><span class="k">主板</span><span class="v">${t.mobo.name}</span><span class="p">¥${fmt(t.mobo.price)}</span></div>
        <div class="bom-row"><span class="k">内存</span><span class="v">${t.ramIds.map((r) => R(r).cap).join(' + ')}GB</span><span class="p">¥${fmt(t.rams.reduce((a, r) => a + r.price, 0))}</span></div>
        <div class="bom-row"><span class="k">电源</span><span class="v">${t.psu.name}</span><span class="p">¥${fmt(t.psu.price)}</span></div>
        <div class="bom-row"><span class="k">存储</span><span class="v">${t.storage.name}</span><span class="p">¥${fmt(t.storage.price)}</span></div>
        <div class="bom-row"><span class="k">散热</span><span class="v">${t.cooling.name}</span><span class="p">¥${fmt(t.cooling.price)}</span></div>
      </div>
      <div class="tier-metrics" style="grid-template-columns:repeat(4,1fr)">
        <div class="tier-metric"><div class="k">显存</div><div class="v">${t.vram}<small>G</small></div></div>
        <div class="tier-metric"><div class="k">余量</div><div class="v">${Math.round(t.headroom * 100)}<small>%</small></div></div>
        <div class="tier-metric"><div class="k">速度</div><div class="v">${t.tps}<small>t/s</small></div></div>
        <div class="tier-metric"><div class="k">功耗</div><div class="v">${t.power}<small>W</small></div></div>
      </div>
    </div>
    <div class="tier-why">
      <b>为什么这么配：</b><br/>
      显存放得下 ${t.gpu.name}×${t.count} = ${t.vram}GB，装完还剩 ${Math.round(t.headroom * 100)}%；整机 ${t.power}W，配 ${t.psu.watt}W 电源（负载 ${load}%）。按 ${t.tps} tokens/s 算，约合 ${chars} 字/秒。
      ${t.gpu.vendor === 'AMD' ? '<br/><span style="color:var(--warn-ink)">注意：AMD 卡需要 ROCm 环境，量化与推理框架的支持不如 CUDA，新手更建议选 NVIDIA。</span>' : ''}
    </div>
    <div class="tier-foot">
      <button class="btn ${t.picked ? 'btn-primary' : 'btn-ghost'} btn-block" data-loadtier="${i}">载入组装台</button>
    </div>
  </div>`;
}

function recomputeRecommend() {
  const model = recModelObj();
  const need = vramNeed(model, recState.quant, recState.ctx);
  $('#recSummary').innerHTML = `
    <span class="sum-pill hot">显存需求 <b>${need.total.toFixed(1)} GB</b></span>
    <span class="sum-pill">权重 <b>${need.weights.toFixed(1)}</b></span>
    <span class="sum-pill">KV Cache <b>${need.kv.toFixed(1)}</b></span>
    <span class="sum-pill">开销 + 余量 <b>${(need.overhead + need.margin).toFixed(1)}</b></span>
    <span class="sum-pill">预算 <b>¥${fmt(recState.budget)}</b></span>
    <span style="margin-left:auto;font-size:11px;color:var(--text-3)">按 ${recState.quant.toUpperCase()} · ${recState.ctx / 1024}K 上下文计算，全部为估算值</span>`;

  const { tiers, limited } = computeTiers(model, need);
  lastTiers = tiers;
  if (tiers.length && tiers[0].price > recState.budget) {
    const over = tiers[0].price - recState.budget;
    $('#recSummary').insertAdjacentHTML('beforeend',
      `<span class="sum-pill" style="border-color:rgba(255,180,84,.4);background:rgba(255,180,84,.08);color:var(--warn-ink)">最便宜方案超预算 ¥${fmt(over)}</span>`);
  }
  if (!tiers.length) {
    $('#tierGrid').innerHTML = `<div class="card pad" style="grid-column:1/-1;text-align:center">
      <div style="font-size:14px;font-weight:600;margin-bottom:6px">${model.name} 在 ${recState.quant.toUpperCase()} · ${recState.ctx / 1024}K 下需要 ${need.total.toFixed(0)}GB 显存</div>
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.7">
        即使是 4 张 H100（320GB）也放不下，说明这个组合不现实。<br/>
        建议：降低量化档位、缩短上下文，或者改用更小的模型 / 云端 API。
      </div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:14px">
        <button class="btn btn-soft btn-sm" data-recquant="int4">试试 INT4</button>
        <button class="btn btn-ghost btn-sm" data-recctx="8192">试试 8K 上下文</button>
      </div>
    </div>`;
    return;
  }
  $('#tierGrid').innerHTML = tiers.map((t, i) => tierCard(t, i)).join('') +
    (limited ? `<div class="card pad" style="display:flex;flex-direction:column;gap:8px;background:linear-gradient(180deg,rgba(255,180,84,.07),transparent);border-color:rgba(255,180,84,.24)">
      <div style="font-size:13px;font-weight:620;color:var(--warn-ink)">当前条件下只有 ${tiers.length} 套可行方案</div>
      <div style="font-size:12px;color:var(--text-2);line-height:1.7">
        ${model.name} 在 ${recState.quant.toUpperCase()} · ${recState.ctx / 1024}K 下需要 ${need.total.toFixed(1)}GB 显存，
        其余组合要么装不下，要么价格会翻好几倍，没有推荐价值。<br/><br/>
        建议：提高预算、降低量化或缩短上下文；也可以先租云 API 跑通业务，再决定要不要自建。
      </div>
    </div>` : '');
}

function renderRecommend() {
  const sel = $('#recModel');
  if (!sel.options.length) {
    sel.innerHTML = DATA.models
      .map((m) => `<option value="${m.id}">${m.name} · ${m.vendor} · ${m.params}B</option>`)
      .join('') + `<option value="custom">自定义参数（只知道多少 B）</option>`;
  }
  sel.value = recState.modelId;
  const cp = $('#recCustomParams');
  cp.disabled = recState.modelId !== 'custom';
  cp.value = recState.modelId === 'custom' ? recState.customParams : '';
  cp.placeholder = '选「自定义」后填写';
  $('#recBudget').value = recState.budget;
  $('#recCtx').value = String(recState.ctx);
  $$('#recQuant button').forEach((b) => b.classList.toggle('active', b.dataset.q === recState.quant));
  $$('#recPref button').forEach((b) => b.classList.toggle('active', b.dataset.p === recState.pref));
  recomputeRecommend();
}

function loadTier(i) {
  const t = lastTiers[i];
  if (!t) return;
  state.build = {
    gpus: Array(t.count).fill(t.gpu.id), cpu: t.cpu.id, mobo: t.mobo.id,
    rams: [...t.ramIds], psu: t.psu.id, storages: [t.storage.id], cooling: t.cooling.id
  };
  const model = recModelObj();
  state.modelId = model.id === 'custom' ? 'custom' : model.id;
  state.customModel = model.id === 'custom' ? model : null;
  state.quant = recState.quant;
  state.ctx = recState.ctx;
  refreshBuilder();
  go('builder');
  toast(`已载入「${t.name}」，可以在组装台继续改`);
}

/* ---------------- 显卡详情 ---------------- */
function gpuModal(id) {
  const g = G(id);
  if (!g) return;
  const rows = DATA.models.map((m) => {
    const n = vramNeed(m, 'int4', 8192).total;
    return { m, n, ok: g.vram >= n };
  });
  openModal(`
    <div class="modal-head">
      <div class="gpu-chip" style="width:44px;height:34px"><svg><use href="#i-cpu"/></svg></div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <h3 style="font-size:17px;font-weight:650;letter-spacing:-.02em">${g.name}</h3>
          <span class="badge ${g.vendor === 'AMD' ? 'badge-err' : 'badge-ok'}">${g.vendor}</span>
          <span class="badge badge-mute">${g.klass}</span>
        </div>
        <div class="vendor-line" style="margin-top:3px"><span class="vendor-dot"></span>${g.arch} 架构 · ${g.note}</div>
      </div>
      <button class="close-x" onclick="closeModal()"><svg width="14" height="14"><use href="#i-close"/></svg></button>
    </div>

    <div class="spec-grid" style="margin-bottom:14px">
      <div><div class="k">显存</div><div class="v mono">${g.vram} GB</div></div>
      <div><div class="k">显存类型</div><div class="v mono">${g.vramType}</div></div>
      <div><div class="k">位宽</div><div class="v mono">${g.bus}</div></div>
      <div><div class="k">带宽</div><div class="v mono">${g.bw} GB/s</div></div>
      <div><div class="k">功耗 TDP</div><div class="v mono">${g.tdp} W</div></div>
      <div><div class="k">供电接口</div><div class="v mono">${g.power}</div></div>
      <div><div class="k">卡长</div><div class="v mono">${g.length}</div></div>
      <div><div class="k">建议电源</div><div class="v mono">${g.recPsu} W</div></div>
    </div>

    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:6px">适合场景</div>
    <div style="font-size:12.5px;line-height:1.65;color:var(--text-2);margin-bottom:16px">${g.scene}</div>

    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:8px">单卡能跑哪些模型（INT4 · 8K 上下文）</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${rows.map((r) => `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:7px 10px;border-radius:8px;background:var(--surface-2);border:1px solid var(--border)">
        <span style="flex:1">${r.m.name}</span>
        <span class="mono" style="color:var(--text-3);font-size:11px">${r.n.toFixed(1)}G</span>
        <span class="badge ${r.ok ? 'badge-ok' : 'badge-err'}">${r.ok ? (r.n > g.vram * 0.9 ? '勉强' : '可以') : '放不下'}</span>
      </div>`).join('')}
    </div>

    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-primary" style="flex:1" id="useGpu">拿去装机</button>
      <button class="btn btn-ghost" id="gpuRec">用它做推荐</button>
    </div>
  `);
  $('#useGpu').addEventListener('click', () => {
    addPart('gpu', g.id); closeModal(); go('builder'); toast('已加入机箱');
  });
  $('#gpuRec').addEventListener('click', () => {
    closeModal(); go('recommend'); toast('在推荐页调整模型即可对比这张卡');
  });
}

/* ---------------- 搜索面板 ---------------- */
function cmdItems(q = '') {
  const items = [
    { t: '知识地图', s: '学习', go: 'home' },
    { t: '学习路径', s: '学习', go: 'path' },
    { t: '概念词典', s: '学习', go: 'glossary' },
    { t: '模型百科', s: '探索', go: 'models' },
    { t: '硬件百科', s: '探索', go: 'hardware' },
    { t: 'DIY 组装台', s: '实战', go: 'builder' },
    ...DATA.models.map((m) => ({ t: m.name, s: `模型 · ${m.params}B`, go: `model:${m.id}` })),
    ...DATA.gpus.map((g) => ({ t: g.name, s: `显卡 · ${g.vram}GB · ¥${fmt(g.price)}`, go: `gpu:${g.id}` })),
    ...DATA.glossary.map((g) => ({ t: g.t, s: `术语 · ${g.en}`, go: `term:${g.t}` }))
  ];
  if (!q) return items.slice(0, 9);
  return items.filter((i) => i.t.toLowerCase().includes(q.toLowerCase()) || i.s.toLowerCase().includes(q.toLowerCase())).slice(0, 9);
}
function renderCmdk(q = '') {
  const list = cmdItems(q);
  $('#cmdkList').innerHTML = list.map((i, idx) =>
    `<div class="cmdk-item ${idx === 0 ? 'sel' : ''}" data-cmd="${i.go}">
      <svg width="14" height="14" style="opacity:.6"><use href="#i-chev"/></svg>
      <span>${i.t}</span><span class="k">${i.s}</span>
    </div>`).join('') || `<div style="padding:16px;color:var(--text-3);font-size:12.5px">没有匹配结果</div>`;
}

/* ---------------- 存储 ---------------- */
function saveBuild() {
  try { localStorage.setItem('clab.build', JSON.stringify({ build: state.build, modelId: state.modelId, quant: state.quant, ctx: state.ctx })); } catch (e) {}
}
function loadBuild() {
  try {
    const raw = localStorage.getItem('clab.build');
    if (!raw) return false;
    const d = JSON.parse(raw);
    Object.assign(state, { build: d.build, modelId: d.modelId, quant: d.quant, ctx: d.ctx });
    return true;
  } catch (e) { return false; }
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', (e) => {
  const nav = e.target.closest('.nav-item');
  if (nav) { go(nav.dataset.view); return; }

  const goEl = e.target.closest('[data-go]');
  if (goEl) {
    const v = goEl.dataset.go;
    if (v === 'noop') { toast('先完成第 3 关再解锁这一关'); return; }
    if (v.startsWith('gpu:')) { go('hardware'); gpuModal(v.slice(4)); return; }
    if (v.startsWith('model:')) { modelModal(v.slice(6)); return; }
    if (v.startsWith('term:')) { termModal(v.slice(5)); return; }
    go(v); return;
  }

  const mf = e.target.closest('[data-mfilter]');
  if (mf) { state.modelFilter = mf.dataset.mfilter; renderModels(); return; }
  const gf = e.target.closest('[data-gfilter]');
  if (gf) { state.gpuFilter = gf.dataset.gfilter; renderHardware(); return; }
  const bf = e.target.closest('[data-bfilter]');
  if (bf) { state.budgetFilter = bf.dataset.bfilter; renderHardware(); return; }

  const mc = e.target.closest('[data-model]');
  if (mc) { modelModal(mc.dataset.model); return; }
  const tc = e.target.closest('[data-term]');
  if (tc) { termModal(tc.dataset.term); return; }

  const ag = e.target.closest('[data-addgpu]');
  if (ag) { addPart('gpu', ag.dataset.addgpu); go('builder'); toast('已加入机箱'); return; }

  const gc = e.target.closest('[data-gpu]');
  if (gc) { gpuModal(gc.dataset.gpu); return; }

  const lt = e.target.closest('[data-loadtier]');
  if (lt) { loadTier(+lt.dataset.loadtier); return; }

  const rq = e.target.closest('[data-recquant]');
  if (rq) { recState.quant = rq.dataset.recquant; renderRecommend(); return; }
  const rc = e.target.closest('[data-recctx]');
  if (rc) { recState.ctx = +rc.dataset.recctx; renderRecommend(); return; }

  const pi = e.target.closest('.pitem');
  if (pi) { addPart(pi.dataset.kind, pi.dataset.id); return; }

  const pt = e.target.closest('[data-ptab]');
  if (pt) { state.paletteTab = pt.dataset.ptab; renderPalette(); return; }

  const rm = e.target.closest('[data-rm]');
  if (rm) { removeSlot(rm.dataset.rm); return; }

  const ps = e.target.closest('[data-preset]');
  if (ps) { applyPreset(ps.dataset.preset); return; }

  const act = e.target.closest('[data-act]');
  if (act) { handleAction(act.dataset.act); return; }

  const cmdi = e.target.closest('[data-cmd]');
  if (cmdi) {
    const v = cmdi.dataset.cmd;
    $('#cmdk').classList.remove('show');
    if (v.startsWith('model:')) modelModal(v.slice(6));
    else if (v.startsWith('term:')) termModal(v.slice(5));
    else if (v.startsWith('gpu:')) go('hardware');
    else go(v);
    return;
  }

  // empty slot click → 切到对应 palette
  const slot = e.target.closest('.slot');
  if (slot && !slot.classList.contains('filled')) {
    const acc = slot.dataset.accept;
    if (acc && PALETTE_TABS.some((t) => t.id === acc)) {
      state.paletteTab = acc;
      renderPalette();
      toast('从左侧「' + PALETTE_TABS.find((t) => t.id === acc).label + '」拖进来');
    }
  }
});

function handleAction(a) {
  if (a === 'manual') { go('manual'); return; }
  if (a === 'goto:hardware') { go('hardware'); return; }
  if (a.startsWith('preset:')) { applyPreset(a.slice(7)); return; }
  if (a.startsWith('quant:')) { state.quant = a.slice(6); refreshBuilder(); toast('量化已调整为 ' + state.quant.toUpperCase()); return; }
  if (a.startsWith('ctx:')) { state.ctx = +a.slice(4); refreshBuilder(); toast('上下文已调整为 ' + state.ctx / 1024 + 'K'); return; }
  if (a === 'psu:auto') {
    const s = buildStats();
    const need = s.power * 1.3;
    const fit = DATA.psus.find((p) => p.watt >= need) || DATA.psus[DATA.psus.length - 1];
    state.build.psu = fit.id; refreshBuilder(); toast('已换成 ' + fit.name); return;
  }
  if (a === 'ram:auto') {
    const need = vramNeed(curModel(), state.quant, state.ctx).weights * 1.5;
    const cur = buildStats().ramGB;
    const add = DATA.rams.find((r) => cur + r.cap >= need);
    if (add) { state.build.rams.push(add.id); refreshBuilder(); toast('内存已增加 ' + add.cap + 'GB'); }
    else toast('内存已经够用了');
    return;
  }
  if (a.startsWith('cooling:')) { state.build.cooling = a.slice(8); refreshBuilder(); toast('散热已更换'); return; }
}

/* drag & drop */
document.addEventListener('dragstart', (e) => {
  const it = e.target.closest('.pitem');
  if (!it) return;
  e.dataTransfer.setData('text/plain', JSON.stringify({ kind: it.dataset.kind, id: it.dataset.id }));
  it.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'copy';
});
document.addEventListener('dragend', (e) => {
  const it = e.target.closest('.pitem');
  if (it) it.classList.remove('dragging');
});
document.addEventListener('dragover', (e) => {
  const slot = e.target.closest('.slot');
  if (!slot) return;
  e.preventDefault();
  slot.classList.add('drop-hover');
});
document.addEventListener('dragleave', (e) => {
  const slot = e.target.closest('.slot');
  if (slot) slot.classList.remove('drop-hover');
});
document.addEventListener('drop', (e) => {
  const slot = e.target.closest('.slot');
  if (!slot) return;
  e.preventDefault();
  slot.classList.remove('drop-hover');
  try {
    const d = JSON.parse(e.dataTransfer.getData('text/plain'));
    if (slot.dataset.accept !== d.kind) { toast('这个槽位放不了该部件'); return; }
    addPart(d.kind, d.id);
  } catch (err) {}
});

/* ---------------- 顶部交互 ---------------- */
$('#themeToggle').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme;
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  $('#themeToggle').innerHTML = `<svg><use href="#${next === 'dark' ? 'i-sun' : 'i-moon'}"/></svg>`;
  try { localStorage.setItem('clab.theme', next); } catch (e) {}
});

const cmdk = $('#cmdk');
$('#searchTrigger').addEventListener('click', () => {
  cmdk.classList.add('show');
  $('#cmdkInput').value = '';
  renderCmdk('');
  setTimeout(() => $('#cmdkInput').focus(), 30);
});
cmdk.addEventListener('click', (e) => { if (e.target === cmdk) cmdk.classList.remove('show'); });
$('#cmdkInput').addEventListener('input', (e) => renderCmdk(e.target.value.trim()));

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    cmdk.classList.toggle('show');
    if (cmdk.classList.contains('show')) { $('#cmdkInput').value = ''; renderCmdk(''); $('#cmdkInput').focus(); }
  }
  if (e.key === 'Escape') { cmdk.classList.remove('show'); closeModal(); }
});

$('#evalBtn').addEventListener('click', () => {
  const r = evaluate();
  if (r.empty) { toast('先补齐显卡、CPU、主板和电源'); return; }
  runSim(r);
  toast(`评估完成：${r.score} 分（${r.grade} 级）`);
  $('#scoreArc').animate?.([{ opacity: .4 }, { opacity: 1 }], { duration: 320 });
});
$('#clearBuild').addEventListener('click', () => {
  state.build = { gpus: [], cpu: null, mobo: null, rams: [], psu: null, storages: [], cooling: null };
  refreshBuilder(); toast('已清空机箱');
});
$('#manualBtn').addEventListener('click', () => { go('manual'); });
$('#saveBuildBtn').addEventListener('click', () => { saveBuild(); toast('配置已保存到本地'); });
$('#termSearch').addEventListener('input', (e) => renderGlossary(e.target.value.trim()));

const budgetInput = $('#budgetInput');
if (budgetInput) {
  budgetInput.addEventListener('input', (e) => {
    state.budget = Math.max(1000, +e.target.value || 0);
    renderEval();
  });
}

/* ---- 配置推荐表单 ---- */
$('#recModel').addEventListener('change', (e) => {
  recState.modelId = e.target.value;
  const cp = $('#recCustomParams');
  cp.disabled = recState.modelId !== 'custom';
  cp.value = recState.modelId === 'custom' ? recState.customParams : '';
  if (recState.modelId === 'custom') { cp.focus(); cp.select(); }
  recomputeRecommend();
});
$('#recCustomParams').addEventListener('input', (e) => {
  recState.customParams = +e.target.value || 7;
  recomputeRecommend();
});
$('#recCtx').addEventListener('change', (e) => {
  recState.ctx = +e.target.value;
  recomputeRecommend();
});
$('#recBudget').addEventListener('input', (e) => {
  recState.budget = Math.max(3000, +e.target.value || 3000);
  recomputeRecommend();
});
$('#recQuant').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-q]');
  if (!b) return;
  recState.quant = b.dataset.q;
  $$('#recQuant button').forEach((x) => x.classList.toggle('active', x === b));
  recomputeRecommend();
});
$('#recPref').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-p]');
  if (!b) return;
  recState.pref = b.dataset.p;
  $$('#recPref button').forEach((x) => x.classList.toggle('active', x === b));
  recomputeRecommend();
});

/* compare */
$('#compareBtn').addEventListener('click', () => {
  if (state.compare.length < 2) { toast('至少选 2 个模型才能对比'); return; }
  const list = state.compare.map(M).filter(Boolean);
  openModal(`
    <div class="modal-head">
      <div style="flex:1"><h3 style="font-size:16px;font-weight:650">模型对比</h3>
        <div style="font-size:11.5px;color:var(--text-3)">统一按 ${state.quant.toUpperCase()} · ${state.ctx / 1024}K 估算</div></div>
      <button class="close-x" onclick="closeModal()"><svg width="14" height="14"><use href="#i-close"/></svg></button>
    </div>
    <table class="spec">
      <thead><tr><th>模型</th><th>参数</th><th>上下文</th><th>显存需求</th><th>4090 速度</th></tr></thead>
      <tbody>${list.map((m) => {
        const n = vramNeed(m, state.quant, state.ctx);
        const t = estimateTps(m, [G('rtx4090')], state.quant, state.ctx);
        return `<tr><td>${m.name}</td><td class="mono">${m.params}B</td><td class="mono">${Math.round(m.ctxMax / 1024)}K</td><td class="mono">${n.total.toFixed(1)}G</td><td class="mono" style="color:var(--warn-ink)">${t} t/s</td></tr>`;
      }).join('')}</tbody>
    </table>`);
});

/* ---------------- init ---------------- */
function init() {
  try {
    const th = localStorage.getItem('clab.theme');
    if (th) {
      document.documentElement.dataset.theme = th;
      $('#themeToggle').innerHTML = `<svg><use href="#${th === 'dark' ? 'i-sun' : 'i-moon'}"/></svg>`;
    }
  } catch (e) {}

  renderPath();
  renderModels();
  renderHardware();
  renderPalette();
  renderGlossary();
  renderChassis();
  renderEval();

  if (!loadBuild()) {
    applyPreset('balance', true);
  } else {
    refreshBuilder();
  }
  $('#cmpCount').textContent = state.compare.length;
  window.closeModal = closeModal;
}
init();
