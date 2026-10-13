import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { leerAccion, resumenVisita } from '@/lib/interno/visita-guiada';
import { aplicarATodos, cambiosDeEstudio, type BaseEscribible } from '@/lib/interno/visita-guiada-servidor';

export const runtime = 'nodejs';

// Quién recibe la visita guiada, decidido desde /interno (lib/tour/, migración
// 20261008010535). Tres cosas se pueden decidir:
//
//   · un estudio: activar (conserva lo que lleva), activar desde cero (la reinicia y
//     empieza ya) o desactivar;
//   · todos a la vez: activar (los que aún no la han completado) o desactivar;
//   · los estudios NUEVOS: si la llevan de serie (ajuste de plataforma que lee el trigger
//     `marcar_tour_obligatorio` al nacer un estudio).
//
// Corre con service-role: cada escritura exige `studios.update` y se audita con el antes y
// el después. Una demo nunca la recibe, ni siquiera con «todos».

const CLAVE_NUEVOS = 'visita_guiada_estudios_nuevos';

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'studios.read');
  if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const [estudios, ajuste] = await Promise.all([
    db.from('studios')
      .select('id, nombre, slug, plan, creado_en, es_demo, cadena_id, suspendido_en, subscription_status, tour_obligatorio, tour_progreso, tour_completado_en')
      .order('creado_en', { ascending: false }),
    db.from('ajustes_plataforma').select('valor').eq('clave', CLAVE_NUEVOS).maybeSingle(),
  ]);
  if (estudios.error) return NextResponse.json({ error: 'No se han podido leer los estudios.' }, { status: 500 });

  return NextResponse.json({
    nuevos: (ajuste.data?.valor as { activa?: boolean } | null)?.activa === true,
    estudios: (estudios.data ?? []).map(e => ({
      id: e.id as string,
      nombre: (e.nombre as string | null) ?? (e.slug as string),
      slug: e.slug as string,
      plan: e.plan as string,
      creadoEn: e.creado_en as string,
      esDemo: e.es_demo === true,
      deCadena: !!e.cadena_id,
      suspendido: !!e.suspendido_en,
      // Paga hoy (suscripción de Stripe activa): imponerle una visita de ~50 min es otra conversación.
      paga: e.subscription_status === 'active',
      obligatorio: e.tour_obligatorio === true,
      resumen: resumenVisita({
        obligatorio: e.tour_obligatorio === true,
        completadaEn: (e.tour_completado_en as string | null) ?? null,
        progreso: e.tour_progreso,
      }),
    })),
  });
}

export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'studios.update');
  if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const accion = leerAccion(await req.json().catch(() => null));
  if (!accion) return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });

  // ── Estudios nuevos ────────────────────────────────────────────────────────
  if (accion.accion === 'nuevos') {
    const { data: antes } = await db.from('ajustes_plataforma').select('valor').eq('clave', CLAVE_NUEVOS).maybeSingle();
    const { error } = await db.from('ajustes_plataforma').upsert({
      clave: CLAVE_NUEVOS, valor: { activa: accion.activar },
      actualizado_en: new Date().toISOString(), actualizado_por: g.admin.userId,
    }, { onConflict: 'clave' });
    if (error) return NextResponse.json({ error: 'No se ha podido guardar el ajuste.' }, { status: 500 });
    await registrar(db, req, {
      actor: g.admin, accion: 'visita-guiada.nuevos.cambiado',
      objetivoTipo: 'ajuste', objetivoId: CLAVE_NUEVOS,
      resumen: `Visita guiada en estudios nuevos: ${accion.activar ? 'activada' : 'desactivada'}`,
      antes: antes?.valor ?? { activa: false }, despues: { activa: accion.activar },
    });
    return NextResponse.json({ ok: true, nuevos: accion.activar });
  }

  // ── Todos a la vez ─────────────────────────────────────────────────────────
  if (accion.accion === 'todos') {
    const { ids, error } = await aplicarATodos(db as unknown as BaseEscribible, accion.activar);
    if (error) return NextResponse.json({ error: 'No se ha podido aplicar a todos.' }, { status: 500 });
    const cambiados = ids.length;
    await registrar(db, req, {
      actor: g.admin, accion: accion.activar ? 'visita-guiada.todos.activada' : 'visita-guiada.todos.desactivada',
      objetivoTipo: 'studio',
      resumen: `Visita guiada ${accion.activar ? 'activada' : 'desactivada'} en ${cambiados} estudio${cambiados === 1 ? '' : 's'}`,
      despues: { estudios: ids },
    });
    return NextResponse.json({ ok: true, cambiados });
  }

  // ── Un estudio ─────────────────────────────────────────────────────────────
  const { data: antes } = await db.from('studios')
    .select('id, nombre, slug, es_demo, tour_obligatorio, tour_progreso, tour_completado_en')
    .eq('id', accion.id).maybeSingle();
  if (!antes) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
  if (antes.es_demo === true && accion.operacion !== 'desactivar') {
    return NextResponse.json({ error: 'Un estudio de demo no recibe la visita guiada.' }, { status: 409 });
  }

  const cambios = cambiosDeEstudio(accion.operacion);
  const { error } = await db.from('studios').update(cambios).eq('id', accion.id);
  if (error) return NextResponse.json({ error: 'No se ha podido cambiar el estudio.' }, { status: 500 });

  const nombre = (antes.nombre as string | null) ?? (antes.slug as string);
  const verbo = accion.operacion === 'desactivar' ? 'desactivada' : accion.operacion === 'activar' ? 'activada' : 'activada desde cero';
  await registrar(db, req, {
    actor: g.admin, accion: `visita-guiada.estudio.${accion.operacion}`,
    objetivoTipo: 'studio', objetivoId: accion.id,
    resumen: `${nombre}: visita guiada ${verbo}`,
    antes: { obligatorio: antes.tour_obligatorio, completadaEn: antes.tour_completado_en },
    despues: { obligatorio: cambios.tour_obligatorio },
  });
  return NextResponse.json({ ok: true });
}
