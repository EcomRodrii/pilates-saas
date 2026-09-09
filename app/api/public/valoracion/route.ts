import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import {
  leerHistorialValoracion, guardarValoracionInicial,
  tieneConsentimientoSalud, registrarConsentimientoSaludSocia,
} from '@/lib/db/valoracion-inicial-admin';
import { VALORACION_VACIA, type Valoracion } from '@/lib/valoracion-inicial';
import { textoConsentimientoSalud } from '@/lib/student/valoracion-copy';

// La valoración inicial de la alumna, desde su propia app.
//
// SEGURIDAD, en el mismo orden en que se aplica:
//  1. Sesión real (JWT de Supabase Auth) — `verificarUsuarioSupabase`.
//  2. El `socioId` sale de ese token cruzado con el estudio
//     (`socioAutenticado`), NUNCA del cuerpo. Aceptarlo del body sería dejar
//     elegir de quién es la valoración que se lee o se escribe.
//  3. El estudio tiene que tenerlo activado (`valoracion_inicial_activa`).
//  4. La mitad de salud solo se toca con consentimiento vigente, comprobado
//     CONTRA LA BASE en cada petición — nunca con un flag del cliente.
//
// ⚠️ Este es el primer canal de escritura de dato de salud (RGPD art. 9) fuera
// de una sesión de personal en todo el repo. Por eso el consentimiento se
// comprueba aquí y no se hereda de la pantalla, y por eso sin él la valoración
// se guarda IGUAL, solo que sin su mitad clínica.

export const dynamic = 'force-dynamic';

async function socia(req: NextRequest, studioId: string) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return null;
  return socioAutenticado(user.userId, studioId);
}

/** ¿El estudio la tiene activada? */
async function estaActiva(studioId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data } = await admin.from('studios')
    .select('valoracion_inicial_activa').eq('id', studioId).maybeSingle();
  return Boolean(data?.valoracion_inicial_activa);
}

/** Para el texto del consentimiento, que se redacta con el nombre del estudio. */
async function nombreEstudio(studioId: string): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin) return 'tu estudio';
  const { data } = await admin.from('studios').select('nombre').eq('id', studioId).maybeSingle();
  return (data?.nombre as string | undefined) ?? 'tu estudio';
}

export async function GET(req: NextRequest) {
  // También el GET: dispara tres consultas, dos de ellas sobre la mitad
  // clínica. Más holgado que el POST porque la pantalla lo llama al montar y
  // la tarjeta de Inicio otra vez.
  const limited = await enforceRateLimit(req, 'public-valoracion-leer', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const studioId = req.nextUrl.searchParams.get('studioId') ?? '';
  if (!studioId) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });

  const socioId = await socia(req, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const [activa, conSalud] = await Promise.all([
      estaActiva(studioId), tieneConsentimientoSalud(socioId),
    ]);
    // Se responde con `activa: false` en vez de un 404: la pantalla necesita
    // saber que existe pero está apagada, para no ofrecer una entrada muerta.
    if (!activa) return NextResponse.json({ activa: false, conSalud: false, historial: null });

    // La socia SIEMPRE puede leer su propia mitad de salud: es suya. El gate de
    // rol de la RLS es para el personal, no para ella.
    const historial = await leerHistorialValoracion(studioId, socioId, true);
    return NextResponse.json({ activa: true, conSalud, historial });
  } catch (e) {
    return errorInterno('valoracion:leer', e, 'No hemos podido cargar tu valoración.');
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-valoracion', { max: 40, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    studioId?: string;
    accion?: 'guardar' | 'completar' | 'consentir-salud';
    valoracion?: Partial<Valoracion>;
  } | null;

  const studioId = body?.studioId ?? '';
  if (!studioId || !body?.accion) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });

  const socioId = await socia(req, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!(await estaActiva(studioId))) {
    return NextResponse.json({ error: 'Este estudio no tiene la valoración activada' }, { status: 403 });
  }

  try {
    if (body.accion === 'consentir-salud') {
      // ⚠️ El texto lo DERIVA el servidor, y antes llegaba en el cuerpo.
      //
      // Es la prueba legal de qué aceptó exactamente, y este repo decide la
      // vigencia de un consentimiento comparando el texto guardado con el
      // vigente (mismo mecanismo que `AceptacionContrato.versionTexto`). Con el
      // texto bajo control del navegador, esa comparación no probaba nada: la
      // traza legal del único canal de art. 9 abierto al público se
      // autocertificaba. Mismo criterio que `textoLegalCompleto(studioConfig)`
      // en las penalizaciones — se deriva en servidor y el campo del cliente,
      // si viene, se ignora.
      const nombre = await nombreEstudio(studioId);
      const r = await registrarConsentimientoSaludSocia(socioId, textoConsentimientoSalud(nombre));
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: 500 });
      return NextResponse.json({ ok: true, conSalud: true });
    }

    // ⚠️ El consentimiento se relee de la base AQUÍ, en cada escritura. No se
    // hereda de la petición anterior ni se acepta del cuerpo: entre que la
    // pantalla lo pidió y esto se ejecuta, pudo revocarse desde el panel.
    const conSalud = await tieneConsentimientoSalud(socioId);

    const r = await guardarValoracionInicial({
      studioId, socioId,
      // Lo que llegue se mezcla sobre la forma vacía y luego `normalizar` tira
      // lo que no está en el catálogo. Un cuerpo con campos de más no rompe;
      // un cuerpo con valores inventados no se guarda.
      valoracion: { ...VALORACION_VACIA, ...(body.valoracion ?? {}) } as Valoracion,
      completar: body.accion === 'completar',
      conSalud,
    });
    if ('error' in r) {
      return NextResponse.json({ error: r.error, falta: r.falta }, { status: r.falta ? 400 : 500 });
    }
    return NextResponse.json(r);
  } catch (e) {
    return errorInterno('valoracion:guardar', e, 'No hemos podido guardar tu valoración.');
  }
}
