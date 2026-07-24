'use client';

import { LuCheck } from 'react-icons/lu';
import Drawer from '@/components/ui/Drawer';
import { resolveFontFamily } from '@/lib/constants/fonts';
import type { AnyLayer, TextLayer } from '@/types';

interface TextEditDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    selectedLayer: AnyLayer | null;
    onTextChange: (layerId: string, text: string) => void;
    onDeleteLayer: (id: string) => void;
}

export default function TextEditDrawer({
    isOpen,
    onClose,
    title,
    selectedLayer,
    onTextChange,
    onDeleteLayer,
}: TextEditDrawerProps) {
    const textLayer = selectedLayer?.type === 'text' ? (selectedLayer as TextLayer) : null;

    return (
        <Drawer
            isOpen={isOpen}
            onClose={() => {
                // If the text layer has no text, remove it from the canvas
                if (textLayer && !textLayer.text.trim()) {
                    onDeleteLayer(textLayer.id);
                }
                onClose();
            }}
            title={title}
            height="auto"
            closeIcon={<LuCheck className="h-5 w-5 text-brand-primary" />}
        >
            {textLayer && (
                <textarea
                    autoFocus
                    value={textLayer.text}
                    onChange={(e) => onTextChange(textLayer.id, e.target.value)}
                    className="w-full rounded-xl border border-stroke bg-background px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    style={{
                        fontFamily: resolveFontFamily(textLayer.fontFamily),
                        fontWeight: textLayer.fontWeight || 400,
                        minHeight: 120,
                        resize: 'vertical',
                    }}
                    dir="auto"
                />
            )}
        </Drawer>
    );
}
