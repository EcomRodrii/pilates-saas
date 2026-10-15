// ─────────────────────────────────────────────────────────────────────────────
// «Estado de los bonos» de Informes (panel nuevo, como el de «Estadísticas» de
// Bonsai): cuántos bonos hay vivos, cuántas sesiones quedan por dar entre todos,
// y cuáles caducan pronto con sesiones sin usar. Es una foto de HOY: no depende
// del periodo que se mira.
//
// Ninguna cifra es nueva:
//   · vivos y sesiones que quedan: `saldoSesionesBono` (lib/bono-logic.ts), la
//     dueña del «Quedan N» de Clientas, llamada tal cual, socia a socia;
//   · «a punto de caducar»: la regla de `leerBonosPorCaducar`
//     (lib/notificaciones/bonos-inactivas-cron.ts), la del aviso automático y la
//     del asistente. Allí es una consulta SQL; aquí, el mismo filtro sobre los
//     datos que ya tiene el panel. `bonos.test.ts` los ata: si cambia uno, falla.
//
// Puro, sin `@/`: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlanTarifa, Suscripcion } from '../types.ts';
import { saldoSesionesBono } from '../bono-logic.ts';
import { masDias } from '../utils.ts';

/** La ventana de «caducan pronto» de Informes, en días del estudio. */
export const DIAS_CADUCAN_PRONTO = 30;

/**
 * ¿Caduca en el tramo con sesiones por gastar? La regla de `leerBonosPorCaducar`:
 * ACTIVA, con sesiones (no nulas, más de cero) y con fecha de fin dentro del
 * tramo, los dos extremos incluidos.
 */
export function bonoPorCaducar(
  s: Pick<Suscripcion, 'estado' | 'sesionesRestantes' | 'fechaFin'>,
  tramo: { desde: string; hasta: string },
): boolean {
  if (s.estado !== 'ACTIVA') return false;
  if (s.sesionesRestantes == null || s.sesionesRestantes <= 0) return false;
  if (!s.fechaFin) return false;
  const fin = s.fechaFin.slice(0, 10);
  return fin >= tramo.desde && fin <= tramo.hasta;
}

export interface BonoQueCaduca {
  suscripcionId: string;
  socioId: string;
  planId: string;
  /** 'YYYY-MM-DD' */
  fechaFin: string;
  restantes: number;
}

export interface EstadoBonos {
  /** Bonos vigentes (los que cuenta `saldoSesionesBono`). */
  vivos: number;
  /** Sesiones que les quedan, sumadas. */
  sesionesQueQuedan: number;
  /** Los que caducan en `DIAS_CADUCAN_PRONTO` días con sesiones sin usar, el más cercano primero. */
  caducanPronto: BonoQueCaduca[];
  /** Sesiones que se pierden si nadie las usa antes de que caduquen. */
  sesionesQueCaducan: number;
}

export function estadoDeLosBonos(
  suscripciones: readonly Suscripcion[],
  planesTarifa: PlanTarifa[],
  hoyISO: string,
): EstadoBonos {
  const porSocia = new Map<string, Suscripcion[]>();
  for (const s of suscripciones) {
    const suyas = porSocia.get(s.socioId);
    if (suyas) suyas.push(s);
    else porSocia.set(s.socioId, [s]);
  }
  let vivos = 0;
  let sesionesQueQuedan = 0;
  for (const [socioId, suyas] of porSocia) {
    const r = saldoSesionesBono(socioId, suyas, planesTarifa, hoyISO);
    if (!r) continue;
    vivos += r.bonos;
    sesionesQueQuedan += r.restantes;
  }

  const tramo = { desde: hoyISO, hasta: masDias(hoyISO, DIAS_CADUCAN_PRONTO) };
  const caducanPronto = suscripciones
    .filter((s) => bonoPorCaducar(s, tramo))
    .map((s) => ({ suscripcionId: s.id, socioId: s.socioId, planId: s.planId, fechaFin: s.fechaFin!.slice(0, 10), restantes: s.sesionesRestantes! }))
    .sort((a, b) => a.fechaFin.localeCompare(b.fechaFin) || a.suscripcionId.localeCompare(b.suscripcionId));

  return {
    vivos,
    sesionesQueQuedan,
    caducanPronto,
    sesionesQueCaducan: caducanPronto.reduce((n, b) => n + b.restantes, 0),
  };
}
