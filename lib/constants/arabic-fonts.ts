export interface FontDefinition {
  id: string;
  name: string;
  family: string;
  category: 'arabic' | 'english';
}

export const ARABIC_SAFE_FONTS: FontDefinition[] = [
  { id: 'Tajawal', name: 'Tajawal', family: 'Tajawal', category: 'arabic' },
  { id: 'IBM Plex Sans Arabic', name: 'IBM Plex Sans Arabic', family: 'IBM Plex Sans Arabic', category: 'arabic' },
  { id: 'Cairo', name: 'Cairo', family: 'Cairo', category: 'arabic' },
  { id: 'Almarai', name: 'Almarai', family: 'Almarai', category: 'arabic' },
  { id: 'Amiri', name: 'Amiri', family: 'Amiri', category: 'arabic' },
  { id: 'Reem Kufi', name: 'Reem Kufi', family: 'Reem Kufi', category: 'arabic' },
  { id: 'El Messiri', name: 'El Messiri', family: 'El Messiri', category: 'arabic' },
  { id: 'Vazirmatn', name: 'Vazirmatn', family: 'Vazirmatn', category: 'arabic' },
];
