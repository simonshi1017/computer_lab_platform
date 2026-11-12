import { useCallback, useEffect, useState } from 'react';
import { LESSONS_LIST } from '@clab/data';

const STORAGE_KEY = 'clab.progress';

export interface Progress {
  /** 已完成的关卡 id */
  done: string[];
}

function read(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { done: [] };
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const done = Array.isArray(parsed.done) ? parsed.done.filter((id) => typeof id === 'string') : [];
    // 过滤掉已经不存在的关卡，避免教程改版后进度显示成 6/5
    const valid = new Set(LESSONS_LIST.map((lesson) => lesson.id));
    return { done: done.filter((id) => valid.has(id)) };
  } catch {
    return { done: [] };
  }
}

/**
 * 学习进度。
 *
 * M2 阶段只存在 localStorage：不需要登录就能用，刷新不丢。
 * M6 接账号后把这个 hook 换成远端读写即可，调用方不用改。
 */
export function useProgress() {
  const [progress, setProgress] = useState<Progress>({ done: [] });

  // 首次挂载后再读，避免 SSR/严格模式下读到不一致的快照
  useEffect(() => {
    setProgress(read());
  }, []);

  const persist = useCallback((next: Progress) => {
    setProgress(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式忽略 */
    }
  }, []);

  const toggle = useCallback(
    (id: string) => {
      setProgress((current) => {
        const done = current.done.includes(id)
          ? current.done.filter((item) => item !== id)
          : [...current.done, id];
        const next = { done };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* 隐私模式忽略 */
        }
        return next;
      });
    },
    [],
  );

  const reset = useCallback(() => persist({ done: [] }), [persist]);

  const isDone = useCallback((id: string) => progress.done.includes(id), [progress.done]);

  /** 当前进行中的关卡：第一个未完成的 */
  const currentLevel = LESSONS_LIST.find((lesson) => !progress.done.includes(lesson.id))?.level ?? null;

  return {
    done: progress.done,
    total: LESSONS_LIST.length,
    completed: progress.done.length,
    ratio: LESSONS_LIST.length ? progress.done.length / LESSONS_LIST.length : 0,
    isDone,
    toggle,
    reset,
    currentLevel,
  };
}
