export interface CollageLayout {
  id: string;
  name: string;
  count: number;
  shape: ShapeNode;
}

export interface ShapeNode {
  type: 'row' | 'col' | 'cell';
  ratio?: number;
  children?: ShapeNode[];
  cellIndex?: number;
}

export interface CollageCell {
  uri: string;
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
}

export interface CollageState {
  uris: string[];
  layout: string;
  cells: CollageCell[];
  selectedCellIndex: number | null;
}