import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
// Rutas relativas: lo mismo que estado-servidor (lo cargan módulos que prueba `node --test`).
import { cargarEstadosClientas } from '../clientas/estado-servidor.ts';
import {
  estadoDeLoGuardado, estadoGratis, medicionDelGrupo, ESTADO_GRATIS, ESTADO_GRATIS_CERRADO, type EstadoGratis, type UsoGratis,
} from './plan-gratis.ts';
import { hoyEnEstudio, inicioDelDiaEstudio, masDias } from '../utils.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Cuánto usa el plan gratis una dueña (plan-gratis.ts): mide, guarda y lee.
//
// · Las alumnas «Activa» salen de la MISMA función que el chip de Clientas y el
//   Resumen (`cargarEstadosClientas`), en el servidor: el número que cierra es
//   el número que ella ve.
// · Las reservas, de las clases de los últimos 30 días (por la fecha de la
//   clase, desde el principio de ese día en Madrid hasta ahora), sin canceladas,
//   lista de espera ni pendientes de aprobar. Las de clase fija cuentan; una
//   falta (NO_ASISTIO) también: la plaza se ocupó.
// · Se suman TODOS los estudios gratis de la misma dueña (también uno que se
//   quedó con `cadena_id` de un Checkout de Cadena abandonado): trocear el
//   estudio no lo hace gratis.
// · Medir es caro (todas las reservas del grupo): se guarda en `uso_plan_gratis`
//   y el gate lo vuelve a medir después de contestar si tiene más de
//   HORAS_VIGENCIA. Una medición a la vez por estudio: se RESERVA con una
//   escritura condicional (`intento_en`), y si falla no se reintenta hasta
//   pasado MINUTOS_ENTRE_INTENTOS. Si algo falla al medir no se guarda nada (un
//   «0» inventado escondería un exceso); un estudio gratis sin medir más de
//   HORAS_SIN_MEDIR_AVISO va a Sentry.
// · El informe en seco de bajas (lib/retencion/gratis-en-seco-servidor.ts) mide
//   con ESTAS funciones (`estudiosGratisDeLaDuena`, `medirUsoGratis`) y deriva
//   con las mismas reglas puras (plan-gratis.ts), pero no guarda nada aquí.
// ─────────────────────────────────────────────────────────────────────────────

/** Cada cuánto se vuelve a medir. El margen es de días: medio día de retraso no cambia nada. */
export const HORAS_VIGENCIA = 12;
const MINUTOS_ENTRE_INTENTOS = 15;
const HORAS_SIN_MEDIR_AVISO = 24;
/** Ventana de las reservas: «250 reservas al mes» son 250 en las clases de los últimos 30 días. */
export const DIAS_VENTANA_RESERVAS = 30;
/** Las que no son uso: no ocupan plaza. */
const RESERVAS_QUE_NO_CUENTAN = '(CANCELADA,LISTA_ESPERA,PENDIENTE_APROBACION)';

export interface FilaUso {
  studio_id: string;
  alumnas_activas: number | null;
  reservas_30_dias: number | null;
  excedido_desde: string | null;
  medido_en: string | null;
  creado_en: string;
}

/** Los estudios gratis (abiertos o cerrados) de la dueña, con el que se mira siempre dentro. `null` si la lectura falla. */
export async function estudiosGratisDeLaDuena(admin: SupabaseClient, studioId: string, ownerId: string | null): Promise<string[] | null> {
  if (!ownerId) return [studioId];
  const { data, error } = await admin.from('studios').select('id')
    .eq('owner_auth_user_id', ownerId).in('subscription_status', [ESTADO_GRATIS, ESTADO_GRATIS_CERRADO]);
  if (error) return null;
  return [...new Set([studioId, ...((data ?? []) as { id: string }[]).map(s => s.id)])];
}

/** Mide alumnas y reservas de cada estudio. `null` si cualquier lectura falla. Solo lee. */
export async function medirUsoGratis(admin: SupabaseClient, ids: string[], ahora: Date): Promise<Map<string, UsoGratis> | null> {
  const hoy = hoyEnEstudio(ahora);
  // Las clases desde el principio (Madrid) de hace 29 días hasta ahora: 30 días de calendario.
  const desde = inicioDelDiaEstudio(masDias(hoy, -(DIAS_VENTANA_RESERVAS - 1)));
  const hasta = ahora.toISOString();
  const usos = new Map<string, UsoGratis>(ids.map(id => [id, { alumnasActivas: 0, reservas30Dias: 0 }]));

  for (const id of ids) {
    const estados = await cargarEstadosClientas(admin, id, { ahora });
    if (!estados) return null;
    let activas = 0;
    for (const e of estados.values()) if (e.estado === 'ACTIVA') activas++;
    usos.get(id)!.alumnasActivas = activas;

    // Un recuento (HEAD), no las filas: un estudio grande tiene miles al mes.
    const { count, error } = await admin.from('reservas')
      .select('id, sesiones!inner(inicio)', { count: 'exact', head: true })
      .eq('studio_id', id)
      .not('estado', 'in', RESERVAS_QUE_NO_CUENTAN)
      .gte('sesiones.inicio', desde).lte('sesiones.inicio', hasta);
    if (error || count === null) return null;
    usos.get(id)!.reservas30Dias = count;
  }
  return usos;
}

export interface LecturaUsoGratis {
  estado: EstadoGratis;
  /** Toca volver a medir (falta alguna cifra o son de hace más de HORAS_VIGENCIA). */
  caducado: boolean;
  /** Desde cuándo se pasó el grupo según lo guardado (la fecha más antigua). */
  excedidoDesde: string | null;
}

export const COLUMNAS_USO = 'studio_id, alumnas_activas, reservas_30_dias, excedido_desde, medido_en, creado_en';

/** Lo guardado de un grupo, ya derivado (lo que ve el gate). Puro: no lee ni avisa. */
export function lecturaDeLoGuardado(filas: readonly FilaUso[], ids: readonly string[], ahora: Date): LecturaUsoGratis {
  const { estado, excedidoDesde, medidas } = estadoDeLoGuardado(filas.map(f => ({
    alumnasActivas: f.alumnas_activas, reservas30Dias: f.reservas_30_dias, excedidoDesde: f.excedido_desde, medidoEn: f.medido_en,
  })), ids.length, hoyEnEstudio(ahora));
  // Un estudio del grupo sin medir: hasta medirlo no se dice nada del uso.
  const viejo = medidas.length < ids.length
    || medidas.some(m => ahora.getTime() - new Date(m.medidoEn!).getTime() > HORAS_VIGENCIA * 3_600_000);
  return { estado, caducado: viejo, excedidoDesde };
}

/** Lee lo guardado del grupo de la dueña y deriva el estado. Nunca mide. */
export async function leerUsoGratis(admin: SupabaseClient, studioId: string, ownerId: string | null, ahora: Date): Promise<LecturaUsoGratis> {
  const hoy = hoyEnEstudio(ahora);
  const ids = await estudiosGratisDeLaDuena(admin, studioId, ownerId);
  const sinCifras = (excedidoDesde: string | null): LecturaUsoGratis => ({ estado: estadoGratis({ uso: null, excedidoDesde, hoy }), caducado: true, excedidoDesde });
  if (!ids) return sinCifras(null);
  const { data, error } = await admin.from('uso_plan_gratis').select(COLUMNAS_USO).in('studio_id', ids);
  if (error) return sinCifras(null);
  const filas = (data ?? []) as FilaUso[];
  const lectura = lecturaDeLoGuardado(filas, ids, ahora);
  if (!lectura.estado.uso) {
    const atascada = filas.find(f => !f.medido_en && ahora.getTime() - new Date(f.creado_en).getTime() > HORAS_SIN_MEDIR_AVISO * 3_600_000);
    if (atascada) {
      Sentry.captureMessage('[plan gratis] un estudio gratis lleva más de un día sin poder medirse', {
        level: 'warning', tags: { area: 'billing' }, extra: { studioId: atascada.studio_id },
      });
    }
  }
  return lectura;
}

/**
 * Reserva la medición del estudio: una a la vez, y sin reintentar en bucle si
 * la anterior falló hace poco. Crea la fila la primera vez.
 */
async function reservarMedicion(admin: SupabaseClient, studioId: string, ahora: Date): Promise<boolean> {
  await admin.from('uso_plan_gratis').upsert({ studio_id: studioId }, { onConflict: 'studio_id', ignoreDuplicates: true });
  const limite = new Date(ahora.getTime() - MINUTOS_ENTRE_INTENTOS * 60_000).toISOString();
  const { data, error } = await admin.from('uso_plan_gratis').update({ intento_en: ahora.toISOString() })
    .eq('studio_id', studioId).or(`intento_en.is.null,intento_en.lt.${limite}`).select('studio_id');
  return !error && !!data?.length;
}

/**
 * Mide el grupo de la dueña y lo guarda, con el margen al día. Se llama
 * DESPUÉS de contestar (`after()` en el gate): nadie espera por esto.
 */
export async function refrescarUsoGratis(admin: SupabaseClient, studioId: string, ownerId: string | null, ahora: Date): Promise<boolean> {
  if (!(await reservarMedicion(admin, studioId, ahora))) return false;
  const ids = await estudiosGratisDeLaDuena(admin, studioId, ownerId);
  if (!ids) return false;
  const usos = await medirUsoGratis(admin, ids, ahora);
  if (!usos) return false;
  const { data: previas } = await admin.from('uso_plan_gratis').select('excedido_desde').in('studio_id', ids);
  const { excedidoDesde: desde } = medicionDelGrupo(
    [...usos.values()], ((previas ?? []) as { excedido_desde: string | null }[]).map(p => p.excedido_desde), hoyEnEstudio(ahora),
  );
  const medidoEn = ahora.toISOString();
  const filas = ids.map(id => {
    const u = usos.get(id)!;
    return { studio_id: id, alumnas_activas: u.alumnasActivas, reservas_30_dias: u.reservas30Dias, excedido_desde: desde, medido_en: medidoEn };
  });
  const { error } = await admin.from('uso_plan_gratis').upsert(filas, { onConflict: 'studio_id' });
  return !error;
}
