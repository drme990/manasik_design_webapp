'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { PREDEFINED_VARIABLES } from '@/lib/constants/variables';
import { useTranslations } from 'next-intl';

export interface VariablePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (variableId: string, variableName: string) => void;
}

export default function VariablePickerModal({ isOpen, onClose, onSelect }: VariablePickerModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const t = useTranslations('editor.modals.variablePicker');
  const uiT = useTranslations('ui');

  const handleSelect = () => {
    if (!selectedId) return;
    const variable = PREDEFINED_VARIABLES.find((v) => v.id === selectedId);
    if (variable) {
      onSelect(variable.id, variable.label);
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('title')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {uiT('cancel')}
          </Button>
          <Button variant="primary" onClick={handleSelect} disabled={!selectedId}>
            {t('select')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 max-h-75 overflow-y-auto">
        {PREDEFINED_VARIABLES.map((variable) => (
          <button
            key={variable.id}
            onClick={() => setSelectedId(variable.id)}
            className={cn(
              'rounded-lg border p-3 text-right transition-colors',
              selectedId === variable.id
                ? 'border-brand-primary bg-brand-primary-light/10'
                : 'border-stroke bg-card-bg hover:border-brand-primary/50'
            )}
          >
            <p className="font-medium text-foreground">{variable.label}</p>
            <p className="text-xs text-secondary">{variable.id}</p>
          </button>
        ))}
      </div>
    </Modal>
  );
}
