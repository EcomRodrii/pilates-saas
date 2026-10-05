// La frase y el enlace para «Compartir esta clase». Puro (compartir-clase.test.ts).

import { addDias, fechaLarga } from './formato.ts';
import { referidorUtilizable } from './referido.ts';

/** «¿Te vienes a Reformer el martes 7 de octubre a las 18:00?» (o «hoy», «mañana»). */
export function textoCompartirClase(c: { nombre: string; fecha: string; hora: string }, hoy: string): string {
  const larga = fechaLarga(c.fecha);
  const cuando = c.fecha === hoy ? 'hoy'
    : c.fecha === addDias(hoy, 1) ? 'mañana'
      : larga ? `el ${larga}` : '';
  return `¿Te vienes a ${c.nombre}${cuando ? ` ${cuando}` : ''} a las ${c.hora}?`;
}

/**
 * El enlace que se comparte: la página PÚBLICA del estudio abierta en ESA clase (`/reservar/<slug>?sesion=<id>`, que
 * pinta su ficha —«Te han invitado a esta clase»— y deja reservarla aunque no tenga cuenta), con quién la invita
 * (`invita=<socioId>`).
 *
 * Este comentario decía que no había enlace público a UNA clase: sí lo hay, `?sesion=` abre `FichaClaseUnica`.
 *
 * `invita` no es `ref` a propósito: `ref` es la etiqueta del widget y acabaría en Crecimiento web y en «Llegó por». El id
 * es opaco y la comprobación de verdad la hace el servidor al dar de alta (misma ficha, mismo estudio); aquí solo se
 * descarta lo que no tiene forma de id.
 */
export function enlaceCompartirClase(origen: string, slug: string, opciones: { sesionId?: string | null; invita?: string | null } = {}): string {
  const base = `${origen.replace(/\/$/, '')}/reservar/${encodeURIComponent(slug)}`;
  const q = new URLSearchParams();
  if (opciones.sesionId) q.set('sesion', opciones.sesionId);
  if (referidorUtilizable(opciones.invita, null)) q.set('invita', (opciones.invita as string).trim());
  const consulta = q.toString();
  return consulta ? `${base}?${consulta}` : base;
}
