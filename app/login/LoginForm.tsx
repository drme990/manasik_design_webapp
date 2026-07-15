'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/strings';
import { LuLogIn, LuEye, LuEyeOff } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginForm() {
    const t = useTranslations('auth');
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                const redirectTo = searchParams.get('from') || '/projects';
                router.push(redirectTo);
                router.refresh();
            } else if (response.status === 429) {
                setError(result.error || t('errors.tooManyAttempts'));
            } else {
                setError(t(`errors.${result.error || 'serverError'}`));
            }
        } catch {
            setError(t('errors.loginFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-svh flex flex-1 items-center justify-center bg-background p-4">
            <div className="w-full max-w-md">
                <div className="bg-card-bg border border-stroke rounded-site p-8 space-y-6">
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-foreground mb-2">
                            {t('loginTitle')}
                        </h1>
                        <p className="text-secondary text-sm">{t('loginSubtitle')}</p>
                    </div>

                    {error && (
                        <div className="bg-error/10 border border-error text-error px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            id="email"
                            label={t('email')}
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={t('emailPlaceholder')}
                            disabled={loading}
                            autoComplete="email"
                        />

                        <Input
                            id="password"
                            label={t('password')}
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t('passwordPlaceholder')}
                            disabled={loading}
                            autoComplete="current-password"
                            suffix={
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    className="text-secondary hover:text-foreground transition-colors"
                                    tabIndex={-1}
                                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                                >
                                    {showPassword ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                                </button>
                            }
                        />

                        <Button
                            type="submit"
                            variant="primary"
                            loading={loading}
                            className="w-full flex items-center justify-center gap-2"
                        >
                            {!loading && <LuLogIn size={20} />}
                            {loading ? t('loggingIn') : t('loginButton')}
                        </Button>
                    </form>
                </div>
            </div>
        </main>
    );
}
