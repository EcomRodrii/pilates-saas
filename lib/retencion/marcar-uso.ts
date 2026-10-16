import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
// Rutas relativas: lo prueba `node --test`.
import { hoyEnEstudio } from '../utils.ts';
import { modoBajas } from './situacion-estudio.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Las marcas de uso de un estudio (`studios.ultimo_uso_panel_en` /
// `ultimo_uso_app_en`): la señal de que alguien lo usa aunque no cambie nada.
//
// · Solo con BAJAS_AUTOMATICAS=informe. Apagado, no se llama a nada.
// · Como mucho una vez al día de Madrid por estudio: la regla vive en SQL
//   (`marcar_uso_panel` / `marcar_uso_app`, un UPDATE condicional), y aquí un
//   recuerdo por instancia evita hasta la llamada si ya se hizo hoy.
// · Nunca bloquea ni tumba la petición: se llama dentro de `after()` y, si falla,
//   se avisa (sin datos de nadie) y se sigue. Un fallo tampoco se reintenta en
//   cada petición de ese día: con la función sin aplicar serían miles de avisos.
// ─────────────────────────────────────────────────────────────────────────────

export type UsoDelEstudio = 'panel' | 'app';

/** `${uso}:${id}` → día de Madrid del último intento en esta instancia. */
const intentadasHoy = new Map<string, string>();
const MAX_RECORDADAS = 5_000;

export interface OpcionesMarca {
  entorno?: Record<string, string | undefined>;
  ahora?: Date;
}

/**
 * Apunta que hoy se ha usado el estudio. `panel`: `id` es el estudio (el panel o
 * la app del equipo). `app`: `id` es la socia que ha abierto su app con sesión
 * (el estudio lo saca la base de datos). Devuelve si llegó a llamar.
 */
export async function marcarUso(
  admin: Pick<SupabaseClient, 'rpc'>, uso: UsoDelEstudio, id: string, opciones: OpcionesMarca = {},
): Promise<boolean> {
  if (modoBajas(opciones.entorno ?? process.env) !== 'informe' || !id) return false;
  const dia = hoyEnEstudio(opciones.ahora ?? new Date());
  const clave = `${uso}:${id}`;
  if (intentadasHoy.get(clave) === dia) return false;
  if (intentadasHoy.size >= MAX_RECORDADAS) intentadasHoy.clear();
  intentadasHoy.set(clave, dia);
  try {
    const { error } = uso === 'panel'
      ? await admin.rpc('marcar_uso_panel', { p_studio_id: id })
      : await admin.rpc('marcar_uso_app', { p_socio_id: id });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.warn(`[retencion] no se pudo apuntar el uso (${uso}):`, e instanceof Error ? e.message : 'error desconocido');
    try {
      Sentry.captureMessage('[retencion] no se pudo apuntar el uso del estudio', { level: 'warning', tags: { area: 'retencion', uso } });
    } catch { /* sin Sentry, igual */ }
  }
  return true;
}

/** Solo para las pruebas: olvida lo apuntado en esta instancia. */
export function olvidarMarcasDeHoy(): void {
  intentadasHoy.clear();
}
