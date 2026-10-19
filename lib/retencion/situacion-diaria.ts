import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
// Rutas relativas: lo carga el cron, que también se prueba con `node --test`.
import { modoBajas } from './situacion-estudio.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El informe diario de bajas (en seco): una fila por estudio y día de Madrid en
// `estudio_situacion_diaria`, con el estado derivado, su motivo, las señales
// usadas y los casos dudosos. Sirve para comparar días y ver falsos positivos
// antes de que nada se active; nada lo lee para decidir.
//
// · Solo con BAJAS_AUTOMATICAS=informe, y solo escribe en esa tabla (y, la
//   primera vez que un estudio entra, el punto de partida de su marca de panel).
// · Va colgado del cron horario que ya avanza el ciclo de estudios vencidos
//   (`notif-trial`): sin cron nuevo. La RPC es idempotente por estudio y día —lo
//   ya escrito ese día no se toca, salvo un ERROR, que se reintenta—, así que las
//   pasadas de después del primer tic del día no cambian nada.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumenSituacionDiaria {
  dia: string;
  escritas: number;
  ya_estaban: number;
  errores: number;
  marcas_de_panel_iniciales: number;
}

export async function registrarSituacionDiaria(
  admin: Pick<SupabaseClient, 'rpc'>, entorno: Record<string, string | undefined> = process.env,
): Promise<ResumenSituacionDiaria | { skipped: string }> {
  if (modoBajas(entorno) !== 'informe') return { skipped: 'BAJAS_AUTOMATICAS no está en informe' };
  const { data, error } = await admin.rpc('registrar_situacion_diaria');
  if (error) throw new Error(`registrar_situacion_diaria: ${error.message}`);
  const resumen = data as ResumenSituacionDiaria;
  if (resumen.errores > 0) {
    // El detalle (qué falló) está en la fila del estudio, con estado ERROR.
    Sentry.captureMessage('[bajas en seco] la situación de algún estudio no se pudo calcular', {
      level: 'warning', tags: { area: 'retencion' }, extra: { dia: resumen.dia, errores: resumen.errores },
    });
  }
  return resumen;
}
