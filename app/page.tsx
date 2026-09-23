import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth/session';
import DesignShell from '@/components/layout/DesignShell';
import ProjectsPage from './(design)/page';
import ProjectsPageSkeleton from '@/components/projects/ProjectsPageSkeleton';
import { listUserDesignSummaries, DESIGN_SEED_LIMIT } from '@/lib/db/project-queries';
import type { ProjectSummary } from '@/types';

/**
 * Streams the designs list behind a Suspense boundary. Awaiting the DB
 * query directly in RootPage would block client-side navigations (e.g.
 * login → "/") until MongoDB responds — the Suspense boundary lets the
 * shell stream instantly while the query resolves. On failure the client
 * component falls back to its normal /api/projects fetch.
 *
 * The seed is bounded to DESIGN_SEED_LIMIT so the RSC payload stays
 * small; when it hits the limit the client treats the seed as partial
 * and refetches the full list in the background.
 */
async function ProjectsPageData({ userId }: { userId: string }) {
  let initialProjects: ProjectSummary[] | undefined;
  try {
    initialProjects = await listUserDesignSummaries(userId);
  } catch (error) {
    // On DB failure, render the page without SSR data — the client
    // component falls back to its normal /api/projects fetch.
    console.error('[RootPage] Failed to prefetch designs:', error);
  }
  return (
    <ProjectsPage
      initialProjects={initialProjects}
      seedIsPartial={(initialProjects?.length ?? 0) >= DESIGN_SEED_LIMIT}
    />
  );
}

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
      <Suspense fallback={<ProjectsPageSkeleton />}>
        <ProjectsPageData userId={session.id} />
      </Suspense>
    </DesignShell>
  );
}
