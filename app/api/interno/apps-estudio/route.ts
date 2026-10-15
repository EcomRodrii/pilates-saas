import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { tieneFeature } from '@/lib/billing/entitlements';
import { esEstadoApp, type EstadoApp } from '@/lib/app-nativa/pedir-app';
import { columnasDeCambio, leerCambio, ordenCola } from '@/lib/interno/apps-estudio';

export const runtime = 'nodejs';

// La cola de «Pedir mi app» (/interno → Apps de estudio): qué estudios han pedido su app de la
// App Store y en qué punto va cada una. Quien tramita mueve el estado, pone el enlace de la
// tienda cuando está publicada y, ÚNICAMENTE desde aquí, activa la app (`activa`): lo que cambia
// qué abre la app instalada y el fichero de enlaces universales.
//
// Corre con service-role: leer exige `studios.read`, escribir `studios.update`, y cada escritura
// se audita con el antes y el después.

type Fila = {
  studio_id: string; bundle_id: string; nombre_app: string; activa: boolean; estado: string;
  pedida_en: string | null; url_tienda: string | null; nota_interna: string | null;
  studios: { nombre: string | null; slug: string | null; plan: string | null; subscription_status: string | null; es_demo: boolean | null } | null;
};

const COLUMNAS = 'studio_id, bundle_id, nombre_app, activa, estado, pedida_en, url_tienda, nota_interna, studios!inner(nombre, slug, plan, subscription_status, es_demo)';

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'studios.read');
  if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const [{ data, error }, cupos] = await Promise.all([
    db.from('apps_estudio').select(COLUMNAS),
    // El lote de apps creadas de antemano. Tolerante: sin la tabla (migración aún no aplicada) la
    // cola se enseña igual, sin huecos.
    db.from('apps_estudio_cupos').select('bundle_id, asc_app_id, studio_id'),
  ]);
  if (error) return NextResponse.json({ error: 'No se han podido leer las apps.' }, { status: 500 });
  const lote = cupos.error ? [] : (cupos.data ?? []) as { bundle_id: string; asc_app_id: string; studio_id: string | null }[];
  const ascDe = new Map(lote.map((c) => [c.bundle_id, c.asc_app_id]));

  const apps = ((data ?? []) as unknown as Fila[])
    .filter((f) => esEstadoApp(f.estado))
    .map((f) => ({
      studioId: f.studio_id,
      estudio: f.studios?.nombre ?? f.studios?.slug ?? f.studio_id,
      slug: f.studios?.slug ?? null,
      plan: f.studios?.plan ?? null,
      esDemo: f.studios?.es_demo === true,
      // ¿Su plan la incluye hoy? Una petición de un plan que no la lleva se ve, no se esconde.
      planIncluye: tieneFeature({ plan: f.studios?.plan ?? null, subscriptionStatus: f.studios?.subscription_status ?? null }, 'appPropia'),
      bundleId: f.bundle_id,
      // Id de la app en App Store Connect si es un hueco del lote (la app ya existe); `null` si hay
      // que crearla a mano.
      ascAppId: ascDe.get(f.bundle_id) ?? null,
      nombreApp: f.nombre_app,
      activa: f.activa,
      estado: f.estado as EstadoApp,
      pedidaEn: f.pedida_en,
      urlTienda: f.url_tienda,
      notaInterna: f.nota_interna,
    }))
    .sort(ordenCola);
  // Cuántos huecos quedan libres (`null` si el lote no está en esta base): cuando bajen, toca crear otro lote.
  const cuposLibres = cupos.error ? null : lote.filter((c) => !c.studio_id).length;
  return NextResponse.json({ apps, cuposLibres });
}

export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'studios.update');
  if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const cuerpo = await req.json().catch(() => null);
  const studioId = (cuerpo as { studioId?: unknown } | null)?.studioId;
  if (typeof studioId !== 'string' || !studioId) return NextResponse.json({ error: 'Falta el estudio.' }, { status: 400 });

  const { data: antes, error: errAntes } = await db.from('apps_estudio')
    .select('studio_id, bundle_id, nombre_app, activa, estado, url_tienda, nota_interna').eq('studio_id', studioId).maybeSingle();
  if (errAntes) return NextResponse.json({ error: 'No se ha podido leer la app.' }, { status: 500 });
  if (!antes) return NextResponse.json({ error: 'Ese estudio no ha pedido la app.' }, { status: 404 });

  const v = leerCambio(cuerpo, (antes.url_tienda as string | null) ?? null);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const columnas = columnasDeCambio(v.cambio);
  const { error } = await db.from('apps_estudio').update(columnas).eq('studio_id', studioId);
  if (error) return NextResponse.json({ error: 'No se ha podido guardar el cambio.' }, { status: 500 });

  await registrar(db, req, {
    actor: g.admin, accion: 'apps-estudio.cambiada',
    objetivoTipo: 'studio', objetivoId: studioId,
    resumen: `App ${antes.bundle_id as string}: ${Object.keys(columnas).join(', ')}`,
    antes: { estado: antes.estado, activa: antes.activa, urlTienda: antes.url_tienda },
    despues: columnas,
  });
  return NextResponse.json({ ok: true });
}
