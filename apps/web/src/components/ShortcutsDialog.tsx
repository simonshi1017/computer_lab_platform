import { Dialog } from '@/components/ui/Dialog';
import { modKeyLabel, SHORTCUTS } from '@/hooks/useShortcuts';
import { t } from '@/i18n';

/**
 * 快捷键面板。
 *
 * 内容来自 `SHORTCUTS`（唯一事实来源），所以「文档里写了但按不出来」
 * 这种情况不会发生。只有九条，不做搜索框——加搜索反而多一次输入。
 */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const actions = SHORTCUTS.filter((item) => !item.path);
  const navigation = SHORTCUTS.filter((item) => Boolean(item.path));

  return (
    <Dialog open={open} onClose={onClose} labelledBy="shortcuts-title">
      <div className="dialog-head">
        <b id="shortcuts-title">{t('键盘快捷键')}</b>
      </div>
      <div className="dialog-body">
        <div className="shortcut-group">
          <div className="shortcut-group-label">{t('操作')}</div>
          {actions.map((item) => (
            <div className="shortcut-row" key={item.label}>
              <span>{t(item.label)}</span>
              <span className="shortcut-keys">
                {item.keys.map((key) => (
                  <kbd key={key}>{key === 'MOD' ? modKeyLabel() : key}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>

        <div className="shortcut-group">
          <div className="shortcut-group-label">{t('跳转（先按 g）')}</div>
          {navigation.map((item) => (
            <div className="shortcut-row" key={item.label}>
              <span>{t(item.label)}</span>
              <span className="shortcut-keys">
                {item.keys.map((key) => (
                  <kbd key={key}>{key === 'MOD' ? modKeyLabel() : key}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>

        <p className="shortcut-foot">{t('在输入框里不会触发这些快捷键。')}</p>
      </div>
    </Dialog>
  );
}
