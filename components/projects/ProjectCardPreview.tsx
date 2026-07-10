'use client';

import { useMemo } from 'react';
import type { Project } from '@/types';
import LayerRenderer from '@/components/editor/LayerRenderer';
import { LuImageOff } from 'react-icons/lu';

interface ProjectCardPreviewProps {
  project: Project;
  className?: string;
}

export default function ProjectCardPreview({ project, className }: ProjectCardPreviewProps) {
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

  if (layers.length === 0 && !project.backgroundUri) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-muted ${className}`}>
        <LuImageOff className="h-12 w-12 text-secondary" />
      </div>
    );
  }

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{
        backgroundColor: project.backgroundColor ?? '#ffffff',
        backgroundImage: project.backgroundUri ? `url(${project.backgroundUri})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: project.canvasWidth,
          height: project.canvasHeight,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {layers.map((layer) => (
          <LayerRenderer key={layer.id} layer={layer} />
        ))}
      </div>
    </div>
  );
}
