'use client';

import type { MouseEvent } from 'react';
import { esClicNormal } from './contexto';

// ─────────────────────────────────────────────────────────────────────────────
// Ir a una sección de Configuración desde FUERA del shell —la barra superior,
// ⌘K, un aviso, el menú— sin pasar por el router de Next.
//
// ⚠️ #2030: en el build de producción, tras entrar en Configuración por una
// sección (`?tab=altas`) el router guarda esa URL para la ruta, y un
// `router.push` o un `<Link>` a otra sección (`?tab=cobros`) desde la misma
// pantalla vuelve a escribir `?tab=altas`: la sección cambia y la dirección se
// queda pegada (recargar o compartir abre otra). En `next dev` no pasa. El shell ya cambia de sección
// con la API nativa del historial (`irA`, config-shell.tsx); esto le pasa el
// enlace para que lo haga él, preguntando antes si hay cambios sin guardar.
//
// Solo si el shell está montado, que es lo mismo que estar en /configuracion.
// Desde cualquier otra pantalla, quien llama navega como siempre.
// ─────────────────────────────────────────────────────────────────────────────

const EVENTO = 'tentare:configuracion-ir';
let shellsMontados = 0;

/** Lo usa el shell: recibe cada enlace a Configuración mientras está montado. */
export function escucharEnlacesAConfiguracion(ir: (href: string) => void): () => void {
  const alRecibir = (e: Event) => ir((e as CustomEvent<string>).detail);
  shellsMontados += 1;
  window.addEventListener(EVENTO, alRecibir);
  return () => {
    shellsMontados -= 1;
    window.removeEventListener(EVENTO, alRecibir);
  };
}

/** `true` si el shell se encarga de ir a `href`; `false` = navega tú, como siempre. */
export function irEnConfiguracion(href: string): boolean {
  if (typeof window === 'undefined' || shellsMontados === 0) return false;
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname !== '/configuracion' || window.location.pathname !== '/configuracion') return false;
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: `${url.pathname}${url.search}${url.hash}` }));
  return true;
}

/** Para el `onClick` de un `<Link>`: si el shell se encarga, el enlace no navega. */
export function alPulsarEnlaceAConfiguracion(e: MouseEvent, href: string): void {
  if (!esClicNormal(e)) return;
  if (irEnConfiguracion(href)) e.preventDefault();
}
