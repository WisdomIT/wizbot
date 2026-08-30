'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * 되돌리기/다시하기 상태 (#9 PR2b). 드래그처럼 연속된 변경은 `transient: true` 로 넣으면
 * 첫 변경 전 상태만 기록하고 나머지는 기록하지 않는다 — `endTransient()` 또는 일반 변경이 오면 묶음이 끝난다.
 */
export function useHistory<T>(initial: T, limit = 100) {
  const [state, setState] = useState<{ present: T; past: T[]; future: T[] }>({ present: initial, past: [], future: [] });
  const transient = useRef(false);

  const update = useCallback((fn: (prev: T) => T, opts?: { transient?: boolean }) => {
    //  진행 중인 묶음을 이어가는 변경만 기록을 건너뛴다
    const record = !(transient.current && opts?.transient);
    transient.current = opts?.transient ?? false;
    setState((s) => {
      const next = fn(s.present);
      if (next === s.present) return s;
      return record
        ? { present: next, past: [...s.past, s.present].slice(-limit), future: [] }
        : { ...s, present: next };
    });
  }, [limit]);

  const endTransient = useCallback(() => { transient.current = false; }, []);
  const reset = useCallback((value: T) => { transient.current = false; setState({ present: value, past: [], future: [] }); }, []);
  const undo = useCallback(() => {
    transient.current = false;
    setState((s) => (s.past.length ? { present: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.present, ...s.future] } : s));
  }, []);
  const redo = useCallback(() => {
    transient.current = false;
    setState((s) => (s.future.length ? { present: s.future[0], past: [...s.past, s.present], future: s.future.slice(1) } : s));
  }, []);

  return { present: state.present, canUndo: state.past.length > 0, canRedo: state.future.length > 0, update, endTransient, reset, undo, redo };
}
