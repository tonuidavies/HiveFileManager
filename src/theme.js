import React, { createContext, useContext } from 'react';

export const BRAND = '#A435F0';
export const BRAND_DARK = '#7C2BD9';

export const CATEGORY_COLORS = {
  images: '#EC4899',
  videos: '#8B5CF6',
  audio: '#F97316',
  documents: '#3B82F6',
  apks: '#10B981',
  archives: '#EAB308',
  downloads: '#06B6D4',
  large: '#EF4444',
};

const light = {
  dark: false,
  brand: BRAND,
  brandDark: BRAND_DARK,
  gradient: ['#B44CF5', '#7C3AED'],
  bg: '#F5F4FA',
  card: '#FFFFFF',
  cardAlt: '#F0EEF7',
  text: '#16141F',
  sub: '#6D6980',
  faint: '#A29EB2',
  border: '#E9E6F1',
  danger: '#EF4444',
  success: '#10B981',
  overlay: 'rgba(15, 10, 30, 0.45)',
  selected: 'rgba(164, 53, 240, 0.12)',
  folder: '#F5B83D',
  shadow: '#2B1A4A',
  statusBar: 'light',
};

const dark = {
  dark: true,
  brand: '#B566F5',
  brandDark: BRAND,
  gradient: ['#6D28D9', '#3B1A6E'],
  bg: '#0E0D13',
  card: '#1A1822',
  cardAlt: '#24212F',
  text: '#F3F1FA',
  sub: '#A39FB3',
  faint: '#6E6A7E',
  border: '#2A2735',
  danger: '#F87171',
  success: '#34D399',
  overlay: 'rgba(0, 0, 0, 0.6)',
  selected: 'rgba(181, 102, 245, 0.18)',
  folder: '#F5B83D',
  shadow: '#000000',
  statusBar: 'light',
};

export const themes = { light, dark };

export const ThemeContext = createContext(light);
export const useTheme = () => useContext(ThemeContext);

export const radius = { sm: 10, md: 14, lg: 20, xl: 28 };

export function ThemeProvider({ value, children }) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
