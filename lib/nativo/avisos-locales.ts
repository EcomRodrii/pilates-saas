// Avisos de clase PROGRAMADOS EN EL iPhone (docs/APP-IOS.md, «Avisos locales»).
//
// Puro y sin `@/`: lo prueba `node --test` (avisos-locales.test.ts). La app los
// entrega a `AvisosLocalesPlugin` (ios/App/App/), que los programa en iOS con
// `UNUserNotificationCenter`; saltan aunque no haya red ni la app esté abierta.
//
// ⚠️ No duplican a los del servidor: el estudio manda por push el de 24 h y el de
// 1 h (`recordatorio-clase.ts`). Este es otro, el último empujón: 15 minutos
// antes. Si algún día el servidor manda uno a esa distancia, se quita este.
//
// Lo que sale aquí se ve en la pantalla de bloqueo: solo nombre de la clase,
// estudio y sala. Nunca ids, correo, pagos ni bonos.

import { clasesParaElWidget } from './widget-clases.ts';
import type { Clase, Instructora, Reserva } from '../student/tipos.ts';

/** Antelación del aviso local. */
export const MINUTOS_ANTES = 15;
/** iOS guarda como mucho 64 avisos pendientes por app; esto deja sitio de sobra. */
export const MAX_AVISOS_LOCALES = 10;
/** Debe coincidir con `AvisosLocalesPlugin.prefijo` (Swift): lo que empieza así es de aquí y se puede reemplazar. */
export const PREFIJO_AVISO_LOCAL = 'clase-local-';

export interface AvisoLocal {
  id: string;
  titulo: string;
  cuerpo: string;
  /** Cuándo suena, ISO 8601 en UTC sin fracción. */
  cuando: string;
}

/**
 * Un aviso por cada reserva confirmada que empieza dentro de más de
 * `MINUTOS_ANTES` minutos (si ya falta menos, el momento pasó). Orden: la más
 * próxima primero.
 */
export function avisosLocales(e: {
  reservas: readonly Pick<Reserva, 'claseId' | 'estado'>[];
  clases: readonly Pick<Clase, 'id' | 'nombre' | 'inicio' | 'fin' | 'sala' | 'instructoraId'>[];
  instructoras: readonly Pick<Instructora, 'id' | 'nombre'>[];
  estudio: string;
  ahoraMs: number;
}): AvisoLocal[] {
  const lista = clasesParaElWidget({ ...e, max: MAX_AVISOS_LOCALES * 2 });
  const salida: AvisoLocal[] = [];
  for (const c of lista) {
    const cuandoMs = new Date(c.inicio).getTime() - MINUTOS_ANTES * 60_000;
    if (cuandoMs <= e.ahoraMs + 30_000) continue;
    salida.push({
      id: `${PREFIJO_AVISO_LOCAL}${c.id}`,
      titulo: `${c.titulo} empieza en ${MINUTOS_ANTES} minutos`,
      cuerpo: [c.estudio, c.sala].filter(Boolean).join(' · '),
      cuando: new Date(cuandoMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    });
    if (salida.length >= MAX_AVISOS_LOCALES) break;
  }
  return salida;
}

/** Lo que recibe `AvisosLocalesPlugin.programar({ json })`. */
export function jsonParaAvisosLocales(avisos: readonly AvisoLocal[]): string {
  return JSON.stringify({ version: 1, avisos });
}

/** Sirve para no reprogramar si no ha cambiado nada. */
export function huellaDeAvisosLocales(avisos: readonly AvisoLocal[]): string {
  return JSON.stringify(avisos);
}
