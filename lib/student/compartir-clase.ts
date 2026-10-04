// La frase y el enlace para «Compartir esta clase». Puro (compartir-clase.test.ts).

import { addDias, fechaLarga } from './formato.ts';

/** «¿Te vienes a Reformer el martes 7 de octubre a las 18:00?» (o «hoy», «mañana»). */
export function textoCompartirClase(c: { nombre: string; fecha: string; hora: string }, hoy: string): string {
  const larga = fechaLarga(c.fecha);
  const cuando = c.fecha === hoy ? 'hoy'
    : c.fecha === addDias(hoy, 1) ? 'mañana'
      : larga ? `el ${larga}` : '';
  return `¿Te vienes a ${c.nombre}${cuando ? ` ${cuando}` : ''} a las ${c.hora}?`;
}

/**
 * El enlace que se comparte: la página PÚBLICA del estudio (`/reservar/<slug>`),
 * donde la amiga ve el horario y reserva aunque no tenga cuenta. No hay hoy un
 * enlace público a UNA clase (esa página no lee ninguna clase de la URL), así
 * que no se inventa: la frase ya dice cuál es.
 */
export function enlaceCompartirClase(origen: string, slug: string): string {
  return `${origen.replace(/\/$/, '')}/reservar/${encodeURIComponent(slug)}`;
}
