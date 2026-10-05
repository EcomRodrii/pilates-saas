'use client';

import type { Clase } from './tipos.ts';
import { añadirAlCalendario } from './enlaces-clase.ts';
import { crearEventoConHoja, esAppNativa, type EventoCalendario } from '../nativo/puente.ts';
import { hojaDeCalendarioSinPermiso } from '../nativo/plataforma.ts';

// «+ Calendario» de un toque, en la app de iOS.
//
//   · iOS 17 o más: la hoja de iOS para añadir un evento, ya rellena. No pide
//     acceso al calendario (la hoja es del sistema) ni se guarda nada.
//   · iOS 15 y 16, o si la hoja no se puede abrir: el .ics por la hoja de
//     compartir, como antes.
//   · Fuera de la app: lo de siempre (.ics en Apple, Google en el resto).
//
// ⚠️ Lo que había aquí además —«Mis reservas en mi calendario», que añadía y
// quitaba solas todas sus reservas— se retiró de esta tanda: con datos reales
// podía borrar o duplicar eventos del calendario de la alumna, y necesita su
// propio diseño y una prueba en un iPhone.

export interface DatosEstudio { slug: string; nombre: string; direccion: string }

function datosDe(c: Clase, e: DatosEstudio, instructora?: string): EventoCalendario {
  return {
    titulo: `${c.nombre} · ${e.nombre}`,
    inicioMs: new Date(c.inicio).getTime(),
    finMs: new Date(c.fin).getTime(),
    lugar: e.direccion || e.nombre,
    notas: [instructora ? `Con ${instructora}` : null, c.sala].filter(Boolean).join(' · '),
  };
}

/** `añadida`: la añadió con la hoja de iOS. `otro`: el camino de siempre, o la cerró sin añadir. */
export type ResultadoCalendario = 'añadida' | 'otro';

export async function alCalendario(e: DatosEstudio, c: Clase, instructora?: string): Promise<ResultadoCalendario> {
  if (esAppNativa() && hojaDeCalendarioSinPermiso(navigator.userAgent)) {
    const r = await crearEventoConHoja(datosDe(c, e, instructora));
    if (r === true) return 'añadida';
    if (r === false) return 'otro'; // la cerró sin añadir: no es un error
    // `null`: la hoja no se pudo abrir. Al .ics de siempre.
  }
  añadirAlCalendario(c, e.nombre, e.direccion, instructora);
  return 'otro';
}
