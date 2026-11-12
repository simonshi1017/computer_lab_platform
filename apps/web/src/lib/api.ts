/**
 * API 客户端。
 *
 * 三条规则，全站共用：
 * 1. **同域相对路径**。生产走 nginx 反代 /api，开发走 Vite proxy，
 *    所以代码里永远不出现域名——换环境只改构建配置，不改业务代码。
 * 2. **access 过期自动续一次**。用户不该在「保存配置」时突然被踢回登录页；
 *    并发请求同时 401 时只发一次刷新，其余排队等结果。
 * 3. **后端不可用时不抛技术错误**。返回 ApiError 带上人话，
 *    让界面能说「还没连上服务端，配置仍存在本机」而不是 "Failed to fetch"。
 */

export const API_BASE: string = (import.meta.env?.VITE_API_BASE as string | undefined) ?? '/api/v1';

const TOKEN_KEY = 'clab.auth.v1';

export interface ApiUser {
  id: number;
  email: string | null;
  nickname: string | null;
  avatar: string | null;
  isAdmin: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: ApiUser;
}

export interface BuildSummary {
  id: number;
  name: string;
  modelId: string;
  modelName: string;
  score: number;
  grade: string;
  priceCny: number;
  createdAt: string;
  updatedAt: string;
}

/** 配置快照：字段与 useBuild 的 BuilderState 一致，但允许后端原样透传未知字段 */
export interface BuildStatePayload {
  build: {
    gpuIds: string[];
    cpuId: string | null;
    moboId: string | null;
    ramIds: string[];
    psuId: string | null;
    storageIds: string[];
    coolingId: string | null;
  };
  modelId: string;
  customSpec?: Record<string, unknown> | null;
  quant: 'fp16' | 'int8' | 'int4';
  ctx: number;
  budget: number;
  [key: string]: unknown;
}

export interface BuildDetail extends BuildSummary {
  state: BuildStatePayload;
  evaluation: Record<string, unknown> | null;
  note: string | null;
}

export interface SharePayload {
  token: string;
  build: BuildDetail;
  author: string | null;
  views: number;
  createdAt: string;
  expiresAt: string | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** 401 且不是「验证码错误」这类业务 401 —— 需要重新登录 */
  get needsLogin(): boolean {
    return this.status === 401;
  }

  /** 服务端/网络不可用：界面应降级到本地模式，而不是报错 */
  get isOffline(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

// ---------------------------------------------------------------- token

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}

let memoryAuth: StoredAuth | null = null;

export function readAuth(): StoredAuth | null {
  if (memoryAuth) return memoryAuth;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.user) return null;
    memoryAuth = parsed as StoredAuth;
    return memoryAuth;
  } catch {
    return null;
  }
}

export function writeAuth(auth: StoredAuth | null): void {
  memoryAuth = auth;
  try {
    if (auth) localStorage.setItem(TOKEN_KEY, JSON.stringify(auth));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 隐私模式：内存里还有，刷新页面就没了，可接受 */
  }
}

export function currentUser(): ApiUser | null {
  return readAuth()?.user ?? null;
}

// ---------------------------------------------------------------- 核心请求

let refreshing: Promise<AuthTokens | null> | null = null;

async function rawRequest(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    // fetch 抛错只可能是网络层：DNS / 连接被拒 / 离线
    throw new ApiError(0, 'network_error', '连不上服务端，请检查网络或稍后再试');
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let code = 'http_error';
  let message = `请求失败（HTTP ${response.status}）`;
  try {
    const body = (await response.json()) as { detail?: unknown };
    const detail = body?.detail;
    if (typeof detail === 'string') {
      message = detail;
    } else if (detail && typeof detail === 'object') {
      const record = detail as { code?: string; message?: string };
      if (record.code) code = record.code;
      if (record.message) message = record.message;
    }
  } catch {
    /* 非 JSON 错误体（比如 nginx 的 502 页面）就沿用默认文案 */
  }
  return new ApiError(response.status, code, message);
}

async function refreshTokens(): Promise<AuthTokens | null> {
  const auth = readAuth();
  if (!auth) return null;
  try {
    const response = await rawRequest('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });
    if (!response.ok) {
      writeAuth(null);
      return null;
    }
    const tokens = (await response.json()) as AuthTokens;
    writeAuth({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
    });
    return tokens;
  } catch {
    // 网络问题不清理本地凭据：地铁里断网不该让用户重新登录
    return null;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** 已登录但不需要自动刷新的场景（比如主动登出） */
  skipRefresh?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, skipRefresh = false } = options;

  const send = async (): Promise<Response> => {
    const auth = readAuth();
    return rawRequest(path, {
      method,
      headers: auth ? { Authorization: `Bearer ${auth.accessToken}` } : {},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let response = await send();

  if (response.status === 401 && !skipRefresh && readAuth()) {
    // 并发的多个 401 共享同一次刷新，避免刷新风暴把 refresh token 用废
    refreshing ??= refreshTokens().finally(() => {
      refreshing = null;
    });
    const tokens = await refreshing;
    if (tokens) {
      response = await send();
    } else {
      writeAuth(null);
    }
  }

  if (!response.ok) throw await parseError(response);

  if (response.status === 204) return undefined as T;

  // catalog 的 304 由浏览器缓存层处理，这里拿到的一定是完整 body
  return (await response.json()) as T;
}

// ---------------------------------------------------------------- 具体接口

export const authApi = {
  sendCode: (email: string) =>
    api<{ sent: boolean; ttlSeconds: number; debugCode: string | null; hint: string | null }>(
      '/auth/code',
      { method: 'POST', body: { email } },
    ),

  login: async (email: string, code: string): Promise<AuthTokens> => {
    const tokens = await api<AuthTokens>('/auth/login', { method: 'POST', body: { email, code } });
    writeAuth(tokens);
    return tokens;
  },

  devLogin: async (email = 'dev@clab.local'): Promise<AuthTokens> => {
    const tokens = await api<AuthTokens>('/auth/dev-login', {
      method: 'POST',
      body: { email, nickname: '开发者' },
    });
    writeAuth(tokens);
    return tokens;
  },

  me: () => api<ApiUser>('/auth/me'),

  wecomUrl: () => api<{ url: string; state: string; configured: boolean }>('/auth/wecom/url'),

  logout: () => writeAuth(null),
};

export const buildApi = {
  create: (payload: {
    name?: string;
    state: unknown;
    evaluation: unknown;
    note?: string;
  }) => api<BuildDetail>('/builds', { method: 'POST', body: payload }),

  list: () => api<BuildSummary[]>('/builds'),

  get: (id: number) => api<BuildDetail>(`/builds/${id}`),

  update: (id: number, payload: { name?: string; state?: unknown; evaluation?: unknown; note?: string }) =>
    api<BuildDetail>(`/builds/${id}`, { method: 'PATCH', body: payload }),

  remove: (id: number) => api<void>(`/builds/${id}`, { method: 'DELETE' }),
};

export const shareApi = {
  create: (buildId: number, expiresInDays?: number) =>
    api<{ token: string; url: string; expiresAt: string | null; views: number }>('/share', {
      method: 'POST',
      body: { buildId, expiresInDays },
    }),

  resolve: (token: string) => api<SharePayload>(`/share/${token}`),
};

export interface HealthInfo {
  status: 'ok' | 'degraded';
  env: string;
  database: 'up' | 'down';
  features: { wecomLogin: boolean; emailCode: boolean; devLogin: boolean };
}

export const healthApi = {
  info: () => api<HealthInfo>('/health'),
};

export const catalogApi = {
  version: () => api<{ version: string; updatedAt: string | null; counts: Record<string, number> }>('/catalog/version'),
};
