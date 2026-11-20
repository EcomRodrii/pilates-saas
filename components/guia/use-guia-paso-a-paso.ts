'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La guía paso a paso de puesta en marcha: quién la ve y en qué va.
// Qué está hecho lo dicen SIEMPRE los datos del estudio (lib/guia/ruta-puesta-en-marcha.ts);
// lo único que guarda este navegador son los pasos que saltó (una comodidad de quien
// mira, no un dato del estudio) y saltar nunca da un paso por hecho.
//
// Dos ganchos, como `use-pon-en-marcha.ts`: `useGuiaActiva()` es barato (solo `useCore`,
// para el marco que se pinta en todas las pantallas) y `useGuiaPasoAPaso()` calcula la ruta.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useStudio } from '@/lib/studio-context';
import { useGuiaPasoAPasoActiva } from '@/lib/estudio/panel-nuevo-cliente';
import { calcularOnboarding, datosOnboardingDelEstudio, estudioActivado } from '@/lib/onboarding';
import { rutaPuestaEnMarcha, type RutaPuestaEnMarcha } from '@/lib/guia/ruta-puesta-en-marcha';
import { useAltaNuevaPropia } from './use-pon-en-marcha';
import type { EstadoAlta } from '@/lib/alta/estado';

/** ¿Es la propietaria de un estudio del alta nueva, con la guía encendida? `null` = se está preguntando. */
export function useGuiaActiva(): { activo: boolean | null; studioId: string | null; estado: EstadoAlta | null | undefined } {
  const alta = useAltaNuevaPropia();
  const guia = useGuiaPasoAPasoActiva();
  return { ...alta, activo: alta.activo === null ? null : alta.activo && guia };
}

// ── Los pasos saltados, en este navegador ───────────────────────────────────

const clave = (studioId: string) => `tentare-guia-saltados:${studioId}`;
const oyentes = new Set<() => void>();
const cache = new Map<string, string>();

function leer(studioId: string): string {
  const c = cache.get(studioId);
  if (c !== undefined) return c;
  let v = '[]';
  try { v = localStorage.getItem(clave(studioId)) ?? '[]'; } catch { /* sin almacenamiento */ }
  cache.set(studioId, v);
  return v;
}

function parse(crudo: string): string[] {
  try {
    const v = JSON.parse(crudo) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
  } catch { return []; }
}

export function saltarPaso(studioId: string, id: string): void {
  const actuales = parse(leer(studioId));
  if (actuales.includes(id)) return;
  const nuevo = JSON.stringify([...actuales, id]);
  cache.set(studioId, nuevo);
  try { localStorage.setItem(clave(studioId), nuevo); } catch { /* solo en memoria */ }
  for (const f of oyentes) f();
}

function useSaltados(studioId: string | null): string[] {
  const suscribir = useCallback((f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; }, []);
  const crudo = useSyncExternalStore(suscribir, () => (studioId ? leer(studioId) : '[]'), () => '[]');
  return useMemo(() => parse(crudo), [crudo]);
}

// ── La ruta ──────────────────────────────────────────────────────────────────

export interface GuiaPasoAPaso {
  activo: boolean | null;
  studioId: string | null;
  estado: EstadoAlta | null | undefined;
  /** `null` mientras falta algo para calcularla (el estudio, los datos o el servidor). */
  ruta: RutaPuestaEnMarcha | null;
  ocultada: boolean;
  saltar: (id: string) => void;
}

export function useGuiaPasoAPaso(): GuiaPasoAPaso {
  const base = useGuiaActiva();
  const {
    studio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, bannersPortal, dataLoaded, datosIncompletos,
  } = useStudio();
  const saltados = useSaltados(base.studioId);

  const ruta = useMemo(() => {
    // Con la carga a medias una lista vacía no quiere decir «no lo tiene», y sin la
    // respuesta del servidor (`undefined`) mejor esperar que marcar mal.
    if (base.activo !== true || !studio || !dataLoaded || datosIncompletos.length > 0 || base.estado === undefined) return null;
    const datos = datosOnboardingDelEstudio({
      studio, instructores, tiposClase, sesiones, socios, reservas,
      salas, planesTarifa, suscripciones, automationRules, bannersPortal,
    });
    const hecho = new Map(calcularOnboarding(datos).categorias.flatMap(c => c.pasos).map(p => [p.id, p.done]));
    const e = base.estado;
    return rutaPuestaEnMarcha({
      salas: hecho.get('salas') === true,
      instructoras: hecho.get('instructor') === true,
      tipos: hecho.get('clase') === true,
      // «Hay clase reservable» es el sí del servidor; haber programado alguna basta para el paso.
      horario: hecho.get('horario') === true || e?.claseReservable === true,
      tarifas: hecho.get('bonos') === true,
      cobros: hecho.get('stripe') === true,
      marca: hecho.get('marca') === true,
      alumnas: datos.numSocios > 0 || e?.alumnas === true,
      compartir: e?.enlaceCompartido === true,
      primeraReserva: estudioActivado(datos) || e?.primeraReserva === true,
      saltados,
    });
  }, [base.activo, base.estado, studio, instructores, tiposClase, sesiones, socios, reservas, salas, planesTarifa,
    suscripciones, automationRules, bannersPortal, dataLoaded, datosIncompletos, saltados]);

  const studioId = base.studioId;
  const saltar = useCallback((id: string) => { if (studioId) saltarPaso(studioId, id); }, [studioId]);
  return { ...base, ruta, ocultada: !!studio?.onboardingDescartadoEn, saltar };
}
