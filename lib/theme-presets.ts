export type ThemePresetId = 'original' | 'terracotta' | 'plum' | 'teal' | 'burgundy' | 'emerald';

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  primary: string;
  secondary: string;
  neutral: string;
  foreground: string;
}

// `secondary` se usa por todo el panel/portal como color de TEXTO/icono sobre
// fondos claros (badges, pestañas activas, enlaces — nunca como relleno sólido,
// ver `--brand-secondary` en globals.css y sus ~50 usos como `text-brand-secondary`
// / `color: var(--brand-secondary)`). Los valores originales de 5 de los 6
// presets (todos salvo "original") eran tonos pastel pensados como acento de
// fondo, con un contraste real contra blanco de 1.28–2.50:1 — muy por debajo
// del 4.5:1 de WCAG AA para texto normal — así que el texto/badge quedaba
// prácticamente invisible en cualquier estudio que eligiera uno de esos temas
// (p.ej. "Ciruela"). Recalculados con el mismo criterio que ya usa
// `derivarPaleta()` para colores elegidos a mano (mismo matiz, luminosidad
// 26-46%), todos ≥6.9:1 contra blanco.
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'original', label: 'Original', primary: '#343825', secondary: '#5A6142', neutral: '#F1F2EA', foreground: '#D9C29E' },
  { id: 'terracotta', label: 'Terracota', primary: '#C2410C', secondary: '#65341F', neutral: '#FFF7E6', foreground: '#FFFFFF' },
  { id: 'plum', label: 'Ciruela', primary: '#6D28D9', secondary: '#402964', neutral: '#FAF7FF', foreground: '#FFFFFF' },
  { id: 'teal', label: 'Verde azulado', primary: '#0F766E', secondary: '#23615C', neutral: '#F5E6CA', foreground: '#FFFFFF' },
  { id: 'burgundy', label: 'Burdeos', primary: '#7F1D1D', secondary: '#5B2929', neutral: '#FFFDF7', foreground: '#FFFFFF' },
  { id: 'emerald', label: 'Esmeralda', primary: '#065F46', secondary: '#1F6552', neutral: '#FFF8E7', foreground: '#FFFFFF' },
];

export function getPreset(id: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find(p => p.id === id) ?? THEME_PRESETS[0];
}
