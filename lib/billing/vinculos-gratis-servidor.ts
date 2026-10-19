import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
// Rutas relativas: lo carga uso-gratis-servidor, que prueba `node --test`.
import { claveOpaca, secretoRateLimit } from '../rate-limit-core.ts';
import { ESTADO_GRATIS, ESTADO_GRATIS_CERRADO } from './plan-gratis.ts';
import {
  MIN_ALUMNAS_COMUNES, PCT_ALUMNAS_COMUNES, vinculadosDelGrupo, type FilaVinculo, type MotivoVinculo,
} from './vinculos-gratis.ts';

// La mitad de servidor de vinculos-gratis.ts: detectar, leer y apuntar la huella.

/**
 * Busca estudios de otras cuentas que son este mismo negocio y los apunta. Se
 * llama al medir el uso de un estudio gratis (como mucho cada 12 h). Nunca
 * lanza: si falla, la medición sigue como siempre y va a Sentry.
 */
export async function detectarVinculosGratis(admin: SupabaseClient, studioId: string): Promise<void> {
  const { data, error } = await admin.rpc('detectar_vinculos_gratis', {
    p_studio: studioId, p_min_comunes: MIN_ALUMNAS_COMUNES, p_pct_comunes: PCT_ALUMNAS_COMUNES,
  });
  if (error) {
    Sentry.captureMessage('[plan gratis] no se han podido buscar cuentas vinculadas', {
      level: 'warning', tags: { area: 'billing' }, extra: { studioId, error: error.message },
    });
    return;
  }
  for (const v of (data ?? []) as { vinculado_id: string; motivo: MotivoVinculo; cuenta: boolean; nuevo: boolean }[]) {
    if (!v.nuevo) continue;
    // Solo ids: el resto se mira en /interno, donde se puede deshacer.
    Sentry.captureMessage(
      v.cuenta ? '[plan gratis] estudio de otra cuenta vinculado: se suma su uso' : '[plan gratis] alta parecida a un estudio cerrado (solo aviso)',
      { level: 'warning', tags: { area: 'billing', vinculo: v.motivo }, extra: { studioId, vinculadoId: v.vinculado_id, motivo: v.motivo } },
    );
  }
}

/**
 * Los estudios gratis (abiertos o cerrados) más antiguos de otras cuentas a los
 * que este grupo se suma, con los demás estudios gratis de sus dueñas. Si la lectura falla, `[]`
 * y a Sentry: sin vínculos se mide como antes, nunca se deja de medir.
 */
export async function estudiosVinculadosGratis(admin: SupabaseClient, grupo: readonly string[]): Promise<string[]> {
  // Solo los vínculos en los que un estudio del grupo es el NUEVO (`studio_id`):
  // el viejo nunca carga con el uso de quien lo copia.
  const { data, error } = await admin.from('vinculos_cuentas_gratis')
    .select('studio_id, vinculado_id, cuenta, descartado_en')
    .eq('cuenta', true).is('descartado_en', null).in('studio_id', [...grupo]);
  if (error) {
    Sentry.captureMessage('[plan gratis] no se han podido leer las cuentas vinculadas', {
      level: 'warning', tags: { area: 'billing' }, extra: { grupo, error: error.message },
    });
    return [];
  }
  const otros = vinculadosDelGrupo(grupo, (data ?? []) as FilaVinculo[]);
  if (otros.length === 0) return [];
  const { data: filas, error: eFilas } = await admin.from('studios')
    .select('id, owner_auth_user_id, subscription_status').in('id', otros);
  if (eFilas) return [];
  const gratis = new Set([ESTADO_GRATIS, ESTADO_GRATIS_CERRADO]);
  const ids = new Set<string>();
  const duenas = new Set<string>();
  for (const f of (filas ?? []) as { id: string; owner_auth_user_id: string | null; subscription_status: string | null }[]) {
    if (!gratis.has(f.subscription_status ?? '')) continue;
    ids.add(f.id);
    if (f.owner_auth_user_id) duenas.add(f.owner_auth_user_id);
  }
  if (duenas.size > 0) {
    const { data: hermanos } = await admin.from('studios').select('id')
      .in('owner_auth_user_id', [...duenas]).in('subscription_status', [ESTADO_GRATIS, ESTADO_GRATIS_CERRADO]);
    for (const h of (hermanos ?? []) as { id: string }[]) ids.add(h.id);
  }
  for (const g of grupo) ids.delete(g);
  return [...ids];
}

/**
 * Apunta la huella del alta (la primera vez que la dueña abre el panel): la IP y
 * el navegador, con HMAC, nunca en claro. Solo con HUELLA_ALTA (lo comprueba
 * quien llama). La primera se queda: lo que importa es desde dónde se dio de alta.
 */
export async function apuntarHuellaAlta(
  admin: SupabaseClient, studioId: string, ip: string | null, dispositivo: string | null,
): Promise<void> {
  const secreto = secretoRateLimit(process.env);
  if (!secreto || (!ip && !dispositivo)) return;
  const [ipHmac, dispositivoHmac] = await Promise.all([
    ip ? claveOpaca(`huella-ip:${ip}`, secreto) : null,
    dispositivo ? claveOpaca(`huella-disp:${dispositivo}`, secreto) : null,
  ]);
  await admin.from('huellas_alta')
    .upsert({ studio_id: studioId, ip_hmac: ipHmac, dispositivo_hmac: dispositivoHmac }, { onConflict: 'studio_id', ignoreDuplicates: true });
}
