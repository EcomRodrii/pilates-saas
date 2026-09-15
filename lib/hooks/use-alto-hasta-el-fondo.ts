'use client';

import { useCallback } from 'react';

/**
 * Da a un elemento el alto que queda hasta el fondo de la ventana, para que la
 * PÁGINA no haga scroll y lo que se desplace sea lo de dentro.
 *
 * ⚠️ No es un `calc(100vh - N px)`. Eso era lo que tenía el calendario, y N no
 * puede saberlo: encima hay cosas de alto variable que pone el panel —el aviso
 * «¿Primera vez aquí?» de la guía, que la propietaria cierra cuando quiere—.
 * Medido a 1366×768 con ese aviso: la página se desplazaba 60 px y la rejilla
 * salía cortada abajo. Aquí se mide lo que hay encima y lo que hay debajo.
 *
 * Es un ref de función y no un `useRef` + efecto a propósito: el calendario
 * no pinta nada hasta montar (`if (!mounted) return null`), y un efecto que
 * solo depende de `activo` ya habría corrido con el ref vacío y no volvería a
 * correr al aparecer el elemento. El alto va en `style`, sin estado: medir no
 * necesita un render más. Con `activo` en falso manda el CSS.
 */
const px = (v: string) => parseFloat(v) || 0;

/**
 * Lo que la página pinta DEBAJO del elemento: márgenes y rellenos inferiores de
 * él y de sus antepasados, y lo que vaya detrás en el flujo.
 *
 * ⚠️ No vale `scrollHeight - bottom`: el <main> del panel lleva `min-h-dvh`, así
 * que cuando lo de encima encoge (se cierra el aviso de la guía) la página sigue
 * midiendo la ventana entera y ese hueco de relleno contaba como «debajo».
 * Medido: cerrar el aviso no devolvía ni un píxel a la rejilla.
 */
function altoDebajo(el: HTMLElement): number {
  let total = 0;
  for (let n: HTMLElement = el; n.parentElement && n !== document.body; n = n.parentElement) {
    total += px(getComputedStyle(n).marginBottom);
    for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
      const cs = getComputedStyle(s);
      if (cs.display === 'none' || cs.position === 'fixed' || cs.position === 'absolute') continue;
      total += s.getBoundingClientRect().height + px(cs.marginTop) + px(cs.marginBottom);
    }
    const padre = getComputedStyle(n.parentElement);
    total += px(padre.paddingBottom) + px(padre.borderBottomWidth);
  }
  return total;
}

export function useAltoHastaElFondo<T extends HTMLElement>(activo: boolean, minimo = 480) {
  return useCallback((el: T | null) => {
    if (!el || !activo) return;

    let pendiente = 0;
    const medir = () => {
      pendiente = 0;
      const caja = el.getBoundingClientRect();
      const arriba = caja.top + window.scrollY;
      const debajo = altoDebajo(el);
      const alto = `${Math.max(minimo, Math.floor(window.innerHeight - arriba - debajo))}px`;
      if (el.style.height !== alto) el.style.height = alto;
    };
    const programar = () => { if (!pendiente) pendiente = requestAnimationFrame(medir); };

    medir();
    // Lo de encima cambia de alto sin que cambie la ventana (se cierra el aviso,
    // aparece un banner). ⚠️ Observar solo `body` no basta: el panel le pone
    // `min-h-dvh` al <main>, así que el cuerpo sigue midiendo la ventana entera
    // aunque el aviso desaparezca (medido: cerrar el aviso no devolvía ni un
    // píxel a la rejilla). Quien sí encoge es algún antepasado del elemento.
    const observador = new ResizeObserver(programar);
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) observador.observe(p);
    window.addEventListener('resize', programar);
    return () => {
      observador.disconnect();
      window.removeEventListener('resize', programar);
      if (pendiente) cancelAnimationFrame(pendiente);
      el.style.height = '';
    };
  }, [activo, minimo]);
}
