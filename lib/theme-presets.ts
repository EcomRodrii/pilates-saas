export type ThemePresetId = 'original' | 'terracotta' | 'plum' | 'teal' | 'burgundy' | 'emerald';

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  primary: string;
  secondary: string;
  neutral: string;
  foreground: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'original', label: 'Original', primary: '#FFC8E2', secondary: '#B57A8E', neutral: '#EEEEE8', foreground: '#131313' },
  { id: 'terracotta', label: 'Terracota', primary: '#C2410C', secondary: '#EAB308', neutral: '#FFF7E6', foreground: '#FFFFFF' },
  { id: 'plum', label: 'Ciruela', primary: '#6D28D9', secondary: '#C4B5FD', neutral: '#FAF7FF', foreground: '#FFFFFF' },
  { id: 'teal', label: 'Verde azulado', primary: '#0F766E', secondary: '#FF7F50', neutral: '#F5E6CA', foreground: '#FFFFFF' },
  { id: 'burgundy', label: 'Burdeos', primary: '#7F1D1D', secondary: '#F3D5D8', neutral: '#FFFDF7', foreground: '#FFFFFF' },
  { id: 'emerald', label: 'Esmeralda', primary: '#065F46', secondary: '#A7F3D0', neutral: '#FFF8E7', foreground: '#FFFFFF' },
];

export function getPreset(id: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find(p => p.id === id) ?? THEME_PRESETS[0];
}
