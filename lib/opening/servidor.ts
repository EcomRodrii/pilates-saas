import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import type { EstadoSuscripcion, TipoPlan } from '../types.ts';
import { estadoCobroCuenta } from '../billing/cuenta-puede-cobrar.ts';
import { ventanaListo, type DatosListo } from './listo.ts';
import { cargarGrupoAperturaSuave } from './apertura-suave.ts';
import { hoyEnEstudio } from '../utils.ts';
import {
  analizarCapacidad, CONFIG_OPENING_DEFECTO,
  type AnalisisCapacidad, type AsistidaDemanda, type ConfigOpening, type PlanDemanda, type SuscripcionDemanda,
} from './capacidad.ts';
import type { AlCompletar, EtapaVista, TipoEtapa } from './etapas.ts';
import type { AlertaApertura } from './alertas.ts';
import { leerRespuestas, type RespuestasOnboarding } from './onboarding.ts';

// Cargas de Opening OS con cliente service-role, compartidas por la API de la
// home y el cron de alertas. ⚠️ La RLS no filtra: quien llama ya ha decidido
// que puede, y TODA consulta va acotada a `studioId`. Lanzan en error.

const DIAS_HISTORIAL_ASISTENCIA = 90;
const PAGINA = 1000;
const DIA = 86_400_000;

export interface ConfigCompleta extends ConfigOpening { objetivoPreventa: number }

export function configDesdeFila(f: Record<string, unknown> | null): ConfigCompleta {
  if (!f) return { ...CONFIG_OPENING_DEFECTO, objetivoPreventa: 0.4 };
  return {
    umbralAmarillo: Number(f.umbral_amarillo),
    umbralRojo: Number(f.umbral_rojo),
    conversionLeads: Number(f.conversion_leads),
    ventanaAnalisisDias: Number(f.ventana_analisis_dias),
    sesionesSemanaSinTope: Number(f.sesiones_semana_sin_tope),
    semanasBonoSinCaducidad: Number(f.semanas_bono_sin_caducidad),
    objetivoPreventa: Number(f.objetivo_preventa),
  };
}

export interface EstadoAperturaServidor {
  fechaApertura: string | null;
  fase: string | null;
  estudioCreadoEn: string | null;
  tieneAsistencias: boolean;
  config: ConfigCompleta;
  /** null = onboarding sin hacer (o guardado a medias). */
  respuestas: RespuestasOnboarding | null;
}

export async function cargarEstadoApertura(admin: SupabaseClient, studioId: string): Promise<EstadoAperturaServidor | null> {
  const [studioR, progresoR, configR, asistenciaR] = await Promise.all([
    admin.from('studios').select('fecha_apertura, creado_en').eq('id', studioId).maybeSingle(),
    admin.from('opening_progreso').select('fase, objetivos').eq('studio_id', studioId).maybeSingle(),
    admin.from('opening_config').select('*').eq('studio_id', studioId).maybeSingle(),
    admin.from('reservas').select('id').eq('studio_id', studioId).eq('estado', 'ASISTIDA').limit(1),
  ]);
  const error = studioR.error ?? progresoR.error ?? configR.error ?? asistenciaR.error;
  if (error) throw error;
  if (!studioR.data) return null;
  return {
    fechaApertura: (studioR.data.fecha_apertura as string | null) ?? null,
    fase: (progresoR.data?.fase as string | undefined) ?? null,
    estudioCreadoEn: (studioR.data.creado_en as string | null) ?? null,
    tieneAsistencias: (asistenciaR.data?.length ?? 0) > 0,
    config: configDesdeFila(configR.data),
    respuestas: leerRespuestas(progresoR.data?.objetivos),
  };
}

export async function cargarAnalisis(
  admin: SupabaseClient, studioId: string, config: ConfigOpening, now: Date,
): Promise<AnalisisCapacidad> {
  const hasta = new Date(now.getTime() + config.ventanaAnalisisDias * DIA).toISOString();
  const [sesionesR, suscripcionesR, planesR, leadsR] = await Promise.all([
    admin.from('sesiones').select('inicio, aforo_maximo, cancelada')
      .eq('studio_id', studioId).gte('inicio', now.toISOString()).lt('inicio', hasta).limit(5000),
    admin.from('suscripciones').select('socio_id, plan_id, estado, fecha_fin, sesiones_restantes')
      .eq('studio_id', studioId).eq('estado', 'ACTIVA').limit(5000),
    admin.from('planes_tarifa').select('id, tipo, sesiones, limite_semanal, validez_dias').eq('studio_id', studioId),
    admin.from('socios').select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).is('borrado_en', null).in('lead_stage', ['LEAD', 'INTERESADA']),
  ]);
  const error = sesionesR.error ?? suscripcionesR.error ?? planesR.error ?? leadsR.error;
  if (error) throw error;

  const suscripciones: SuscripcionDemanda[] = (suscripcionesR.data ?? []).map(s => ({
    socioId: s.socio_id as string,
    planId: s.plan_id as string,
    estado: s.estado as EstadoSuscripcion,
    fechaFin: (s.fecha_fin as string | null) ?? null,
    sesionesRestantes: (s.sesiones_restantes as number | null) ?? null,
  }));

  // Asistencias solo de las socias con cuota activa, paginadas: PostgREST corta
  // en 1000 filas y un corte silencioso bajaría la frecuencia observada.
  const socioIds = [...new Set(suscripciones.map(s => s.socioId))];
  const asistidasPorSocio = new Map<string, AsistidaDemanda[]>();
  if (socioIds.length > 0) {
    const desde = new Date(now.getTime() - DIAS_HISTORIAL_ASISTENCIA * DIA).toISOString();
    for (let desdeFila = 0; ; desdeFila += PAGINA) {
      const { data, error: e } = await admin.from('reservas').select('socio_id, creado_en')
        .eq('studio_id', studioId).eq('estado', 'ASISTIDA').in('socio_id', socioIds)
        .gte('creado_en', desde).order('creado_en', { ascending: false })
        .range(desdeFila, desdeFila + PAGINA - 1);
      if (e) throw e;
      for (const r of data ?? []) {
        const lista = asistidasPorSocio.get(r.socio_id as string) ?? [];
        lista.push({ creadoEn: r.creado_en as string });
        asistidasPorSocio.set(r.socio_id as string, lista);
      }
      if (!data || data.length < PAGINA) break;
    }
  }

  return analizarCapacidad({
    sesiones: (sesionesR.data ?? []).map(s => ({
      inicio: s.inicio as string, aforoMaximo: Number(s.aforo_maximo), cancelada: Boolean(s.cancelada),
    })),
    suscripciones,
    planes: (planesR.data ?? []).map(p => ({
      id: p.id as string,
      tipo: p.tipo as TipoPlan,
      sesiones: (p.sesiones as number | null) ?? null,
      limiteSemanal: (p.limite_semanal as number | null) ?? null,
      validezDias: (p.validez_dias as number | null) ?? null,
    }) satisfies PlanDemanda),
    leads: leadsR.count ?? 0,
    asistidasPorSocio,
    config,
    now,
  });
}

export interface PlanVenta { id: string; nombre: string; tipo: string; precio: number; activo: boolean }

// fecha_fin es exclusiva (medianoche del día siguiente): el último día es 1 ms antes.
const diaEstudio = (iso: string, exclusivo = false) =>
  hoyEnEstudio(new Date(new Date(iso).getTime() - (exclusivo ? 1 : 0)));

export async function cargarEtapas(admin: SupabaseClient, studioId: string): Promise<{ etapas: EtapaVista[]; planes: PlanVenta[] }> {
  const [etapasR, planesR] = await Promise.all([
    admin.from('launch_stages')
      .select('id, etapa, plan_id, fecha_inicio, fecha_fin, limite_plazas, al_completar, estado, cerrada_motivo')
      .eq('studio_id', studioId).order('fecha_inicio', { ascending: true }),
    admin.from('planes_tarifa').select('id, nombre, tipo, precio, activo').eq('studio_id', studioId),
  ]);
  if (etapasR.error) throw etapasR.error;
  if (planesR.error) throw planesR.error;

  const planes: PlanVenta[] = (planesR.data ?? []).map(p => ({
    id: p.id as string, nombre: p.nombre as string, tipo: p.tipo as string, precio: Number(p.precio), activo: Boolean(p.activo),
  }));
  const nombrePlan = new Map(planes.map(p => [p.id, p.nombre]));
  const ventas = await Promise.all((etapasR.data ?? []).map(async e => {
    const r = await admin.rpc('opening_ventas_etapa', { p_stage_id: e.id });
    if (r.error) throw r.error;
    return Number(r.data ?? 0);
  }));

  const etapas: EtapaVista[] = (etapasR.data ?? []).map((e, i) => ({
    id: e.id as string,
    etapa: e.etapa as TipoEtapa,
    planId: (e.plan_id as string | null) ?? null,
    planNombre: e.plan_id ? nombrePlan.get(e.plan_id as string) ?? null : null,
    desde: diaEstudio(e.fecha_inicio as string),
    hasta: diaEstudio(e.fecha_fin as string, true),
    limitePlazas: (e.limite_plazas as number | null) ?? null,
    alCompletar: e.al_completar as AlCompletar,
    cerrada: e.estado === 'CERRADA',
    cerradaMotivo: (e.cerrada_motivo as 'CUPO' | 'FECHA' | null) ?? null,
    ventas: ventas[i],
  }));
  return { etapas, planes };
}

/** Tope para la lectura de Stripe desde la home: si no contesta, «sin comprobar». */
const TIMEOUT_STRIPE_MS = 2500;

function stripeServidor(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) return null;
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
}

/** Lo que necesita evaluarListo, leído de las mismas tablas que usan checkout, reservas y facturas. */
export async function cargarDatosListo(
  admin: SupabaseClient, studioId: string, fechaApertura: string | null, now: Date,
): Promise<DatosListo> {
  const { desde, hasta } = ventanaListo(fechaApertura, now);
  const [studioR, sesionesR, planesR] = await Promise.all([
    admin.from('studios')
      .select('slug, stripe_account_id, reserva_exigir_plan, reserva_antelacion_maxima_dias, nif, razon_social, direccion, codigo_postal, ciudad, apertura_suave')
      .eq('id', studioId).maybeSingle(),
    admin.from('sesiones').select('inicio, cancelada, tipo_clase_id, instructor_id, aforo_maximo')
      .eq('studio_id', studioId).gte('inicio', desde.toISOString()).lt('inicio', hasta.toISOString()).limit(2000),
    admin.from('planes_tarifa').select('id, activo, precio').eq('studio_id', studioId),
  ]);
  const error = studioR.error ?? sesionesR.error ?? planesR.error;
  if (error) throw error;
  const s = studioR.data ?? {} as Record<string, unknown>;

  const planes = (planesR.data ?? []).map(p => ({ id: p.id as string, activo: Boolean(p.activo), precio: Number(p.precio) }));
  const vendibles = planes.filter(p => p.activo && p.precio > 0).map(p => p.id);
  const tiposPorPlan: Record<string, string[]> = {};
  if (vendibles.length > 0) {
    const { data, error: e } = await admin.from('plan_tipos_clase').select('plan_id, tipo_clase_id').in('plan_id', vendibles);
    if (e) throw e;
    for (const t of data ?? []) (tiposPorPlan[t.plan_id as string] ??= []).push(t.tipo_clase_id as string);
  }

  const cuenta = (s.stripe_account_id as string | null) ?? null;
  const stripe = cuenta ? stripeServidor() : null;
  const estadoStripe: DatosListo['stripe'] = !cuenta ? 'SIN_CUENTA'
    : !stripe ? 'SIN_RESPUESTA'
    : await estadoCobroCuenta(stripe, cuenta, { timeoutMs: TIMEOUT_STRIPE_MS });

  return {
    sesiones: (sesionesR.data ?? []).map(x => ({
      inicio: x.inicio as string,
      cancelada: Boolean(x.cancelada),
      tipoClaseId: (x.tipo_clase_id as string | null) ?? null,
      instructorId: (x.instructor_id as string | null) ?? null,
      aforoMaximo: Number(x.aforo_maximo ?? 0),
    })),
    slug: (s.slug as string | null) ?? null,
    // Mismo defecto que la política de reservas: sin valor, se exige plan.
    exigirPlan: (s.reserva_exigir_plan as boolean | null) ?? true,
    planes,
    tiposPorPlan,
    stripe: estadoStripe,
    fiscal: {
      nif: (s.nif as string | null) ?? null,
      razonSocial: (s.razon_social as string | null) ?? null,
      direccion: (s.direccion as string | null) ?? null,
      codigoPostal: (s.codigo_postal as string | null) ?? null,
      ciudad: (s.ciudad as string | null) ?? null,
    },
    antelacionMaximaDias: (s.reserva_antelacion_maxima_dias as number | null) ?? null,
    aperturaSuaveSinGrupo: s.apertura_suave === true && fechaApertura !== null
      && await (async () => {
        const g = await cargarGrupoAperturaSuave(admin, studioId);
        return g.fundadoras === 0 && g.invitadas.length === 0;
      })(),
  };
}

export interface AlertaGuardada extends AlertaApertura { id: string; creadaEn: string }

export const PREFIJO_CUPO_SUPERADO = 'CUPO_SUPERADO:';
const DIAS_AVISO_CUPO = 7;

export async function cargarAlertasAbiertas(admin: SupabaseClient, studioId: string): Promise<AlertaGuardada[]> {
  const { data, error } = await admin.from('alertas_opening')
    .select('id, tipo, severidad, titulo, descripcion, datos, created_at')
    .eq('studio_id', studioId).is('resuelta_en', null).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(a => ({
    id: a.id as string,
    tipo: a.tipo as string,
    severidad: a.severidad as AlertaApertura['severidad'],
    titulo: a.titulo as string,
    descripcion: (a.descripcion as string | null) ?? '',
    href: ((a.datos as { href?: string } | null)?.href) ?? '/dashboard',
    creadaEn: a.created_at as string,
  }));
}

/**
 * Deja en alertas_opening exactamente las detectadas: abre las nuevas y
 * resuelve las que ya no se cumplen. Con `abrirNuevas: false` solo resuelve
 * (la home): abrir y notificar es cosa del cron, para que abrir la home antes
 * de que pase no deje a la propietaria sin su aviso. Devuelve las que se han ABIERTO ahora
 * (las únicas que merecen notificación). Idempotente: el índice único de
 * alertas abiertas por (studio_id, tipo) hace que repetir no duplique.
 */
export async function sincronizarAlertas(
  admin: SupabaseClient, studioId: string, detectadas: AlertaApertura[], now: Date,
  opciones: { abrirNuevas: boolean } = { abrirNuevas: true },
): Promise<AlertaApertura[]> {
  const abiertas = await cargarAlertasAbiertas(admin, studioId);
  const tiposDetectados = new Set(detectadas.map(a => a.tipo));
  const tiposAbiertos = new Set(abiertas.map(a => a.tipo));

  // Los avisos de cupo superado los crea la BD (migr 20260921195853), no
  // detectarAlertas: si se resolvieran por «no detectado», desaparecerían en
  // cuanto la propietaria abriera Inicio. Se resuelven solos a los 7 días.
  const esDeLaBD = (tipo: string) => tipo.startsWith(PREFIJO_CUPO_SUPERADO);
  const caducado = (creadaEn: string) => now.getTime() - new Date(creadaEn).getTime() > DIAS_AVISO_CUPO * 86_400_000;
  const aResolver = abiertas
    .filter(a => esDeLaBD(a.tipo) ? caducado(a.creadaEn) : !tiposDetectados.has(a.tipo))
    .map(a => a.id);
  if (aResolver.length > 0) {
    const { error } = await admin.from('alertas_opening')
      .update({ resuelta_en: now.toISOString() }).eq('studio_id', studioId).in('id', aResolver);
    if (error) throw error;
  }

  const nuevas: AlertaApertura[] = [];
  if (!opciones.abrirNuevas) return nuevas;
  for (const a of detectadas.filter(d => !tiposAbiertos.has(d.tipo))) {
    const { error } = await admin.from('alertas_opening').insert({
      studio_id: studioId, tipo: a.tipo, severidad: a.severidad, titulo: a.titulo,
      descripcion: a.descripcion, datos: { href: a.href },
    });
    if (error?.code === '23505') continue; // otra pasada la abrió a la vez
    if (error) throw error;
    nuevas.push(a);
  }
  return nuevas;
}
