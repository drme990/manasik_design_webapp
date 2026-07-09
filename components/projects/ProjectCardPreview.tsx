'use client';

import type { Project } from '@/types';
import { LuImageOff } from 'react-icons/lu';

interface ProjectCardPreviewProps {
  project: Project;
  className?: string;
}

export default function ProjectCardPreview({ project, className }: ProjectCardPreviewProps) {
  if (!project.thumbnail && project.layers.length === 0) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-muted ${className}`}>
        <LuImageOff className="h-12 w-12 text-secondary" />
      </div>
    );
  }

  if (project.thumbnail) {
    return (
      <img
        src={project.thumbnail}
        alt={project.name}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  const scale = Math.min(
    1000 / project.canvasWidth,
    1000 / project.canvasHeight,
    1
  );

  const sortedLayers = [...project.layers]
    .filter((l) => l.visible)
    .sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-white ${className}`}
      style={{
        backgroundImage: project.backgroundUri ? `url(${project.backgroundUri})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: project.canvasWidth,
          height: project.canvasHeight,
          transform: `scale(${scale})`,
        }}
      >
        {sortedLayers.map((layer) => (
          <div
            key={layer.id}
            className="absolute"
            style={{
              left: layer.x,
              top: layer.y,
              width: layer.width,
              height: layer.height,
              transform: `rotate(${layer.rotation}deg)`,
              opacity: layer.opacity,
              zIndex: layer.zIndex,
              backgroundColor:
                layer.type === 'shape'
                  ? (layer as any).fillColor
                  : layer.type === 'text' || layer.type === 'dynamic_field'
                  ? (layer as any).backgroundColor || 'transparent'
                  : 'transparent',
              border:
                layer.type === 'shape'
                  ? `${(layer as any).strokeWidth || 0}px solid ${(layer as any).strokeColor || 'transparent'}`
                  : layer.type === 'image'
                  ? `${(layer as any).borderWidth || 0}px solid ${(layer as any).borderColor || 'transparent'}`
                  : `${(layer as any).borderWidth || 0}px solid ${(layer as any).borderColor || 'transparent'}`,
              borderRadius:
                layer.type === 'shape'
                  ? (layer as any).shape === 'circle'
                    ? '50%'
                    : (layer as any).cornerRadius || 0
                  : layer.type === 'image'
                  ? (layer as any).borderRadius || 0
                  : (layer as any).borderRadius || 0,
              color: (layer as any).color,
              fontSize: (layer as any).fontSize,
              fontFamily: (layer as any).fontFamily,
              display: layer.type === 'text' || layer.type === 'dynamic_field' ? 'flex' : undefined,
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'pre-wrap',
              overflow: 'hidden',
            }}
          >
            {layer.type === 'text' && (layer as any).text}
            {layer.type === 'dynamic_field' && (layer as any).placeholder}
            {layer.type === 'image' && (
              <img
                src={(layer as any).uri}
                alt=""
                className="h-full w-full object-cover"
                style={{
                  transform: `scale(${(layer as any).imageScale || 1}) translate(${
                    (layer as any).offsetX || 0
                  }px, ${(layer as any).offsetY || 0}px)`,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
