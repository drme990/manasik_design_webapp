import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth/session';
import DesignShell from '@/components/layout/DesignShell';

export default async function DesignLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await verifySession();

    if (!session) {
        redirect('/login');
    }

    return <DesignShell>{children}</DesignShell>;
}
