'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Pon en marcha tu estudio» del alta nueva (PR-5): quién lo ve y en qué va.
//
// Dos ganchos, para no suscribir a quien no lo necesita al god-context:
//   · `useAltaNuevaPropia()`: ¿es la propietaria de un estudio del alta nueva,
//     con el panel nuevo? Y el estado del servidor (lib/alta/estado-cliente.ts).
//     Solo `useCore()`: lo usan el marco del panel (WhatsApp, el recorrido), que
//     se pinta en las ~90 pantallas.
//   · `usePonEnMarcha()`: además, la lista entera con lo que el panel ya tiene
//     cargado (`useStudio()`), que hace que una tarea se marque al momento al
//     dar de alta a una clienta, sin esperar a la siguiente pregunta.
//
// Qué está hecho lo dicen SIEMPRE los datos (lib/guia/primeros-pasos.ts,
// `primerosPasosAltaNueva`). Lo único que guarda este navegador es qué tareas
// omitió: una comodidad de quien mira, no un dato del estudio.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useCore } from '@/lib/core-context';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { useAltaNueva, usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { useEstadoAlta } from '@/lib/alta/estado-cliente';
import type { EstadoAlta } from '@/lib/alta/estado';
import { sedesDeOnbCentros } from '@/lib/alta/tu-estudio';
import { calcularOnboarding, datosOnboardingDelEstudio, estudioActivado } from '@/lib/onboarding';
import { primerosPasosAltaNueva, type PrimerosPasosAltaNueva } from '@/lib/guia/primeros-pasos';

export interface AltaNuevaPropia {
  /** `null` mientras se pregunta si el estudio va con el alta nueva. */
  activo: boolean | null;
  studioId: string | null;
  /** `undefined` mientras contesta el servidor la primera vez; `null` si no se sabe. */
  estado: EstadoAlta | null | undefined;
}

export function useAltaNuevaPropia(): AltaNuevaPropia {
  const { studio } = useCore();
  const rol = useRol();
  const altaNueva = useAltaNueva();
  const panelNuevo = usePanelNuevo();
  const studioId = studio?.id ?? null;
  // El rol solo vale con el estudio cargado (antes, `useRol` cae al mínimo).
  const activo = !studioId ? null : altaNueva === null ? null : altaNueva && panelNuevo && rol === 'PROPIETARIO';
  const estado = useEstadoAlta(studioId, activo === true);
  return { activo, studioId, estado };
}

// ── Las tareas omitidas, en este navegador ──────────────────────────────────

const claveOmitidas = (studioId: string) => `tentare-pon-en-marcha-omitidas:${studioId}`;
const oyentes = new Set<() => void>();
const cache = new Map<string, string>();

function leerOmitidas(studioId: string): string {
  const c = cache.get(studioId);
  if (c !== undefined) return c;
  let v = '[]';
  try { v = localStorage.getItem(claveOmitidas(studioId)) ?? '[]'; } catch { /* sin almacenamiento */ }
  cache.set(studioId, v);
  return v;
}

function parseOmitidas(crudo: string): string[] {
  try {
    const v = JSON.parse(crudo) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 10) : [];
  } catch { return []; }
}

export function omitirTarea(studioId: string, id: string): void {
  const actuales = parseOmitidas(leerOmitidas(studioId));
  if (actuales.includes(id)) return;
  const nuevo = JSON.stringify([...actuales, id]);
  cache.set(studioId, nuevo);
  try { localStorage.setItem(claveOmitidas(studioId), nuevo); } catch { /* solo en memoria */ }
  for (const f of oyentes) f();
}

function useOmitidas(studioId: string | null): string[] {
  const suscribir = useCallback((f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; }, []);
  const crudo = useSyncExternalStore(suscribir, () => (studioId ? leerOmitidas(studioId) : '[]'), () => '[]');
  return useMemo(() => parseOmitidas(crudo), [crudo]);
}

// ── La lista ─────────────────────────────────────────────────────────────────

export interface PonEnMarcha extends AltaNuevaPropia {
  /** `null` mientras falta algo para calcularla (el estudio, los datos o el servidor). */
  pasos: PrimerosPasosAltaNueva | null;
  /** La ocultó con la X (`studios.onboarding_descartado_en`, el mismo sello que la lista de siempre). */
  ocultada: boolean;
  creadoEn: string | null;
  omitir: (id: string) => void;
}

export function usePonEnMarcha(): PonEnMarcha {
  const base = useAltaNuevaPropia();
  const {
    studio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, bannersPortal, dataLoaded, datosIncompletos,
  } = useStudio();
  const omitidas = useOmitidas(base.studioId);

  const pasos = useMemo(() => {
    // Con la carga a medias, una lista vacía no quiere decir «no lo tiene»; y
    // sin la respuesta del servidor (`undefined`), mejor esperar que marcar mal.
    if (base.activo !== true || !studio || !dataLoaded || datosIncompletos.length > 0 || base.estado === undefined) return null;
    const datos = datosOnboardingDelEstudio({
      studio, instructores, tiposClase, sesiones, socios, reservas,
      salas, planesTarifa, suscripciones, automationRules, bannersPortal,
    });
    const hecho = new Map(calcularOnboarding(datos).categorias.flatMap(c => c.pasos).map(p => [p.id, p.done]));
    const e = base.estado;
    const sedes = sedesDeOnbCentros(studio.onbCentros);
    return primerosPasosAltaNueva({
      claseReservable: e?.claseReservable === true,
      avisoClase: e?.avisoClase ?? null,
      enlaceCompartido: e?.enlaceCompartido === true,
      // Lo que ya tiene cargado el panel, o lo que cuenta el servidor en la tabla entera.
      alumnas: datos.numSocios > 0 || e?.alumnas === true,
      primeraReserva: estudioActivado(datos) || e?.primeraReserva === true,
      marca: hecho.get('marca') === true,
      stripe: hecho.get('stripe') === true,
      fiscales: hecho.get('estudio') === true,
      equipo: hecho.get('invitar-equipo') === true,
      sedes: sedes?.tipo === 'varias' ? { total: sedes.total, abiertas: e?.sedesAbiertas ?? 1 } : null,
      omitidas,
    });
  }, [base.activo, base.estado, studio, instructores, tiposClase, sesiones, socios, reservas, salas, planesTarifa,
    suscripciones, automationRules, bannersPortal, dataLoaded, datosIncompletos, omitidas]);

  const studioId = base.studioId;
  const omitir = useCallback((id: string) => { if (studioId) omitirTarea(studioId, id); }, [studioId]);

  return {
    ...base,
    pasos,
    ocultada: !!studio?.onboardingDescartadoEn,
    creadoEn: studio?.creadoEn ?? null,
    omitir,
  };
}
