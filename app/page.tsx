import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth/session';
import DesignShell from '@/components/layout/DesignShell';
import ProjectsPage from './(design)/page';

// Root route "/" — renders the projects page (main page) with the design
// shell + auth check. We can't rely on the (design) layout here because
// app/page.tsx takes precedence over app/(design)/page.tsx for the "/"
// route, so the group layout doesn't wrap this page.
export default async function RootPage() {
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }
  return (
    <DesignShell>
      <ProjectsPage />
    </DesignShell>
  );
}
