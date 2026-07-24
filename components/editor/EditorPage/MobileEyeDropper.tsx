'use client';

import { ImageColorPicker } from 'react-image-color-picker';

export interface MobileEyeDropperState {
    dataUrl: string;
    onPick: (hex: string) => void;
}

interface MobileEyeDropperProps {
    state: MobileEyeDropperState | null;
    eyeDropperLabel: string;
    cancelLabel: string;
    onClose: () => void;
}

export default function MobileEyeDropper({
    state,
    eyeDropperLabel,
    cancelLabel,
    onClose,
}: MobileEyeDropperProps) {
    if (!state) return null;

    return (
        <div className="fixed inset-0 z-100 flex flex-col items-center justify-center bg-black/90 p-4">
            <p className="mb-3 text-center text-sm text-white/80">
                {eyeDropperLabel}
            </p>
            <div className="max-h-[75vh] max-w-full overflow-hidden rounded-lg shadow-2xl">
                <ImageColorPicker
                    imgSrc={state.dataUrl}
                    zoom={1}
                    onColorPick={(color: string) => {
                        // Library returns "rgb(r, g, b)" — convert to hex
                        const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                        if (match) {
                            const hex = '#' + [match[1], match[2], match[3]]
                                .map((v) => parseInt(v).toString(16).padStart(2, '0'))
                                .join('');
                            state.onPick(hex);
                        } else if (color.startsWith('#')) {
                            state.onPick(color);
                        }
                        onClose();
                    }}
                />
            </div>
            <button
                type="button"
                onClick={onClose}
                className="mt-4 rounded-lg bg-white/20 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-white/30"
            >
                {cancelLabel}
            </button>
        </div>
    );
}
