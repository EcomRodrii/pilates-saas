// ─────────────────────────────────────────────────────────────────────────────
// Packs de consultas del asistente (decisión del fundador, 5-oct-2026): para
// cuando se acaban las del plan. Pago ÚNICO, precios con IVA INCLUIDO (como los
// planes de /precios y /suscripcion). Caducan a los 12 meses de comprarlos.
//
// Quién gasta qué lo decide la base de datos, no esto: `ia_cerrar_consulta`
// (migr 20261005213749 + 20261006014513) gasta primero la cuota del mes y
// después los packs vigentes, el que antes caduca primero, y `ia_saldo_consultas`
// es la única dueña del «te quedan N». Aquí solo vive el catálogo y lo que la
// pantalla necesita saber para decirlo con verdad.
//
// Compra SOLO la propietaria (es dinero de Tentare al estudio, no de una socia):
// a la gerente se le dice «pídeselo a la propietaria».
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { Rol } from '../types.ts';

export interface PackConsultas {
  unidades: 100 | 300 | 1000;
  /** Euros, IVA incluido. Es lo que se cobra: el Checkout se monta con esto (price_data). */
  precioEur: number;
}

export const PACKS_CONSULTAS: readonly PackConsultas[] = [
  { unidades: 100, precioEur: 9 },
  { unidades: 300, precioEur: 24 },
  { unidades: 1000, precioEur: 69 },
];

export const PACK_CADUCA_MESES = 12;

/** La marca que llevan la sesión de Checkout, el PaymentIntent y la factura de un pack. */
export const ORIGEN_PACK = 'ia_pack';

export function packPorUnidades(unidades: unknown): PackConsultas | null {
  return PACKS_CONSULTAS.find(p => p.unidades === unidades) ?? null;
}

/** Céntimos exactos (9 € → 900), sin flotantes de por medio. */
export function centimosDe(pack: PackConsultas): number {
  return Math.round(pack.precioEur * 100);
}

/**
 * Cuándo caduca un pack comprado en `compradoEn`: el mismo día, 12 meses
 * después. Si ese día no existe (29 de febrero), el último del mes.
 */
export function caducidadDelPack(compradoEn: Date): Date {
  const d = new Date(compradoEn.getTime());
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + PACK_CADUCA_MESES);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

/** Solo la propietaria compra. La gerente usa el asistente, pero no mueve dinero. */
export function puedeComprarPacks(rol: Rol | null | undefined): boolean {
  return rol === 'PROPIETARIO';
}

/** «Te quedan pocas»: menos del 10 % de la cuota del mes (y todavía alguna). */
export function saldoBajo(disponibles: number | null, cuota: number | null | undefined): boolean {
  if (disponibles === null || !cuota || cuota <= 0) return false;
  return disponibles > 0 && disponibles < cuota * 0.1;
}

/** Precio por consulta para enseñarlo junto al pack: «0,09 € por consulta». */
export function precioPorConsulta(pack: PackConsultas): string {
  const c = pack.precioEur / pack.unidades;
  return `${c.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} € por consulta`;
}

/** «1.000», «12.500»: con punto también en las de cuatro cifras (es-ES no lo pone en «1000»). */
export function miles(n: number): string {
  return Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function eurosDe(pack: PackConsultas): string {
  return `${pack.precioEur.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`;
}

/**
 * «Te quedan N consultas…», que diga la verdad. `disponibles` (de
 * `ia_saldo_consultas`) ya suma lo que queda de la cuota y lo que queda de los
 * packs: si hay packs de por medio, «este mes» sería mentira (no se renuevan),
 * así que se dice sin apellido.
 */
export function textoQuedan(disponibles: number | null, saldo: { enPrueba?: boolean; packsQuedan?: number } | null): string | null {
  if (disponibles === null) return null;
  const conPacks = (saldo?.packsQuedan ?? 0) > 0;
  if (disponibles <= 0) {
    if (conPacks) return 'No te quedan consultas';
    return saldo?.enPrueba ? 'No te quedan consultas de prueba' : 'No te quedan consultas este mes';
  }
  const verbo = disponibles === 1 ? 'queda' : 'quedan';
  const n = `${miles(disponibles)} ${disponibles === 1 ? 'consulta' : 'consultas'}`;
  if (conPacks) return `Te ${verbo} ${n}`;
  return saldo?.enPrueba ? `Te ${verbo} ${n} de prueba` : `Te ${verbo} ${n} este mes`;
}
