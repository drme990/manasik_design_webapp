import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';

export interface FooterProps {
  className?: string;
}

export default function Footer({ className }: FooterProps) {
  const t = useTranslations('footer');

  return (
    <footer
      className={cn(
        'border-t border-stroke bg-toolbar-bg py-4',
        className
      )}
    >
      <div className="flex flex-col items-center justify-between gap-2 px-4 text-sm text-secondary sm:flex-row">
        <p>{t('tagline')}</p>
        <p>© {new Date().getFullYear()} {t('copyright')}</p>
      </div>
    </footer>
  );
}
