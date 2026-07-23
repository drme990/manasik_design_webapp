import { useState, useCallback, useRef, useEffect } from 'react';

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

const MAX_HISTORY = 50;

export function useUndoRedo<T>(initialState: T, maxHistory: number = MAX_HISTORY) {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: []
  });

  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const setPresent = useCallback((newPresent: T) => {
    setHistory(prev => ({
      past: [...prev.past, prev.present].slice(-maxHistory),
      present: newPresent,
      future: []
    }));
  }, [maxHistory]);

  const undo = useCallback(() => {
    if (!canUndo) return;

    setHistory(prev => {
      const { past, present, future } = prev;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);

      return {
        past: newPast,
        present: previous,
        future: [present, ...future]
      };
    });
  }, [canUndo]);

  const redo = useCallback(() => {
    if (!canRedo) return;

    setHistory(prev => {
      const { past, present, future } = prev;
      const next = future[0];
      const newFuture = future.slice(1);

      return {
        past: [...past, present],
        present: next,
        future: newFuture
      };
    });
  }, [canRedo]);

  const reset = useCallback((newState: T) => {
    setHistory({
      past: [],
      present: newState,
      future: []
    });
  }, []);

  const clear = useCallback(() => {
    setHistory(prev => ({
      past: [],
      present: prev.present,
      future: []
    }));
  }, []);

  const jumpTo = useCallback((index: number) => {
    if (index < 0 || index >= history.past.length) return;

    const newPast = history.past.slice(0, index + 1);
    const newPresent = newPast[newPast.length - 1];
    const newFuture = [...history.past.slice(index + 1), history.present, ...history.future];

    setHistory({
      past: newPast.slice(0, -1),
      present: newPresent,
      future: newFuture
    });
  }, [history]);

  return {
    state: history.present,
    setState: setPresent,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
    clear,
    jumpTo,
    historyLength: history.past.length + history.future.length + 1
  };
}