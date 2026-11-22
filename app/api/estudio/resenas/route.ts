import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { hoyEnEstudio, masDias } from '@/lib/utils';
import { LIMITES_PREMIO, PREFIJO_CODIGO_PREMIO_RESENA, validarAjustesResenas, type AjustesResenas } from '@/lib/valoraciones/premio';

// «Reseñas y premio» (Configuración → Cómo me comunico): el enlace de reseñas del
// estudio y el código que se regala a quien valora una clase en Tentare. Solo la
// propietaria, como el resto de esa sección (Marketing está desactivado y recepción
// y gerencia no ven Configuración).
//
// Con service-role y filtrando SIEMPRE por el estudio de la sesión. La base lo
// vuelve a exigir con CHECK (https, topes del premio): ver la migración
// 20261122004106. Ninguna columna se acepta fuera de las de aquí.

export const dynamic = 'force-dynamic';

async function acceso(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (sesion.rol !== 'PROPIETARIO') {
    return { error: NextResponse.json({ error: 'Solo la propietaria puede cambiar esto' }, { status: 403 }) };
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }) };
  return { sesion, admin };
}

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function leer(admin: Admin, studioId: string) {
  const { data, error } = await admin.from('studios')
    .select('slug, resena_enlace, resena_premio_tipo, resena_premio_valor, resena_premio_dias').eq('id', studioId).single();
  if (error || !data) throw error ?? new Error('Estudio no encontrado');

  // Cuántos premios se han regalado y cuántos se han canjeado (solo cifras, nunca a quién).
  const premios = () => admin.from('codigos_descuento').select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId).like('codigo', `${PREFIJO_CODIGO_PREMIO_RESENA}%`);
  // El embudo de los últimos 30 días (hora de Madrid): solo cifras, nunca a quién.
  const hoy = hoyEnEstudio();
  const desdeDia = masDias(hoy, -30);
  const desdeInstante = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ count: regalados }, { count: canjeados }, { count: valoraciones }, { count: mostrados }, { data: clics }] = await Promise.all([
    premios(),
    premios().gte('usos', 1),
    admin.from('valoraciones').select('id', { count: 'exact', head: true }).eq('studio_id', studioId).gte('creado_en', desdeInstante),
    admin.from('socios').select('id', { count: 'exact', head: true }).eq('studio_id', studioId).gte('resena_pedida_en', desdeInstante),
    admin.from('resenas_clics').select('origen, n').eq('studio_id', studioId).gte('dia', desdeDia),
  ]);
  const clicsDe = (origen: 'app' | 'qr') => ((clics ?? []) as { origen: string; n: number }[]).filter(c => c.origen === origen).reduce((t, c) => t + (c.n ?? 0), 0);

  const ajustes: AjustesResenas = {
    enlace: (data.resena_enlace as string | null) ?? null,
    premioTipo: (data.resena_premio_tipo as AjustesResenas['premioTipo']) ?? null,
    premioValor: data.resena_premio_valor == null ? null : Number(data.resena_premio_valor),
    premioDias: Number(data.resena_premio_dias ?? LIMITES_PREMIO.dias.porDefecto),
  };
  return {
    ajustes,
    regalados: regalados ?? 0,
    canjeados: canjeados ?? 0,
    slug: (data.slug as string | null) ?? null,
    embudo: { valoraciones: valoraciones ?? 0, mostrados: mostrados ?? 0, clicsApp: clicsDe('app'), clicsQr: clicsDe('qr') },
  };
}

export async function GET(req: NextRequest) {
  const g = await acceso(req);
  if ('error' in g) return g.error;
  try {
    return NextResponse.json(await leer(g.admin, g.sesion.studioId));
  } catch (err) {
    return errorInterno('estudio/resenas:GET', err, 'No se han podido leer los ajustes.');
  }
}

export async function PUT(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'estudio-resenas', { max: 20, windowSeconds: 60 });
  if (limited) return limited;
  const g = await acceso(req);
  if ('error' in g) return g.error;

  const body = await req.json().catch(() => null);
  const v = validarAjustesResenas(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const { error } = await g.admin.from('studios').update({
    resena_enlace: v.ajustes.enlace,
    resena_premio_tipo: v.ajustes.premioTipo,
    resena_premio_valor: v.ajustes.premioValor,
    resena_premio_dias: v.ajustes.premioDias,
  }).eq('id', g.sesion.studioId);
  if (error) return errorInterno('estudio/resenas:PUT', error, 'No se ha podido guardar. Inténtalo de nuevo.');

  try {
    return NextResponse.json(await leer(g.admin, g.sesion.studioId));
  } catch (err) {
    return errorInterno('estudio/resenas:PUT', err, 'Se ha guardado, pero no se ha podido releer.');
  }
}
