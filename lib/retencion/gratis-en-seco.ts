// ─────────────────────────────────────────────────────────────────────────────
// El plan gratis medido EN SECO (bajas: medir el gratis sin visitas y el grupo
// de la dueña, en modo informe). SOLO LECTURA: nada de aquí guarda una medición
// ni cierra un panel. Lo que sale va al informe diario
// (`estudio_situacion_diaria.gratis`), nunca a `uso_plan_gratis` ni a `studios`:
// el gate cierra el panel leyendo `uso_plan_gratis`.
//
// Hoy el gratis solo se mide cuando la dueña abre el panel (/api/billing/status),
// así que quien no entra nunca se mide ni se cierra. El informe mide cada
// estudio gratis una vez al día con la MISMA medición del gate
// (`medirUsoGratis`, uso-gratis-servidor.ts) y las MISMAS reglas puras
// (plan-gratis.ts), y apunta:
//
//   · `actual`: lo que guardaría el gate si midiera ahora (regla de hoy: el
//     grupo son todos los gratis de la dueña): cifras, desde cuándo se pasó y la
//     fase (DENTRO/CERCA = normal, MARGEN, CERRADO);
//   · `guardado`: lo que tiene hoy `uso_plan_gratis` (lo que lee el gate), y si
//     las dos dicen lo mismo (`coincide`: fase y desde cuándo);
//   · `propuesta`: lo mismo con el grupo de la regla propuesta (§6 del diseño):
//     sin los estudios ELIMINADOS, sin los SUSPENDIDOS por abandono y sin demos;
//     un EN_BAJA o un SUSPENDIDO por el límite siguen contando (si no, trocear
//     escaparía). `grupo_difiere` si los grupos no son el mismo.
//
// Una lectura que falla se apunta en `ambiguo` y lo que dependía de ella queda
// en `null`: no se inventa un cero (escondería un exceso) ni una fecha.
//
// Puro, sin `@/`: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ESTADO_GRATIS, ESTADO_GRATIS_CERRADO, esPlanGratis, estadoDeLoGuardado, estadoGratis, medicionDelGrupo,
  type FaseGratis, type UsoGratis, type UsoGuardado,
} from '../billing/plan-gratis.ts';
import type { EstadoEstudio } from './situacion-estudio.ts';

/** Mediciones de estudio por pasada del cron (cada una lee todas sus alumnas y reservas). */
export const MAX_MEDICIONES_POR_PASADA = 25;

export const VERSION_INFORME_GRATIS = 1;

// ─── Quién se mide ───────────────────────────────────────────────────────────

/** La fila del informe del día, lo que hace falta de ella. */
export interface FilaDelDia {
  studio_id: string;
  estado: EstadoEstudio | 'ERROR';
  motivo: string | null;
  paga: boolean | null;
  avisos: string[] | null;
  gratis: unknown;
}

/** La ficha del estudio, lo que hace falta de ella. */
export interface FichaEstudio {
  id: string;
  owner_auth_user_id: string | null;
  subscription_status: string | null;
  es_demo: boolean | null;
}

/**
 * ¿Se mide hoy este estudio? Solo uno en el plan gratis (abierto o cerrado),
 * que no paga (ni él ni su cadena: lo dice la fila del día), que no es demo,
 * con su fila del día bien calculada y todavía sin medir (una vez al día).
 */
export function seMideHoy(fila: FilaDelDia, ficha: FichaEstudio | undefined): boolean {
  if (!ficha || fila.estado === 'ERROR' || fila.gratis !== null) return false;
  if (fila.paga !== false || fila.estado === 'ACTIVO_PAGO') return false;
  if (ficha.es_demo === true) return false;
  return esPlanGratis(ficha.subscription_status);
}

/**
 * ¿Cabe medir `faltan` estudios más en esta pasada? El primero de la pasada
 * siempre cabe: si no, una dueña con más estudios que el tope no se mediría nunca.
 */
export function cabeEnLaPasada(faltan: number, hechas: number, tope: number = MAX_MEDICIONES_POR_PASADA): boolean {
  return faltan === 0 || hechas === 0 || hechas + faltan <= tope;
}

// ─── El grupo de la dueña, con la regla propuesta ────────────────────────────

/** Lo que el informe del día sabe de un estudio de la dueña. */
export interface MiembroDelGrupo {
  /** Estado de su fila del día (`null`: sin fila ese día). */
  estado: EstadoEstudio | 'ERROR' | null;
  motivo: string | null;
  esDemo: boolean;
}

export type MotivoFuera = 'demo' | 'eliminado' | 'abandono';

export interface GrupoPropuesto {
  ids: string[];
  fuera: Array<{ id: string; motivo: MotivoFuera }>;
  /** Estudios del grupo de hoy cuya situación no se sabe (sin fila o con ERROR): sin ella no se decide. */
  sinSituacion: string[];
}

/**
 * El grupo con la regla PROPUESTA (§6): de los estudios del grupo de hoy (los
 * gratis de la dueña), fuera las demos, los ELIMINADOS y los SUSPENDIDOS por
 * abandono. Los demás siguen, también un EN_BAJA, un INACTIVO o un SUSPENDIDO
 * por el límite del gratis. El estudio que se mide está siempre.
 */
export function grupoPropuesto(studioId: string, grupoDeHoy: readonly string[], miembros: ReadonlyMap<string, MiembroDelGrupo>): GrupoPropuesto {
  const g: GrupoPropuesto = { ids: [studioId], fuera: [], sinSituacion: [] };
  for (const id of grupoDeHoy) {
    if (id === studioId) continue;
    const m = miembros.get(id);
    if (m?.esDemo) g.fuera.push({ id, motivo: 'demo' });
    else if (!m || m.estado === null || m.estado === 'ERROR') g.sinSituacion.push(id);
    else if (m.estado === 'ELIMINADO') g.fuera.push({ id, motivo: 'eliminado' });
    else if (m.estado === 'SUSPENDIDO' && m.motivo === 'abandono') g.fuera.push({ id, motivo: 'abandono' });
    else g.ids.push(id);
  }
  return g;
}

// ─── El registro del día ─────────────────────────────────────────────────────

export type CodigoAmbiguo =
  /** No se pudo leer qué estudios gratis tiene la dueña. */
  | 'grupo_sin_leer'
  /** Falló la medición de algún estudio del grupo. */
  | 'medicion_fallida'
  /** No se pudo leer `uso_plan_gratis`: sin él no se sabe desde cuándo se pasó. */
  | 'guardado_sin_leer'
  /** No se sabe la situación de algún estudio de la dueña: el grupo propuesto no se decide. */
  | 'situacion_de_otro_estudio_sin_saber';

export interface ResultadoRegla {
  grupo: string[];
  alumnas: number;
  reservas: number;
  /** Desde cuándo cuenta el margen (lo que se guardaría). */
  excedido_desde: string | null;
  fase: FaseGratis;
  /** El día en que se cierra (en margen o cerrado). */
  cierra_el: string | null;
}

export interface InformeGratis {
  version: typeof VERSION_INFORME_GRATIS;
  medido_en: string;
  /** `subscription_status` al medir: un 'gratis_cerrado' sigue cerrado, se mida lo que se mida (como en el gate). */
  estado_suscripcion: string | null;
  /** Lo de este estudio solo, sin sumar el grupo. */
  propio: { alumnas: number; reservas: number } | null;
  /** Regla de hoy con lo medido ahora: lo que guardaría el gate. */
  actual: ResultadoRegla | null;
  /** Lo que tiene hoy `uso_plan_gratis` (lo que lee el gate). Fase SIN_MEDIR si le faltan cifras. */
  guardado: { fase: FaseGratis; alumnas: number | null; reservas: number | null; excedido_desde: string | null } | null;
  /** ¿Lo medido (`actual`) y lo guardado dicen lo mismo, en fase y fecha? `null` si falta alguno. */
  coincide: boolean | null;
  /** Regla propuesta (§6) con lo medido ahora. */
  propuesta: (ResultadoRegla & { fuera: GrupoPropuesto['fuera'] }) | null;
  /** ¿Las dos reglas dan grupos distintos? `null` si no se sabe. */
  grupo_difiere: boolean | null;
  ambiguo: CodigoAmbiguo[];
}

export interface EntradaInformeGratis {
  studioId: string;
  estadoSuscripcion: string | null;
  /** El día del estudio ('YYYY-MM-DD', Madrid). */
  hoy: string;
  medidoEn: string;
  /** El grupo con la regla de hoy (`estudiosGratisDeLaDuena`, la del gate); `null` si no se pudo leer. */
  grupoDeHoy: readonly string[] | null;
  /** Lo medido de cada estudio (`medirUsoGratis`); `null` = falló. Lo que no está, no se midió. */
  usos: ReadonlyMap<string, UsoGratis | null>;
  /** `uso_plan_gratis` de los estudios del grupo de hoy; `null` si no se pudo leer. */
  guardado: ReadonlyArray<UsoGuardado & { studioId: string }> | null;
  miembros: ReadonlyMap<string, MiembroDelGrupo>;
}

const mismosIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

export function informeGratis(e: EntradaInformeGratis): InformeGratis {
  const ambiguo = new Set<CodigoAmbiguo>();
  // Ya cerrado en la base: cerrado, digan lo que digan las cifras (lo mismo que hace el gate).
  const cerradoEnLaBase = e.estadoSuscripcion === ESTADO_GRATIS_CERRADO;
  const conCierre = (fase: FaseGratis): FaseGratis => (cerradoEnLaBase ? 'CERRADO' : fase);

  const propio = e.usos.get(e.studioId);
  if (!e.grupoDeHoy) ambiguo.add('grupo_sin_leer');
  if (!e.guardado) ambiguo.add('guardado_sin_leer');

  /** Lo que guardaría quien mide para ese grupo, y su fase. `null` si falta algo (no se inventa). */
  const resultado = (ids: readonly string[]): ResultadoRegla | null => {
    const usos = ids.map(id => e.usos.get(id) ?? null);
    if (usos.some(u => u === null)) {
      ambiguo.add('medicion_fallida');
      return null;
    }
    if (!e.guardado) return null;
    const en = new Set(ids);
    const { uso, excedidoDesde } = medicionDelGrupo(
      usos as UsoGratis[], e.guardado.filter(g => en.has(g.studioId)).map(g => g.excedidoDesde), e.hoy,
    );
    const estado = estadoGratis({ uso, excedidoDesde, hoy: e.hoy });
    return {
      grupo: [...ids], alumnas: uso.alumnasActivas, reservas: uso.reservas30Dias,
      excedido_desde: excedidoDesde, fase: conCierre(estado.fase), cierra_el: estado.cierraEl,
    };
  };

  let guardado: InformeGratis['guardado'] = null;
  let actual: ResultadoRegla | null = null;
  let propuesta: InformeGratis['propuesta'] = null;
  let grupoDifiere: boolean | null = null;

  if (e.grupoDeHoy) {
    if (e.guardado) {
      const en = new Set(e.grupoDeHoy);
      const lo = estadoDeLoGuardado(e.guardado.filter(g => en.has(g.studioId)), e.grupoDeHoy.length, e.hoy);
      guardado = {
        fase: conCierre(lo.estado.fase), alumnas: lo.estado.uso?.alumnasActivas ?? null,
        reservas: lo.estado.uso?.reservas30Dias ?? null, excedido_desde: lo.excedidoDesde,
      };
    }
    actual = resultado(e.grupoDeHoy);
    const g = grupoPropuesto(e.studioId, e.grupoDeHoy, e.miembros);
    if (g.sinSituacion.length > 0) {
      ambiguo.add('situacion_de_otro_estudio_sin_saber');
    } else {
      grupoDifiere = !mismosIds(g.ids, e.grupoDeHoy);
      const r = resultado(g.ids);
      propuesta = r && { ...r, fuera: g.fuera };
    }
  } else if (propio === null) {
    ambiguo.add('medicion_fallida');
  }

  return {
    version: VERSION_INFORME_GRATIS,
    medido_en: e.medidoEn,
    estado_suscripcion: e.estadoSuscripcion,
    propio: propio ? { alumnas: propio.alumnasActivas, reservas: propio.reservas30Dias } : null,
    actual,
    guardado,
    coincide: actual && guardado ? actual.fase === guardado.fase && actual.excedido_desde === guardado.excedido_desde : null,
    propuesta,
    grupo_difiere: grupoDifiere,
    ambiguo: [...ambiguo],
  };
}

// ─── Los casos que se apuntan ────────────────────────────────────────────────

export const CODIGOS_AVISO_GRATIS = [
  'gratis_medicion_ambigua', 'gratis_lo_mediria_el_barrido', 'gratis_difiere_del_gate', 'gratis_se_cerraria', 'grupo_dueña_difiere',
] as const;
export type CodigoAvisoGratis = (typeof CODIGOS_AVISO_GRATIS)[number];

/** Su frase en /interno → Bajas (en seco). */
export const TEXTO_AVISO_GRATIS: Record<CodigoAvisoGratis, string> = {
  gratis_medicion_ambigua: 'plan gratis: alguna lectura falló al medirlo en seco (no se inventa nada)',
  gratis_lo_mediria_el_barrido: 'plan gratis: el gate no lo tiene medido; el barrido sí lo mediría',
  gratis_difiere_del_gate: 'plan gratis: lo medido en seco no coincide con lo guardado (fase o fecha)',
  gratis_se_cerraria: 'plan gratis: con lo medido, el panel se cerraría',
  'grupo_dueña_difiere': 'grupo de la dueña: la regla propuesta da otro grupo',
};

/** Los avisos del día que salen de un registro (los apunta el cron y los enseña /interno). */
export function avisosDeGratis(i: InformeGratis): CodigoAvisoGratis[] {
  const a: CodigoAvisoGratis[] = [];
  if (i.ambiguo.length > 0) a.push('gratis_medicion_ambigua');
  if (i.actual && i.guardado?.fase === 'SIN_MEDIR') a.push('gratis_lo_mediria_el_barrido');
  if (i.guardado && i.guardado.fase !== 'SIN_MEDIR' && i.coincide === false) a.push('gratis_difiere_del_gate');
  if (i.actual?.fase === 'CERRADO' && i.estado_suscripcion === ESTADO_GRATIS) a.push('gratis_se_cerraria');
  if (i.grupo_difiere === true) a.push('grupo_dueña_difiere');
  return a;
}

/** Un registro leído de la base (jsonb): solo si tiene la forma de esta versión. */
export function comoInformeGratis(v: unknown): InformeGratis | null {
  if (!v || typeof v !== 'object') return null;
  const i = v as Partial<InformeGratis>;
  return i.version === VERSION_INFORME_GRATIS && typeof i.medido_en === 'string' && Array.isArray(i.ambiguo) ? (i as InformeGratis) : null;
}
