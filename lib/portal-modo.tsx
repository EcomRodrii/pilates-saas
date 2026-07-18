'use client';

// Tema día/noche del portal de socios. Ligero: estado local + localStorage +
// un evento de ventana para que Shell y páginas se sincronicen sin contexto.
// El color de marca sigue siendo --portal-brand (lo pone PortalShell); esto solo
// controla neutros claro/oscuro. Copia este archivo a lib/portal-modo.tsx

import { useEffect, useState, useCallback } from 'react';

export type Modo = 'dia' | 'noche';

export interface ModoTokens {
  bg: string; surface: string; surface2: string; line: string;
  ink: string; muted: string; muted2: string;
  accentInk: string; tabbar: string; bar: string;
  hero: string; heroLine: string; heroText: string; heroSub: string; heroAccent: string;
}

// `muted` es texto de contenido real (subtítulos, nombres, estados), no solo
// decorativo — por eso está calibrado para pasar 4.5:1 (WCAG AA texto normal)
// contra `surface` en su propio modo, no solo "gris más clarito que ink".
export const MODO_TOKENS: Record<Modo, ModoTokens> = {
  noche: {
    bg: '#0D0D0F', surface: '#16161A', surface2: '#1A1A1F', line: 'rgba(255,255,255,0.07)',
    ink: '#FFFFFF', muted: '#8C8C99', muted2: '#B8B8C0',
    accentInk: '#1A1216', tabbar: 'rgba(13,13,15,0.92)', bar: '#26262C',
    hero: 'linear-gradient(150deg,#2A1C24 0%,#1A1216 60%,#0D0D0F 100%)', heroLine: 'rgba(255,200,226,0.14)',
    heroText: '#FFFFFF', heroSub: '#B8B8C0', heroAccent: 'var(--portal-brand)',
  },
  dia: {
    bg: '#F3F2EE', surface: '#FFFFFF', surface2: '#F7F6F2', line: 'rgba(0,0,0,0.06)',
    ink: '#14141A', muted: '#717177', muted2: '#6E6A72',
    accentInk: '#FFFFFF', tabbar: 'rgba(243,242,238,0.92)', bar: '#ECEAE4',
    hero: 'linear-gradient(150deg,#FFE1EE 0%,#FBEEF2 55%,#FFFFFF 100%)', heroLine: 'rgba(255,200,226,0.6)',
    heroText: '#14141A', heroSub: '#6E6A72', heroAccent: '#B4557E',
  },
};

const KEY = 'pilates:portal-modo';
const EVT = 'pilates:portal-modo-change';

function readModo(): Modo {
  if (typeof window === 'undefined') return 'noche';
  const v = window.localStorage.getItem(KEY);
  return v === 'dia' || v === 'noche' ? v : 'noche';
}

export function useModo() {
  const [modo, setModoState] = useState<Modo>('noche');

  useEffect(() => {
    setModoState(readModo());
    const sync = () => setModoState(readModo());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync); };
  }, []);

  const setModo = useCallback((m: Modo) => {
    try { window.localStorage.setItem(KEY, m); } catch { /* ignore */ }
    window.dispatchEvent(new Event(EVT));
    setModoState(m);
  }, []);

  const toggle = useCallback(() => setModo(readModo() === 'noche' ? 'dia' : 'noche'), [setModo]);

  const noche = modo === 'noche';
  return { modo, noche, toggle, setModo, t: MODO_TOKENS[modo] };
}
