export interface FontDefinition {
  id: string;
  name: string;
  family: string;
  category: 'arabic' | 'english';
}

export const ARABIC_SAFE_FONTS: FontDefinition[] = [
  { id: 'Tajawal', name: 'Tajawal', family: 'Tajawal', category: 'arabic' },
  { id: 'Cairo', name: 'Cairo', family: 'Cairo', category: 'arabic' },
  { id: 'Almarai', name: 'Almarai', family: 'Almarai', category: 'arabic' },
  { id: 'IBM Plex Sans Arabic', name: 'IBM Plex Sans Arabic', family: 'IBM Plex Sans Arabic', category: 'arabic' },
  { id: 'Noto Sans Arabic', name: 'Noto Sans Arabic', family: 'Noto Sans Arabic', category: 'arabic' },
  { id: 'Noto Kufi Arabic', name: 'Noto Kufi Arabic', family: 'Noto Kufi Arabic', category: 'arabic' },
  { id: 'Amiri', name: 'Amiri', family: 'Amiri', category: 'arabic' },
  { id: 'Aref Ruqaa', name: 'Aref Ruqaa', family: 'Aref Ruqaa', category: 'arabic' },
  { id: 'Reem Kufi', name: 'Reem Kufi', family: 'Reem Kufi', category: 'arabic' },
  { id: 'El Messiri', name: 'El Messiri', family: 'El Messiri', category: 'arabic' },
  { id: 'Lateef', name: 'Lateef', family: 'Lateef', category: 'arabic' },
  { id: 'Scheherazade New', name: 'Scheherazade New', family: 'Scheherazade New', category: 'arabic' },
  { id: 'Markazi Text', name: 'Markazi Text', family: 'Markazi Text', category: 'arabic' },
  { id: 'Vazirmatn', name: 'Vazirmatn', family: 'Vazirmatn', category: 'arabic' },
  // English fonts
  { id: 'Inter', name: 'Inter', family: 'Inter', category: 'english' },
  { id: 'Roboto', name: 'Roboto', family: 'Roboto', category: 'english' },
  { id: 'Open Sans', name: 'Open Sans', family: 'Open Sans', category: 'english' },
  { id: 'Lato', name: 'Lato', family: 'Lato', category: 'english' },
  { id: 'Montserrat', name: 'Montserrat', family: 'Montserrat', category: 'english' },
  { id: 'Poppins', name: 'Poppins', family: 'Poppins', category: 'english' },
  { id: 'Playfair Display', name: 'Playfair Display', family: 'Playfair Display', category: 'english' },
  { id: 'Merriweather', name: 'Merriweather', family: 'Merriweather', category: 'english' },
  { id: 'Oswald', name: 'Oswald', family: 'Oswald', category: 'english' },
  { id: 'Raleway', name: 'Raleway', family: 'Raleway', category: 'english' },
  { id: 'Dancing Script', name: 'Dancing Script', family: 'Dancing Script', category: 'english' },
  { id: 'Bebas Neue', name: 'Bebas Neue', family: 'Bebas Neue', category: 'english' },
];
