// Qué pasa con lo que tiene una clienta cuando se la da de BAJA.
//
// «Dar de baja» era un `activo = false` y nada más: la cuota seguía ACTIVA, el
// cron de renovaciones le generaba el recibo del mes siguiente y el cobro diario
// se lo pasaba a la tarjeta. La baja ahora decide, con esta función, qué se hace
// con cada cosa suya, y la ventana de confirmación enseña exactamente eso antes
// de pulsar (la ruta `app/api/socios/[id]/baja` ejecuta el mismo plan):
//
//   · cuota MENSUAL ACTIVA con fecha de renovación por llegar → baja al vencer:
//     usa lo que ya ha pagado hasta su fecha y no se le vuelve a cobrar (la misma
//     pieza que «Cancelar al final del periodo», migr 20260913215533);
//   · cuota MENSUAL ya vencida (puede tener su recibo de renovación generado) o
//     PAUSADA → se cancela ya; sus recibos pendientes siguen la política del
//     estudio (`studios.recibos_al_cancelar_cuota`, la escribe el trigger);
//   · bonos y el resto → no se tocan: no se renuevan solos, y si vuelve los tiene;
//   · plazas fijas → baja: si no, el motor la seguiría apuntando cada semana.
//
// Puro: se prueba con `node --test`.

import { puedeProgramarBaja } from '../billing/baja-al-vencer.ts';

/** Por qué se va (tabla `bajas_clienta`). Sin texto libre: el detalle de «Otro» va en una nota. */
// Sin «salud» a propósito: diría algo de su salud a quien no puede leerlo
// (recepción no ve la ficha clínica). Para eso está «Motivos personales».
export const MOTIVOS_BAJA = ['SE_MUDA', 'PERSONAL', 'PRECIO', 'HORARIOS', 'NO_LE_CONVENCIO', 'OTRO'] as const;
export type MotivoBaja = (typeof MOTIVOS_BAJA)[number];

export const ETIQUETA_MOTIVO_BAJA: Record<MotivoBaja, string> = {
  SE_MUDA: 'Se muda',
  PERSONAL: 'Motivos personales',
  PRECIO: 'Precio',
  HORARIOS: 'Horarios',
  NO_LE_CONVENCIO: 'No le convenció',
  OTRO: 'Otro motivo',
};

export function esMotivoBaja(x: unknown): x is MotivoBaja {
  return typeof x === 'string' && (MOTIVOS_BAJA as readonly string[]).includes(x);
}

export interface CuotaDeLaClienta {
  id: string;
  planId: string;
  estado: string;
  fechaFin: string | null;
}

export interface PlanDeLaCuota {
  id: string;
  nombre: string;
  tipo: string;
}

export interface PlazaDeLaClienta {
  id: string;
  estado: 'ACTIVA' | 'PAUSADA' | 'BAJA';
}

export interface CuotaEnLaBaja {
  id: string;
  /** Nombre del plan, o «su plan» si ya no existe. */
  plan: string;
  fechaFin: string | null;
}

export interface PlanDeBaja {
  /** Siguen hasta su fecha y no se renuevan (`baja_al_vencer = true`). */
  alVencer: CuotaEnLaBaja[];
  /** Se cancelan ya (`estado = 'CANCELADA'`). */
  cancelarAhora: CuotaEnLaBaja[];
  /** No se tocan (bonos, pruebas…): no se renuevan solas. */
  intactas: CuotaEnLaBaja[];
  /** Plazas fijas que pasan a BAJA. */
  plazas: string[];
}

/** `hoyISO`: 'YYYY-MM-DD' en hora del estudio. */
export function planDeBaja(
  cuotas: readonly CuotaDeLaClienta[],
  planes: readonly PlanDeLaCuota[],
  plazas: readonly PlazaDeLaClienta[],
  hoyISO: string,
): PlanDeBaja {
  const plan: PlanDeBaja = { alVencer: [], cancelarAhora: [], intactas: [], plazas: [] };
  for (const c of cuotas) {
    if (c.estado !== 'ACTIVA' && c.estado !== 'PAUSADA') continue;
    const p = planes.find(x => x.id === c.planId);
    const enLaBaja: CuotaEnLaBaja = { id: c.id, plan: p?.nombre ?? 'su plan', fechaFin: c.fechaFin };
    if (p?.tipo !== 'MENSUAL') { plan.intactas.push(enLaBaja); continue; }
    if (c.estado === 'ACTIVA' && puedeProgramarBaja(c, p, hoyISO)) plan.alVencer.push(enLaBaja);
    else plan.cancelarAhora.push(enLaBaja);
  }
  plan.plazas = plazas.filter(p => p.estado !== 'BAJA').map(p => p.id);
  return plan;
}

/** ¿Hay algo que hacer con su dinero o su agenda? Sin nada, la baja es solo la marca. */
export function bajaSinConsecuencias(plan: PlanDeBaja): boolean {
  return plan.alVencer.length === 0 && plan.cancelarAhora.length === 0 && plan.plazas.length === 0;
}

// Lo que devuelve la ruta: lo que ha pasado de verdad, para que la pantalla lo
// pinte sin suponer nada.
// Por cada reserva cancelada, a quién le ha llegado su plaza (como devuelve
// /api/reservas/cancelar): el calendario lo refleja sin recargar.
export interface RespuestaBaja {
  ok: true;
  cuotasAlVencer: { id: string; plan: string; fechaFin: string | null }[];
  cuotasCanceladas: { id: string; plan: string }[];
  plazasDadasDeBaja: string[];
  /** Las clases que su plaza fija ya le tenía reservadas y se han soltado. */
  reservasDePlazaRetiradas: string[];
  reservasCanceladas: {
    id: string; sesionId: string;
    promovidaSocioId: string | null; ofertaSocioId: string | null; ofertaExpiraEn: string | null;
  }[];
  reservasSinCancelar: number;
}
