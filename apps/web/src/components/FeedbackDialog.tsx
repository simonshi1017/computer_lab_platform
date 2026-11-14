import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquarePlus } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { track } from '@/lib/track';
import { t } from '@/i18n';

/**
 * 轻量反馈入口。
 *
 * 刻意不做「提交到后台工单库」：对内网工具来说，反馈的瓶颈从来不是
 * 存储，而是「用户愿不愿意写」。所以只留一个输入框 + 两个动作：
 * - 提交：写一条 `feedback` 埋点（正文进 props，管理员在数据看板能看到数量与全文）；
 * - 复制：剪贴板拿走，贴到 IM 里给维护者。内网 http 下 clipboard 不可用时会降级提示。
 *
 * 不做「已读回执」和「工单状态」——那是另一个产品，不是这个页面的职责。
 */
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname } = useLocation();
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSent(false);
    setCopied(false);
  }, [open]);

  const submit = () => {
    const note = text.trim();
    if (!note) return;
    // 埋点本身是静默的：反馈提交不能因为统计接口挂了而失败
    void track('feedback', { note: note.slice(0, 200), page: pathname, length: note.length });
    setSent(true);
    setText('');
  };

  const copy = async () => {
    const note = text.trim();
    if (!note) return;
    try {
      await navigator.clipboard.writeText(note);
      setCopied(true);
    } catch {
      // 内网 http 下没有 clipboard API，退回「选中让你自己复制」
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} labelledBy="feedback-title">
      <div className="dialog-head">
        <b id="feedback-title">{t('反馈问题')}</b>
      </div>
      <div className="dialog-body">
        {sent ? (
          <div className="feedback-done">
            <MessageSquarePlus size={18} />
            <b>{t('已收到，谢谢')}</b>
            <p>{t('反馈会出现在数据看板的事件分布里，维护者能看到正文。')}</p>
          </div>
        ) : (
          <>
            <p className="feedback-hint">
              {t('哪一步看不懂、哪个数字不对、或者想要什么功能，写在这里就行。')}
            </p>
            <textarea
              className="input feedback-input"
              value={text}
              maxLength={200}
              rows={4}
              placeholder={t('例如：27B 模型在 4090 上为什么只剩 3.5G 余量？')}
              onChange={(event) => setText(event.target.value)}
              aria-label={t('反馈内容')}
            />
            <div className="feedback-actions">
              <span className="feedback-count">
                {text.length} / 200
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={copy} disabled={!text.trim()}>
                {copied ? t('已复制') : t('复制内容')}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!text.trim()}>
                {t('提交反馈')}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
