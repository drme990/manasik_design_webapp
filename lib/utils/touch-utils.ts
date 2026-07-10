export function getLayerIdFromPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const layerEl = el.closest('[data-layer-id]');
  return layerEl?.getAttribute('data-layer-id') || null;
}

export function getActionFromPoint(x: number, y: number): { action: string; direction?: string; mode?: string } | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const actionEl = el.closest('[data-action]');
  if (!actionEl) return null;
  return {
    action: actionEl.getAttribute('data-action') || '',
    direction: actionEl.getAttribute('data-direction') || undefined,
    mode: actionEl.getAttribute('data-mode') || undefined,
  };
}
