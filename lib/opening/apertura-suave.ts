import type { SupabaseClient } from '@supabase/supabase-js';
import { bloqueadaPorAperturaSuave, ETIQUETA_APERTURA_SUAVE } from '../booking-logic.ts';
import { inicioDelDiaEstudio } from '../utils.ts';
import { MENSAJE_APERTURA_SUAVE } from './apertura-suave-texto.ts';

// Apertura suave: única lectura de «¿esta clase está cerrada a esta socia?».
// La usan crearReservaPublica (web, widget, app de la alumna, OAuth) y el
// checkout embebido antes de cobrar; el mostrador no pasa por aquí a propósito.
// Cliente service-role: toda consulta va acotada a `studioId`.

export { MENSAJE_APERTURA_SUAVE };

export interface AperturaSuaveEstudio { activa: boolean; fechaApertura: string | null }

export async function cargarAperturaSuave(admin: SupabaseClient, studioId: string): Promise<AperturaSuaveEstudio> {
  const { data, error } = await admin.from('studios').select('apertura_suave, fecha_apertura').eq('id', studioId).maybeSingle();
  if (error) throw error;
  return { activa: Boolean(data?.apertura_suave), fechaApertura: (data?.fecha_apertura as string | null) ?? null };
}

/** Planes que vende alguna etapa de lanzamiento del estudio: quien los tiene, es fundadora. */
export async function planesDeEtapa(admin: SupabaseClient, studioId: string): Promise<Set<string>> {
  const { data, error } = await admin.from('launch_stages').select('plan_id').eq('studio_id', studioId).not('plan_id', 'is', null);
  if (error) throw error;
  return new Set((data ?? []).map(e => e.plan_id as string));
}

/** ¿Está la socia en el grupo? Etiqueta de invitada o una cuota ACTIVA de un plan de etapa. */
export async function estaEnGrupoAperturaSuave(admin: SupabaseClient, studioId: string, socioId: string | null): Promise<boolean> {
  if (!socioId) return false;
  const [socioR, planes] = await Promise.all([
    admin.from('socios').select('tags').eq('id', socioId).eq('studio_id', studioId).maybeSingle(),
    planesDeEtapa(admin, studioId),
  ]);
  if (socioR.error) throw socioR.error;
  if (((socioR.data?.tags as string[] | null) ?? []).includes(ETIQUETA_APERTURA_SUAVE)) return true;
  if (planes.size === 0) return false;
  const { data, error } = await admin.from('suscripciones').select('id')
    .eq('studio_id', studioId).eq('socio_id', socioId).eq('estado', 'ACTIVA').in('plan_id', [...planes]).limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * null si la clase se puede reservar; si no, la fecha de apertura (para el
 * mensaje). `planQueCompra`: en el checkout, comprar un plan de etapa ya te mete
 * en el grupo, así que no se le cierra la clase a quien está pagando para entrar.
 */
export async function cierreAperturaSuave(
  admin: SupabaseClient, studioId: string, socioId: string | null, inicioClaseISO: string,
  opciones: { planQueCompra?: string } = {},
): Promise<string | null> {
  const { activa, fechaApertura } = await cargarAperturaSuave(admin, studioId);
  if (!activa || !fechaApertura) return null;
  const inicioApertura = inicioDelDiaEstudio(fechaApertura);
  // Barato primero: si la clase ya es de después de abrir, no hace falta mirar a la socia.
  if (!bloqueadaPorAperturaSuave(inicioClaseISO, inicioApertura, true, false)) return null;
  if (opciones.planQueCompra && (await planesDeEtapa(admin, studioId)).has(opciones.planQueCompra)) return null;
  return (await estaEnGrupoAperturaSuave(admin, studioId, socioId)) ? null : fechaApertura;
}

export interface GrupoAperturaSuave {
  /** Socias con una cuota ACTIVA de un plan de etapa (sin repetir). */
  fundadoras: number;
  invitadas: { id: string; nombre: string }[];
}

/** Quién forma hoy el grupo, para enseñárselo al estudio en la tarjeta de apertura. */
export async function cargarGrupoAperturaSuave(admin: SupabaseClient, studioId: string): Promise<GrupoAperturaSuave> {
  const planes = await planesDeEtapa(admin, studioId);
  const [susR, invR] = await Promise.all([
    planes.size === 0 ? Promise.resolve({ data: [], error: null })
      : admin.from('suscripciones').select('socio_id')
        .eq('studio_id', studioId).eq('estado', 'ACTIVA').in('plan_id', [...planes]).limit(5000),
    admin.from('socios').select('id, nombre, apellidos')
      .eq('studio_id', studioId).is('borrado_en', null).contains('tags', [ETIQUETA_APERTURA_SUAVE])
      .order('nombre', { ascending: true }).limit(500),
  ]);
  if (susR.error) throw susR.error;
  if (invR.error) throw invR.error;
  return {
    fundadoras: new Set((susR.data ?? []).map(s => (s as { socio_id: string }).socio_id)).size,
    invitadas: (invR.data ?? []).map(x => ({
      id: x.id as string,
      nombre: [x.nombre, x.apellidos].filter(Boolean).join(' ') || 'Sin nombre',
    })),
  };
}

/**
 * Añade o quita la etiqueta de invitada. Lee y reescribe `tags` entero (es un
 * array): con dos personas editando a la vez gana la última, igual que en la
 * ficha de la clienta. false si la socia no es de este estudio.
 */
export async function marcarInvitada(admin: SupabaseClient, studioId: string, socioId: string, invitada: boolean): Promise<boolean> {
  const { data, error } = await admin.from('socios').select('tags')
    .eq('id', socioId).eq('studio_id', studioId).is('borrado_en', null).maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const actuales = ((data.tags as string[] | null) ?? []).filter(t => t !== ETIQUETA_APERTURA_SUAVE);
  const tags = invitada ? [...actuales, ETIQUETA_APERTURA_SUAVE] : actuales;
  const { error: e } = await admin.from('socios').update({ tags }).eq('id', socioId).eq('studio_id', studioId);
  if (e) throw e;
  return true;
}
