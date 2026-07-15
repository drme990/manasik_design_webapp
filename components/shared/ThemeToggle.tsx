'use client';

import { useTheme } from 'next-themes';
import { useTranslations } from '@/lib/i18n/strings';
import { LuChevronDown } from 'react-icons/lu';
import { cn } from '@/lib/utils/cn';

const THEMES = ['light', 'black', 'manasik', 'ghadaq', 'colors'] as const;

export interface ThemeToggleProps {
    className?: string;
}

export default function ThemeToggle({ className }: ThemeToggleProps) {
    const { theme, setTheme } = useTheme();
    const t = useTranslations('themes');

    return (
        <div className={cn('relative', className)}>
            <label htmlFor="theme-toggle" className="sr-only">
                {t('label')}
            </label>
            <select
                id="theme-toggle"
                value={theme ?? 'manasik'}
                onChange={(e) => setTheme(e.target.value)}
                className="appearance-none rounded-lg border border-stroke bg-background px-3 py-1.5 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
                {THEMES.map((themeId) => (
                    <option key={themeId} value={themeId}>
                        {t(themeId)}
                    </option>
                ))}
            </select>
            <LuChevronDown className="pointer-events-none absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2 text-secondary" />
        </div>
    );
}
