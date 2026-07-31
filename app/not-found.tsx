import Link from 'next/link';
import { LuArrowLeft, LuCompass } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { useTranslations } from '@/lib/i18n/strings';

export default function NotFound() {
    const t = useTranslations('ui.notFound');

    return (
        <main className="flex min-h-svh flex-col items-center justify-center px-4 py-8">
            <div className="flex flex-col items-center text-center">
                {/* Icon */}
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
                    <LuCompass className="h-8 w-8" />
                </div>

                {/* 404 */}
                <p className="mt-6 text-6xl font-bold text-brand-primary">404</p>

                {/* Title + description */}
                <h1 className="mt-4 text-2xl font-bold text-foreground">{t('title')}</h1>
                <p className="mt-2 max-w-sm text-sm text-secondary">{t('description')}</p>

                {/* Back home button */}
                <Link href="/" className="mt-6">
                    <Button variant="primary" className="gap-2">
                        <LuArrowLeft className="h-5 w-5 rtl:rotate-180" />
                        {t('backHome')}
                    </Button>
                </Link>
            </div>
        </main>
    );
}
