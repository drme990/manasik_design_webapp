import { useEffect, useCallback } from 'react';
import { isShortcutKey } from '../utils/keyboard';

export interface KeyboardShortcuts {
  'ctrl+z'?: () => void;
  'ctrl+shift+z'?: () => void;
  'ctrl+y'?: () => void;
  'delete'?: () => void;
  'backspace'?: () => void;
  'ctrl+d'?: () => void;
  'ctrl+c'?: () => void;
  'ctrl+v'?: () => void;
  'ctrl+a'?: () => void;
  'escape'?: () => void;
  'arrowup'?: () => void;
  'arrowdown'?: () => void;
  'arrowleft'?: () => void;
  'arrowright'?: () => void;
  'ctrl+arrowup'?: () => void;
  'ctrl+arrowdown'?: () => void;
  'ctrl+arrowleft'?: () => void;
  'ctrl+arrowright'?: () => void;
  'shift+arrowup'?: () => void;
  'shift+arrowdown'?: () => void;
  'shift+arrowleft'?: () => void;
  'shift+arrowright'?: () => void;
}

export function useKeyboard(shortcuts: KeyboardShortcuts = {}, enabled: boolean = true) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Check each shortcut
    for (const [shortcut, handler] of Object.entries(shortcuts)) {
      if (handler && isShortcutKey(event, shortcut)) {
        event.preventDefault();
        event.stopPropagation();
        handler();
        return;
      }
    }
  }, [shortcuts, enabled]);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, enabled]);

  return {
    isShortcutKey
  };
}

export function useKeyboardShortcut(
  shortcut: string,
  handler: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isShortcutKey(event, shortcut)) {
        event.preventDefault();
        event.stopPropagation();
        handler();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcut, handler, enabled]);
}