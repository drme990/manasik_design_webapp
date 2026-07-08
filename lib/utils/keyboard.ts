export function isShortcutKey(event: KeyboardEvent, shortcut: string): boolean {
  const keys = shortcut.toLowerCase().split('+');
  const pressedKeys: string[] = [];

  if (event.ctrlKey || event.metaKey) pressedKeys.push('ctrl');
  if (event.shiftKey) pressedKeys.push('shift');
  if (event.altKey) pressedKeys.push('alt');
  pressedKeys.push(event.key.toLowerCase());

  return keys.every(key => pressedKeys.includes(key));
}