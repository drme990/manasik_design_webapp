import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth/session';
import DesignShell from '@/components/layout/DesignShell';
import ProjectsPage from './(design)/page';
import { listUserDesignSummaries } from '@/lib/db/project-queries';

// Root route "/" — renders the projects page (main page) with the design
// shell + auth check. We can't rely on the (design) layout here because
// app/page.tsx takes precedence over app/(design)/page.tsx for the "/"
// route, so the group layout doesn't wrap this page.
export default async function RootPage() {
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }
  // Fetch the designs list server-side so the initial HTML renders with
  // real cards — the client component hydrates the store from this data
  // and skips the client-side fetch entirely on first load.
  const initialProjects = await listUserDesignSummaries(session.id);
  return (
    <DesignShell>
      <ProjectsPage initialProjects={initialProjects} />
    </DesignShell>
  );
}
