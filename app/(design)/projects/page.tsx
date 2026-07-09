'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LuPlus, LuImageOff } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { listProjects, createProject } from '@/lib/store/projects';
import type { Project } from '@/types';

const PRESETS = [
  { name: 'Square', width: 1080, height: 1080 },
  { name: 'Story', width: 1080, height: 1920 },
  { name: 'Post', width: 1200, height: 1500 },
];

export default function ProjectsPage() {
  const t = useTranslations('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjects().then((data) => {
      const sorted = [...data].sort((a, b) => b.updatedAt - a.updatedAt);
      setProjects(sorted);
      setLoading(false);
    });
  }, []);

  const handleCreate = async (preset: typeof PRESETS[number]) => {
    const project = await createProject({
      name: `${preset.name} — ${new Date().toLocaleDateString()}`,
      kind: 'design',
      canvasWidth: preset.width,
      canvasHeight: preset.height,
    });
    window.location.href = `/editor/${project.id}`;
  };

  return (
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
            <p className="mt-1 text-secondary">{t('subtitle')}</p>
          </div>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('newProject')}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handleCreate(preset)}
                className="flex items-center gap-4 rounded-xl border border-stroke bg-card-bg p-4 text-left transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                  <LuPlus className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{preset.name}</p>
                  <p className="text-sm text-secondary">{preset.width} × {preset.height}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('recentDesigns')}</h2>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="aspect-4/3 animate-pulse bg-muted" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              action={
                <Button onClick={() => handleCreate(PRESETS[0])}>{t('createFirst')}</Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Link key={project.id} href={`/editor/${project.id}`}>
                  <Card className="group relative aspect-3/4 overflow-hidden border-stroke bg-card-bg p-0 transition-colors hover:border-brand-primary">
                    {project.thumbnail ? (
                      <img
                        src={project.thumbnail}
                        alt={project.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted">
                        <LuImageOff className="h-12 w-12 text-secondary" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-4">
                      <p className="truncate font-medium text-white">{project.name}</p>
                      <p className="text-xs text-white/80">
                        {new Date(project.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
