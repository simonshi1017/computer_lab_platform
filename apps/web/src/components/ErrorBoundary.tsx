import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** 出问题时给用户的一条退路说明，例如「回组装台重新配」 */
  hint?: string;
}

interface State {
  error: Error | null;
}

/**
 * 页面级错误边界。
 *
 * React 的规则：渲染期抛异常会把整棵树卸载，结果就是白屏——
 * 用户看不到任何信息，也不知道该做什么。这里兜住并给出两个动作：
 * 重试、或者回首页。
 *
 * 注意它只能接住渲染与生命周期里的同步错误；事件处理器与异步代码里的
 * 异常不会经过这里，需要在源头自己 try/catch。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 生产环境这里应该上报到监控；当前先落控制台，方便本地排查
    console.error('[clab] 页面渲染出错', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <section className="page" role="alert">
        <div className="card mx-auto mt-10 max-w-[560px] p-7 text-center">
          <div
            className="mx-auto grid h-12 w-12 place-items-center rounded-xl"
            style={{ background: 'rgba(220,38,38,.1)', color: 'var(--danger-ink)' }}
          >
            <AlertOctagon size={22} />
          </div>
          <h1 className="mt-4 text-[18px] font-semibold">这个页面出了点问题</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {this.props.hint ?? '不是你的操作有误，是页面渲染时抛了异常。可以先重试一次，或者回首页换个入口。'}
          </p>
          <pre
            className="mt-3 max-h-[120px] overflow-auto rounded-lg border p-2.5 text-left text-[10.5px] leading-relaxed"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}
          >
            {error.message}
          </pre>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={this.reset}>
              <RotateCcw size={13} />
              重试
            </button>
            <a href="/" className="btn btn-ghost btn-sm no-underline">
              回到首页
            </a>
          </div>
        </div>
      </section>
    );
  }
}
