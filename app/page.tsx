import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth/session';
import DesignShell from '@/components/layout/DesignShell';
import ProjectsPage from './(design)/page';
import DesignsSection from '@/components/projects/DesignsSection';
import PdfSection from '@/components/projects/PdfSection';
import { SectionSkeleton } from '@/components/projects/SectionSkeleton';
import {
  listUserDesignSummaries,
  listUserPdfProjects,
  DESIGN_SEED_LIMIT,
} from '@/lib/db/project-queries';
import type { PdfProject, ProjectSummary } from '@/types';

/**
 * Streams the designs list behind its own Suspense boundary. Awaiting
 * the DB query directly in RootPage would block client-side navigations
 * (e.g. login → "/") until MongoDB responds — the boundary lets the
 * shell (header + nav cards + create drawer) stream instantly while the
 * query resolves. On failure the client component falls back to its
 * normal /api/projects fetch.
 *
 * The seed is bounded to DESIGN_SEED_LIMIT so the RSC payload stays
 * small; when it hits the limit the client treats the seed as partial
 * and refetches the full list in the background.
 */
async function DesignsData({ userId }: { userId: string }) {
  let initialProjects: ProjectSummary[] | undefined;
  try {
    initialProjects = await listUserDesignSummaries(userId);
  } catch (error) {
    console.error('[RootPage] Failed to prefetch designs:', error);
  }
  return (
    <DesignsSection
      initialProjects={initialProjects}
      seedIsPartial={(initialProjects?.length ?? 0) >= DESIGN_SEED_LIMIT}
    />
  );
}

/**
 * Streams the PDF projects list behind its own Suspense boundary —
 * a separate `design_pdf_projects` query that resolves independently of
 * the designs query. On failure the client falls back to its normal
 * /api/pdf-projects fetch.
 */
async function PdfProjectsData({ userId }: { userId: string }) {
  let initialProjects: PdfProject[] | undefined;
  try {
    initialProjects = await listUserPdfProjects(userId);
  } catch (error) {
    console.error('[RootPage] Failed to prefetch PDF projects:', error);
  }
  return <PdfSection initialProjects={initialProjects} />;
}

// Root route "/" — renders the projects page (main page) with the design
// shell + auth check. We can't rely on the (design) layout here because
// app/page.tsx takes precedence over app/(design)/page.tsx for the "/"
// route, so the group layout doesn't wrap this page.
//
// Each data section streams behind its own Suspense boundary, so the
// page shell + nav cards render instantly, the designs section resolves
// on its own clock, and a slow designs query never holds the PDF
// section (or the rest of the page) hostage.
export default async function RootPage() {
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }
  return (
    <DesignShell>
      <ProjectsPage
        designs={
          <Suspense fallback={<SectionSkeleton />}>
            <DesignsData userId={session.id} />
          </Suspense>
        }
        pdfs={
          <Suspense fallback={<SectionSkeleton />}>
            <PdfProjectsData userId={session.id} />
          </Suspense>
        }
      />
    </DesignShell>
  );
}
