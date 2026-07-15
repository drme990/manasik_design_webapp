import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth/session';
import LoginForm from './LoginForm';

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ from?: string | string[] }>;
}) {
    const session = await verifySession();

    if (session) {
        const { from } = await searchParams;
        const redirectTo = (Array.isArray(from) ? from[0] : from) || '/projects';
        redirect(redirectTo);
    }

    return <LoginForm />;
}
