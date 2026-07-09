'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getPreset, type ThemePresetId } from '@/lib/theme-presets';

const PRESET_KEY = 'panel-theme-preset';
const DARK_KEY = 'panel-dark-mode';

interface PanelThemeValue {
  presetId: ThemePresetId;
  setPreset: (id: ThemePresetId) => void;
  dark: boolean;
  setDark: (v: boolean) => void;
}

const PanelThemeContext = createContext<PanelThemeValue | null>(null);

export function usePanelTheme(): PanelThemeValue {
  const ctx = useContext(PanelThemeContext);
  if (!ctx) throw new Error('usePanelTheme debe usarse dentro de PanelThemeProvider');
  return ctx;
}

function applyToElement(el: HTMLElement, presetId: ThemePresetId, dark: boolean) {
  const preset = getPreset(presetId);
  el.style.setProperty('--brand', preset.primary);
  el.style.setProperty('--brand-foreground', preset.foreground);
  el.style.setProperty('--brand-secondary', preset.secondary);
  el.classList.toggle('dark', dark);
}

export function PanelThemeProvider({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [presetId, setPresetId] = useState<ThemePresetId>('original');
  const [dark, setDarkState] = useState(false);

  useEffect(() => {
    const storedPreset = (localStorage.getItem(PRESET_KEY) as ThemePresetId | null) ?? 'original';
    const storedDark = localStorage.getItem(DARK_KEY) === '1';
    setPresetId(storedPreset);
    setDarkState(storedDark);
    if (ref.current) applyToElement(ref.current, storedPreset, storedDark);
  }, []);

  function setPreset(id: ThemePresetId) {
    setPresetId(id);
    localStorage.setItem(PRESET_KEY, id);
    if (ref.current) applyToElement(ref.current, id, dark);
  }

  function setDark(v: boolean) {
    setDarkState(v);
    localStorage.setItem(DARK_KEY, v ? '1' : '0');
    if (ref.current) applyToElement(ref.current, presetId, v);
  }

  return (
    <PanelThemeContext.Provider value={{ presetId, setPreset, dark, setDark }}>
      <div ref={ref} className={className}>{children}</div>
    </PanelThemeContext.Provider>
  );
}
