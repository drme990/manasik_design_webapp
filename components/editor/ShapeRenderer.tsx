'use client';

import type { ShapeLayer } from '@/types';

export interface ShapeRendererProps {
  shape: ShapeLayer['shape'];
  width: number;
  height: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  filled?: boolean;
  cornerRadius?: number;
  className?: string;
  /** PNG shape only — R2 URL of the uploaded PNG */
  uri?: string;
}

function buildStarPoints(points: number, cx: number, cy: number, outerR: number, innerR: number): string {
  const step = Math.PI / points;
  const coords: string[] = [];
  for (let i = 0; i < 2 * points; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    coords.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return coords.join(' ');
}

export default function ShapeRenderer({
  shape,
  width,
  height,
  fillColor,
  strokeColor,
  strokeWidth,
  filled = true,
  cornerRadius = 0,
  className,
  uri,
}: ShapeRendererProps) {
  const padding = strokeWidth / 2;
  const innerWidth = Math.max(0, width - strokeWidth);
  const innerHeight = Math.max(0, height - strokeWidth);
  const fill = filled ? fillColor : 'transparent';

  // PNG shape — render as an <img> so that html-to-image (toJpeg/toPng)
  // can properly fetch and inline the image during export.
  //
  // The R2 URL is routed through the same-origin /api/image-proxy to avoid
  // CORS errors when html-to-image tries to fetch it. R2 doesn't send
  // Access-Control-Allow-Origin headers, so a direct fetch from the hosting
  // domain fails. The proxy adds the CORS headers and streams the image
  // back same-origin. On localhost this happens to work without the proxy
  // (browsers are more permissive with localhost), but on the hosted domain
  // it fails with "Failed to fetch" + an img error event.
  //
  // Context menu / long-press suppression is handled via draggable={false},
  // onContextMenu prevention, and CSS -webkit-touch-callout: none.
  // pointer-events:none is safe because the parent ShapeLayerComponent div
  // handles all pointer events.
  if (shape === 'png' && uri) {
    const isExternal = uri.startsWith('http') &&
      typeof window !== 'undefined' &&
      !uri.startsWith(window.location.origin);
    const safeSrc = isExternal
      ? `/api/image-proxy?url=${encodeURIComponent(uri)}`
      : uri;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={safeSrc}
        alt=""
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        className={className}
        style={{
          width,
          height,
          objectFit: 'contain',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          pointerEvents: 'none',
          touchAction: 'manipulation',
        }}
      />
    );
  }

  if (shape === 'line') {
    return (
      <svg
        className={className}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <line
          x1={padding}
          y1={height / 2}
          x2={width - padding}
          y2={height / 2}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (shape === 'circle') {
    return (
      <svg
        className={className}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <ellipse
          cx={width / 2}
          cy={height / 2}
          rx={innerWidth / 2}
          ry={innerHeight / 2}
          fill={fill}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      </svg>
    );
  }

  if (shape === 'triangle') {
    const points = `${width / 2},${padding} ${padding},${height - padding} ${width - padding},${height - padding}`;
    return (
      <svg
        className={className}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <polygon
          points={points}
          fill={fill}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (shape.startsWith('star_')) {
    const pointsCount = parseInt(shape.split('_')[1], 10) || 5;
    const outerR = Math.min(innerWidth, innerHeight) / 2;
    const innerR = outerR * 0.4;
    const points = buildStarPoints(pointsCount, width / 2, height / 2, outerR, innerR);
    return (
      <svg
        className={className}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <polygon
          points={points}
          fill={fill}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // rectangle supports corner radius
  const rx = shape === 'rectangle' ? cornerRadius : 0;
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <rect
        x={padding}
        y={padding}
        width={innerWidth}
        height={innerHeight}
        rx={rx}
        fill={fill}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}
