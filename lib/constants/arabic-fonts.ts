export interface FontDefinition {
  id: string;
  name: string;
  family: string;
  weight: number;
  category: 'arabic' | 'english';
}

export const ARABIC_SAFE_FONTS: FontDefinition[] = [
  { id: 'Expo Arabic|700', name: 'Expo Arabic Bold', family: 'Expo Arabic', weight: 700, category: 'arabic' },
  { id: 'Tajawal|700', name: 'Tajawal Bold', family: 'Tajawal', weight: 700, category: 'arabic' },
  { id: 'Tajawal|400', name: 'Tajawal', family: 'Tajawal', weight: 400, category: 'arabic' },
  { id: 'Tajawal|800', name: 'Tajawal Extra', family: 'Tajawal', weight: 800, category: 'arabic' },
  { id: 'IBM Plex Sans Arabic|700', name: 'IBM Plex Bold', family: 'IBM Plex Sans Arabic', weight: 700, category: 'arabic' },
  { id: 'IBM Plex Sans Arabic|400', name: 'IBM Plex', family: 'IBM Plex Sans Arabic', weight: 400, category: 'arabic' },
  { id: 'IBM Plex Sans Arabic|500', name: 'IBM Plex Med', family: 'IBM Plex Sans Arabic', weight: 500, category: 'arabic' },
];
