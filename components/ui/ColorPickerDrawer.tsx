'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
}: ColorPickerDrawerProps) {
  const t = useTranslations('editor.colorPicker');
  const [recent, setRecent] = useState<string[]>([]);
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(1);
  const [val, setVal] = useState(1);
  const [hexInput, setHexInput] = useState(value);
  const [rInput, setRInput] = useState('0');
  const [gInput, setGInput] = useState('0');
  const [bInput, setBInput] = useState('0');

  const fieldRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Refs for current HSV during drag (avoids re-renders)
  const hueRef = useRef(0);
  const satRef = useRef(1);
  const valRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const pendingHexRef = useRef<string | null>(null);

  // Sync everything when the drawer opens
  useEffect(() => {
    if (isOpen) {
      setRecent(loadRecent());
      syncFromHex(value);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep inputs in sync when value changes externally (not during drag)
  useEffect(() => {
    if (isOpen && !draggingRef.current) syncInputsFromHex(value);
  }, [value, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Current hue as a solid color
  const hueColor = useMemo(() => {
    const rgb = hsvToRgb(hue / 360, 1, 1);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }, [hue]);

  // Indicator position (only used for initial render / non-drag updates)
  const indicatorX = `${sat * 100}%`;
  const indicatorY = `${(1 - val) * 100}%`;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={handleClose}
      title={title || t('pickColor')}
      height="full"
    >
      <div className="space-y-5">
        {/* 1 — Color Field (saturation × brightness) */}
        <div
          ref={fieldRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative h-40 w-full touch-none overflow-hidden rounded-2xl border border-stroke"
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
          {/* Indicator — positioned via ref during drag, via style otherwise */}
          <div
            ref={indicatorRef}
            className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white shadow-lg"
            style={{ left: indicatorX, top: indicatorY, backgroundColor: value }}
          />
        </div>

        {/* 2 — Hue slider (red → red rainbow) with custom thumb */}
        <div className="relative h-6">
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
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent focus:outline-none [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-lg [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:shadow-lg"
          />
        </div>

        {/* 3 — Hex input */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-secondary">HEX</label>
          <input
            type="text"
            value={hexInput}
            onChange={(e) => handleHexChange(e.target.value)}
            onBlur={handleHexCommit}
            className="w-full rounded-lg border border-stroke bg-background px-3 py-2.5 text-center text-sm font-mono uppercase text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary"
            placeholder="#000000"
            maxLength={7}
          />
        </div>

        {/* 4 — RGB inputs */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-secondary">RGB</label>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <span className="mb-1 block text-center text-[10px] font-semibold text-error">R</span>
              <input
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

        {/* 5 — Recent colors (circles) */}
        {recent.length > 0 && (
          <div>
            <label className="mb-2 block text-xs font-medium text-secondary">الأخيرة</label>
            <div className="flex flex-wrap gap-2.5">
              {recent.map((color, index) => (
                <button
                  key={`${color}-${index}`}
                  onClick={() => handleRecentSelect(color)}
                  className={cn(
                    'h-9 w-9 rounded-full border-2 transition-transform active:scale-90',
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
