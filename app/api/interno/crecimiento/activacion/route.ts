import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { hoyEnEstudio } from '@/lib/utils';
import { desdeDeLaConsulta, filaDesdeBd, resumirActivacion, type ExtraEmbudo, type FilaEmbudo } from '@/lib/alta/embudo';

// Activación de estudios nuevos: el embudo del alta y sus cohortes por semana
// (lib/alta/embudo.ts). `growth.read` («funnels de producto»), como las altas
// sin terminar; la puerta de /interno exige además el segundo factor (aal2).
//
// La RPC devuelve una fila por estudio, y de aquí solo sale el RESUMEN: ni ids,
// ni nombres, ni correos. Si la lectura falla se dice (500), nunca se pinta un
// cero: la pantalla enseña «Faltan datos».
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'growth.read');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const hoy = hoyEnEstudio(new Date());
  const { data, error } = await db.rpc('embudo_activacion_detalle', {
    p_desde: desdeDeLaConsulta(hoy),
    p_incluir_pruebas: false,
  });
  if (error || !Array.isArray(data)) {
    return NextResponse.json({ error: 'No se ha podido leer el embudo del alta' }, { status: 500 });
  }

  const filas = (data as unknown[]).map(filaDesdeBd).filter((f): f is FilaEmbudo => f !== null);
  const extras = await extrasDeHoy(db, filas.map(f => f.studioId).filter((x): x is string => !!x));
  return NextResponse.json(resumirActivacion(
    extras ? filas.map(f => (f.studioId && extras.has(f.studioId) ? { ...f, extra: extras.get(f.studioId) } : f)) : filas,
    hoy,
  ));
}

/**
 * Cómo está hoy cada estudio en Stripe y en alumnas. Si cualquier lectura falla
 * devuelve null y esos tres pasos salen «—»: un 0 inventado diría «nadie lo
 * tiene». Solo cifras, nunca ids ni correos hacia fuera.
 */
async function extrasDeHoy(db: NonNullable<ReturnType<typeof getSupabaseAdmin>>, ids: string[]): Promise<Map<string, ExtraEmbudo> | null> {
  if (ids.length === 0) return new Map();
  const [estudios, socios] = await Promise.all([
    db.from('studios').select('id, stripe_account_id').in('id', ids),
    // Una fila por ficha, sin los datos de la alumna: solo si hay cuenta en la app.
    db.from('socios').select('studio_id, auth_user_id').in('studio_id', ids).limit(20_000),
  ]);
  if (estudios.error || socios.error) return null;
  const fuera = new Map<string, ExtraEmbudo>();
  for (const e of (estudios.data ?? []) as { id: string; stripe_account_id: string | null }[]) {
    fuera.set(e.id, { conStripe: !!e.stripe_account_id, alumnasCargadas: 0, alumnasConCuenta: 0 });
  }
  for (const s of (socios.data ?? []) as { studio_id: string; auth_user_id: string | null }[]) {
    const x = fuera.get(s.studio_id);
    if (!x) continue;
    x.alumnasCargadas += 1;
    if (s.auth_user_id) x.alumnasConCuenta += 1;
  }
  return fuera;
}
