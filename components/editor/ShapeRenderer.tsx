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
}: ShapeRendererProps) {
  const padding = strokeWidth / 2;
  const innerWidth = Math.max(0, width - strokeWidth);
  const innerHeight = Math.max(0, height - strokeWidth);
  const fill = filled ? fillColor : 'transparent';

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

  // rectangle and rectangle_free — both support corner radius
  const rx = (shape === 'rectangle' || shape === 'rectangle_free') ? cornerRadius : 0;
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
