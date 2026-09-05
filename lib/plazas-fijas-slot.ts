// Espejo en TS del emparejamiento por SLOT de `materializar_plazas_fijas`
// (migr 0084 / 20260812130000): una plaza fija se ancla a (sala, día de la
// semana, hora local, tipo opcional) y el cron nocturno la convierte en
// reservas para las sesiones futuras que encajan. Si el estudio mueve la clase
// y nada mueve el ancla, la plaza deja de materializar EN SILENCIO: sin sesión
// que encaje no hay fila en el JOIN, y `plazas_fijas_sin_materializar` —que
// usa el mismo JOIN— tampoco la ve. Aquí vive la detección del lado del panel
// (bandeja "Para hoy" + aviso en el diálogo de la ficha). Lógica pura: todo el
// tiempo entra por `ahoraMs` para que los tests sean deterministas.

import { franjaLocalDe, hoyEnEstudio } from './utils.ts';
import type { PlazaFija, Sesion } from './types.ts';

/** Mismo horizonte que `materializar_plazas_fijas(p_horizonte_dias default 42)`. */
export const HORIZONTE_PLAZA_FIJA_DIAS = 42;

const DIA_MS = 86_400_000;

// Lunes primero en la UI; los valores son los de extract(dow) de Postgres.
const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function nombreDiaSemana(dow: number): string {
  return NOMBRE_DIA[dow] ?? '—';
}

/** 'HH:MM:SS' local del inicio — el formato exacto de `plazas_fijas.hora_inicio`. */
export function horaInicioLocalDe(inicioISO: string): string {
  const { hora, minuto } = franjaLocalDe(inicioISO);
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00`;
}

/** 'HH:MM' → 'HH:MM:00'; 'HH:MM:SS' se deja tal cual. Para comparar lo que teclea el formulario con la columna. */
export function normalizarHoraInicio(hora: string): string {
  return hora.length === 5 ? `${hora}:00` : hora;
}

/** Lo mínimo de una sesión que hace falta para emparejarla: vale la `Sesion`
 *  cruda y cualquier forma enriquecida del calendario que conserve estos tres. */
export type SesionSlot = Pick<Sesion, 'salaId' | 'tipoClaseId' | 'inicio'>;

/**
 * ¿La sesión encaja en el slot de la plaza? Sala, día de la semana y hora en
 * hora LOCAL del estudio (no UTC: la misma clase cae en 18:00 UTC en verano y
 * 19:00 en invierno), tipo solo si la plaza está acotada, y la fecha local de
 * la sesión dentro de la vigencia. Mismo criterio, condición a condición, que
 * el JOIN de la RPC — si aquel cambia, este también.
 */
export function sesionEncajaEnPlaza(pf: PlazaFija, s: SesionSlot): boolean {
  if (s.salaId !== pf.salaId) return false;
  if (pf.tipoClaseId && s.tipoClaseId !== pf.tipoClaseId) return false;
  const franja = franjaLocalDe(s.inicio);
  if (franja.dow !== pf.diaSemana) return false;
  if (horaInicioLocalDe(s.inicio) !== normalizarHoraInicio(pf.horaInicio)) return false;
  const fecha = hoyEnEstudio(new Date(s.inicio));
  if (fecha < pf.vigenciaDesde) return false;
  if (pf.vigenciaHasta && fecha > pf.vigenciaHasta) return false;
  return true;
}

function diasInclusivos(desdeYmd: string, hastaYmd: string): number {
  const a = Date.parse(`${desdeYmd}T00:00:00Z`);
  const b = Date.parse(`${hastaYmd}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DIA_MS) + 1;
}

/**
 * Plazas ACTIVAS en vigencia sin NINGUNA sesión —cancelada o no— que encaje en
 * su slot dentro de la ventana. Una sesión cancelada cuenta como "la clase
 * existe": ese caso ya lo avisa `plazas_fijas_sin_materializar` a la socia
 * ('sesion_cancelada', un aviso por sesión); lo que se busca aquí es la clase
 * que YA NO ESTÁ a esa hora, que es lo que la propietaria tiene que arreglar.
 * Consecuencia asumida: un slot cuya serie se CANCELÓ entera (en vez de
 * borrarse) nunca se marca aquí como huérfano — la socia recibe el aviso de
 * clase cancelada por cada sesión, y ese aviso ya dice qué pasa.
 *
 * Guardia anti-falso-positivo: la ventana se recorta a la última sesión que el
 * estudio tiene programada. Un estudio que crea el horario semana a semana no
 * tiene "sesión dentro de 6 semanas" para NINGUNA plaza, y eso no es una plaza
 * huérfana. Y si en la ventana que queda (por plaza: desde hoy o su inicio,
 * hasta el final o su fin) no caben 7 días, no cabe ni una ocurrencia del día
 * de la semana → no se afirma nada.
 */
export function plazasFijasSinSesion(
  plazas: PlazaFija[],
  sesiones: Sesion[],
  ahoraMs: number,
  horizonteDias: number = HORIZONTE_PLAZA_FIJA_DIAS,
): PlazaFija[] {
  let ultimaProgramadaMs = Number.NEGATIVE_INFINITY;
  for (const s of sesiones) {
    if (s.cancelada) continue;
    const t = Date.parse(s.inicio);
    if (!Number.isNaN(t) && t > ultimaProgramadaMs) ultimaProgramadaMs = t;
  }
  if (!Number.isFinite(ultimaProgramadaMs)) return [];

  const finVentanaMs = Math.min(ahoraMs + horizonteDias * DIA_MS, ultimaProgramadaMs);
  const hoy = hoyEnEstudio(new Date(ahoraMs));
  const finVentana = hoyEnEstudio(new Date(finVentanaMs));

  const out: PlazaFija[] = [];
  for (const pf of plazas) {
    if (pf.estado !== 'ACTIVA') continue;
    if (pf.vigenciaHasta && pf.vigenciaHasta < hoy) continue;              // ya terminó
    const desde = pf.vigenciaDesde > hoy ? pf.vigenciaDesde : hoy;
    const hasta = pf.vigenciaHasta && pf.vigenciaHasta < finVentana ? pf.vigenciaHasta : finVentana;
    if (diasInclusivos(desde, hasta) < 7) continue;                         // no se puede saber
    const hay = sesiones.some(s => {
      const t = Date.parse(s.inicio);
      if (Number.isNaN(t) || t < ahoraMs || t > finVentanaMs) return false;
      return sesionEncajaEnPlaza(pf, s);
    });
    if (!hay) out.push(pf);
  }
  return out;
}
