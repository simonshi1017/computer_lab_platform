import { useEffect, useState } from 'react';
import { KeyRound, Loader2, Mail, MessageSquare, QrCode } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { ApiError, authApi, healthApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { t } from '@/i18n';

/**
 * 登录对话框。
 *
 * 三种入口按「能用程度」排序，而不是按实现顺序：
 * 1. 企业微信扫码（公司同事最顺，但要运维先配好 corp id）
 * 2. 邮箱验证码（自己人能收邮件就行）
 * 3. 开发登录（只有后端处于 dev 环境才出现，生产点了会 501）
 *
 * 任何一种不可用时都**明说原因**，而不是把按钮藏起来让人猜。
 */
export function LoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { login, devLogin, sendCode } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [wecomUrl, setWecomUrl] = useState<string | null>(null);
  const [wecomReason, setWecomReason] = useState('');
  const [devLoginEnabled, setDevLoginEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    void (async () => {
      try {
        const health = await healthApi.info();
        setDevLoginEnabled(health.features.devLogin);
      } catch {
        setDevLoginEnabled(false);
      }
      try {
        const result = await authApi.wecomUrl();
        setWecomUrl(result.url);
        setWecomReason('');
      } catch (err) {
        setWecomUrl(null);
        setWecomReason(err instanceof ApiError ? err.message : t("企业微信登录暂不可用"));
      }
    })();
  }, [open]);

  const submitEmail = async () => {
    if (!email.includes('@')) {
      setError(t("请输入完整邮箱地址"));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await sendCode(email.trim());
      setStep('code');
      setDevCode(result.debugCode);
      setHint(result.hint ?? '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("发送失败，请稍后再试"));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), code.trim());
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("登录失败，请稍后再试"));
    } finally {
      setBusy(false);
    }
  };

  const doDevLogin = async () => {
    setBusy(true);
    setError('');
    try {
      await devLogin();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("开发登录不可用"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} labelledBy="login-title">
      <div className="dialog-head">
        <div className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: 'var(--surface-2)' }}>
          <KeyRound size={17} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h2 id="login-title" style={{ fontSize: 16, fontWeight: 700 }}>
            {t("登录后可以保存配置")}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
            {t("不登录也能用全部功能，配置存在本机浏览器里。")}
          </p>
        </div>
      </div>

      <div className="dialog-body" style={{ display: 'grid', gap: 14 }}>
        {wecomUrl ? (
          <a className="btn btn-ghost w-full" href={wecomUrl}>
            <QrCode size={15} />
            {t("企业微信扫码登录")}
          </a>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.7 }} title={wecomReason}>
            <b style={{ color: 'var(--text-2)' }}>{t("企业微信扫码暂未开通")}</b>
            <br />
            {t("需要管理员配置企业微信应用后可用，当前请用邮箱验证码登录。")}
          </div>
        )}

        <div style={{ height: 1, background: 'var(--border)' }} />

        {step === 'email' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="field-label" htmlFor="login-email">
              {t("邮箱")}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Mail
                  size={14}
                  style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-3)' }}
                />
                <input
                  id="login-email"
                  className="input"
                  style={{ paddingLeft: 32 }}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void submitEmail()}
                />
              </div>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submitEmail()}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : t("发送验证码")}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="field-label" htmlFor="login-code">
              {t("验证码（已发送到")} {email}）
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <MessageSquare
                  size={14}
                  style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-3)' }}
                />
                <input
                  id="login-code"
                  className="input"
                  style={{ paddingLeft: 32, letterSpacing: 3 }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder={t("6 位数字")}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  onKeyDown={(event) => event.key === 'Enter' && void submitCode()}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || code.length < 4}
                onClick={() => void submitCode()}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : t("登录")}
              </button>
            </div>

            {devCode && (
              <div
                style={{
                  fontSize: 11.5,
                  padding: '7px 10px',
                  borderRadius: 8,
                  background: 'var(--surface-2)',
                  color: 'var(--text-2)',
                  lineHeight: 1.6,
                }}
              >
                {hint || t("开发环境未配置邮件服务")} {t("· 本次验证码")}{' '}
                <b className="mono" style={{ letterSpacing: 2, color: 'var(--accent)' }}>
                  {devCode}
                </b>
              </div>
            )}

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ justifySelf: 'start' }}
              onClick={() => {
                setStep('email');
                setCode('');
                setDevCode(null);
              }}
            >
              {t("换个邮箱")}
            </button>
          </div>
        )}

        {error && (
          <div role="alert" style={{ fontSize: 12, color: 'var(--danger-ink)' }}>
            {error}
          </div>
        )}

        {devLoginEnabled && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void doDevLogin()}>
            {t("开发模式一键登录（后端 dev 环境）")}
          </button>
        )}
      </div>
    </Dialog>
  );
}
