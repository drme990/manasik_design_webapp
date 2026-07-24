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
  // can properly fetch and inline the external R2 URL during export.
  // CSS background-image URLs from external origins are NOT inlined by
  // html-to-image, so PNG shapes would be silently dropped from exports
  // when rendered as a <div> with background-image.
  //
  // Context menu / long-press suppression (the original reason for using
  // a <div>) is handled via draggable={false}, onContextMenu prevention,
  // and CSS -webkit-touch-callout: none. pointer-events:none is safe
  // because the parent ShapeLayerComponent div handles all pointer events.
  if (shape === 'png' && uri) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={uri}
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
