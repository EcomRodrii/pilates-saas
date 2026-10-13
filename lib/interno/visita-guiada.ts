// ─────────────────────────────────────────────────────────────────────────────
// /interno → Visita guiada: qué estado tiene cada estudio, dicho en una frase.
//
// Puro y client-safe (imports relativos con extensión: lo ejecuta `node --test`).
// Lo comparten el endpoint (que devuelve el estado ya resuelto) y los tests.
// ─────────────────────────────────────────────────────────────────────────────

import { CAPITULOS } from '../tour/capitulos.ts';
import { parseProgreso } from '../tour/progreso.ts';

export type EstadoVisitaEstudio = 'desactivada' | 'sin-empezar' | 'en-curso' | 'completada';

export interface ResumenVisita {
  estado: EstadoVisitaEstudio;
  /** «Capítulo 3 de 10 · paso c3.2», «Completada el 8 oct»… listo para pintar. */
  texto: string;
  /** Lo que lleva hecho, 0–100, para una barra. */
  porcentaje: number;
}

const TOTAL_PASOS = CAPITULOS.reduce((n, c) => n + c.pasos.length, 0);

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });

export function resumenVisita(
  e: { obligatorio: boolean; completadaEn: string | null; progreso: unknown },
): ResumenVisita {
  const p = parseProgreso(e.progreso);
  const cerrados = new Set([...p.hechos, ...p.aplazados]);
  const porcentaje = Math.round((cerrados.size / TOTAL_PASOS) * 100);

  if (e.completadaEn) return { estado: 'completada', texto: `Completada el ${fecha(e.completadaEn)}`, porcentaje: 100 };
  if (!e.obligatorio) {
    // Desactivada, pero conserva lo que llevaba: se dice, para que «Activar» no sorprenda.
    return { estado: 'desactivada', texto: cerrados.size > 0 ? `Desactivada · llevaba un ${porcentaje} %` : 'Desactivada', porcentaje };
  }
  if (!p.inicio) return { estado: 'sin-empezar', texto: 'Activa · todavía no ha empezado', porcentaje: 0 };

  const i = CAPITULOS.findIndex(c => c.pasos.some(s => !cerrados.has(s.id)));
  if (i === -1) return { estado: 'en-curso', texto: 'Casi lista: falta cerrar el último capítulo', porcentaje };
  return { estado: 'en-curso', texto: `Capítulo ${i + 1} de ${CAPITULOS.length} · ${CAPITULOS[i].titulo}`, porcentaje };
}

export type AccionVisita =
  | { accion: 'estudio'; id: string; operacion: 'activar' | 'activar-desde-cero' | 'desactivar' }
  | { accion: 'todos'; activar: boolean }
  | { accion: 'nuevos'; activar: boolean };

/** Valida el cuerpo que llega al endpoint: nada de fiarse de lo que mande el cliente. */
export function leerAccion(x: unknown): AccionVisita | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (o.accion === 'estudio') {
    if (typeof o.id !== 'string' || !o.id || o.id.length > 200) return null;
    if (o.operacion !== 'activar' && o.operacion !== 'activar-desde-cero' && o.operacion !== 'desactivar') return null;
    return { accion: 'estudio', id: o.id, operacion: o.operacion };
  }
  if ((o.accion === 'todos' || o.accion === 'nuevos') && typeof o.activar === 'boolean') {
    return { accion: o.accion, activar: o.activar };
  }
  return null;
}
