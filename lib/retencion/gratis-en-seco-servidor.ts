import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
// Rutas relativas: lo carga el cron, y lo prueban `node --test` y supabase/tests.
import { todasLasFilas, type Pagina } from '../clientas/estado-servidor.ts';
import { COLUMNAS_USO, estudiosGratisDeLaDuena, medirUsoGratis, type FilaUso } from '../billing/uso-gratis-servidor.ts';
import type { UsoGratis, UsoGuardado } from '../billing/plan-gratis.ts';
import { hoyEnEstudio } from '../utils.ts';
import { modoBajas } from './situacion-estudio.ts';
import {
  MAX_MEDICIONES_POR_PASADA, avisosDeGratis, cabeEnLaPasada, informeGratis, seMideHoy,
  type FichaEstudio, type FilaDelDia, type MiembroDelGrupo,
} from './gratis-en-seco.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El plan gratis medido en seco (lib/retencion/gratis-en-seco.ts), en el cron
// horario que ya escribe el informe diario de bajas (`notif-trial`), justo
// después de `registrar_situacion_diaria` y sobre las filas de ese día.
//
// · Solo con BAJAS_AUTOMATICAS=informe. Apagado, no lee ni escribe nada.
// · SOLO escribe la columna `gratis` (y sus avisos) de la fila del día de cada
//   estudio, y solo si estaba vacía: idempotente por estudio y día. NUNCA
//   `uso_plan_gratis` (el gate cierra el panel leyéndola) ni `studios`.
// · Mide con la función del gate (`medirUsoGratis`), que solo lee; el grupo de
//   hoy es el del gate (`estudiosGratisDeLaDuena`).
// · Quien paga y las demos no se miden. Como mucho MAX_MEDICIONES_POR_PASADA
//   estudios por pasada: lo que no cabe queda para la siguiente (cada hora).
// · El «hoy» es el de Madrid: el día de las filas lo pone la base
//   (`hoy_estudio()`) y, si al medir ya es otro día, se deja para la pasada siguiente.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumenGratisEnSeco {
  dia: string;
  /** Estudios gratis medidos y apuntados en el informe esta pasada. */
  apuntados: number;
  /** De ellos, con alguna lectura fallida (apuntados como ambiguos). */
  ambiguos: number;
  /** Los que no cupieron en el tope de esta pasada. */
  aplazados: number;
  /** Mediciones de estudio hechas (las de los grupos incluidas). */
  mediciones: number;
  errores: number;
}

export interface OpcionesGratisEnSeco {
  /** El día del informe ('YYYY-MM-DD', Madrid): el que devolvió `registrar_situacion_diaria`. */
  hoy: string;
  ahora?: Date;
  entorno?: Record<string, string | undefined>;
  tope?: number;
  /** Para las pruebas: la medición (por defecto, la del gate). */
  medir?: typeof medirUsoGratis;
}

/** Columna que aún no existe (código desplegado antes que su migración). */
const COLUMNA_INEXISTENTE = '42703';

export async function medirGratisEnSeco(admin: SupabaseClient, opciones: OpcionesGratisEnSeco): Promise<ResumenGratisEnSeco | { skipped: string }> {
  if (modoBajas(opciones.entorno ?? process.env) !== 'informe') return { skipped: 'BAJAS_AUTOMATICAS no está en informe' };
  const ahora = opciones.ahora ?? new Date();
  const hoy = opciones.hoy;
  if (hoyEnEstudio(ahora) !== hoy) return { skipped: 'el día del informe ya no es el de hoy en Madrid' };
  const medir = opciones.medir ?? medirUsoGratis;
  const tope = opciones.tope ?? MAX_MEDICIONES_POR_PASADA;

  const [filas, fichas] = await Promise.all([
    todasLasFilas<FilaDelDia>((d, h) => admin.from('estudio_situacion_diaria')
      .select('studio_id, estado, motivo, paga, avisos, gratis').eq('dia', hoy)
      .order('studio_id').range(d, h) as unknown as Pagina<FilaDelDia>),
    todasLasFilas<FichaEstudio>((d, h) => admin.from('studios')
      .select('id, owner_auth_user_id, subscription_status, es_demo')
      .order('id').range(d, h) as unknown as Pagina<FichaEstudio>),
  ]);
  if ((filas.error as { code?: string } | null)?.code === COLUMNA_INEXISTENTE) return { skipped: 'falta la columna `gratis` (migración sin aplicar)' };
  if (filas.error) throw new Error(`leer el informe del día: ${filas.error.message}`);
  if (fichas.error) throw new Error(`leer los estudios: ${fichas.error.message}`);

  const fichaDe = new Map(fichas.data.map(f => [f.id, f]));
  const filaDe = new Map(filas.data.map(f => [f.studio_id, f]));
  const miembros = new Map<string, MiembroDelGrupo>(fichas.data.map(f => [f.id, {
    estado: filaDe.get(f.id)?.estado ?? null, motivo: filaDe.get(f.id)?.motivo ?? null, esDemo: f.es_demo === true,
  }]));

  const resumen: ResumenGratisEnSeco = { dia: hoy, apuntados: 0, ambiguos: 0, aplazados: 0, mediciones: 0, errores: 0 };
  // Cada estudio se mide una vez por pasada, aunque esté en el grupo de otro.
  const usos = new Map<string, UsoGratis | null>();

  for (const fila of filas.data.filter(f => seMideHoy(f, fichaDe.get(f.studio_id)))) {
    const ficha = fichaDe.get(fila.studio_id)!;
    try {
      const grupoDeHoy = await estudiosGratisDeLaDuena(admin, ficha.id, ficha.owner_auth_user_id);
      const faltan = (grupoDeHoy ?? [ficha.id]).filter(id => !usos.has(id));
      if (!cabeEnLaPasada(faltan.length, resumen.mediciones, tope)) {
        resumen.aplazados++;
        continue;
      }
      for (const id of faltan) {
        const m = await medir(admin, [id], ahora).catch(() => null);
        usos.set(id, m?.get(id) ?? null);
        resumen.mediciones++;
      }

      let guardado: Array<UsoGuardado & { studioId: string }> | null = null;
      if (grupoDeHoy) {
        const { data, error } = await admin.from('uso_plan_gratis').select(COLUMNAS_USO).in('studio_id', grupoDeHoy);
        guardado = error ? null : ((data ?? []) as FilaUso[]).map(f => ({
          studioId: f.studio_id, alumnasActivas: f.alumnas_activas, reservas30Dias: f.reservas_30_dias,
          excedidoDesde: f.excedido_desde, medidoEn: f.medido_en,
        }));
      }

      const informe = informeGratis({
        studioId: ficha.id, estadoSuscripcion: ficha.subscription_status, hoy, medidoEn: ahora.toISOString(),
        grupoDeHoy, usos, guardado, miembros,
      });
      const avisos = [...new Set([...(fila.avisos ?? []), ...avisosDeGratis(informe)])];
      // Solo la fila de ese día, solo si seguía sin medir y bien calculada: una segunda pasada no reescribe nada.
      const { data, error } = await admin.from('estudio_situacion_diaria')
        .update({ gratis: informe, avisos })
        .eq('studio_id', ficha.id).eq('dia', hoy).is('gratis', null).neq('estado', 'ERROR')
        .select('studio_id');
      if (error) {
        resumen.errores++;
        continue;
      }
      if (data?.length) {
        resumen.apuntados++;
        if (informe.ambiguo.length > 0) resumen.ambiguos++;
      }
    } catch {
      resumen.errores++;
    }
  }

  if (resumen.ambiguos > 0 || resumen.errores > 0) {
    // El detalle (qué falló) está en la fila del estudio. Sin datos de nadie.
    Sentry.captureMessage('[bajas en seco] el plan gratis de algún estudio no se pudo medir del todo', {
      level: 'warning', tags: { area: 'retencion' }, extra: { dia: hoy, ambiguos: resumen.ambiguos, errores: resumen.errores },
    });
  }
  return resumen;
}
