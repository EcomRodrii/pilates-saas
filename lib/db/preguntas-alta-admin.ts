import 'server-only';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  esTipoPregunta, preguntasPendientes, validarRespuestas,
  type PreguntaAlta, type ValorRespuesta,
} from '@/lib/preguntas-alta';

// Lectura y escritura de las preguntas de alta con el cliente de servicio.
//
// ⚠️ La alumna NO puede leer `campos_personalizados` con su sesión: su RLS es
// solo para el personal del estudio (migr 20260913214150). Tampoco escribe
// `socios.campos_extra` directamente. Todo pasa por aquí, con la socia ya
// resuelta desde su JWT (`socioAutenticado`), nunca desde el cuerpo.

export interface EstadoPreguntasAlta {
  /** El estudio tiene encendido «Preguntar los datos extra en su app». */
  activa: boolean;
  /** Todas las preguntas activas, en el orden del estudio. */
  preguntas: PreguntaAlta[];
  /** Las que le faltan; si hay alguna, la app no la deja seguir. */
  pendientes: string[];
  /** Lo que ya tiene guardado, solo de estas preguntas (para rellenar el formulario). */
  respuestas: Record<string, ValorRespuesta>;
}

const APAGADO: EstadoPreguntasAlta = { activa: false, preguntas: [], pendientes: [], respuestas: {} };

async function preguntasDelEstudio(admin: SupabaseClient, studioId: string): Promise<{ activa: boolean; preguntas: PreguntaAlta[] }> {
  const { data: studio, error: eStudio } = await admin
    .from('studios').select('preguntas_alta_activas').eq('id', studioId).maybeSingle();
  if (eStudio) throw eStudio;
  if (studio?.preguntas_alta_activas !== true) return { activa: false, preguntas: [] };

  const { data, error } = await admin
    .from('campos_personalizados')
    .select('id, etiqueta, tipo, opciones, requerido, orden')
    .eq('studio_id', studioId).eq('activo', true)
    .order('orden', { ascending: true });
  if (error) throw error;
  const preguntas = (data ?? [])
    .filter(r => esTipoPregunta(r.tipo))
    .map(r => ({
      id: r.id as string,
      etiqueta: r.etiqueta as string,
      tipo: r.tipo as PreguntaAlta['tipo'],
      opciones: (r.opciones as string[] | null) ?? [],
      requerido: r.requerido === true,
    }));
  return { activa: true, preguntas };
}

async function extraDeLaSocia(admin: SupabaseClient, studioId: string, socioId: string): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from('socios').select('campos_extra').eq('id', socioId).eq('studio_id', studioId).maybeSingle();
  if (error) throw error;
  const extra = data?.campos_extra;
  return extra && typeof extra === 'object' && !Array.isArray(extra) ? extra as Record<string, unknown> : {};
}

export async function leerPreguntasAlta(admin: SupabaseClient, studioId: string, socioId: string): Promise<EstadoPreguntasAlta> {
  const { activa, preguntas } = await preguntasDelEstudio(admin, studioId);
  if (!activa || preguntas.length === 0) return { ...APAGADO, activa };
  const extra = await extraDeLaSocia(admin, studioId, socioId);
  const respuestas: Record<string, ValorRespuesta> = {};
  for (const p of preguntas) {
    const v = extra[p.id];
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') respuestas[p.id] = v;
  }
  return { activa, preguntas, pendientes: preguntasPendientes(preguntas, extra).map(p => p.id), respuestas };
}

/**
 * ¿Le falta contestar algo? Para las puertas de reservar y comprar: con el
 * interruptor apagado o sin preguntas, nunca bloquea.
 */
export async function faltanPreguntasAlta(admin: SupabaseClient, studioId: string, socioId: string): Promise<boolean> {
  const { pendientes } = await leerPreguntasAlta(admin, studioId, socioId);
  return pendientes.length > 0;
}

export type ResultadoGuardarRespuestas =
  | { ok: true; estado: EstadoPreguntasAlta }
  | { ok: false; status: number; error: string; errores?: Record<string, string> };

/**
 * Guarda sus respuestas en `socios.campos_extra`, mezcladas con lo que ya
 * hubiera (lo que rellenó el mostrador en otras preguntas no se toca).
 *
 * Se validan contra las preguntas de HOY: si el estudio cambió una opción
 * mientras ella rellenaba, se le dice en esa pregunta en vez de guardar un valor
 * que ya no existe.
 */
export async function guardarRespuestasAlta(
  admin: SupabaseClient, studioId: string, socioId: string, entrada: Record<string, unknown>,
): Promise<ResultadoGuardarRespuestas> {
  const { activa, preguntas } = await preguntasDelEstudio(admin, studioId);
  if (!activa) return { ok: false, status: 409, error: 'El estudio ya no pide estas preguntas.' };
  const r = validarRespuestas(preguntas, entrada);
  if (!r.ok) return { ok: false, status: 400, error: 'Revisa las respuestas marcadas.', errores: r.errores };

  const extra = await extraDeLaSocia(admin, studioId, socioId);
  const { error } = await admin
    .from('socios').update({ campos_extra: { ...extra, ...r.valores } })
    .eq('id', socioId).eq('studio_id', studioId);
  if (error) throw error;
  // Se relee en vez de suponer: lo que la app ve después es lo que quedó guardado.
  return { ok: true, estado: await leerPreguntasAlta(admin, studioId, socioId) };
}

/** Código estable del rechazo: la app lo traduce a «abre las preguntas», no a un error. */
export const CODIGO_FALTAN_PREGUNTAS = 'faltan-preguntas';

/**
 * La puerta de las rutas que CREAN algo nuevo para la alumna (reservar una
 * clase, comprar un plan): si el estudio pide sus preguntas y le falta alguna,
 * no se hace. La app ya la para antes, así que esto es la cerradura para quien
 * llegue por otro sitio (la página de reservas, el widget, una pestaña vieja).
 *
 * No se aplica a pagar un recibo que ya debe ni a cancelar: eso no es empezar
 * nada, y bloquearlo la dejaría atrapada.
 *
 * Fail-OPEN si la comprobación misma falla: es una regla del estudio, no de
 * seguridad, y un parpadeo de la base no puede dejar sin reservar a nadie. Se
 * reporta para que se vea.
 */
export async function bloqueoPorPreguntasAlta(
  studioId: string, socioId: string, que: 'reservar' | 'comprar',
): Promise<NextResponse | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    if (!(await faltanPreguntasAlta(admin, studioId, socioId))) return null;
  } catch (err) {
    Sentry.captureException(err, { tags: { area: 'preguntas-alta' }, extra: { studioId } });
    return null;
  }
  return NextResponse.json({
    error: `Antes de ${que} tienes que contestar unas preguntas del estudio. Te salen al abrir la app del estudio.`,
    codigo: CODIGO_FALTAN_PREGUNTAS,
  }, { status: 409 });
}
