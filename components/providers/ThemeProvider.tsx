'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { type ReactNode } from 'react';

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="manasik"
      enableSystem={false}
      themes={['light', 'black', 'manasik', 'ghadaq', 'colors']}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
