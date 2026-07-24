'use client';

import { memo, useMemo } from 'react';
import { LuImage } from 'react-icons/lu';
import type { Project } from '@/types';
import LayerRenderer from '@/components/editor/LayerRenderer';

interface ProjectCardPreviewProps {
  project: Project;
  className?: string;
}

function ProjectCardPreviewInner({ project, className }: ProjectCardPreviewProps) {
  // Always call hooks first — before any conditional returns.
  const layers = useMemo(
    () => [...project.layers].filter((l) => l.visible).sort((a, b) => a.zIndex - b.zIndex),
    [project.layers]
  );

  const scale = useMemo(() => {
    const maxReference = 1200;
    return Math.min(
      maxReference / project.canvasWidth,
      maxReference / project.canvasHeight,
      1
    );
  }, [project.canvasWidth, project.canvasHeight]);

  const bg = project.backgroundThumbnailUri || project.backgroundUri;

  // If the project has a thumbnail URL (from R2), render it as an image.
  // This is the fast path — no layer rendering needed, just a single <img>.
  if (project.thumbnail) {
    return (
      <div
        className={`relative h-full w-full overflow-hidden ${className}`}
        style={{
          backgroundColor: project.backgroundColor ?? '#ffffff',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={project.thumbnail}
          alt={project.name}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
    );
  }

  // If there are no layers and no background, show a placeholder
  if (layers.length === 0 && !bg) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center ${className}`}
        style={{ backgroundColor: project.backgroundColor ?? '#ffffff' }}
      >
        <LuImage className="h-10 w-10 text-secondary/30" />
      </div>
    );
  }

  // No thumbnail — render layers live as a fallback.
  // This is slower but ensures the preview works even before the first save.
  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{
        backgroundColor: project.backgroundColor ?? '#ffffff',
        backgroundImage: bg ? `url(${bg})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2"
        style={{
          width: project.canvasWidth,
          height: project.canvasHeight,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {layers.map((layer) => (
          <LayerRenderer key={layer.id} layer={layer} useThumbnail />
        ))}
      </div>
    </div>
  );
}

// Memoized so cards only re-render when their project data actually changes.
const ProjectCardPreview = memo(ProjectCardPreviewInner, (prev, next) =>
  prev.project.id === next.project.id &&
  prev.project.updatedAt === next.project.updatedAt &&
  prev.project.thumbnail === next.project.thumbnail &&
  prev.project.layers === next.project.layers &&
  prev.project.backgroundUri === next.project.backgroundUri &&
  prev.project.backgroundThumbnailUri === next.project.backgroundThumbnailUri &&
  prev.project.backgroundColor === next.project.backgroundColor &&
  prev.className === next.className
);

export default ProjectCardPreview;
