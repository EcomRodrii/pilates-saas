// Escribe en el libro `auditoria_estudio` desde una ruta de servidor.
//
// FAIL-OPEN, como el trigger de la base de datos: si registrar falla, la operación
// de dinero que ya se hizo SIGUE en pie (un reembolso no se «deshace» porque el
// libro no respondiera) y se avisa. Nunca lanza: quien llama puede hacer `await`
// sin envolver nada.
//
// Sin `import 'server-only'` ni alias `@/` a propósito: se prueba con `node --test`.

import type { SupabaseClient } from '@supabase/supabase-js';
import { filaDeAuditoriaServidor, type EntradaServidor } from './entrada-servidor.ts';

export type Informar = (mensaje: string, extra: Record<string, unknown>) => void;

/**
 * Log + Sentry. El de Sentry va dinámico: el módulo se importa desde tests que no lo necesitan.
 * Exportado para que una ruta avise de un fallo del libro que ocurre FUERA de este helper (p. ej. al
 * leer el valor de antes): un fallo que nadie ve es justo lo que el libro existe para evitar.
 */
export const avisarAuditoria: Informar = (mensaje, extra) => {
  console.error(`[auditoria] ${mensaje}`, extra);
  void import('@sentry/nextjs')
    .then(S => S.captureMessage(`[auditoria] ${mensaje}`, { level: 'error', tags: { area: 'auditoria' }, extra }))
    .catch(() => { /* sin Sentry no se pierde nada más que el aviso */ });
};

/**
 * Cuánto se espera al libro. Las rutas de dinero lo `await`an ANTES de marcar el recibo: un insert
 * colgado (fetch no trae tope propio) dejaría un reembolso ya hecho sin marcar hasta que la plataforma
 * cortase la ruta. Pasado esto se da por fallado y se avisa.
 */
export const TIEMPO_MAXIMO_MS = 5000;

/** Postgres: unique_violation. Ver el índice del reembolso en la migración 20260925194043. */
const DUPLICADO = '23505';

/** Lo que las rutas reciben para poder sustituirlo en un test. */
export type RegistrarAuditoria = (admin: SupabaseClient, entrada: EntradaServidor) => Promise<void>;

export async function registrarAuditoriaServidor(
  admin: SupabaseClient,
  entrada: EntradaServidor,
  informar: Informar = avisarAuditoria,
): Promise<void> {
  try {
    const r = filaDeAuditoriaServidor(entrada);
    if (!r.ok) {
      // Sin cambios no hay nada que anotar. Una entrada incompleta es un fallo de quien llama: se avisa.
      if (r.razon === 'ENTRADA_INVALIDA') {
        informar('AUDITORIA_ENTRADA_INVALIDA', { tabla: entrada.tabla, filaId: entrada.filaId, detalle: r.detalle });
      }
      return;
    }
    const { error } = await admin.from('auditoria_estudio').insert(r.fila).abortSignal(AbortSignal.timeout(TIEMPO_MAXIMO_MS));
    // Un duplicado exacto (el mismo reembolso de Stripe, dos clics a la vez) es lo que el índice único está
    // ahí para rechazar: la entrada ya existe, no hay nada que avisar.
    if (error && error.code === DUPLICADO) return;
    if (error) informar('AUDITORIA_FALLO', { tabla: entrada.tabla, filaId: entrada.filaId, error: error.message });
  } catch (e) {
    informar('AUDITORIA_FALLO', { tabla: entrada.tabla, filaId: entrada.filaId, error: e instanceof Error ? e.message : String(e) });
  }
}
