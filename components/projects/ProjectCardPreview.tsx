'use client';

import { memo, useMemo } from 'react';
import type { Project } from '@/types';
import LayerRenderer from '@/components/editor/LayerRenderer';

interface ProjectCardPreviewProps {
  project: Project;
  className?: string;
}

function ProjectCardPreviewInner({ project, className }: ProjectCardPreviewProps) {
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

  // Stable signature for detecting changes — avoids re-rendering when the
  // parent re-renders but this project's data hasn't changed.
  const bg = project.backgroundThumbnailUri || project.backgroundUri;

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
  prev.project.layers === next.project.layers &&
  prev.project.backgroundUri === next.project.backgroundUri &&
  prev.project.backgroundThumbnailUri === next.project.backgroundThumbnailUri &&
  prev.project.backgroundColor === next.project.backgroundColor &&
  prev.className === next.className
);

export default ProjectCardPreview;
