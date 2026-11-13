import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  authApi,
  currentUser,
  readAuth,
  writeAuth,
  type ApiUser,
} from '@/lib/api';
import { t } from '@/i18n';

/**
 * 登录状态。
 *
 * 一个刻意的取舍：**登录失败不影响使用**。
 * 产品的 P0 是静态站，M6 加的账号只承载「跨设备保存 / 分享」。
 * 所以这里把「没有登录」「够不着后端」都当作正常状态，界面降级到本地模式，
 * 而不是弹一个挡住全站的登录墙。
 */

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: ApiUser | null;
  /** 后端不可达：界面上所有「保存/分享」应显示为本地模式 */
  offline: boolean;
  sendCode: (email: string) => Promise<{ debugCode: string | null; hint: string | null }>;
  login: (email: string, code: string) => Promise<void>;
  devLogin: () => Promise<void>;
  logout: () => void;
  /** 保存配置前调用：确保 token 还有效 */
  ensureFresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<ApiUser | null>(null);
  const [offline, setOffline] = useState(false);

  // 企业微信扫码回跳：token 在 query 上，取出来后立刻从地址栏抹掉，
  // 否则用户复制 URL 分享给别人时会把登录态一起带出去。
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const access = params.get('sso_access');
    const refresh = params.get('sso_refresh');
    if (!access || !refresh) return;

    params.delete('sso_access');
    params.delete('sso_refresh');
    params.delete('state');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);

    void (async () => {
      try {
        // 先落凭据再取用户信息，这样 me() 能带上刚拿到的 token
        writeAuth({ accessToken: access, refreshToken: refresh, user: { id: 0 } as ApiUser });
        const me = await authApi.me();
        writeAuth({ accessToken: access, refreshToken: refresh, user: me });
        setUser(me);
        setStatus('authenticated');
        setOffline(false);
      } catch {
        writeAuth(null);
        setStatus('anonymous');
      }
    })();
  }, []);

  useEffect(() => {
    const stored = readAuth();
    if (!stored) {
      setStatus('anonymous');
      return;
    }

    // 乐观显示：本地有 token 就先当已登录，后台再校验。
    // 断网时用户仍然看得到自己的昵称，而不是闪一下「未登录」再回来。
    setUser(stored.user);
    setStatus('authenticated');

    void (async () => {
      try {
        const me = await authApi.me();
        setUser(me);
        writeAuth({ ...stored, user: me });
        setOffline(false);
      } catch (error) {
        if (error instanceof ApiError && error.needsLogin) {
          writeAuth(null);
          setUser(null);
          setStatus('anonymous');
        } else {
          setOffline(true);
        }
      }
    })();
  }, []);

  const sendCode = useCallback(async (email: string) => {
    const result = await authApi.sendCode(email);
    return { debugCode: result.debugCode, hint: result.hint };
  }, []);

  const login = useCallback(async (email: string, code: string) => {
    const tokens = await authApi.login(email, code);
    setUser(tokens.user);
    setStatus('authenticated');
    setOffline(false);
  }, []);

  const devLogin = useCallback(async () => {
    const tokens = await authApi.devLogin();
    setUser(tokens.user);
    setStatus('authenticated');
    setOffline(false);
  }, []);

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const ensureFresh = useCallback(async () => {
    if (!readAuth()) return false;
    try {
      const me = await authApi.me();
      setUser(me);
      setOffline(false);
      return true;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, offline, sendCode, login, devLogin, logout, ensureFresh }),
    [status, user, offline, sendCode, login, devLogin, logout, ensureFresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error(t("useAuth 必须在 AuthProvider 内使用"));
  return context;
}

export { currentUser };
