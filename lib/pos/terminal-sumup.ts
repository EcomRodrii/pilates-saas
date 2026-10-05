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
  centimosSinPropina, ErrorSumup, estadoDesdeSumup, leerReferenciaSumup, referenciaSumup, type Afiliado, type ClienteSumup,
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

/** El `error` de una consulta que SumUp no contestó: ni pagado ni fallido. */
export const SIN_RESPUESTA = 'SumUp no ha contestado';

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

/**
 * Lo que dice SumUp de a quién pertenece el cobro. ⚠️ El `studioId` es el del
 * estudio que pregunta (su cuenta de SumUp), no algo que diga SumUp: lo que
 * protege de cerrar algo de otra sede es que toda lectura y escritura filtra por
 * `studio_id`, no esta metadata.
 */
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
        importeCentimos: t ? centimosSinPropina(t) : null,
        metadata: metadataDe(t?.foreign_transaction_id, o.studioId),
        // Sin `metodoReal`, como el datáfono de Stripe: la venta sigue siendo
        // DATAFONO y el recibo, TARJETA (lo decide quien cierra).
        ...(t ? { cargoSumup: t.id } : {}),
      };
    } catch (err) {
      // No se sabe: ni pagado ni fallido. Se vuelve a preguntar.
      console.error('[pos/sumup:consultar]', err instanceof Error ? err.message : err);
      return { estado: 'PROCESANDO', error: SIN_RESPUESTA };
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
        // Un 4xx es un «no» de SumUp: el cobro no existe. Sin respuesta (red, 5xx o una
        // respuesta sin id) NO se sabe: el importe puede estar en la pantalla del Solo.
        // Se le pide que pare, y se dice que mire antes de cobrar otra vez. Si aun así
        // la clienta paga, lo recogen el aviso y el repaso del historial.
        if (err instanceof ErrorSumup && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
          return { ok: false, error: 'No se pudo enviar el importe al datáfono. Comprueba que está encendido y con conexión.' };
        }
        try { await o.cliente.terminar(o.merchantCode, o.readerId); } catch { /* lo dirá la pantalla del Solo */ }
        return { ok: false, error: 'No sabemos si el importe ha llegado al datáfono. Mira su pantalla: si está pidiendo la tarjeta, cancélalo allí antes de volver a cobrar.' };
      }
    },

    consultar,

    async cancelar(referencia) {
      // Solo se para el Solo si este cobro sigue abierto SEGÚN SumUp. Sin respuesta
      // no se sabe qué está haciendo el lector, y podría ser la venta de otra persona.
      const antes = await consultar(referencia);
      if (antes.estado !== 'PENDIENTE' && antes.estado !== 'PROCESANDO') return;
      if (antes.error === SIN_RESPUESTA) return;
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

/**
 * ¿Ha pasado ya el tiempo en que un cobro de SumUp es del mostrador y de su aviso?
 * Desde ahí lo resuelve el barrido, y solo desde ahí puede una máquina dar por muerto
 * uno «caducado»: eso no lo dice SumUp, es que su API aún no devuelve la transacción
 * (`estadoDesdeSumup`, a los dos minutos), y puede ser un retraso. Lo usan el barrido
 * y quien decide sobre el cobro de la Caja de un recibo sin tenerlo delante, que no se
 * adelanta al barrido: el enlace de pago online (`vidaDelCobroDeLaCajaEnElRecibo`) y
 * el cobro diario (`soltarCobroDeMostradorDelRecibo` con margen).
 */
export function yaNoEsDelMostrador(referencia: string | null | undefined, ahora: Date): boolean {
  const ref = leerReferenciaSumup(referencia);
  return !!ref && ahora.getTime() - ref.emitidaEn.getTime() >= MINUTOS_ANTES_DE_BARRER * 60_000;
}

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
    if (!yaNoEsDelMostrador(f.referencia, ahora)) continue;
    const minutos = (ahora.getTime() - ref.emitidaEn.getTime()) / 60_000;
    const lista = porEstudio.get(f.studioId) ?? [];
    lista.push({ studioId: f.studioId, objeto: { tipo: f.tipo, id: f.id }, referencia: f.referencia, minutos });
    porEstudio.set(f.studioId, lista);
  }
  return porEstudio;
}

// ── El historial: lo que cobró el Solo y nadie cerró ─────────────────────────

/** Cuánto historial se repasa en cada barrido (horario): dos pasadas por cobro, con margen. */
export const MINUTOS_DE_HISTORIAL = 135;

export interface LoQueYaSabemos {
  /** Transacciones con las que ya se cerró un recibo (`recibos.sumup_transaction_id`). */
  recibosCerrados: ReadonlySet<string>;
  /** Claves ya anotadas en `reconciliaciones_pos`. */
  reconciliados: ReadonlySet<string>;
  /** `client_transaction_id` de las ventas recientes con referencia `sumup:`, y su estado. */
  ventas: ReadonlyMap<string, string | null>;
  /** `client_transaction_id` de los recibos con un cobro de SumUp guardado (en vuelo). */
  recibosEnVuelo: ReadonlySet<string>;
}

/**
 * Del historial de la cuenta, los cobros que hay que mirar uno a uno: los que no
 * cerraron nada y nada está esperando. Un cobro en vuelo lo resuelve el barrido
 * por referencia; una venta ANULADA que aparece cobrada sí se mira (entró dinero).
 * Los cobros hechos desde la app de SumUp sin Tentare también salen aquí: al
 * mirarlos no traen nuestra referencia y se dejan.
 */
export function movimientosPorMirar(
  movs: readonly { transaccionId: string; clientTransactionId: string | null }[],
  sabido: LoQueYaSabemos,
  clave: (transaccionId: string) => string,
): { transaccionId: string; clientTransactionId: string }[] {
  return movs.flatMap(m => {
    if (!m.clientTransactionId) return [];
    if (sabido.recibosCerrados.has(m.transaccionId) || sabido.reconciliados.has(clave(m.transaccionId))) return [];
    if (sabido.recibosEnVuelo.has(m.clientTransactionId)) return [];
    const venta = sabido.ventas.get(m.clientTransactionId);
    if (venta === 'PAGADA' || venta === 'PENDIENTE_PAGO') return [];
    return [{ transaccionId: m.transaccionId, clientTransactionId: m.clientTransactionId }];
  });
}
