'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { authHeader } from '@/lib/api-client';
import { foregroundParaFondo } from '@/lib/theme-runtime';
import type { ThemeConfig } from '@/lib/theme-schema';

const DARK_KEY = 'panel-dark-mode';

interface PanelThemeValue {
  dark: boolean;
  setDark: (v: boolean) => void;
}

const PanelThemeContext = createContext<PanelThemeValue | null>(null);

export function usePanelTheme(): PanelThemeValue {
  const ctx = useContext(PanelThemeContext);
  if (!ctx) throw new Error('usePanelTheme debe usarse dentro de PanelThemeProvider');
  return ctx;
}

function aplicarMarca(el: HTMLElement, theme: ThemeConfig) {
  el.style.setProperty('--brand', theme.primary);
  el.style.setProperty('--brand-foreground', foregroundParaFondo(theme.primary));
  el.style.setProperty('--brand-secondary', theme.secondary);
}

// La MARCA del panel proviene del estudio (tema publicado en la DB), no de una
// preferencia por-usuario. Lo único personal es el modo claro/oscuro
// (localStorage). Si la carga del tema falla, se mantiene la marca por defecto
// de globals.css (fallback robusto).
export function PanelThemeProvider({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dark, setDarkState] = useState(false);

  useEffect(() => {
    // Lectura de la preferencia personal en el montaje (localStorage no existe
    // en SSR, por eso va en el efecto y no en el render).
    const storedDark = localStorage.getItem(DARK_KEY) === '1';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDarkState(storedDark);
    if (ref.current) ref.current.classList.toggle('dark', storedDark);

    let vivo = true;
    (async () => {
      try {
        const res = await fetch('/api/theme', { headers: await authHeader() });
        if (!res.ok || !vivo) return;
        const theme = (await res.json()) as ThemeConfig;
        if (ref.current && vivo) aplicarMarca(ref.current, theme);
      } catch {
        // sin conexión / sin sesión → marca por defecto
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  function setDark(v: boolean) {
    setDarkState(v);
    localStorage.setItem(DARK_KEY, v ? '1' : '0');
    if (ref.current) ref.current.classList.toggle('dark', v);
  }

  return (
    <PanelThemeContext.Provider value={{ dark, setDark }}>
      <div ref={ref} className={className}>{children}</div>
    </PanelThemeContext.Provider>
  );
}
