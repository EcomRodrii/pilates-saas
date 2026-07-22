import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { generateUniqueSlug } from '@/lib/supabase-data';
import { tieneFeature } from '@/lib/billing/entitlements';
import { errorInterno } from '@/lib/errores-servidor';

// "Añadir sede" (Configuración → Estudio, solo con el plan CADENA activo).
// Server-side porque hace falta un gate que RLS por sí sola no puede expresar:
// insert_studios (migración 0062) ya impide vincular cadena_id a una cadena
// ajena, pero NO sabe si la suscripción de ESA cadena sigue entitled a
// multiCentro — eso es una regla de negocio, se valida aquí.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede añadir sedes' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { nombre?: string; ciudad?: string; telefono?: string } | null;
  const nombre = body?.nombre?.trim();
  if (!nombre) return NextResponse.json({ error: 'Falta el nombre de la sede' }, { status: 400 });

  const { data: studio } = await admin
    .from('studios').select('cadena_id, plan, subscription_status')
    .eq('id', sesion.studioId).maybeSingle();
  if (!studio?.cadena_id) {
    return NextResponse.json({ error: 'Este estudio no pertenece a ninguna cadena todavía' }, { status: 400 });
  }
  if (!tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscription_status }, 'multiCentro')) {
    return NextResponse.json({ error: 'Tu plan no incluye varios centros' }, { status: 403 });
  }

  try {
    // El trigger heredar_plan_de_cadena (migración 0062) rellena plan/
    // subscription_status/current_period_end desde `cadenas` en el propio
    // INSERT — la sede nueva queda operativa sin checkout aparte.
    for (let intento = 0; intento < 3; intento++) {
      const id = `studio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const slug = await generateUniqueSlug(nombre);
      const { error } = await admin.from('studios').insert({
        id,
        nombre,
        ciudad: body?.ciudad?.trim() || null,
        telefono: body?.telefono?.trim() || null,
        owner_auth_user_id: sesion.userId,
        cadena_id: studio.cadena_id,
        slug,
      });
      if (!error) return NextResponse.json({ id, slug });
      if (error.code !== '23505' || !error.message.includes('studios_slug_key')) {
        throw new Error(`insert studios: ${error.message}`);
      }
      // Choque de slug: reintenta con uno recién generado.
    }
    return NextResponse.json({ error: 'No se pudo generar un slug único tras varios intentos' }, { status: 500 });
  } catch (err) {
    return errorInterno('cadena/sedes:POST', err, 'No se pudo crear la sede. Inténtalo de nuevo más tarde.');
  }
}
