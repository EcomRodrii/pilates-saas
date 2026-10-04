// ─────────────────────────────────────────────────────────────────────────────
// El datáfono SumUp Solo como proveedor de cobro de la Caja.
//
// Mismo contrato que el de Stripe (`ProveedorTerminal` en terminal.ts: iniciar,
// consultar, cancelar; autoritativo: lo confirma SumUp, no quien cobra), pero con
// su propio contexto ya cerrado dentro (cliente con el token del estudio, cuenta,
// lector): no necesita la cuenta de Stripe del estudio para nada.
//
// Sin red ni base de datos: el cliente se inyecta (lib/pos/sumup.ts). Lo monta
// lib/pos/cobro-del-estudio.ts.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ErrorSumup, estadoDesdeSumup, leerReferenciaSumup, referenciaSumup, type Afiliado, type ClienteSumup,
} from './sumup.ts';
import type { ConsultaCobro } from './consulta-stripe.ts';
import type { EstadoPagoPOS } from './tipos.ts';

/** Lo que pide la Caja para cobrar (el mismo `PeticionCobro` de terminal.ts, sin Stripe). */
export interface PeticionCobroSumup {
  importeCentimos: number;
  concepto: string;
  ref: { ventaId: string; reciboId?: never } | { reciboId: string; ventaId?: never };
}

export type InicioSumup = { ok: true; referencia: string; estado: EstadoPagoPOS } | { ok: false; error: string };

export interface ProveedorSumup {
  readonly id: 'datafono';
  readonly nombre: string;
  readonly esAutoritativo: true;
  iniciar(p: PeticionCobroSumup): Promise<InicioSumup>;
  consultar(referencia: string): Promise<ConsultaCobro>;
  /**
   * Para el cobro en el Solo. ⚠️ `terminate` para LO QUE ESTÉ HACIENDO el lector,
   * no un cobro concreto: solo se manda si ESTE cobro sigue sin terminar (si ya
   * acabó, el Solo puede estar con el de otra persona). Y solo lo llama quien
   * está mirando ese cobro en la Caja, nunca un camino que no sepa qué hay en el
   * datáfono.
   */
  cancelar(referencia: string): Promise<void>;
}

/** `venta:<id>` / `recibo:<id>`: viaja como `foreign_transaction_id` y vuelve en la transacción. */
export function referenciaExterna(ref: PeticionCobroSumup['ref']): string {
  return ref.ventaId ? `venta:${ref.ventaId}` : `recibo:${ref.reciboId}`;
}

/**
 * ¿Dice SumUp que el cobro es de este objeto? Lo sabe por la referencia que le
 * dimos al cobrar (`foreign_transaction_id`). Si dice que es de OTRO, nunca vale.
 * Si no dice nada, vale solo cuando no se exige dueño.
 */
export function esDeEste(est: Pick<ConsultaCobro, 'metadata'>, studioId: string, o: { tipo: 'venta' | 'recibo'; id: string }, p: { exigirDueno: boolean }): boolean {
  const meta = est.metadata ?? {};
  const conDueno = meta.ventaId !== undefined || meta.reciboId !== undefined;
  if (!conDueno) return !p.exigirDueno;
  const id = o.tipo === 'recibo' ? meta.reciboId : meta.ventaId;
  return id === o.id && meta.studioId === studioId;
}

function metadataDe(foreign: string | null | undefined, studioId: string): Record<string, string> {
  const m = /^(venta|recibo):(.+)$/.exec(foreign ?? '');
  if (!m) return {};
  return m[1] === 'venta' ? { studioId, ventaId: m[2] } : { studioId, reciboId: m[2] };
}

export function crearProveedorSumup(o: {
  cliente: ClienteSumup;
  merchantCode: string;
  readerId: string;
  studioId: string;
  afiliado: Afiliado;
  /** La `return_url` firmada de este cobro (lib/pos/sumup-aviso.ts). */
  urlDeAviso: (ref: PeticionCobroSumup['ref']) => string;
  ahora?: () => Date;
}): ProveedorSumup {
  const ahora = o.ahora ?? (() => new Date());

  async function consultar(referencia: string): Promise<ConsultaCobro> {
    const ref = leerReferenciaSumup(referencia);
    if (!ref) return { estado: 'ERROR', error: 'Referencia de SumUp no válida' };
    try {
      const t = await o.cliente.buscarTransaccion(o.merchantCode, ref.clientTransactionId);
      if (t && t.currency !== 'EUR') return { estado: 'ERROR', error: `Cobro en ${t.currency}, no en euros` };
      // Se pidió por este id: si vuelve otro, no es este cobro (nunca PAGADO por error ajeno).
      if (t?.client_transaction_id && t.client_transaction_id !== ref.clientTransactionId) {
        return { estado: 'ERROR', error: 'SumUp devolvió otra transacción' };
      }
      return {
        estado: estadoDesdeSumup(t, ref.emitidaEn, ahora()),
        importeCentimos: t ? Math.round(t.amount * 100) : null,
        metadata: metadataDe(t?.foreign_transaction_id, o.studioId),
        // Sin `metodoReal`, como el datáfono de Stripe: la venta sigue siendo
        // DATAFONO y el recibo, TARJETA (lo decide quien cierra).
        ...(t ? { cargoSumup: t.id } : {}),
      };
    } catch (err) {
      // No se sabe: ni pagado ni fallido. Se vuelve a preguntar.
      console.error('[pos/sumup:consultar]', err instanceof Error ? err.message : err);
      return { estado: 'PROCESANDO' };
    }
  }

  return {
    id: 'datafono',
    nombre: 'Datáfono',
    esAutoritativo: true,

    async iniciar(p) {
      if (!Number.isInteger(p.importeCentimos) || p.importeCentimos <= 0) return { ok: false, error: 'Ese importe no se puede cobrar.' };
      try {
        const r = await o.cliente.cobrar(o.merchantCode, o.readerId, {
          centimos: p.importeCentimos,
          descripcion: p.concepto,
          returnUrl: o.urlDeAviso(p.ref),
          afiliado: o.afiliado,
          referenciaExterna: referenciaExterna(p.ref),
        });
        return { ok: true, referencia: referenciaSumup(r.clientTransactionId, ahora()), estado: 'PENDIENTE' };
      } catch (err) {
        console.error('[pos/sumup:iniciar]', err instanceof ErrorSumup ? `${err.status} ${err.codigo ?? ''} ${err.message}` : err);
        if (err instanceof ErrorSumup && err.caducado) return { ok: false, error: 'La cuenta de SumUp necesita volver a conectarse. Pídeselo a la dueña del estudio.' };
        if (err instanceof ErrorSumup && err.status === 409) return { ok: false, error: 'El datáfono ya está con otro cobro. Termínalo o cancélalo en el datáfono y vuelve a intentarlo.' };
        return { ok: false, error: 'No se pudo enviar el importe al datáfono. Comprueba que está encendido y con conexión.' };
      }
    },

    consultar,

    async cancelar(referencia) {
      const antes = await consultar(referencia);
      if (antes.estado !== 'PENDIENTE' && antes.estado !== 'PROCESANDO') return;
      try {
        await o.cliente.terminar(o.merchantCode, o.readerId);
      } catch (err) {
        // Solo funciona si el Solo espera la tarjeta: lo dirá la siguiente consulta.
        console.error('[pos/sumup:cancelar]', err instanceof Error ? err.message : err);
      }
    },
  };
}

// ── El barrido de cobros que nadie cerró ─────────────────────────────────────

/** Antes de esto, el cobro es del mostrador (que sondea) y de su aviso: el barrido no se mete. */
export const MINUTOS_ANTES_DE_BARRER = 10;
/** Un cobro que sigue sin resolverse pasado esto ya no es un retraso: se avisa. */
export const HORAS_PARA_AVISAR = 24;

export interface CobroEnVuelo {
  studioId: string;
  objeto: { tipo: 'venta' | 'recibo'; id: string };
  referencia: string;
  minutos: number;
}

/**
 * De las filas con una referencia `sumup:` guardada, las que toca mirar ya,
 * agrupadas por estudio (un token por estudio). Lo que no se lee como referencia
 * de SumUp se descarta: no es de este barrido.
 */
export function cobrosParaBarrer(
  filas: { tipo: 'venta' | 'recibo'; id: string; studioId: string; referencia: string | null }[],
  ahora: Date,
): Map<string, CobroEnVuelo[]> {
  const porEstudio = new Map<string, CobroEnVuelo[]>();
  for (const f of filas) {
    const ref = leerReferenciaSumup(f.referencia);
    if (!ref || !f.referencia) continue;
    const minutos = (ahora.getTime() - ref.emitidaEn.getTime()) / 60_000;
    if (minutos < MINUTOS_ANTES_DE_BARRER) continue;
    const lista = porEstudio.get(f.studioId) ?? [];
    lista.push({ studioId: f.studioId, objeto: { tipo: f.tipo, id: f.id }, referencia: f.referencia, minutos });
    porEstudio.set(f.studioId, lista);
  }
  return porEstudio;
}
