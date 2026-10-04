'use client';

import { useEffect } from 'react';
import type { Clase, Reserva } from './tipos.ts';
import { guardarAjuste, leerAjuste, planCalendario, type MapaEventos } from './calendario-auto.ts';
import { añadirAlCalendario } from './enlaces-clase.ts';
import { borrarEventoCalendario, crearEventoCalendario, esAppNativa, pedirAccesoCalendario, type EventoCalendario } from '../nativo/puente.ts';

// El calendario del iPhone, desde la app de la alumna:
//
//   · «Mis reservas en mi calendario» (Perfil): cada reserva confirmada entra
//     sola en el calendario y sale si se cancela (`sincronizarCalendario`, que
//     llaman Inicio y Mis clases con lo que ya han cargado: ni una petición más).
//   · «+ Calendario» de un toque (`alCalendario`): en la app va directo al
//     calendario; fuera de ella, o sin permiso, lo de siempre (.ics / Google).
//
// La lógica de qué crear y qué quitar es pura (calendario-auto.ts).

export interface DatosEstudio { slug: string; nombre: string; direccion: string }

function evento(c: Clase, e: DatosEstudio, instructora?: string): EventoCalendario {
  return {
    titulo: `${c.nombre} · ${e.nombre}`,
    inicioMs: new Date(c.inicio).getTime(),
    finMs: new Date(c.fin).getTime(),
    lugar: e.direccion || e.nombre,
    notas: [instructora ? `Con ${instructora}` : null, c.sala].filter(Boolean).join(' · '),
  };
}

// Una sincronización a la vez: Inicio y Mis clases pueden pedirla seguidas, y dos
// en paralelo crearían el mismo evento dos veces.
let enCurso: Promise<void> = Promise.resolve();

export function sincronizarCalendario(
  e: DatosEstudio, reservas: Reserva[], clases: Clase[], nombreInstructora: (id: string) => string | undefined,
): Promise<void> {
  if (!esAppNativa()) return Promise.resolve();
  enCurso = enCurso.then(async () => {
    const ajuste = leerAjuste(e.slug);
    if (!ajuste.activo) return;
    const mapa: MapaEventos = { ...ajuste.mapa };
    const plan = planCalendario(reservas, clases, mapa, Date.now());
    if (!plan.crear.length && !plan.quitar.length && !plan.olvidar.length) return;
    for (const id of plan.olvidar) delete mapa[id];
    for (const [claseId, eventoId] of plan.quitar) {
      // Aunque falle (la borró ella a mano, o retiró el permiso), sale de la
      // memoria: no hay nada más que hacer con ese id.
      await borrarEventoCalendario(eventoId);
      delete mapa[claseId];
    }
    for (const c of plan.crear) {
      const id = await crearEventoCalendario(evento(c, e, nombreInstructora(c.instructoraId)));
      if (id) mapa[c.id] = id;
    }
    // Se relee por si mientras tanto la apagó.
    if (leerAjuste(e.slug).activo) guardarAjuste(e.slug, { activo: true, mapa });
  }).catch(() => {});
  return enCurso;
}

/** Enciende el interruptor. `false` si no dio permiso: el interruptor se queda apagado. */
export async function activarCalendario(e: DatosEstudio): Promise<boolean> {
  const ok = await pedirAccesoCalendario();
  if (!ok) return false;
  const { mapa } = leerAjuste(e.slug);
  guardarAjuste(e.slug, { activo: true, mapa });
  return true;
}

/**
 * Apaga el interruptor y quita los eventos que la app había puesto (los de
 * clases que aún no han pasado: las pasadas ya salieron de la memoria). Dejarlos
 * sería peor: si luego cancela, nadie los quitaría.
 */
export async function desactivarCalendario(slug: string): Promise<void> {
  const { mapa } = leerAjuste(slug);
  guardarAjuste(slug, { activo: false, mapa: {} });
  await enCurso;
  for (const id of Object.values(mapa)) await borrarEventoCalendario(id);
}

export function calendarioActivo(slug: string): boolean {
  return leerAjuste(slug).activo;
}

export type ResultadoCalendario = 'añadida' | 'ya-estaba' | 'otro';

/**
 * «+ Calendario». En la app: directo al calendario del iPhone (pide permiso la
 * primera vez) y queda apuntada, así que el interruptor no la duplica y la quita
 * si cancela. Sin permiso o fuera de la app: el camino de siempre.
 */
export async function alCalendario(e: DatosEstudio, c: Clase, instructora?: string): Promise<ResultadoCalendario> {
  if (esAppNativa()) {
    const ajuste = leerAjuste(e.slug);
    if (ajuste.mapa[c.id]) return 'ya-estaba';
    if (await pedirAccesoCalendario()) {
      const id = await crearEventoCalendario(evento(c, e, instructora));
      if (id) {
        const ahora = leerAjuste(e.slug);
        guardarAjuste(e.slug, { activo: ahora.activo, mapa: { ...ahora.mapa, [c.id]: id } });
        return 'añadida';
      }
    }
  }
  añadirAlCalendario(c, e.nombre, e.direccion, instructora);
  return 'otro';
}

/**
 * Para las pantallas que ya cargan sus reservas (Inicio, Mis clases): cada vez
 * que cambian, el calendario se pone al día. Con el interruptor apagado o fuera
 * de la app, no hace nada.
 */
export function useSincronizarCalendario(
  e: DatosEstudio,
  datos: { reservas: Reserva[]; clases: Clase[]; instructoras: { id: string; nombre: string }[] } | null | undefined,
): void {
  const { slug, nombre, direccion } = e;
  useEffect(() => {
    if (!datos) return;
    void sincronizarCalendario({ slug, nombre, direccion }, datos.reservas, datos.clases,
      (id) => datos.instructoras.find((i) => i.id === id)?.nombre);
  }, [slug, nombre, direccion, datos]);
}
