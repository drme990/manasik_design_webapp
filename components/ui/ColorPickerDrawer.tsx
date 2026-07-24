'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LuPipette, LuPlus, LuX, LuPencil } from 'react-icons/lu';
import { cn } from '@/lib/utils/cn';
import { rgbToHex, hsvToRgb, rgbToHsv, hexToRgb } from '@/lib/utils/color';
import { useTranslations } from '@/lib/i18n/strings';
import Drawer from './Drawer';

export interface ColorPickerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  onChange: (value: string) => void;
  title?: string;
  onDragStart?: () => void;
  /** Called when the eye dropper is clicked. Parent should close drawer, pick color, then reopen. */
  onEyeDropper?: () => void;
  /**
   * When true, the drawer opens with the custom color picker already expanded
   * (instead of the palette). Used to reopen after an eye-dropper pick so the
   * user sees the picked color in the custom picker.
   */
  forceCustomPickerOnOpen?: boolean;
  /** Saved colors from DB (session-cached by parent). */
  savedColors?: string[];
  /** Add the current color to saved colors. */
  onSaveColor?: (color: string) => void;
  /** Remove a color from saved colors. */
  onRemoveSavedColor?: (color: string) => void;
}

const RECENT_KEY = 'color-picker-recent';
const MAX_RECENT = 10;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(colors: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(colors.slice(0, MAX_RECENT)));
  } catch {
    // ignore
  }
}

export default function ColorPickerDrawer({
  isOpen,
  onClose,
  value,
  onChange,
  title,
  onDragStart,
  onEyeDropper,
  forceCustomPickerOnOpen = false,
  savedColors = [],
  onSaveColor,
  onRemoveSavedColor,
}: ColorPickerDrawerProps) {
  const t = useTranslations('editor.colorPicker');
  const [recent, setRecent] = useState<string[]>([]);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [editSavedColors, setEditSavedColors] = useState(false);
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(1);
  const [val, setVal] = useState(1);
  const [hexInput, setHexInput] = useState(value);
  const [rInput, setRInput] = useState('0');
  const [gInput, setGInput] = useState('0');
  const [bInput, setBInput] = useState('0');

  const fieldRef = useRef<HTMLDivElement>(null);
  const hueFieldRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const hexInputRef = useRef<HTMLInputElement>(null);
  const rInputRef = useRef<HTMLInputElement>(null);
  const gInputRef = useRef<HTMLInputElement>(null);
  const bInputRef = useRef<HTMLInputElement>(null);

  // Refs for current HSV during drag (avoids re-renders)
  const hueRef = useRef(0);
  const satRef = useRef(1);
  const valRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const pendingHexRef = useRef<string | null>(null);

  // Reset recent colors and custom picker state when drawer opens
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setRecent(loadRecent());
      setShowCustomPicker(forceCustomPickerOnOpen);
    }
  }

  // Sync everything when the drawer opens
  useEffect(() => {
    if (isOpen) {
      syncFromHex(value);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep inputs in sync when value changes externally (not during drag)
  useEffect(() => {
    if (isOpen && !draggingRef.current) syncInputsFromHex(value);
  }, [value, isOpen]);

  function syncFromHex(hex: string) {
    const rgb = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    hueRef.current = hsv.h * 360;
    satRef.current = hsv.s;
    valRef.current = hsv.v;
    setHue(hsv.h * 360);
    setSat(hsv.s);
    setVal(hsv.v);
    syncInputsFromHex(hex);
  }

  function syncInputsFromHex(hex: string) {
    const rgb = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
    setHexInput(hex.toUpperCase());
    setRInput(String(rgb.r));
    setGInput(String(rgb.g));
    setBInput(String(rgb.b));
  }

  const addRecent = useCallback((color: string) => {
    setRecent((prev) => {
      const filtered = prev.filter((c) => c.toLowerCase() !== color.toLowerCase());
      const next = [color, ...filtered].slice(0, MAX_RECENT);
      saveRecent(next);
      return next;
    });
  }, []);

  // --- Color field: direct DOM updates during drag for zero lag ---
  const updateIndicatorDOM = useCallback((s: number, v: number) => {
    if (indicatorRef.current) {
      indicatorRef.current.style.left = `${s * 100}%`;
      indicatorRef.current.style.top = `${(1 - v) * 100}%`;
      // Update indicator background to match the actual current color
      const rgb = hsvToRgb(hueRef.current / 360, s, v);
      indicatorRef.current.style.backgroundColor = rgbToHex(rgb.r, rgb.g, rgb.b);
    }
  }, []);

  const flushPendingChange = useCallback(() => {
    if (pendingHexRef.current) {
      const hex = pendingHexRef.current;
      pendingHexRef.current = null;
      // Sync all React state now that drag is done
      const rgb = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
      setHue(hueRef.current);
      setSat(satRef.current);
      setVal(valRef.current);
      setHexInput(hex.toUpperCase());
      setRInput(String(rgb.r));
      setGInput(String(rgb.g));
      setBInput(String(rgb.b));
      onChange(hex);
    }
  }, [onChange]);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = fieldRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      const s = x / rect.width;
      const v = 1 - y / rect.height;
      satRef.current = s;
      valRef.current = v;

      // Direct DOM update — no React re-render
      updateIndicatorDOM(s, v);

      // Throttle onChange via rAF
      const rgb = hsvToRgb(hueRef.current / 360, s, v);
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      pendingHexRef.current = hex;

      // Direct DOM update for hex/RGB inputs — zero-lag during drag
      if (hexInputRef.current) hexInputRef.current.value = hex.toUpperCase();
      if (rInputRef.current) rInputRef.current.value = String(rgb.r);
      if (gInputRef.current) gInputRef.current.value = String(rgb.g);
      if (bInputRef.current) bInputRef.current.value = String(rgb.b);

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          if (pendingHexRef.current) {
            onChange(pendingHexRef.current);
            pendingHexRef.current = null;
          }
        });
      }
    },
    [updateIndicatorDOM, onChange],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onDragStart?.();
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    // Cancel any pending rAF and flush final state
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    flushPendingChange();
  };

  // --- Hue slider ---
  const handleHueChange = (h: number) => {
    hueRef.current = h;
    setHue(h);
    const rgb = hsvToRgb(h / 360, satRef.current, valRef.current);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    syncInputsFromHex(hex);
    // Direct DOM updates for zero-lag during slider drag
    const hueRgb = hsvToRgb(h / 360, 1, 1);
    const hueHex = rgbToHex(hueRgb.r, hueRgb.g, hueRgb.b);
    if (hueFieldRef.current) {
      hueFieldRef.current.style.backgroundColor = hueHex;
    }
    if (indicatorRef.current) {
      indicatorRef.current.style.backgroundColor = hex;
    }
    onChange(hex);
  };

  // --- Hex input ---
  const handleHexChange = (raw: string) => {
    setHexInput(raw);
    let hex = raw.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      syncFromHex(hex);
      onChange(hex);
    }
  };

  const handleHexCommit = () => {
    let hex = hexInput.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      syncInputsFromHex(value);
    } else {
      addRecent(hex.toUpperCase());
    }
  };

  // --- RGB inputs ---
  const handleRgbChange = (channel: 'r' | 'g' | 'b', raw: string) => {
    const num = Math.max(0, Math.min(255, parseInt(raw) || 0));
    const r = channel === 'r' ? num : parseInt(rInput) || 0;
    const g = channel === 'g' ? num : parseInt(gInput) || 0;
    const b = channel === 'b' ? num : parseInt(bInput) || 0;
    if (channel === 'r') setRInput(String(num));
    if (channel === 'g') setGInput(String(num));
    if (channel === 'b') setBInput(String(num));
    const hex = rgbToHex(r, g, b);
    syncFromHex(hex);
    onChange(hex);
  };

  const handleRecentSelect = (color: string) => {
    syncFromHex(color);
    onChange(color);
  };

  const handleClose = () => {
    addRecent(value.toUpperCase());
    onClose();
  };

  const handleEyeDropper = () => {
    addRecent(value.toUpperCase());
    onEyeDropper?.();
  };

  // Current hue as a solid color
  const hueColor = useMemo(() => {
    const rgb = hsvToRgb(hue / 360, 1, 1);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }, [hue]);

  // Current color computed from HSV state — used for indicator background
  // so it always matches the indicator position, not the lagging value prop
  const currentColor = useMemo(() => {
    const rgb = hsvToRgb(hue / 360, sat, val);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }, [hue, sat, val]);

  // Indicator position (only used for initial render / non-drag updates)
  const indicatorX = `${sat * 100}%`;
  const indicatorY = `${(1 - val) * 100}%`;

  // Eye dropper icon — rendered in the drawer header as the leading icon
  const eyeDropperIcon = onEyeDropper ? (
    <button
      type="button"
      onClick={handleEyeDropper}
      className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
      aria-label={t('eyeDropper')}
      title={t('eyeDropper')}
    >
      <LuPipette className="h-5 w-5" />
    </button>
  ) : undefined;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={handleClose}
      title={title || t('pickColor')}
      height={showCustomPicker ? 'twoThirds' : 'auto'}
      headerIcon={eyeDropperIcon}
    >
      <div className="space-y-5">
        {/* Custom color picker — color field, hue slider, hex/RGB inputs */}
        {showCustomPicker && (
          <>
            {/* Color Field (saturation × brightness) */}
            <div
              ref={(el) => { fieldRef.current = el; hueFieldRef.current = el; }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative h-40 w-full cursor-crosshair touch-none overflow-hidden rounded-2xl border border-stroke"
              style={{ backgroundColor: hueColor }}
            >
              {/* White gradient → left to right = saturation 0→1 */}
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to right, #ffffff, transparent)' }}
              />
              {/* Black gradient → top to bottom = brightness 1→0 */}
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, #000000, transparent)' }}
              />
              {/* Indicator */}
              <div
                ref={indicatorRef}
                className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white shadow-lg"
                style={{ left: indicatorX, top: indicatorY, backgroundColor: currentColor }}
              />
            </div>

            {/* Hue slider (red → red rainbow) with custom thumb */}
            <div className="relative h-6 touch-none" dir="ltr">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                }}
              />
              <input
                type="range"
                min={0}
                max={360}
                value={hue}
                onChange={(e) => handleHueChange(Number(e.target.value))}
                onPointerDown={() => onDragStart?.()}
                className="absolute inset-0 h-full w-full cursor-pointer touch-none appearance-none bg-transparent focus:outline-none [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-lg"
              />
            </div>

            {/* Hex input with color preview */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-secondary">HEX</label>
              <div className="relative">
                <input
                  ref={hexInputRef}
                  type="text"
                  value={hexInput}
                  onChange={(e) => handleHexChange(e.target.value)}
                  onBlur={handleHexCommit}
                  className="w-full rounded-lg border border-stroke bg-background py-2.5 ps-12 pe-3 text-center text-sm font-mono uppercase text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  placeholder="#000000"
                  maxLength={7}
                />
                <div
                  className="pointer-events-none absolute left-2 top-1/2 h-7 w-7 -translate-y-1/2 rounded-md border border-stroke"
                  style={{ backgroundColor: value }}
                />
              </div>
            </div>

            {/* RGB inputs */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-secondary">RGB</label>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <span className="mb-1 block text-center text-[10px] font-semibold text-error">R</span>
                  <input
                    ref={rInputRef}
                    type="number"
                    min={0}
                    max={255}
                    value={rInput}
                    onChange={(e) => handleRgbChange('r', e.target.value)}
                    className="w-full rounded-lg border border-stroke bg-background px-2 py-2 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>
                <div>
                  <span className="mb-1 block text-center text-[10px] font-semibold text-success">G</span>
                  <input
                    ref={gInputRef}
                    type="number"
                    min={0}
                    max={255}
                    value={gInput}
                    onChange={(e) => handleRgbChange('g', e.target.value)}
                    className="w-full rounded-lg border border-stroke bg-background px-2 py-2 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>
                <div>
                  <span className="mb-1 block text-center text-[10px] font-semibold text-brand-primary">B</span>
                  <input
                    ref={bInputRef}
                    type="number"
                    min={0}
                    max={255}
                    value={bInput}
                    onChange={(e) => handleRgbChange('b', e.target.value)}
                    className="w-full rounded-lg border border-stroke bg-background px-2 py-2 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* Saved colors (circles) — from DB, session-cached */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-xs font-medium text-secondary">{t('savedColors')}</label>
            <div className="flex items-center gap-2">
              {onRemoveSavedColor && savedColors.length > 0 && (
                <button
                  type="button"
                  onClick={() => setEditSavedColors((v) => !v)}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors',
                    editSavedColors
                      ? 'bg-brand-primary/15 text-brand-primary'
                      : 'text-secondary hover:bg-stroke hover:text-foreground'
                  )}
                  aria-label={t('editColors')}
                  title={t('editColors')}
                >
                  <LuPencil className="h-3.5 w-3.5" />
                  {t('editColors')}
                </button>
              )}
              {onSaveColor && (
                <button
                  type="button"
                  onClick={() => onSaveColor(value.toUpperCase())}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-primary transition-colors hover:bg-brand-primary/10"
                  aria-label={t('saveCurrentColor')}
                  title={t('saveCurrentColor')}
                >
                  <LuPlus className="h-3.5 w-3.5" />
                  {t('saveCurrentColor')}
                </button>
              )}
            </div>
          </div>
          {savedColors.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="flex min-w-0 w-2/3 items-center gap-2.5 overflow-x-auto scrollbar-none [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
                {savedColors.map((color, index) => (
                  <div key={`${color}-${index}`} className="relative shrink-0">
                    <button
                      onClick={() => !editSavedColors && handleRecentSelect(color)}
                      className={cn(
                        'h-9 w-9 rounded-full border-2 transition-transform active:scale-90',
                        value.toLowerCase() === color.toLowerCase()
                          ? 'border-foreground'
                          : 'border-stroke',
                      )}
                      style={{ backgroundColor: color }}
                      aria-label={color}
                    />
                    {editSavedColors && onRemoveSavedColor && (
                      <button
                        onClick={() => onRemoveSavedColor(color)}
                        className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-error text-white"
                        aria-label={t('removeColor')}
                      >
                        <LuX className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {/* Custom color button — normal button on the right, 1/3 width */}
              <button
                type="button"
                onClick={() => setShowCustomPicker((v) => !v)}
                className={cn(
                  'flex h-9 w-1/3 shrink-0 items-center justify-center gap-1.5 rounded-xl border-2 px-2 text-xs font-medium transition-colors',
                  showCustomPicker
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                    : 'border-stroke bg-card-bg text-foreground hover:border-brand-primary/50'
                )}
                aria-label={showCustomPicker ? t('hideCustomColor') : t('customColor')}
                title={showCustomPicker ? t('hideCustomColor') : t('customColor')}
              >
                <LuPipette className="h-4 w-4" />
                <span className="truncate">{showCustomPicker ? t('hideCustomColor') : t('customColor')}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              {/* Custom color button — shown even when no saved colors, 1/3 width */}
              <button
                type="button"
                onClick={() => setShowCustomPicker((v) => !v)}
                className={cn(
                  'flex h-9 w-1/3 shrink-0 items-center justify-center gap-1.5 rounded-xl border-2 px-2 text-xs font-medium transition-colors',
                  showCustomPicker
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                    : 'border-stroke bg-card-bg text-foreground hover:border-brand-primary/50'
                )}
                aria-label={showCustomPicker ? t('hideCustomColor') : t('customColor')}
                title={showCustomPicker ? t('hideCustomColor') : t('customColor')}
              >
                <LuPipette className="h-4 w-4" />
                <span className="truncate">{showCustomPicker ? t('hideCustomColor') : t('customColor')}</span>
              </button>
              <p className="flex h-9 w-2/3 items-center truncate text-sm text-secondary">{t('savedColorsEmpty')}</p>
            </div>
          )}
        </div>

        {/* Recent colors (circles) */}
        {recent.length > 0 && (
          <div>
            <label className="mb-2 block text-xs font-medium text-secondary">{t('recent')}</label>
            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
              {recent.map((color, index) => (
                <button
                  key={`${color}-${index}`}
                  onClick={() => handleRecentSelect(color)}
                  className={cn(
                    'h-9 w-9 shrink-0 rounded-full border-2 transition-transform active:scale-90',
                    value.toLowerCase() === color.toLowerCase()
                      ? 'border-foreground'
                      : 'border-stroke',
                  )}
                  style={{ backgroundColor: color }}
                  aria-label={color}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
