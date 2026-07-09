'use client';

import { cn } from '@/lib/utils/cn';
import { useState, ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  className?: string;
}

export default function Tabs({ tabs, defaultTab, onChange, className }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  return (
    <div className={cn('w-full', className)}>
      <div className="flex border-b border-stroke">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              'px-4 py-3 text-sm font-medium transition-colors relative',
              activeTab === tab.id
                ? 'text-brand-primary'
                : 'text-secondary hover:text-foreground'
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />
            )}
          </button>
        ))}
      </div>
      <div className="py-4">
        {tabs.find((tab) => tab.id === activeTab)?.content}
      </div>
    </div>
  );
}

export { Tabs };