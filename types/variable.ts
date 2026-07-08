export type VariableType = 'text' | 'number' | 'date' | 'image';

export interface Variable {
  id: string;
  label: string;
  type: VariableType;
  defaultValue?: string | number;
}

export interface CustomVariable extends Variable {
  isCustom: true;
}

export interface VariableValue {
  variableId: string;
  value: string | number;
}