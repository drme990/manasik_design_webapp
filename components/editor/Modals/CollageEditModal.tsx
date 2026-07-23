'use client';

import { useState, useRef, useEffect } from 'react';
import FullPageDrawer from '@/components/ui/FullPageDrawer';
import Button from '@/components/ui/Button';
import { useTranslations } from '@/lib/i18n/strings';
import { cn } from '@/lib/utils/cn';
import { COLLAGE_LAYOUTS } from '@/lib/constants/presets';
import { LuReplace, LuRotateCcw, LuPlus, LuTrash2 } from 'react-icons/lu';
import type { ImageLayer, ImageLayerCollageCell } from '@/types';
import CollageCellImage, { getCellClampBounds, clampCellOffset } from '../CollageCellImage';

export interface CollageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  layer: ImageLayer | null;
  onUpdate: (updates: Partial<ImageLayer>) => void;
}

export default function CollageEditModal({
  isOpen,
  onClose,
  layer,
  onUpdate,
}: CollageEditModalProps) {
  const t = useTranslations('editor.modals.collageEdit');
  const uiT = useTranslations('ui');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [dragState, setDragState] = useState<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  // Drag-and-drop swap state — pointer-based (works on both desktop mouse and
  // mobile touch). Separate from the pointer-based pan/zoom above.
  // Only unselected cells with images are drag sources; all cells are drop
  // targets. Dropping cell A onto cell B swaps their content.
  //
  // swapStartRef tracks a potential swap before the movement threshold is met
  // (so a tap still selects the cell, while a drag initiates a swap).
  const swapStartRef = useRef<{ x: number; y: number; index: number; pointerId: number; cellW: number; cellH: number; uri: string } | null>(null);
  const [swapDrag, setSwapDrag] = useState<{
    sourceIndex: number;
    x: number;
    y: number;
    imgW: number;
    imgH: number;
    uri: string;
  } | null>(null);
  const swapDragRef = useRef(swapDrag);
  useEffect(() => { swapDragRef.current = swapDrag; }, [swapDrag]);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  // Set to true when a swap drag just ended — prevents the subsequent click
  // from selecting the cell (a drag should not also select).
  const swapJustEndedRef = useRef(false);

  // Natural dimensions of each cell's image — needed to calculate the cover
  // scale and clamp the drag offset so the image always covers the cell frame.
  const [imageDimensions, setImageDimensions] = useState<Map<number, { w: number; h: number }>>(new Map());
  const imageDimensionsRef = useRef(imageDimensions);
  useEffect(() => {
    imageDimensionsRef.current = imageDimensions;
  }, [imageDimensions]);

  // Pinch-to-zoom + rotate state
  const pinchRef = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    startDistance: number;
    startScale: number;
    startAngle: number;
    startRotation: number;
    // Smoothing fields
    lastScaleFactor?: number;
    lastAngleDelta?: number;
    lastDelta?: { dist: number; angle: number };
  }>({ pointers: new Map(), startDistance: 0, startScale: 1, startAngle: 0, startRotation: 0 });

  // Reset state when the modal opens (adjusting state when a prop changes —
  // per React docs, this is done during render, not in an effect).
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setSelectedCell(null);
      setDragState(null);
      setSwapDrag(null);
      setDropTarget(null);
    }
  }

  useEffect(() => {
    if (isOpen) {
      pinchRef.current.pointers.clear();
      pinchRef.current.startDistance = 0;
      pinchRef.current.startAngle = 0;
      pinchRef.current.startRotation = 0;
      pinchRef.current.lastScaleFactor = undefined;
      pinchRef.current.lastAngleDelta = undefined;
      pinchRef.current.lastDelta = undefined;
      // Reset swap-drag refs too (can't mutate refs during render)
      swapStartRef.current = null;
      swapJustEndedRef.current = false;
    }
  }, [isOpen]);

  const collage = layer?.collage;
  const layout = collage ? COLLAGE_LAYOUTS.find(l => l.id === collage.layout) || COLLAGE_LAYOUTS[0] : null;

  // Preview scale — ratio between on-screen preview size and real canvas size.
  // Drag deltas in screen px are divided by this to convert to canvas px.
  const previewScale = layer ? Math.min(layer.width, 280) / layer.width : 1;

  const handleReplaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || selectedCell === null || !collage) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const uri = event.target?.result as string;
      // Load image to capture natural dimensions
      const probe = new Image();
      probe.onload = () => {
        setImageDimensions(prev => {
          const next = new Map(prev);
          next.set(selectedCell, { w: probe.naturalWidth, h: probe.naturalHeight });
          return next;
        });
        const cells = [...collage.cells];
        cells[selectedCell] = {
          ...cells[selectedCell],
          uri,
          naturalWidth: probe.naturalWidth,
          naturalHeight: probe.naturalHeight,
          // scale=1 means "100% = fills the box" (cover).
          // CollageCellImage internally applies fillScale to go contain→cover.
          offsetX: 0,
          offsetY: 0,
          scale: 1,
          rotation: 0,
        };
        const uris = cells.map(c => c.uri);
        onUpdate({ collage: { ...collage, cells, uris } });
      };
      probe.src = uri;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCellUpdate = (index: number, updates: Partial<ImageLayerCollageCell>) => {
    if (!collage) return;
    const cells = [...collage.cells];
    cells[index] = { ...cells[index], ...updates };
    onUpdate({ collage: { ...collage, cells } });
  };

  const handleAddImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !collage) return;
    if (collage.cells.length >= 4) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const uri = event.target?.result as string;
      const probe = new Image();
      probe.onload = () => {
        const newIdx = collage.cells.length;
        setImageDimensions(prev => {
          const next = new Map(prev);
          next.set(newIdx, { w: probe.naturalWidth, h: probe.naturalHeight });
          return next;
        });
        const newLayoutId = COLLAGE_LAYOUTS.find(l => l.count === collage.cells.length + 1)?.id ?? collage.layout;

        const newCells = [...collage.cells, {
          uri,
          offsetX: 0,
          offsetY: 0,
          scale: 1, // 1.0 = 100% = fills the cell
          naturalWidth: probe.naturalWidth,
          naturalHeight: probe.naturalHeight,
        }];
        const newUris = newCells.map(c => c.uri);
        onUpdate({
          collage: {
            ...collage,
            cells: newCells,
            uris: newUris,
            layout: newLayoutId,
          },
        });
      };
      probe.src = uri;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Remove a cell's image — keeps at least 2 cells so the collage is never
  // reduced to a single image. Also picks a layout matching the new count.
  const handleRemoveCell = (index: number) => {
    if (!collage) return;
    if (collage.cells.length <= 2) return; // minimum 2 images
    const newCells = collage.cells.filter((_, i) => i !== index);
    const newUris = newCells.map(c => c.uri);
    const newLayout = COLLAGE_LAYOUTS.find(l => l.count === newCells.length);
    // Clear cached dimensions for shifted indices
    setImageDimensions(prev => {
      const next = new Map<number, { w: number; h: number }>();
      newCells.forEach((_, i) => {
        const srcIdx = i < index ? i : i + 1;
        const d = prev.get(srcIdx);
        if (d) next.set(i, d);
      });
      return next;
    });
    setSelectedCell(null);
    onUpdate({
      collage: {
        ...collage,
        cells: newCells,
        uris: newUris,
        layout: newLayout?.id ?? collage.layout,
      },
    });
  };

  // Swap the contents of two cells (uri, offsets, scale, rotation, natural
  // dimensions). Used by the drag-and-drop swap interaction.
  const swapCells = (a: number, b: number) => {
    if (!collage || a === b) return;
    const cells = [...collage.cells];
    const tmp = cells[a];
    cells[a] = cells[b];
    cells[b] = tmp;
    const uris = cells.map(c => c.uri);
    // Swap cached image dimensions so pan/zoom clamping still works after swap
    setImageDimensions(prev => {
      const next = new Map(prev);
      const da = prev.get(a);
      const db = prev.get(b);
      if (db) next.set(a, db); else next.delete(a);
      if (da) next.set(b, da); else next.delete(b);
      return next;
    });
    onUpdate({ collage: { ...collage, cells, uris } });
  };

  // ─── Pointer-based swap drag (works on desktop + mobile) ───────────────
  // On unselected cells with images, a tap selects the cell (via onClick),
  // while a drag beyond SWAP_THRESHOLD initiates a swap. The floating preview
  // follows the pointer; the cell under the pointer is highlighted as the
  // drop target. On pointer up, if over a different cell, the two cells swap.
  const SWAP_THRESHOLD = 6; // px of movement before swap drag starts

  const handleSwapPointerDown = (e: React.PointerEvent, index: number, cellW: number, cellH: number) => {
    if (!collage || selectedCell === index) return;
    const cell = collage.cells[index];
    if (!cell?.uri) return;
    // Record the potential swap start — don't begin the drag yet, wait for
    // movement beyond the threshold so a quick tap still selects the cell.
    swapStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      index,
      pointerId: e.pointerId,
      cellW,
      cellH,
      uri: cell.uri,
    };
    // Capture the pointer so move/up events keep firing even outside the cell
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleSwapPointerMove = (e: React.PointerEvent) => {
    const start = swapStartRef.current;
    if (!start || start.pointerId !== e.pointerId) return;

    // If swap drag hasn't started yet, check the threshold
    if (!swapDragRef.current) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < SWAP_THRESHOLD) return;
      // Threshold met — begin the swap drag
      setSwapDrag({
        sourceIndex: start.index,
        x: e.clientX,
        y: e.clientY,
        imgW: start.cellW,
        imgH: start.cellH,
        uri: start.uri,
      });
    }

    // Update floating preview position
    setSwapDrag(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : prev);

    // Detect drop target via elementFromPoint — the floating preview has
    // pointer-events:none so it won't intercept the hit test.
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cellEl = el?.closest('[data-cell-index]') as HTMLElement | null;
    if (cellEl) {
      const targetIdx = Number(cellEl.dataset.cellIndex);
      if (targetIdx !== swapDragRef.current?.sourceIndex) {
        setDropTarget(targetIdx);
      } else {
        setDropTarget(null);
      }
    } else {
      setDropTarget(null);
    }
  };

  const handleSwapPointerUp = (e: React.PointerEvent) => {
    swapStartRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);

    const drag = swapDragRef.current;
    if (drag) {
      // A swap drag was in progress — perform the swap if there's a valid target
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cellEl = el?.closest('[data-cell-index]') as HTMLElement | null;
      const targetIdx = cellEl ? Number(cellEl.dataset.cellIndex) : null;
      if (targetIdx !== null && targetIdx !== drag.sourceIndex) {
        swapCells(drag.sourceIndex, targetIdx);
      }
      // Suppress the click that follows pointerup — a drag shouldn't select
      swapJustEndedRef.current = true;
    }
    // If no swap drag was started (movement < threshold), the onClick handler
    // will fire and select the cell — nothing to do here.
    setSwapDrag(null);
    setDropTarget(null);
  };

  const handleSwapPointerCancel = (e: React.PointerEvent) => {
    swapStartRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    setSwapDrag(null);
    setDropTarget(null);
  };

  const handleImagePointerDown = (e: React.PointerEvent, index: number) => {
    if (!collage || selectedCell !== index) return;
    e.preventDefault();
    e.stopPropagation();

    const cell = collage.cells[index];
    const pinch = pinchRef.current;

    // Track pointer for pinch detection
    pinch.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // If two pointers are down, start pinch + rotate mode
    if (pinch.pointers.size === 2) {
      const pts = [...pinch.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      // Ignore if fingers are too close — causes extreme sensitivity
      if (dist < 20) return;
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      pinch.startDistance = dist;
      pinch.startScale = cell?.scale ?? 1;
      pinch.startAngle = angle;
      pinch.startRotation = cell?.rotation ?? 0;
      pinch.lastScaleFactor = undefined;
      pinch.lastAngleDelta = undefined;
      pinch.lastDelta = undefined;
      // Cancel drag when pinching
      setDragState(null);
      return;
    }

    // Single pointer — start drag.
    // Capture the pointer so move/up events keep firing on this element even
    // when the cursor leaves the cell bounds. Without this, pointerup is missed
    // when the mouse exits the cell, leaving dragState stuck and causing the
    // image to follow the mouse without a click.
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragState({
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: cell?.offsetX ?? 0,
      startOffsetY: cell?.offsetY ?? 0,
    });
  };

  const handleImagePointerMove = (e: React.PointerEvent) => {
    if (!collage || selectedCell === null) return;
    const pinch = pinchRef.current;

    // Update pointer position for pinch tracking
    if (pinch.pointers.has(e.pointerId)) {
      pinch.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two-finger pinch zoom + rotate
      if (pinch.pointers.size >= 2 && pinch.startDistance > 0) {
        e.preventDefault();
        const pts = [...pinch.pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);

        // Dead zone — ignore micro-movements to reduce jitter
        const lastDelta = pinch.lastDelta ?? { dist: pinch.startDistance, angle: pinch.startAngle };
        const distMoved = Math.abs(dist - lastDelta.dist);
        const angleMoved = Math.abs((angle - lastDelta.angle) * (180 / Math.PI));
        if (distMoved < 1.5 && angleMoved < 1.5) {
          return;
        }

        // Smoothed scale factor
        const rawScaleFactor = dist / pinch.startDistance;
        const prevScaleFactor = pinch.lastScaleFactor ?? rawScaleFactor;
        const SMOOTH_ALPHA = 0.4;
        const scaleFactor = prevScaleFactor * (1 - SMOOTH_ALPHA) + rawScaleFactor * SMOOTH_ALPHA;
        const clampedScale = Math.max(0.1, Math.min(10, scaleFactor));
        const newScale = Math.max(0.1, Math.min(10, pinch.startScale * clampedScale));

        // Smoothed rotation delta (degrees)
        const rawAngleDelta = (angle - pinch.startAngle) * (180 / Math.PI);
        const prevAngleDelta = pinch.lastAngleDelta ?? rawAngleDelta;
        const angleDelta = prevAngleDelta * (1 - SMOOTH_ALPHA) + rawAngleDelta * SMOOTH_ALPHA;
        let newRotation = pinch.startRotation + angleDelta;

        // Magnetic snapping to 45° increments
        const SNAP_THRESHOLD = 4;
        const snapped = Math.round(newRotation / 45) * 45;
        if (Math.abs(newRotation - snapped) < SNAP_THRESHOLD) {
          newRotation = snapped;
        }

        handleCellUpdate(selectedCell, { scale: newScale, rotation: newRotation });

        // Persist smoothed values for next move
        pinch.lastScaleFactor = scaleFactor;
        pinch.lastAngleDelta = angleDelta;
        pinch.lastDelta = { dist, angle };
        return;
      }
    }

    // Single-finger drag
    if (!dragState || !layout) return;
    e.preventDefault();
    // Convert screen-pixel delta to full-canvas-pixel space so offsetX/Y
    // are stored in the same coordinate space LayerRenderer uses.
    const dx = (e.clientX - dragState.startX) / previewScale;
    const dy = (e.clientY - dragState.startY) / previewScale;
    let newOffsetX = dragState.startOffsetX + dx;
    let newOffsetY = dragState.startOffsetY + dy;

    // Clamp offsets so the image can't be dragged into empty space.
    const cellDef = layout.cells[selectedCell];
    const gap = collage.gap ?? 4;
    const realCellW = cellDef.w * layer.width - gap;
    const realCellH = cellDef.h * layer.height - gap;
    const cell = collage.cells[selectedCell];
    const nat = imageDimensionsRef.current.get(selectedCell)
      ?? (cell.naturalWidth && cell.naturalHeight
        ? { w: cell.naturalWidth, h: cell.naturalHeight }
        : null);
    if (nat) {
      const { maxX, maxY } = getCellClampBounds(nat.w, nat.h, realCellW, realCellH, cell.scale ?? 1);
      const clamped = clampCellOffset(newOffsetX, newOffsetY, maxX, maxY);
      newOffsetX = clamped.offsetX;
      newOffsetY = clamped.offsetY;
    }

    handleCellUpdate(selectedCell, {
      offsetX: newOffsetX,
      offsetY: newOffsetY,
    });
  };

  const handleImagePointerUp = (e: React.PointerEvent) => {
    const pinch = pinchRef.current;
    // Release pointer capture so the element stops tracking the pointer
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    pinch.pointers.delete(e.pointerId);
    // If one pointer remains, restart drag from its position
    if (pinch.pointers.size === 1 && selectedCell !== null && collage) {
      const cell = collage.cells[selectedCell];
      const [pt] = [...pinch.pointers.values()];
      setDragState({
        startX: pt.x,
        startY: pt.y,
        startOffsetX: cell?.offsetX ?? 0,
        startOffsetY: cell?.offsetY ?? 0,
      });
    } else if (pinch.pointers.size === 0) {
      pinch.startDistance = 0;
      pinch.startAngle = 0;
      pinch.startRotation = 0;
      pinch.lastScaleFactor = undefined;
      pinch.lastAngleDelta = undefined;
      pinch.lastDelta = undefined;
    }
    setDragState(null);
  };

  if (!collage || !layout || !layer) return null;

  const selectedCellData = selectedCell !== null ? collage.cells[selectedCell] : null;
  // Preview — smaller to fit mobile screens without breaking layout
  const previewW = Math.min(layer.width, 280);
  const previewH = previewW * (layer.height / layer.width);
  // Layouts available for the current image count
  const availableLayouts = COLLAGE_LAYOUTS.filter(l => l.count === collage.cells.length);
  // Mini-preview dimensions for layout thumbnails
  const thumbW = 48;
  const thumbH = thumbW * (layer.height / layer.width);

  const handleLayoutChange = (layoutId: string) => {
    onUpdate({ collage: { ...collage, layout: layoutId } });
  };

  return (
    <FullPageDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={t('title')}
      footer={
        collage.cells.length < 4 ? (
          <Button
            variant="primary"
            onClick={() => addFileInputRef.current?.click()}
            className="gap-2"
          >
            <LuPlus className="h-5 w-5" />
            {t('addImage')}
          </Button>
        ) : undefined
      }
    >
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceFile} />
      <input ref={addFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddImage} />

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Collage preview */}
        <div className="flex justify-center">
          <div
            className="relative overflow-hidden touch-none shadow-lg"
            style={{
              width: previewW,
              height: previewH,
              backgroundColor: collage.bgColor,
              borderRadius: collage.containerRadius ?? 0,
            }}
          >
            {layout.cells.map((cellDef, i) => {
              const cell = collage.cells[i];
              const gap = collage.gap ?? 4;
              const cellW = cellDef.w * layer.width * previewScale - gap;
              const cellH = cellDef.h * layer.height * previewScale - gap;
              const cellX = cellDef.x * layer.width * previewScale + gap / 2;
              const cellY = cellDef.y * layer.height * previewScale + gap / 2;
              const isSelected = selectedCell === i;
              return (
                <div
                  key={i}
                  data-cell-index={i}
                  onClick={() => {
                    // Suppress click after a swap drag (drag shouldn't select)
                    if (swapJustEndedRef.current) {
                      swapJustEndedRef.current = false;
                      return;
                    }
                    setSelectedCell(i);
                  }}
                  className={cn(
                    'absolute overflow-hidden transition-all cursor-pointer',
                    isSelected ? 'ring-2 ring-brand-primary ring-offset-1 touch-none' : 'hover:ring-1 hover:ring-brand-primary/50',
                    dropTarget === i && 'ring-2 ring-brand-primary ring-offset-2',
                    swapDrag?.sourceIndex === i && 'opacity-40'
                  )}
                  style={{
                    left: cellX,
                    top: cellY,
                    width: cellW,
                    height: cellH,
                    borderRadius: layer.borderRadius,
                  }}
                  // Selected cell: pointer-based pan/zoom (existing handlers).
                  // Unselected cell with image: pointer-based swap drag (new).
                  onPointerDown={isSelected
                    ? (e) => handleImagePointerDown(e, i)
                    : cell?.uri
                      ? (e) => handleSwapPointerDown(e, i, cellW, cellH)
                      : undefined}
                  onPointerMove={isSelected
                    ? handleImagePointerMove
                    : cell?.uri
                      ? handleSwapPointerMove
                      : undefined}
                  onPointerUp={isSelected
                    ? handleImagePointerUp
                    : cell?.uri
                      ? handleSwapPointerUp
                      : undefined}
                  onPointerCancel={isSelected
                    ? handleImagePointerUp
                    : cell?.uri
                      ? handleSwapPointerCancel
                      : undefined}
                >
                  {cell?.uri ? (
                    <CollageCellImage
                      cell={cell}
                      cellWidth={cellDef.w * layer.width - gap}
                      cellHeight={cellDef.h * layer.height - gap}
                      displayScale={previewScale}
                      index={i}
                      onDimensionsLoaded={(idx, w, h) => {
                        setImageDimensions(prev => {
                          if (prev.get(idx)?.w === w) return prev;
                          const next = new Map(prev);
                          next.set(idx, { w, h });
                          return next;
                        });
                      }}
                      className={isSelected ? 'cursor-move' : undefined}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted text-secondary text-xs">
                      {i + 1}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Layout picker — shows all layouts matching the current image count */}
        {availableLayouts.length > 1 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{t('layout')}</h3>
            <div className="flex flex-wrap gap-2">
              {availableLayouts.map((l) => {
                const isActive = collage.layout === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => handleLayoutChange(l.id)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border p-2 transition-all',
                      isActive
                        ? 'border-brand-primary ring-2 ring-brand-primary/30 bg-brand-primary/5'
                        : 'border-stroke hover:border-brand-primary/50'
                    )}
                  >
                    {/* Mini layout preview */}
                    <div
                      className="relative overflow-hidden bg-muted"
                      style={{ width: thumbW, height: thumbH, borderRadius: 4 }}
                    >
                      {l.cells.map((c, ci) => {
                        const gap = collage.gap ?? 4;
                        const cw = c.w * thumbW - gap;
                        const ch = c.h * thumbH - gap;
                        const cx = c.x * thumbW + gap / 2;
                        const cy = c.y * thumbH + gap / 2;
                        return (
                          <div
                            key={ci}
                            className={cn(
                              'absolute rounded-sm',
                              isActive ? 'bg-brand-primary/60' : 'bg-foreground/20'
                            )}
                            style={{ left: cx, top: cy, width: cw, height: ch }}
                          />
                        );
                      })}
                    </div>
                    <span className={cn(
                      'text-[10px] leading-tight',
                      isActive ? 'font-semibold text-foreground' : 'text-secondary'
                    )}>
                      {l.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected cell controls */}
        {selectedCell !== null && selectedCellData ? (
          <div className="space-y-4 rounded-xl border border-stroke bg-card-bg p-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {t('cell', { index: selectedCell + 1 })}
              </h3>
              <button
                onClick={() => setSelectedCell(null)}
                className="text-xs text-secondary hover:text-foreground"
              >
                {uiT('done')}
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5"
              >
                <LuReplace className="h-4 w-4" />
                {t('replace')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCellUpdate(selectedCell, { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 })}
                className="gap-1.5"
              >
                <LuRotateCcw className="h-4 w-4" />
                {t('reset')}
              </Button>
              {/* Remove image — hidden when only 2 cells remain (minimum) */}
              {collage.cells.length > 2 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveCell(selectedCell)}
                  className="gap-1.5 text-red-500 hover:text-red-600"
                >
                  <LuTrash2 className="h-4 w-4" />
                  {t('remove')}
                </Button>
              )}
            </div>

            {/* Zoom slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-secondary">{t('zoom')}</label>
                <span className="text-xs font-medium text-foreground">{Math.round(selectedCellData.scale * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={3}
                step={0.05}
                value={selectedCellData.scale}
                onChange={(e) => handleCellUpdate(selectedCell, { scale: Number(e.target.value) })}
                className="w-full accent-brand-primary"
              />
            </div>

            {/* Drag hint */}
            <p className="text-center text-xs text-secondary">{t('dragHint')}</p>
            <p className="text-center text-xs text-secondary">{t('swapHint')}</p>
          </div>
        ) : (
          <div className="space-y-1 text-center">
            <p className="text-sm text-secondary">{t('selectHint')}</p>
            <p className="text-xs text-secondary">{t('swapHint')}</p>
          </div>
        )}
      </div>

      {/* Floating swap-drag preview — follows the pointer (mouse or finger).
          Shows just the image content (not the cell frame) so the user sees
          exactly what they're dragging. pointer-events:none so it doesn't
          interfere with elementFromPoint hit-testing for drop targets. */}
      {swapDrag && (
        <div
          className="pointer-events-none fixed z-9999"
          style={{
            left: swapDrag.x - swapDrag.imgW / 2,
            top: swapDrag.y - swapDrag.imgH / 2,
            width: swapDrag.imgW,
            height: swapDrag.imgH,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={swapDrag.uri}
            alt=""
            className="h-full w-full object-cover shadow-2xl ring-2 ring-brand-primary"
            style={{
              borderRadius: layer.borderRadius,
              opacity: 0.9,
            }}
            draggable={false}
          />
        </div>
      )}
    </FullPageDrawer>
  );
}
