import { API_BASE, readAuth } from '@/lib/api';

/**
 * 埋点上报。
 *
 * 三条硬约束，都是踩过的坑：
 * 1. **不能阻塞交互**：所有调用都是 `void track(...)`，不 await、不弹错。
 *    埋点失败必须是完全静默的——用户点「保存」时因为统计接口挂了而报错，
 *    是最典型的本末倒置。
 * 2. **不能丢最后一批**：离开页面时用 `sendBeacon`，否则「打开就关掉」
 *    这类最关键的流失数据永远采不到。
 * 3. **不能堆积**：失败就丢弃，不做重试队列。内网工具不需要「离线补传」，
 *    攒一星期再集中上报只会把服务打出一个尖峰。
 */

export type EventName =
  | 'page_view'
  | 'model_view'
  | 'gpu_view'
  | 'lesson_start'
  | 'lesson_done'
  | 'recommend_view'
  | 'recommend_apply'
  | 'build_save'
  | 'build_load'
  | 'share_create'
  | 'share_open'
  | 'card_download'
  | 'manual_print'
  | 'scenario_start'
  | 'scenario_complete'
  | 'feedback';

interface QueuedEvent {
  name: EventName;
  path?: string;
  props?: Record<string, string | number | boolean>;
}

const SESSION_KEY = 'clab.session.v1';
const FLUSH_DELAY = 600;
const MAX_QUEUE = 20;

let queue: QueuedEvent[] = [];
let timer: number | null = null;
let started = false;

/** 匿名会话 id：只用来算 UV，不关联任何身份 */
export function sessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing && existing.length >= 8) return existing;
    const created =
      (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 24);
    localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    // 隐私模式：退化成内存内的临时 id，UV 会偏高但不会崩
    return `tmp-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function endpoint(): string {
  return `${API_BASE}/events`;
}

function sendWithFetch(events: QueuedEvent[]): void {
  const auth = readAuth();
  try {
    void fetch(endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      },
      body: JSON.stringify({ sessionId: sessionId(), events }),
      // keepalive 让请求在页面卸载后仍能完成，体积上限 64KB，这里远低于
      keepalive: true,
    }).catch(() => {
      /* 静默丢弃 */
    });
  } catch {
    /* 静默丢弃 */
  }
}

function sendWithBeacon(events: QueuedEvent[]): void {
  if (!navigator.sendBeacon) {
    sendWithFetch(events);
    return;
  }
  try {
    const blob = new Blob([JSON.stringify({ sessionId: sessionId(), events })], {
      type: 'application/json',
    });
    // beacon 不能带 Authorization 头，所以这一批的 user_id 会是空。
    // 可接受：卸载前的最后一批本来就是「离开」信号，用匿名 id 足够算 UV。
    navigator.sendBeacon(endpoint(), blob);
  } catch {
    /* 静默丢弃 */
  }
}

function flush(useBeacon = false): void {
  if (queue.length === 0) return;
  const batch = queue.slice(0, MAX_QUEUE);
  queue = queue.slice(batch.length);
  if (useBeacon) sendWithBeacon(batch);
  else sendWithFetch(batch);
}

function schedule(): void {
  if (timer !== null) return;
  timer = window.setTimeout(() => {
    timer = null;
    flush();
  }, FLUSH_DELAY);
}

export function track(name: EventName, props?: QueuedEvent['props']): void {
  queue.push({ name, path: `${window.location.pathname}${window.location.search}`, props });
  if (queue.length >= MAX_QUEUE) {
    flush();
    return;
  }
  schedule();
}

/** 页面级事件只记路径，省一次 props 序列化 */
export function trackPageView(path: string): void {
  queue.push({ name: 'page_view', path });
  schedule();
}

/** 在 App 里调一次：注册「离开页面」的兜底上报 */
export function initTracking(): void {
  if (started) return;
  started = true;

  // pagehide 比 beforeunload 可靠：移动端把标签页切到后台时 beforeunload 不触发
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
}
