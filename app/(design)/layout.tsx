import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth/session';
import Header from '@/components/layout/Header';

export default async function DesignLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await verifySession();

    if (!session) {
        redirect('/login');
    }

    return (
        <>
            <Header />
            {children}
        </>
    )
}
