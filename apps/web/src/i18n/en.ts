/**
 * 英文字典：key 是源码里的中文原文，value 是英文译文。
 *
 * 生成的姿势：改完 UI 后跑 `node scripts/i18n-codemod.mjs check`，
 * 它会列出所有「源码里出现但字典里没有」的中文串；补进这里即可。
 * 未收录的 key 会原样显示中文，不会让页面崩，便于分批补齐。
 */
export const EN: Record<string, string> = {
  // ---- 外壳 / 导航 ----
  '跳到主内容': 'Skip to main content',
  '算力实验室': 'Compute Lab',
  '搜索页面…': 'Search pages…',
  '切换主题': 'Toggle theme',
  '切换到浅色主题': 'Switch to light theme',
  '切换到深色主题': 'Switch to dark theme',
  '切换语言': 'Switch language',
  '我的配置': 'My Builds',
  '查看我的配置': 'View my builds',
  '退出登录': 'Sign out',
  '登录': 'Sign in',
  '登录后可跨设备保存配置': 'Sign in to sync builds across devices',
  '页面': 'Page',
  '未找到': 'Not found',
  '学习': 'Learn',
  '探索': 'Explore',
  '实战': 'Build',
  '项目进度': 'Project progress',
  '数据自动化 · 已完成': 'Data automation · done',
  '已完成': 'Done',
  '已上线': 'Live',
  '加载中…': 'Loading…',
  '加载中': 'Loading',
  '出错了': 'Something went wrong',
  '返回首页': 'Back to home',
  '刷新重试': 'Reload and retry',
  '关闭': 'Close',
  '取消': 'Cancel',
  '确定': 'Confirm',
  '保存': 'Save',
  '删除': 'Delete',
  '编辑': 'Edit',
  '搜索': 'Search',
  '全部': 'All',
  '暂无数据': 'No data yet',
  '更多': 'More',

  // ---- 页面元信息（navigation.ts） ----
  '知识地图': 'Knowledge Map',
  '学习路径': 'Learning Path',
  '概念词典': 'Glossary',
  '模型百科': 'Model Catalog',
  '硬件百科': 'Hardware Catalog',
  '配置推荐': 'Build Recommender',
  'DIY 组装台': 'DIY Builder',
  '我的说明书': 'My Manual',
  '数据看板': 'Analytics',
  '分享的配置': 'Shared Build',
  '五关渐进式学习路径，每关留下一个可验证的输出物。':
    'A five-level path; each level leaves you with one verifiable artifact.',
  '从「什么是模型」到「跑出第一句话」，每一关都有明确产出。':
    'From "what is a model" to your first generated token — every level has a concrete output.',
  '先用小白话讲一遍，想看专业定义再展开。':
    'Plain language first, with the formal definition one click away.',
  '先看「它像什么」，再看「它要多少显存」。':
    'First see what it is like, then how much VRAM it needs.',
  '显卡是「能装多大」，带宽是「说得多快」。':
    'VRAM decides what fits; bandwidth decides how fast it talks.',
  '告诉我要跑什么模型，直接给出三档可落地的装机方案。':
    'Tell us which model you want to run; get three buildable configurations.',
  '左边挑件，中间装机，右边实时告诉你行不行。':
    'Pick parts on the left, assemble in the middle, get a live verdict on the right.',
  '保存过的每一套方案都在这里，可以继续改，也可以生成分享链接。':
    'Every saved build lives here — keep editing or generate a share link.',
  '把配置整理成一份能照着做的部署说明书。':
    'Turn a build into a deployment manual you can actually follow.',
  '访问、转化与学习完成率。': 'Traffic, conversion and learning completion.',
  '别人分享给你的一套装机方案。': 'A build someone shared with you.',

  // ---- 首页 ----
  '把「跑大模型」这件事，': 'Running a large language model, ',
  '拆开给你看': 'taken apart for you',
  '不用懂硬件，不用背公式。从「什么是参数」开始，亲手拖出一台能跑模型的服务器，':
    'No hardware knowledge, no formulas to memorize. Start with "what is a parameter" and assemble a server',
  '再让它告诉你行不行、快不快、贵不贵。':
    'that can actually run a model — then see if it works, how fast, and what it costs.',
  '开始组装我的服务器': 'Build my server',
  '先看看有哪些模型': 'Browse models first',
  '你的算力知识地图': 'Your compute knowledge map',
  '今日推荐': 'Today’s pick',
  '继续学习': 'Continue learning',
  '开始学习': 'Start learning',
  '五关全部完成，可以去装一台真机器了': 'All five levels done — time to build a real machine',
  'M0–M5 全部交付：基建 · 内核 · 内容 · 组装台 · 推荐 · 打磨（前端 90 单测）':
    'M0–M5 delivered: scaffolding, engine, content, builder, recommender, polish (90 frontend tests)',
  'M6–M7 · 账号与分享、价格快照、埋点看板（后端 69 用例 · E2E 21 条）':
    'M6–M7 · accounts & sharing, price snapshots, analytics (69 backend tests · 21 E2E)',

  // ---- 组装台 / 说明书通用 ----
  '保存 / 分享': 'Save / Share',
  '清空机箱': 'Clear chassis',
  '保存到我的配置': 'Save to my builds',
  '生成分享链接': 'Generate share link',
  '下载分享图': 'Download share card',
  '已载入': 'Loaded',
  '载入失败：配置可能已被删除，或链接已过期': 'Load failed: the build may have been deleted or the link expired',
  '这套配置引用的模型已不在目录里，无法载入': 'The model referenced by this build is no longer in the catalog',
  '可以继续改，改完是你自己的副本': 'Keep editing — changes become your own copy',
  '配置清单': 'Parts list',
  '成本合计': 'Total cost',
  '性能预估': 'Performance estimate',
  '风险提示': 'Risk notes',
  '打印 / 导出': 'Print / Export',
  '目标模型': 'Target model',
  '显存需求': 'VRAM required',
  '总功耗': 'Total power draw',
  '预估电费': 'Estimated electricity',
  '六维评估': 'Six-axis score',
  '兼容': 'Compatibility',
  '性能': 'Performance',
  '成本': 'Cost',
  '功耗': 'Power',
  '扩展': 'Expandability',
  '匹配': 'Fit',
  '全站中英双语 · 已完成': 'Full bilingual rollout · done',
  'M6–M8 · 账号与分享、价格快照、埋点看板、全站中英双语（后端 69 用例 · E2E 23 条）':
    'M6–M8 · accounts & sharing, price snapshots, analytics dashboard, full Chinese/English support (69 backend tests · 23 E2E checks)',
};
