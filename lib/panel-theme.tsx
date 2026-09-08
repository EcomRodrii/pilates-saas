'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fetchThemePublicado } from '@/lib/api-client';
// Directo de wcag-contrast.ts/color-utils.ts (cero dependencias cada uno), NO
// de theme-runtime.ts: ese módulo importa theme-schema.ts (zod) y
// PanelThemeProvider está montado en TODAS las rutas del panel — importar
// desde ahí bundlaría zod en las 22.
import { ID_ANFITRION_PANEL } from '@/lib/panel-portal';
import { foregroundParaFondo } from '@/lib/wcag-contrast';
import { colorLegibleSobre, mezclarHex } from '@/lib/color-utils';
import type { ThemeConfig } from '@/lib/theme-schema';

const DARK_KEY = 'panel-dark-mode';
const THEME_CACHE_KEY = 'panel-theme-cache';

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

// `--card` en claro y en oscuro (app/globals.css). No se leen del DOM porque
// esto corre antes del primer pintado.
const CARD_CLARO = '#FFFFFF';
const CARD_OSCURO = '#1E1E22';

// ⚠️ El modo entra aquí como argumento, y no es un detalle. La clase `.dark` y
// estas custom properties viven en el MISMO div, y un `style` en línea gana a
// una regla de clase: el `--brand-secondary: #A8B37A` del bloque oscuro de
// globals.css nunca llegaba a aplicarse en un estudio con tema propio. Se
// quedaba con el color calculado para fondo claro, sobre fondo oscuro.
function aplicarMarca(el: HTMLElement, theme: ThemeConfig, dark: boolean) {
  el.style.setProperty('--brand', theme.primary);
  el.style.setProperty('--brand-foreground', foregroundParaFondo(theme.primary));
  // El fondo real de este color no es la tarjeta, sino su tinte de marca al
  // 12 % — que es donde el panel pinta badges y pestañas activas.
  el.style.setProperty(
    '--brand-secondary',
    colorLegibleSobre(theme.secondary, mezclarHex(theme.primary, dark ? CARD_OSCURO : CARD_CLARO, 0.12)),
  );
}

function leerMarcaCacheada(): ThemeConfig | null {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY);
    return raw ? (JSON.parse(raw) as ThemeConfig) : null;
  } catch {
    return null;
  }
}

function guardarMarcaCache(theme: ThemeConfig) {
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(theme));
  } catch {
    // localStorage lleno/deshabilitado: no rompe nada, solo no hay caché
  }
}

// La MARCA del panel proviene del estudio (tema publicado en la DB), no de una
// preferencia por-usuario. Lo único personal es el modo claro/oscuro
// (localStorage). Si la carga del tema falla, se mantiene la marca por defecto
// de globals.css (fallback robusto).
export function PanelThemeProvider({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Último tema aplicado: al cambiar de claro a oscuro hay que recalcular el
  // color con el fondo nuevo, y para eso hace falta acordarse de él.
  const temaRef = useRef<ThemeConfig | null>(null);
  const [dark, setDarkState] = useState(false);

  // I: el panel mostraba un instante el oliva por defecto de globals.css antes
  // del tema personalizado del estudio, porque `aplicarMarca` solo corría tras
  // el fetch de /api/theme (useEffect, después del primer pintado). Se aplica
  // aquí el último tema cacheado ANTES de que el navegador pinte (useLayoutEffect
  // es síncrono, a diferencia de useEffect) — el fetch de abajo sigue refrescando
  // y corrigiendo en segundo plano por si el tema cambió desde la última visita.
  useLayoutEffect(() => {
    const cached = leerMarcaCacheada();
    if (!cached || !ref.current) return;
    temaRef.current = cached;
    aplicarMarca(ref.current, cached, localStorage.getItem(DARK_KEY) === '1');
  }, []);

  useEffect(() => {
    // Lectura de la preferencia personal en el montaje (localStorage no existe
    // en SSR, por eso va en el efecto y no en el render).
    const storedDark = localStorage.getItem(DARK_KEY) === '1';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDarkState(storedDark);
    if (ref.current) ref.current.classList.toggle('dark', storedDark);

    let vivo = true;
    // ⚠️ Vía `fetchThemePublicado`, no con un `fetch` propio: este provider está
    // montado en TODAS las rutas del panel y pedía `/api/theme` por su cuenta,
    // fuera del dedupe de peticiones en vuelo de `api-client`. Al abrir el
    // editor de apariencia se solapaba con la petición idéntica de la
    // biblioteca de temas y el panel pedía DOS veces exactamente lo mismo.
    // Compartir la clave `theme-publicado` las funde en una.
    async function cargarMarca() {
      try {
        const theme = await fetchThemePublicado();
        if (!vivo) return;
        temaRef.current = theme;
        // El modo se lee del DOM, no de `storedDark`: entre el arranque y la
        // respuesta del fetch el usuario puede haber pulsado el interruptor.
        if (ref.current) aplicarMarca(ref.current, theme, ref.current.classList.contains('dark'));
        guardarMarcaCache(theme);
      } catch {
        // sin conexión / sin sesión → marca por defecto
      }
    }
    cargarMarca();
    // El editor de marca dispara esto al publicar → el panel refleja la nueva
    // marca sin recargar.
    const onCambio = () => cargarMarca();
    window.addEventListener('tentare-theme-changed', onCambio);
    return () => {
      vivo = false;
      window.removeEventListener('tentare-theme-changed', onCambio);
    };
  }, []);

  function setDark(v: boolean) {
    setDarkState(v);
    localStorage.setItem(DARK_KEY, v ? '1' : '0');
    if (!ref.current) return;
    ref.current.classList.toggle('dark', v);
    // El fondo ha cambiado, así que el color de marca legible sobre él también.
    if (temaRef.current) aplicarMarca(ref.current, temaRef.current, v);
  }

  return (
    <PanelThemeContext.Provider value={{ dark, setDark }}>
      <div ref={ref} className={className}>
        {children}
        {/* ⚠️ Anfitrión de los portales del panel. Va AQUÍ y no en
            `document.body` por una razón concreta: la clase `.dark` vive en
            este div, así que todo lo que se portalee fuera vuelve a los tokens
            CLAROS — hojas blancas sobre el panel oscuro y texto blanco sobre
            blanco. Y va como hermano de `children`, no dentro, para quedar
            fuera de lo que `.panel-page-in` transforma: si no, `position:
            fixed` volvería a medirse contra la caja animada en vez del
            viewport, que es justo por lo que se portalea. */}
        <div id={ID_ANFITRION_PANEL} />
      </div>
    </PanelThemeContext.Provider>
  );
}
