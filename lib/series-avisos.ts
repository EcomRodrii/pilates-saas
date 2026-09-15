// Cuándo avisar de una clase que se repite y se acaba, y qué decir. Sin I/O.
//
// Escalado para no molestar: a 30 días solo la bandeja de Inicio (sin
// notificación); a 14, un push; a 7 y al terminar sin renovar, push y email.
// Cada serie avisa una vez por tramo: se guarda el último tramo enviado y a qué
// fecha de fin se refería (`series.aviso_tramo` / `aviso_fin`), así que al
// renovarse empieza de cero. Y un solo aviso por estudio al día, con todas las
// clases juntas: con 50 series acabando la misma semana, uno por serie sería spam.

import { fechaDMY } from './series-renovacion.ts';

export type TramoAviso = 'aviso14' | 'aviso7' | 'final';

const ORDEN: Record<TramoAviso, number> = { aviso14: 1, aviso7: 2, final: 3 };

/** El tramo que toca por días hasta la última clase; `null` = aún solo la bandeja. */
export function tramoDe(diasHastaFin: number): TramoAviso | null {
  if (diasHastaFin <= 0) return 'final';
  if (diasHastaFin <= 7) return 'aviso7';
  if (diasHastaFin <= 14) return 'aviso14';
  return null;
}

/** ¿Hay que avisar hoy de esta serie? Solo si sube de tramo, o si es otra fecha de fin (se renovó). */
export function tocaAvisar(
  actual: TramoAviso | null,
  guardado: { tramo: string | null; fin: string | null },
  fin: string,
): boolean {
  if (!actual) return false;
  if (guardado.fin !== fin) return true;
  const antes = guardado.tramo && guardado.tramo in ORDEN ? ORDEN[guardado.tramo as TramoAviso] : 0;
  return ORDEN[actual] > antes;
}

/** Si alguno ya aprieta (una semana o terminada), va también por email. */
export function esUrgente(tramos: TramoAviso[]): boolean {
  return tramos.some(t => t !== 'aviso14');
}

/** El título del aviso agrupado. */
export function resumenAviso(tramos: TramoAviso[]): string {
  const n = tramos.length;
  if (tramos.every(t => t === 'final')) {
    return n === 1 ? 'Una clase que se repite ha terminado sin renovar' : `${n} clases que se repiten han terminado sin renovar`;
  }
  if (esUrgente(tramos)) {
    return n === 1 ? 'Una clase que se repite termina en menos de una semana' : `${n} clases que se repiten terminan pronto`;
  }
  return n === 1 ? 'Una clase que se repite termina en dos semanas' : `${n} clases que se repiten terminan en dos semanas`;
}

export function resumenRenovadas(n: number): string {
  return n === 1 ? 'Una clase se ha renovado sola' : `${n} clases se han renovado solas`;
}

const VISIBLES = 3;

/** «Reformer · Lunes 12:30 · Sala 1: termina el 05/10/2026 · …y 2 más», sin punto final. */
export function listaAviso(items: { nombre: string; fin: string; hoy: string; nota?: string | null }[]): string {
  const partes = items.slice(0, VISIBLES).map(i => {
    const cuando = i.fin < i.hoy ? `terminó el ${fechaDMY(i.fin)}` : i.fin === i.hoy ? 'termina hoy' : `termina el ${fechaDMY(i.fin)}`;
    const nota = i.nota ? ` (no se ha podido renovar sola: ${i.nota.replace(/\.$/, '').toLowerCase()})` : '';
    return `${i.nombre}: ${cuando}${nota}`;
  });
  if (items.length > VISIBLES) partes.push(`y ${items.length - VISIBLES} más`);
  return partes.join(' · ');
}
