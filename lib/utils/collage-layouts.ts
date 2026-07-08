import type { CollageLayout, ShapeNode } from '@/types';

// Layout definitions
export const LAYOUTS: CollageLayout[] = [
  // 2 images
  {
    id: '2-side-by-side',
    name: 'جنبًا إلى جنب',
    count: 2,
    shape: {
      type: 'row',
      children: [
        { type: 'cell', cellIndex: 0 },
        { type: 'cell', cellIndex: 1 }
      ]
    }
  },
  {
    id: '2-top-bottom',
    name: 'فوق وتحت',
    count: 2,
    shape: {
      type: 'col',
      children: [
        { type: 'cell', cellIndex: 0 },
        { type: 'cell', cellIndex: 1 }
      ]
    }
  },
  // 3 images
  {
    id: '3-horizontal',
    name: 'أفقي',
    count: 3,
    shape: {
      type: 'row',
      children: [
        { type: 'cell', cellIndex: 0 },
        { type: 'cell', cellIndex: 1 },
        { type: 'cell', cellIndex: 2 }
      ]
    }
  },
  {
    id: '3-1+2',
    name: '1 + 2',
    count: 3,
    shape: {
      type: 'col',
      children: [
        { type: 'cell', cellIndex: 0, ratio: 1 },
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 1 },
            { type: 'cell', cellIndex: 2 }
          ]
        }
      ]
    }
  },
  {
    id: '3-2+1',
    name: '2 + 1',
    count: 3,
    shape: {
      type: 'col',
      children: [
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 0 },
            { type: 'cell', cellIndex: 1 }
          ]
        },
        { type: 'cell', cellIndex: 2, ratio: 1 }
      ]
    }
  },
  // 4 images
  {
    id: '4-grid',
    name: 'شبكة 2×2',
    count: 4,
    shape: {
      type: 'col',
      children: [
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 0 },
            { type: 'cell', cellIndex: 1 }
          ]
        },
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 2 },
            { type: 'cell', cellIndex: 3 }
          ]
        }
      ]
    }
  },
  {
    id: '4-1+3',
    name: '1 + 3',
    count: 4,
    shape: {
      type: 'col',
      children: [
        { type: 'cell', cellIndex: 0, ratio: 1 },
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 1 },
            { type: 'cell', cellIndex: 2 },
            { type: 'cell', cellIndex: 3 }
          ]
        }
      ]
    }
  },
  {
    id: '4-3+1',
    name: '3 + 1',
    count: 4,
    shape: {
      type: 'col',
      children: [
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 0 },
            { type: 'cell', cellIndex: 1 },
            { type: 'cell', cellIndex: 2 }
          ]
        },
        { type: 'cell', cellIndex: 3, ratio: 1 }
      ]
    }
  },
  // 5 images
  {
    id: '5-1+4',
    name: '1 + 4',
    count: 5,
    shape: {
      type: 'col',
      children: [
        { type: 'cell', cellIndex: 0, ratio: 1 },
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 1 },
            { type: 'cell', cellIndex: 2 },
            { type: 'cell', cellIndex: 3 },
            { type: 'cell', cellIndex: 4 }
          ]
        }
      ]
    }
  },
  {
    id: '5-2+3',
    name: '2 + 3',
    count: 5,
    shape: {
      type: 'col',
      children: [
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 0 },
            { type: 'cell', cellIndex: 1 }
          ]
        },
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 2 },
            { type: 'cell', cellIndex: 3 },
            { type: 'cell', cellIndex: 4 }
          ]
        }
      ]
    }
  },
  // 6 images
  {
    id: '6-grid',
    name: 'شبكة 2×3',
    count: 6,
    shape: {
      type: 'col',
      children: [
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 0 },
            { type: 'cell', cellIndex: 1 },
            { type: 'cell', cellIndex: 2 }
          ]
        },
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 3 },
            { type: 'cell', cellIndex: 4 },
            { type: 'cell', cellIndex: 5 }
          ]
        }
      ]
    }
  },
  {
    id: '6-1+5',
    name: '1 + 5',
    count: 6,
    shape: {
      type: 'col',
      children: [
        { type: 'cell', cellIndex: 0, ratio: 1 },
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 1 },
            { type: 'cell', cellIndex: 2 },
            { type: 'cell', cellIndex: 3 },
            { type: 'cell', cellIndex: 4 },
            { type: 'cell', cellIndex: 5 }
          ]
        }
      ]
    }
  },
  // 7 images
  {
    id: '7-1+6',
    name: '1 + 6',
    count: 7,
    shape: {
      type: 'col',
      children: [
        { type: 'cell', cellIndex: 0, ratio: 1 },
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 1 },
            { type: 'cell', cellIndex: 2 },
            { type: 'cell', cellIndex: 3 },
            { type: 'cell', cellIndex: 4 },
            { type: 'cell', cellIndex: 5 },
            { type: 'cell', cellIndex: 6 }
          ]
        }
      ]
    }
  },
  // 8 images
  {
    id: '8-grid',
    name: 'شبكة 2×4',
    count: 8,
    shape: {
      type: 'col',
      children: [
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 0 },
            { type: 'cell', cellIndex: 1 },
            { type: 'cell', cellIndex: 2 },
            { type: 'cell', cellIndex: 3 }
          ]
        },
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 4 },
            { type: 'cell', cellIndex: 5 },
            { type: 'cell', cellIndex: 6 },
            { type: 'cell', cellIndex: 7 }
          ]
        }
      ]
    }
  },
  // 9 images
  {
    id: '9-grid',
    name: 'شبكة 3×3',
    count: 9,
    shape: {
      type: 'col',
      children: [
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 0 },
            { type: 'cell', cellIndex: 1 },
            { type: 'cell', cellIndex: 2 }
          ]
        },
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 3 },
            { type: 'cell', cellIndex: 4 },
            { type: 'cell', cellIndex: 5 }
          ]
        },
        {
          type: 'row',
          children: [
            { type: 'cell', cellIndex: 6 },
            { type: 'cell', cellIndex: 7 },
            { type: 'cell', cellIndex: 8 }
          ]
        }
      ]
    }
  }
];

export function resolveLayout(layoutId: string): CollageLayout | null {
  return LAYOUTS.find(layout => layout.id === layoutId) || null;
}

export function walkShape(
  shape: ShapeNode,
  callback: (node: ShapeNode, path: number[]) => void,
  path: number[] = []
): void {
  callback(shape, path);

  if (shape.children) {
    shape.children.forEach((child, index) => {
      walkShape(child, callback, [...path, index]);
    });
  }
}

export function suggestLayout(count: number): CollageLayout | null {
  // Find layouts that support the exact count
  const exactMatches = LAYOUTS.filter(layout => layout.count === count);

  if (exactMatches.length > 0) {
    // Return the first exact match (could be improved with heuristics)
    return exactMatches[0];
  }

  // If no exact match, find the closest layout with more cells
  const largerLayouts = LAYOUTS.filter(layout => layout.count > count)
    .sort((a, b) => a.count - b.count);

  return largerLayouts[0] || null;
}

export function layoutsForCount(count: number): CollageLayout[] {
  return LAYOUTS.filter(layout => layout.count === count);
}

export function gridFor(count: number): { rows: number; cols: number } {
  const sqrt = Math.sqrt(count);
  const cols = Math.ceil(sqrt);
  const rows = Math.ceil(count / cols);
  return { rows, cols };
}

export function getCellCount(shape: ShapeNode): number {
  if (shape.type === 'cell') {
    return 1;
  }

  if (shape.children) {
    return shape.children.reduce((sum, child) => sum + getCellCount(child), 0);
  }

  return 0;
}

export function getCellRects(
  shape: ShapeNode,
  containerWidth: number,
  containerHeight: number
): Array<{ x: number; y: number; width: number; height: number; index: number }> {
  const rects: Array<{ x: number; y: number; width: number; height: number; index: number }> = [];

  walkShape(shape, (node, path) => {
    if (node.type === 'cell' && node.cellIndex !== undefined) {
      // Calculate rect based on path and ratios
      // This is a simplified version - full implementation would need to track
      // the actual layout calculations
      rects.push({
        x: 0,
        y: 0,
        width: containerWidth,
        height: containerHeight,
        index: node.cellIndex
      });
    }
  });

  return rects;
}