import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
// Rutas relativas: lo prueba `node --test`.
import { hoyEnEstudio } from '../utils.ts';
import { enVentanaDelEmbudo, PASOS_DURABLES, type DetalleEmbudo, type PasoEmbudo } from './embudo.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Apuntar un paso del embudo del alta (`embudo_alta`, migración
// 20261021020248). Lo llaman rutas que hacen OTRA cosa (la puerta del panel, el
// «¿puede reservar?»), casi siempre desde `after()`, así que:
//
// · NUNCA lanza ni tumba a quien llama: si falla, se avisa (sin datos de nadie)
//   y se sigue. Medir no puede romper lo que se mide.
// · Una fila por estudio, paso y día de Madrid: el día lo pone la base
//   (`default public.hoy_estudio()`) y `on conflict do nothing` hace que repetir
//   en el mismo día no cueste nada ni cambie la primera hora apuntada.
// · Solo estudios en sus primeros DIAS_EMBUDO días (`enVentanaDelEmbudo`): el
//   embudo es de estudios que arrancan, y la tabla no crece con los veteranos.
//   Salvo los `PASOS_DURABLES` (embudo.ts, PR-5): las marcas de «esto ya
//   se le enseñó» (el recorrido, la tarjeta del plan, el correo de la primera
//   clase) valen pase cuando pase, y son UNA fila por estudio, no una por día.
// · Un intento por estudio, paso y día en cada instancia (como `marcarUso`):
//   /api/billing/status se pide en cada carga del panel, y con la migración sin
//   aplicar todavía cada carga sería un aviso. Lo que se pierde así es, como
//   mucho, un reintento el mismo día.
//
// ⚠️ Cliente service-role: la tabla no tiene políticas para el cliente. El
// estudio sale SIEMPRE de la sesión de quien llama, nunca del cuerpo.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionesPaso {
  detalle?: DetalleEmbudo | null;
  /** `studios.creado_en` si quien llama ya lo tiene; si no, se lee. */
  creadoEn?: string | null;
  ahora?: Date;
}

/** `${paso}:${estudio}` → día de Madrid del último intento en esta instancia. */
const intentadosHoy = new Map<string, string>();
const MAX_RECORDADOS = 5_000;

/** Solo para los tests: cada uno empieza sin intentos de hoy. */
export function olvidarPasosDeHoy(): void {
  intentadosHoy.clear();
}

/** Devuelve si escribió en esta llamada (con `on conflict do nothing`: o ya estaba). Nunca lanza. */
export async function apuntarPaso(
  admin: Pick<SupabaseClient, 'from'>, studioId: string, paso: PasoEmbudo, opciones: OpcionesPaso = {},
): Promise<boolean> {
  try {
    if (!studioId) return false;
    const ahora = opciones.ahora ?? new Date();
    const clave = `${paso}:${studioId}`;
    const hoy = hoyEnEstudio(ahora);
    if (intentadosHoy.get(clave) === hoy) return false;
    if (intentadosHoy.size >= MAX_RECORDADOS) intentadosHoy.clear();
    intentadosHoy.set(clave, hoy);

    let creadoEn = opciones.creadoEn;
    if (creadoEn === undefined) {
      const { data, error } = await admin.from('studios').select('creado_en').eq('id', studioId).maybeSingle();
      if (error) throw new Error(error.message);
      creadoEn = (data?.creado_en as string | null | undefined) ?? null;
    }
    if (!PASOS_DURABLES.includes(paso) && !enVentanaDelEmbudo(creadoEn, ahora)) return false;

    const { error } = await admin.from('embudo_alta').upsert(
      { studio_id: studioId, paso, detalle: opciones.detalle ?? null },
      { onConflict: 'studio_id,paso,dia', ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.warn(`[embudo-alta] no se pudo apuntar «${paso}»:`, e instanceof Error ? e.message : 'error desconocido');
    try {
      Sentry.captureMessage('[embudo-alta] no se pudo apuntar un paso', { level: 'warning', tags: { area: 'embudo-alta', paso } });
    } catch { /* sin Sentry, igual */ }
    return false;
  }
}
