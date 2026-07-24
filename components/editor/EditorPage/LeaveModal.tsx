'use client';

import { LuX } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface LeaveModalProps {
    isOpen: boolean;
    onClose: () => void;
    wasSyncedBefore: boolean;
    renameValue: string;
    onRenameChange: (value: string) => void;
    onNo: () => void;
    onYes: () => void;
    labels: {
        keepEditing: string;
        saveChangesTitle: string;
        saveProjectTitle: string;
        saveChangesDescription: string;
        saveProjectDescription: string;
        renameProjectPlaceholder: string;
        no: string;
        yes: string;
    };
}

export default function LeaveModal({
    isOpen,
    onClose,
    wasSyncedBefore,
    renameValue,
    onRenameChange,
    onNo,
    onYes,
    labels,
}: LeaveModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4">
            <div className="relative w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl">
                {/* X close button — same as "continue editing" (just dismisses the modal) */}
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-secondary transition-colors hover:bg-muted hover:text-foreground rtl:right-auto rtl:left-3"
                    aria-label={labels.keepEditing}
                >
                    <LuX className="h-5 w-5" />
                </button>
                <h2 className="mb-2 pe-8 text-lg font-bold text-foreground">
                    {wasSyncedBefore ? labels.saveChangesTitle : labels.saveProjectTitle}
                </h2>
                <p className="mb-4 text-sm text-secondary">
                    {wasSyncedBefore ? labels.saveChangesDescription : labels.saveProjectDescription}
                </p>
                {/* Inline rename input — only for first-time save (brand-new project).
                    The user can rename and confirm save in one step. */}
                {!wasSyncedBefore && (
                    <div className="mb-4">
                        <Input
                            value={renameValue}
                            onChange={(e) => onRenameChange(e.target.value)}
                            placeholder={labels.renameProjectPlaceholder}
                            autoFocus
                        />
                    </div>
                )}
                <div className="flex gap-3">
                    <Button
                        variant="ghost"
                        onClick={onNo}
                        className="flex-1 text-secondary"
                    >
                        {labels.no}
                    </Button>
                    <Button
                        onClick={onYes}
                        className="flex-1"
                    >
                        {labels.yes}
                    </Button>
                </div>
            </div>
        </div>
    );
}
