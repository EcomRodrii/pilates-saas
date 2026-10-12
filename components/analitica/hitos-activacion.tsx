'use client';

import { useEffect, useRef } from 'react';
import { useStudio } from '@/lib/studio-context';
import { datosHecho } from '@/lib/tour/hecho';
import { capturarEvento } from '@/lib/posthog-cliente';
import { EVENTO_DEL_HITO, avanzarBase, estadoHitos, faltaAlguno, hitosNuevos, type EstadoHitos } from '@/lib/analitica/hitos';

// Observa los hitos de activación de un estudio nuevo y los manda a PostHog
// cuando pasan de no a sí (ver lib/analitica/hitos.ts). No pinta nada.
//
// Lo monta `dashboard-shell` en un chunk aparte, solo para la propietaria de un
// estudio de menos de un mes (`debeObservar`): el resto del panel no paga ni
// la suscripción al contexto.
//
// La línea base se toma al terminar la carga (`dataLoaded`: las listas llegan
// en el mismo lote) y es por estudio. Cambiar de sede recarga el panel entero,
// pero si alguna vez dejara de hacerlo, un estudio distinto toma su propia base
// en vez de compararse con el anterior.
export function HitosActivacion() {
  const { studio, dataLoaded, datosIncompletos, salas, tiposClase, sesiones, socios, instructores, planesTarifa, suscripciones } = useStudio();
  const base = useRef<{ studioId: string; hitos: EstadoHitos } | null>(null);

  const studioId = studio?.id ?? null;
  // Con la carga a medias (`datosIncompletos`), una lista vacía no quiere decir
  // «no tiene»: ni se toma línea base ni se emite nada en esta sesión.
  const ahora = dataLoaded && studio && datosIncompletos.length === 0
    ? estadoHitos(datosHecho({
      studio: { nif: studio.nif ?? null, razonSocial: studio.razonSocial ?? null, logoUrl: studio.logoUrl ?? null },
      salas, tiposClase, sesiones, socios, instructores, planesTarifa, suscripciones,
    }))
    : null;
  const tipos = ahora?.tiposClase ?? null;
  const clases = ahora?.sesiones ?? null;
  const tarifa = ahora?.tarifaActiva ?? null;

  useEffect(() => {
    if (!studioId || tipos === null || clases === null || tarifa === null) return;
    const actual: EstadoHitos = { tiposClase: tipos, sesiones: clases, tarifaActiva: tarifa };
    if (!base.current || base.current.studioId !== studioId) {
      base.current = { studioId, hitos: actual };
      return;
    }
    if (!faltaAlguno(base.current.hitos)) return;
    for (const hito of hitosNuevos(base.current.hitos, actual)) capturarEvento(EVENTO_DEL_HITO[hito]);
    base.current = { studioId, hitos: avanzarBase(base.current.hitos, actual) };
  }, [studioId, tipos, clases, tarifa]);

  return null;
}
