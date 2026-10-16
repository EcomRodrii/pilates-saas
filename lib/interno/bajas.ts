// ─────────────────────────────────────────────────────────────────────────────
// /interno → Bajas (en seco): lo que diría la máquina de estados de bajas, sin
// hacer nada. Parte pura (la comparten la ruta, la pantalla y los tests).
//
//   · `vivo`: la situación de hoy de cada estudio, calculada al pedirla
//     (`situacion_estudios`, la misma función que escribe el informe diario);
//   · `historial`: el informe diario (`estudio_situacion_diaria`), para ver la
//     evolución por días y qué estudios cambian de estado de un día a otro;
//   · `gratis`: el plan gratis medido en seco ese día (columna `gratis` del
//     informe, lib/retencion/gratis-en-seco.ts): lo medido, lo que tiene el gate
//     y si el grupo de la dueña cambia con la regla propuesta.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DIAS_HASTA_INACTIVO, DIAS_HASTA_SUSPENDIDO, ESTADOS_ESTUDIO, type EstadoEstudio, type ModoBajas,
} from '../retencion/situacion-estudio.ts';
import {
  TEXTO_AVISO_GRATIS, avisosDeGratis, comoInformeGratis, type InformeGratis, type MotivoFuera,
} from '../retencion/gratis-en-seco.ts';
import type { FaseGratis } from '../billing/plan-gratis.ts';
import { masDias } from '../utils.ts';

/** Lo que devuelve `public.situacion_estudios` (snake_case de la BD). */
export interface FilaSituacionBd {
  studio_id: string;
  estado: EstadoEstudio;
  motivo: string | null;
  variante: string | null;
  paga: boolean;
  gestion_limitada: boolean;
  servicio_alumnas_suspendido: boolean;
  cobros_automaticos_pausados: boolean;
  es_demo: boolean;
  suspendido_a_mano: boolean;
  fase_gratis: string;
  ultima_actividad: string | null;
  ancla: string;
  dias_de_cierre: number;
  dias_sin_actividad: number;
  avisos: string[] | null;
}

export interface EstudioBajas {
  id: string;
  nombre: string;
  estado: EstadoEstudio;
  motivo: string | null;
  variante: string | null;
  paga: boolean;
  gestionLimitada: boolean;
  servicioAlumnasSuspendido: boolean;
  cobrosAutomaticosPausados: boolean;
  esDemo: boolean;
  suspendidoAMano: boolean;
  faseGratis: string;
  ultimaActividad: string | null;
  ancla: string;
  diasDeCierre: number;
  diasSinActividad: number;
  avisos: string[];
  /** Si nadie hace nada y sin cierres nuevos: el día en que entraría en INACTIVO / SUSPENDIDO. */
  entraInactivoEl: string | null;
  entraSuspendidoEl: string | null;
  /** El plan gratis medido en seco ese día (solo si el informe de ese día lo tiene). */
  gratis: GratisEnPantalla | null;
}

/** Lo que guardaría quien mide con una regla, con los estudios por su nombre. */
export interface ReglaEnPantalla {
  alumnas: number;
  reservas: number;
  fase: FaseGratis;
  excedidoDesde: string | null;
  cierraEl: string | null;
  grupo: string[];
}

export interface GratisEnPantalla {
  medidoEn: string;
  propio: { alumnas: number; reservas: number } | null;
  actual: ReglaEnPantalla | null;
  guardado: { fase: FaseGratis; alumnas: number | null; reservas: number | null; excedidoDesde: string | null } | null;
  coincide: boolean | null;
  propuesta: (ReglaEnPantalla & { fuera: Array<{ nombre: string; motivo: MotivoFuera }> }) | null;
  grupoDifiere: boolean | null;
  ambiguo: string[];
  avisos: string[];
}

export interface ResumenGratis {
  /** Estudios con medición en seco ese día. */
  medidos: number;
  /** Lo medido y lo que tiene el gate dicen lo mismo. */
  coinciden: number;
  /** El gate no los tiene medidos; el barrido sí. */
  loMediriaElBarrido: number;
  /** El gate tiene cifras y lo medido dice otra fase o fecha. */
  difierenDelGate: number;
  enMargen: number;
  seCerrarian: number;
  ambiguos: number;
  gruposDistintos: number;
}

/** Una fila del informe diario, lo justo para comparar días. */
export interface FilaDiaria {
  studio_id: string;
  dia: string;
  estado: EstadoEstudio | 'ERROR';
}

export type Recuento = Record<EstadoEstudio | 'ERROR', number>;

export interface CambioDeEstado {
  dia: string;
  studioId: string;
  nombre: string;
  de: EstadoEstudio | 'ERROR' | null;
  a: EstadoEstudio | 'ERROR';
}

export interface RespuestaBajas {
  modo: ModoBajas;
  hoy: string;
  umbrales: { inactivo: number; suspendido: number };
  vivo: { recuento: Recuento; estudios: EstudioBajas[] };
  historial: { dias: Array<{ dia: string; recuento: Recuento }>; cambios: CambioDeEstado[] };
  /** El plan gratis medido en seco el día que se mira. */
  gratis: ResumenGratis;
  /** Lecturas que fallaron: lo que no se pudo leer no sale como cero. */
  noLeidos: string[];
}

export const ESTADOS_CON_ERROR = [...ESTADOS_ESTUDIO, 'ERROR'] as const;

export const ETIQUETA_ESTADO: Record<EstadoEstudio | 'ERROR', string> = {
  ACTIVO_PAGO: 'Paga',
  PAGO_PENDIENTE: 'Pago pendiente',
  GRATIS: 'Gratis',
  GRATIS_EN_MARGEN: 'Gratis, en margen',
  INACTIVO: 'Inactivo',
  SUSPENDIDO: 'Suspendido',
  EN_BAJA: 'En baja',
  ELIMINADO: 'Eliminado',
  ERROR: 'Error de cálculo',
};

/**
 * Los casos dudosos que apunta `situacion_estudio` (columna `avisos`), en
 * palabras. Un aviso nuevo en el SQL sin su frase aquí lo para un test.
 */
export const TEXTO_AVISO: Record<string, string> = {
  past_due_sin_plazo: 'pago en reintento: cuenta como que paga, sin plazo todavía',
  plan_de_cadena_a_mano: 'paga por el plan de su cadena, concedido a mano',
  plan_a_mano: 'plan concedido a mano',
  paga_con_baja_abierta: 'paga, pero tiene una baja o un borrado abierto',
  cadena_no_encontrada: 'su cadena no aparece',
  prueba_local: 'prueba local: con el plan gratis encendido pasa a gratis',
  pago_a_medias: 'pago a medias en Stripe',
  gratis_sin_medir: 'gratis sin medir: no se sabe si pasa del límite',
  demo_fuera_de_transiciones: 'demo: la falta de uso no la mueve',
  demo_es_sede_principal_por_antiguedad: 'demo y sede más antigua de su cadena: hoy sería la principal',
  suspendido_a_mano: 'suspendido a mano desde /interno',
  sin_marca_de_panel: 'aún sin marca de uso del panel',
  marca_panel_inicial_de_sesiones: 'el uso del panel sale aún de la última sesión del equipo, no de una marca',
  marca_posterior_al_dia: 'una marca de uso posterior al día (no cuenta)',
  vivo_solo_por_alumnas: 'lo único reciente es de alumnas (app o reservas)',
};

export function textoAviso(codigo: string): string {
  return TEXTO_AVISO[codigo] ?? (TEXTO_AVISO_GRATIS as Record<string, string>)[codigo] ?? codigo;
}

/** El registro del día (`estudio_situacion_diaria.gratis`) para la pantalla, con los estudios por su nombre. */
export function gratisParaPantalla(valor: unknown, nombres: ReadonlyMap<string, string>): GratisEnPantalla | null {
  const i: InformeGratis | null = comoInformeGratis(valor);
  if (!i) return null;
  const nombre = (id: string) => nombres.get(id) ?? id;
  const regla = (r: InformeGratis['actual']): ReglaEnPantalla | null => r && {
    alumnas: r.alumnas, reservas: r.reservas, fase: r.fase, excedidoDesde: r.excedido_desde, cierraEl: r.cierra_el, grupo: r.grupo.map(nombre),
  };
  return {
    medidoEn: i.medido_en,
    propio: i.propio,
    actual: regla(i.actual),
    guardado: i.guardado && { fase: i.guardado.fase, alumnas: i.guardado.alumnas, reservas: i.guardado.reservas, excedidoDesde: i.guardado.excedido_desde },
    coincide: i.coincide,
    propuesta: i.propuesta && { ...regla(i.propuesta)!, fuera: i.propuesta.fuera.map(f => ({ nombre: nombre(f.id), motivo: f.motivo })) },
    grupoDifiere: i.grupo_difiere,
    ambiguo: i.ambiguo,
    avisos: avisosDeGratis(i),
  };
}

/** El recuento del plan gratis medido en seco. */
export function resumenGratis(estudios: ReadonlyArray<Pick<EstudioBajas, 'gratis'>>): ResumenGratis {
  const r: ResumenGratis = { medidos: 0, coinciden: 0, loMediriaElBarrido: 0, difierenDelGate: 0, enMargen: 0, seCerrarian: 0, ambiguos: 0, gruposDistintos: 0 };
  for (const { gratis: g } of estudios) {
    if (!g) continue;
    r.medidos++;
    if (g.coincide === true) r.coinciden++;
    if (g.avisos.includes('gratis_lo_mediria_el_barrido')) r.loMediriaElBarrido++;
    if (g.avisos.includes('gratis_difiere_del_gate')) r.difierenDelGate++;
    if (g.actual?.fase === 'MARGEN') r.enMargen++;
    if (g.avisos.includes('gratis_se_cerraria')) r.seCerrarian++;
    if (g.ambiguo.length > 0) r.ambiguos++;
    if (g.grupoDifiere === true) r.gruposDistintos++;
  }
  return r;
}

export function recuentoVacio(): Recuento {
  return Object.fromEntries(ESTADOS_CON_ERROR.map(e => [e, 0])) as Recuento;
}

export function recuentoPorEstado(filas: ReadonlyArray<{ estado: EstadoEstudio | 'ERROR' }>): Recuento {
  const r = recuentoVacio();
  for (const f of filas) r[f.estado] = (r[f.estado] ?? 0) + 1;
  return r;
}

/** La previsión «si nadie hace nada»: solo para quien la falta de uso puede mover (gratis, no demo). */
export function prevision(f: Pick<FilaSituacionBd, 'estado' | 'es_demo' | 'dias_sin_actividad'>, hoy: string): Pick<EstudioBajas, 'entraInactivoEl' | 'entraSuspendidoEl'> {
  const puedeMoverse = !f.es_demo && (f.estado === 'GRATIS' || f.estado === 'GRATIS_EN_MARGEN' || f.estado === 'INACTIVO');
  if (!puedeMoverse) return { entraInactivoEl: null, entraSuspendidoEl: null };
  return {
    entraInactivoEl: f.estado === 'INACTIVO' ? null : masDias(hoy, Math.max(0, DIAS_HASTA_INACTIVO - f.dias_sin_actividad)),
    entraSuspendidoEl: masDias(hoy, Math.max(0, DIAS_HASTA_SUSPENDIDO - f.dias_sin_actividad)),
  };
}

export function estudioDesdeBd(f: FilaSituacionBd, nombre: string, hoy: string, gratis: GratisEnPantalla | null = null): EstudioBajas {
  return {
    id: f.studio_id,
    nombre,
    estado: f.estado,
    motivo: f.motivo,
    variante: f.variante,
    paga: f.paga,
    gestionLimitada: f.gestion_limitada,
    servicioAlumnasSuspendido: f.servicio_alumnas_suspendido,
    cobrosAutomaticosPausados: f.cobros_automaticos_pausados,
    esDemo: f.es_demo,
    suspendidoAMano: f.suspendido_a_mano,
    faseGratis: f.fase_gratis,
    ultimaActividad: f.ultima_actividad,
    ancla: f.ancla,
    diasDeCierre: f.dias_de_cierre,
    diasSinActividad: f.dias_sin_actividad,
    // Los del cálculo de hoy y los del plan gratis medido en seco ese día.
    avisos: [...new Set([...(f.avisos ?? []), ...(gratis?.avisos ?? [])])],
    ...prevision(f, hoy),
    gratis,
  };
}

/** El recuento de cada día del informe, del más antiguo al más reciente. */
export function evolucionPorDia(filas: readonly FilaDiaria[]): Array<{ dia: string; recuento: Recuento }> {
  const porDia = new Map<string, FilaDiaria[]>();
  for (const f of filas) porDia.set(f.dia, [...(porDia.get(f.dia) ?? []), f]);
  return [...porDia.keys()].sort().map(dia => ({ dia, recuento: recuentoPorEstado(porDia.get(dia)!) }));
}

/**
 * Los estudios cuyo estado cambia de un día del informe al siguiente con fila
 * (si faltan días en medio, se compara con el último que hubo). La primera fila
 * de un estudio no es un cambio, salvo que aparezca después del primer día del
 * informe: entonces es un estudio nuevo (`de: null`).
 */
export function cambiosEntreDias(filas: readonly FilaDiaria[], nombres: ReadonlyMap<string, string>): CambioDeEstado[] {
  const ordenadas = [...filas].sort((a, b) => (a.dia === b.dia ? a.studio_id.localeCompare(b.studio_id) : a.dia.localeCompare(b.dia)));
  const primerDia = ordenadas[0]?.dia ?? null;
  const ultimo = new Map<string, FilaDiaria>();
  const cambios: CambioDeEstado[] = [];
  for (const f of ordenadas) {
    const antes = ultimo.get(f.studio_id);
    if (antes ? antes.estado !== f.estado : f.dia !== primerDia) {
      cambios.push({ dia: f.dia, studioId: f.studio_id, nombre: nombres.get(f.studio_id) ?? f.studio_id, de: antes?.estado ?? null, a: f.estado });
    }
    ultimo.set(f.studio_id, f);
  }
  return cambios.sort((a, b) => (a.dia === b.dia ? a.nombre.localeCompare(b.nombre) : b.dia.localeCompare(a.dia)));
}

/** `?hoy=` de la pantalla: un día válido, como mucho dos años alrededor del de hoy. Si no, el de hoy. */
export function hoyPedido(valor: string | null, hoy: string): string {
  // `masDias(x, 0)` normaliza: un «31 de febrero» vuelve como otro día y no vale.
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || masDias(valor, 0) !== valor) return hoy;
  return valor >= masDias(hoy, -730) && valor <= masDias(hoy, 730) ? valor : hoy;
}
