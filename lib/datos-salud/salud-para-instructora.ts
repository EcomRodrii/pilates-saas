// ─────────────────────────────────────────────────────────────────────────────
// Qué ve de la salud de SU alumna la instructora en la app del estudio.
//
// Decisión del fundador (14-sep-2026), dato de categoría especial (art. 9 RGPD):
//   · solo con consentimiento de salud VIGENTE; sin él, «sin consentimiento» y
//     nada que deje adivinar si hay condiciones;
//   · solo avisos ESTRUCTURADOS de las condiciones activas: semáforo, etiqueta,
//     zona, restricciones (con su texto legible) y gravedad. Nunca las notas
//     libres de la condición, la valoración inicial ni el cuestionario;
//   · de las notas de progreso, solo las que escribió ELLA, en solo lectura.
//
// Que sea «su alumna» NO se decide aquí (ver `instructoraAtiendeSocia`), ni se
// registra la lectura: eso lo hace el servidor antes de devolver nada.
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { CondicionSalud, NivelSemaforo, NotaProgreso, SeveridadCondicion, ZonaCorporal } from '../types';
import { condicionesActivas, etiquetaRestriccion, semaforo } from '../ficha-clinica.ts';
import { estadoConsentimientoSalud } from './consentimiento.ts';

export interface AvisoSalud {
  etiqueta: string;
  zona: ZonaCorporal | null;
  /** Texto legible de cada restricción (no el código). */
  restricciones: string[];
  severidad: SeveridadCondicion;
}

export type SaludParaInstructora =
  | { consentimiento: 'SIN_CONSENTIMIENTO' }
  | { consentimiento: 'VIGENTE'; semaforo: NivelSemaforo; avisos: AvisoSalud[] };

/** Lo único de una condición que hace falta: ni sus notas libres llegan a leerse. */
export type CondicionParaAviso = Pick<CondicionSalud, 'etiqueta' | 'zona' | 'restricciones' | 'severidad' | 'estado'>;

export function saludParaInstructora(p: {
  consentimientoFecha: string | null;
  consentimientoRevocadoEn: string | null;
  condiciones: readonly CondicionParaAviso[];
}): SaludParaInstructora {
  const estado = estadoConsentimientoSalud({ fecha: p.consentimientoFecha, revocadoEn: p.consentimientoRevocadoEn });
  if (estado !== 'VIGENTE') return { consentimiento: 'SIN_CONSENTIMIENTO' };
  // `semaforo` y `condicionesActivas` solo miran estado, severidad y restricciones.
  const condiciones = [...p.condiciones] as CondicionSalud[];
  return {
    consentimiento: 'VIGENTE',
    semaforo: semaforo(condiciones),
    avisos: condicionesActivas(condiciones).map((c) => ({
      etiqueta: c.etiqueta,
      zona: c.zona ?? null,
      restricciones: (c.restricciones ?? []).map(etiquetaRestriccion),
      severidad: c.severidad,
    })),
  };
}

export interface NotaPropia {
  id: string;
  creadaEn: string;
  textoLibre: string;
  progreso: string | null;
  alertas: string | null;
  planProximaSesion: string | null;
}

export type NotaParaInstructora = Pick<
  NotaProgreso, 'id' | 'instructorId' | 'creadaEn' | 'textoLibre' | 'progreso' | 'alertas' | 'planProximaSesion'
>;

/** Solo las que escribió ella, de la más reciente a la más antigua. */
export function notasPropias(notas: readonly NotaParaInstructora[], instructorId: string): NotaPropia[] {
  return notas
    .filter((n) => n.instructorId === instructorId)
    .sort((a, b) => Date.parse(b.creadaEn) - Date.parse(a.creadaEn))
    .map((n) => ({
      id: n.id,
      creadaEn: n.creadaEn,
      textoLibre: n.textoLibre ?? '',
      progreso: n.progreso ?? null,
      alertas: n.alertas ?? null,
      planProximaSesion: n.planProximaSesion ?? null,
    }));
}

/** Lo que recibe la app: sin consentimiento, nada más; con él, avisos y sus notas. */
export type SaludAlumna =
  | { consentimiento: 'SIN_CONSENTIMIENTO' }
  | { consentimiento: 'VIGENTE'; semaforo: NivelSemaforo; avisos: AvisoSalud[]; notas: NotaPropia[] };

export const TEXTO_ZONA: Record<ZonaCorporal, string> = {
  RODILLA: 'Rodilla', COLUMNA: 'Columna', HOMBRO: 'Hombro', CADERA: 'Cadera',
  CUELLO: 'Cuello', MUNECA: 'Muñeca', TOBILLO: 'Tobillo', GENERAL: 'General',
};

export const TEXTO_SEVERIDAD: Record<SeveridadCondicion, string> = { LEVE: 'Leve', MEDIA: 'Media', ALTA: 'Alta' };
