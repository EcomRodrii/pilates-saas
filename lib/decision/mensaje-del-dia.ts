// El mensaje del día (`decision_mensajes_dia`) y la recomendación a la que
// apunta, en hora del ESTUDIO. Puro: lo usan GET /api/decisiones y el análisis
// (lib/inngest/decision.ts), y se prueba sin base de datos.
import { hoyEnEstudio, inicioDelDiaEstudio, finDelDiaEstudio } from '../utils.ts';

/**
 * La fecha ('YYYY-MM-DD') del mensaje del día de `ahora`: el día en Madrid.
 *
 * ⚠️ No `toISOString().slice(0, 10)`: eso es el día en UTC, y de 00:00 a 02:00
 * de Madrid (01:00 en invierno) todavía es AYER. El análisis guardaba el mensaje
 * con el día UTC y la pantalla lo buscaba igual, así que a las 01:30 enseñaba el
 * mensaje de ayer como si fuera el de hoy. Quien escribe el mensaje y quien lo
 * lee usan esta misma función.
 */
export function fechaDelMensaje(ahora: Date): string {
  return hoyEnEstudio(ahora);
}

/** Lo que hace falta de una recomendación para elegir la del mensaje. */
export interface FilaParaMensaje {
  id: string;
  estado: string;
  creadoEn: string | null;
  resueltoEn: string | null;
}

const VIVAS = new Set(['PENDIENTE', 'APROBADA']);

/** Más reciente primero; con la misma fecha, por id: el resultado no depende del orden en que lleguen. */
function masRecientePrimero(campo: 'creadoEn' | 'resueltoEn') {
  return (a: FilaParaMensaje, b: FilaParaMensaje) =>
    (b[campo] ?? '').localeCompare(a[campo] ?? '') || b.id.localeCompare(a.id);
}

/**
 * De las recomendaciones del estudio con la `dedupe_key` del mensaje, cuál es
 * la suya. Respaldo para los mensajes que se guardaron con un id que nunca llegó
 * a la base de datos (el análisis guardaba el id en memoria de la candidata, y
 * al refrescar una recomendación que ya existía, la fila conservaba el suyo):
 *
 *   1. la que sigue viva (PENDIENTE o APROBADA): el índice único parcial solo
 *      deja una, pero se ordena igual por si acaso;
 *   2. si no, la que se resolvió el MISMO día del mensaje, en hora de Madrid
 *      (respondida hoy: la pantalla dice cómo quedó);
 *   3. si no, ninguna. Una de otro día con la misma clave es otro asunto: el
 *      mensaje de hoy no puede enseñar cómo acabó la de la semana pasada.
 */
export function elegirRecomendacionDelMensaje<T extends FilaParaMensaje>(filas: readonly T[], fechaMensaje: string): T | null {
  const vivas = filas.filter(f => VIVAS.has(f.estado)).sort(masRecientePrimero('creadoEn'));
  if (vivas.length > 0) return vivas[0];
  const desde = inicioDelDiaEstudio(fechaMensaje);
  const hasta = finDelDiaEstudio(fechaMensaje);
  const resueltasEseDia = filas
    .filter(f => !VIVAS.has(f.estado) && f.resueltoEn !== null
      && Date.parse(f.resueltoEn) >= Date.parse(desde) && Date.parse(f.resueltoEn) < Date.parse(hasta))
    .sort(masRecientePrimero('resueltoEn'));
  return resueltasEseDia[0] ?? null;
}

/**
 * ¿La aplazó con «Recuérdamelo» el mismo día del mensaje? Solo entonces el
 * veredicto dice «Lo has dejado para más adelante». Una aplazada hace días que
 * vuelve a ser el mensaje de hoy es un mensaje nuevo, y sigue PENDIENTE: si
 * ya se resolvió, lo que manda es cómo quedó, no que se aplazó.
 */
export function aplazadaElDiaDelMensaje(
  rec: { estado: string; pospuestaEn?: string | null },
  fechaMensaje: string,
): boolean {
  if (rec.estado !== 'PENDIENTE' || !rec.pospuestaEn) return false;
  const t = Date.parse(rec.pospuestaEn);
  return t >= Date.parse(inicioDelDiaEstudio(fechaMensaje)) && t < Date.parse(finDelDiaEstudio(fechaMensaje));
}

/** El instante (ISO) en que empieza el día de Madrid de `ahora`: el «hoy» de lo que el piloto hizo solo. */
export function inicioDeHoyEnEstudio(ahora: Date): string {
  return inicioDelDiaEstudio(hoyEnEstudio(ahora));
}
