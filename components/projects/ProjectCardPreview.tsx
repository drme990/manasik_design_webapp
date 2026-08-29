'use client';

import { memo, useMemo, useState } from 'react';
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

  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const scale = useMemo(() => {
    const maxReference = 1200;
    return Math.min(
      maxReference / project.canvasWidth,
      maxReference / project.canvasHeight,
      1
    );
  }, [project.canvasWidth, project.canvasHeight]);

  const bg = project.backgroundThumbnailUri || project.backgroundUri;

  // Determine the preview image URL:
  // - Order-generated designs (kind='order_design') use `orderDesignUrl` —
  //   the actual rendered JPG stored in R2. This is the exact image
  //   the admin panel shows, so the thumbnail always matches.
  //   (Also check source='order' for backward compat with old docs.)
  // - Other projects use `thumbnail` (a separate R2 upload).
  const isOrderDesign = project.kind === 'order_design' || project.source === 'order';
  const previewImageUrl = isOrderDesign
    ? project.orderDesignUrl
    : project.thumbnail;

  // Order designs are overwritten at the same R2 key when the admin
  // edits + saves. Append a cache-busting query param (updatedAt) so
  // the browser always fetches the latest version, not a stale CDN copy.
  const imgSrc = previewImageUrl && isOrderDesign
    ? `${previewImageUrl}${previewImageUrl.includes('?') ? '&' : '?'}v=${project.updatedAt}`
    : previewImageUrl;

  // If the project has a preview image URL (from R2), render it as an
  // image. This is the fast path — no layer rendering needed.
  // Shows a skeleton shimmer while loading and falls back to the
  // placeholder icon on error.
  if (previewImageUrl && !imgError) {
    return (
      <div
        className={`relative h-full w-full overflow-hidden ${className}`}
        style={{
          backgroundColor: project.backgroundColor ?? '#ffffff',
        }}
      >
        {/* Skeleton shimmer while the image loads */}
        {!imgLoaded && (
          <div className="absolute inset-0 animate-pulse bg-muted" />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={project.name}
          className={`h-full w-full object-contain transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
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
  prev.project.orderDesignUrl === next.project.orderDesignUrl &&
  prev.project.layers === next.project.layers &&
  prev.project.backgroundUri === next.project.backgroundUri &&
  prev.project.backgroundThumbnailUri === next.project.backgroundThumbnailUri &&
  prev.project.backgroundColor === next.project.backgroundColor &&
  prev.className === next.className
);

export default ProjectCardPreview;
