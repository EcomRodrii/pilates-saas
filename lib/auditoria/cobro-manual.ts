// Cobros con el método de pago guardado que LANZA UNA PERSONA del equipo.
//
// «Cobrar online» (Cobros → clienta) y aprobar una propuesta de cobro en
// Automatizaciones llaman a `cobrarReciboOffSession`, que escribe el recibo con
// service-role: el trigger del libro no lo ve y nadie sabía QUIÉN lo cobró.
//
// Aquí se anota lo que ESTA petición cambió en el recibo, con la sesión como actor.
// El helper NO toca `cobrarReciboOffSession` (el código de dinero central): lee el
// recibo antes y después y anota la diferencia, con las mismas reglas que el resto
// del libro (solo las columnas que cambian).
//
// Qué NO se anota, y por qué:
//   · un cobro que el banco rechaza, pide 3DS, o un fallo transitorio de Stripe: la
//     función no toca el recibo, así que no hay ningún cambio que contar (Stripe y
//     `cobros_intentos` guardan el intento; el libro guarda cambios);
//   · `COBRADO_SIN_PERSISTIR`: el dinero entró pero el recibo NO cambió. Ese caso ya
//     salta a Sentry y se concilia a mano; inventar un `COBRADO` en el libro sería
//     mentir sobre lo que dice el recibo.
//
// Sin `import 'server-only'` ni alias `@/` a propósito: se prueba con `node --test`.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SesionAuditoria } from './entrada-servidor.ts';
import { avisarAuditoria, registrarAuditoriaServidor, type Informar, type RegistrarAuditoria } from './registrar-servidor.ts';

/** Lo que un cobro cambia del recibo y merece contarse. Deliberadamente corto: no la entrega del bono, la factura ni contadores. */
export const COLUMNAS_DEL_COBRO = ['estado', 'metodo_cobro', 'sepa_estado', 'fecha_cobro', 'stripe_payment_intent_id'] as const;

const SELECCION = [...COLUMNAS_DEL_COBRO, 'socio_id', 'concepto', 'importe'].join(', ');

/** Tope de cada lectura del recibo. Más corto que el del insert: la de ANTES va delante del cargo. */
export const TIEMPO_LECTURA_MS = 3000;

/** Desde dónde se lanzó: la pantalla de Cobros, o la propuesta aprobada en Automatizaciones. */
export type OrigenDelCobro = 'COBRAR_ONLINE' | 'AUTOMATIZACIONES';

type Fila = Record<string, unknown>;

async function leerRecibo(
  admin: SupabaseClient, studioId: string, reciboId: string,
): Promise<{ fila: Fila | null; error: string | null }> {
  try {
    // Con tope de tiempo: la lectura de ANTES va delante del cargo, y un select colgado no puede retrasarlo.
    const { data, error } = await admin.from('recibos').select(SELECCION)
      .eq('id', reciboId).eq('studio_id', studioId)
      .abortSignal(AbortSignal.timeout(TIEMPO_LECTURA_MS)).maybeSingle();
    if (error) return { fila: null, error: error.message };
    return { fila: (data as unknown as Fila | null) ?? null, error: null };
  } catch (e) {
    return { fila: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * El recibo ANTES de cobrar. Mejor esfuerzo: si no se puede leer, el cobro sigue (fail-open,
 * como todo el libro) pero SE AVISA, y la entrada saldrá sin el valor de antes.
 */
export async function leerReciboAntesDeCobrar(
  admin: SupabaseClient, studioId: string, reciboId: string, informar: Informar = avisarAuditoria,
): Promise<Fila | null> {
  const { fila, error } = await leerRecibo(admin, studioId, reciboId);
  if (error) informar('AUDITORIA_LECTURA_PREVIA_FALLO', { tabla: 'recibos', filaId: reciboId, error });
  return fila;
}

function soloCobro(f: Fila | null): Fila | null {
  if (!f) return null;
  return Object.fromEntries(COLUMNAS_DEL_COBRO.map(c => [c, f[c] ?? null]));
}

/** El resultado de `cobrarReciboOffSession`, en lo que aquí importa. */
export interface ResultadoDelCobro {
  ok: boolean;
  status?: string;
  aviso?: string;
}

/**
 * Anota lo que el cobro cambió del recibo. Nunca lanza. Solo si el cobro salió bien (cobrado
 * o adeudo SEPA en marcha) y el recibo cambió de verdad.
 */
export async function anotarCobroManual(
  admin: SupabaseClient,
  p: {
    sesion: SesionAuditoria;
    reciboId: string;
    socioId: string;
    /** Lo que devolvió `leerReciboAntesDeCobrar`. */
    antes: Fila | null;
    resultado: ResultadoDelCobro;
    origen: OrigenDelCobro;
  },
  registrar: RegistrarAuditoria = registrarAuditoriaServidor,
  informar: Informar = avisarAuditoria,
): Promise<void> {
  try {
    if (!p.resultado.ok) return;
    // El dinero entró pero el recibo no cambió: nada verdadero que anotar (ver la cabecera). El aviso a Sentry
    // de `cerrarCobroOffSession` no dice QUIÉN lo lanzó: aquí se deja, para poder conciliarlo.
    if (p.resultado.aviso === 'COBRADO_SIN_PERSISTIR') {
      informar('AUDITORIA_COBRO_SIN_PERSISTIR_LANZADO_POR', { tabla: 'recibos', filaId: p.reciboId, userId: p.sesion.userId, rol: p.sesion.rol, origen: p.origen });
      return;
    }

    const { fila: despues, error } = await leerRecibo(admin, p.sesion.studioId, p.reciboId);
    if (error || !despues) {
      // Sin esto, un cobro real quedaría sin rastro Y sin aviso: no se puede saber cómo quedó el recibo.
      informar('AUDITORIA_LECTURA_POSTERIOR_FALLO', { tabla: 'recibos', filaId: p.reciboId, error: error ?? 'recibo no encontrado' });
      return;
    }

    const antesCobro = soloCobro(p.antes);
    const despuesCobro = soloCobro(despues);
    // El cobro salió bien y el recibo no cambió (p. ej. un adeudo SEPA que perdió una carrera): el libro no
    // lleva una entrada vacía, pero tampoco se calla: hay un cobro lanzado por una persona sin cambio que contar.
    if (antesCobro && JSON.stringify(antesCobro) === JSON.stringify(despuesCobro)) {
      informar('AUDITORIA_COBRO_SIN_CAMBIO_EN_EL_RECIBO', { tabla: 'recibos', filaId: p.reciboId, userId: p.sesion.userId, rol: p.sesion.rol, origen: p.origen });
      return;
    }

    await registrar(admin, {
      sesion: p.sesion,
      tabla: 'recibos', filaId: p.reciboId, operacion: 'UPDATE',
      // El socio es el del RECIBO, no el que diga el cuerpo.
      socioId: (despues.socio_id as string | null) ?? p.socioId,
      antes: antesCobro,
      despues: despuesCobro,
      contexto: {
        accion: 'COBRO_LANZADO',
        concepto: (despues.concepto as string | null) ?? null,
        importe: Number(despues.importe) || null,
        // 'succeeded' = cobrado ya; 'processing' = adeudo SEPA en marcha (tarda días y puede devolverse).
        resultado_cobro: p.resultado.status ?? null,
        origen: p.origen,
        // Sin la lectura de antes, el «antes» de cada columna sale vacío: no significa que no hubiera valor.
        ...(p.antes ? {} : { sin_valor_anterior: true }),
      },
    });
  } catch (e) {
    informar('AUDITORIA_FALLO', { tabla: 'recibos', filaId: p.reciboId, error: e instanceof Error ? e.message : String(e) });
  }
}
