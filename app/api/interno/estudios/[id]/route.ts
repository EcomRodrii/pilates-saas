import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';

export const runtime = 'nodejs';

// Ficha 360º de un estudio.
//
// ── Qué NO devuelve, a propósito ─────────────────────────────────────────────
// Ni el listado de socias, ni sus emails o teléfonos, ni una sola fila de ficha
// clínica. Para dar soporte hace falta saber CUÁNTAS socias tiene un estudio y
// si su calendario se mueve, no cómo se llaman sus clientas ni qué lesión de
// espalda arrastran. Son datos de salud de terceros: el panel no los enseña
// aunque técnicamente el service-role pueda leerlos.
//
// Cuando haga falta entrar de verdad en los datos de un cliente, eso es
// impersonation, y lleva su propio flujo con motivo, caducidad y aviso.
//
// Abrir esta ficha SÍ se audita: es acceso a información de un cliente.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirPermiso(req, 'studios.read');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { id } = await params;

  const { data: studio } = await db.from('studios')
    .select('id, slug, nombre, plan, email, telefono, direccion, creado_en, stripe_customer_id, stripe_account_id, owner_auth_user_id, suspendido_en, suspendido_motivo, review_boost_elegible_en, review_boost_mostrado_en')
    .eq('id', id).maybeSingle();
  if (!studio) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });

  const hace30 = new Date(Date.now() - 30 * 864e5).toISOString();

  const [equipo, nSocias, nClases, reservas30, recibos, duenaAuth, reviewBoostFeedback, reviewBoostRecompensa] = await Promise.all([
    db.from('instructores').select('id, nombre, rol, activo, auth_user_id').eq('studio_id', id),
    db.from('socios').select('id', { count: 'exact', head: true }).eq('studio_id', id),
    db.from('sesiones').select('id', { count: 'exact', head: true }).eq('studio_id', id),
    db.from('reservas').select('id', { count: 'exact', head: true }).eq('studio_id', id).gte('creado_en', hace30),
    db.from('recibos').select('importe, estado, fecha_cobro').eq('studio_id', id).eq('estado', 'COBRADO').gte('fecha_cobro', hace30.slice(0, 10)),
    studio.owner_auth_user_id
      ? db.auth.admin.getUserById(studio.owner_auth_user_id as string)
      : Promise.resolve({ data: { user: null } }),
    db.from('review_boost_feedback').select('rating, creado_en').eq('studio_id', id).maybeSingle(),
    db.from('review_boost_recompensas').select('canjeada_en').eq('studio_id', id).maybeSingle(),
  ]);

  // Facturación DEL ESTUDIO a sus socias (su negocio), no lo que nos paga a
  // nosotros. Sirve para dimensionar la cuenta y detectar quién crece.
  const facturacion30d = (recibos.data ?? []).reduce((s, r) => s + Number(r.importe ?? 0), 0);

  const equipoFilas = (equipo.data ?? []).map(i => ({
    nombre: (i.nombre as string | null) ?? '—',
    rol: i.rol as string,
    activo: Boolean(i.activo),
    // Sin cuenta no recibe avisos: es la causa nº1 de "no me llega nada".
    tieneCuenta: Boolean(i.auth_user_id),
  }));

  const duena = 'data' in duenaAuth ? duenaAuth.data?.user ?? null : null;

  await registrar(db, req, {
    actor: g.admin,
    accion: 'estudio.ficha.abierta',
    objetivoTipo: 'studio',
    objetivoId: id,
    resumen: `Abrió la ficha de ${(studio.nombre as string | null) ?? studio.slug}`,
  });

  return NextResponse.json({
    estudio: {
      id: studio.id, slug: studio.slug, nombre: studio.nombre, plan: studio.plan,
      email: studio.email, telefono: studio.telefono, direccion: studio.direccion,
      creadoEn: studio.creado_en,
    },
    duena: duena ? {
      email: duena.email ?? null,
      ultimoAcceso: duena.last_sign_in_at ?? null,
      alta: duena.created_at ?? null,
    } : null,
    pagos: {
      // Lo local solo dice si llegó a existir un cliente/cuenta en Stripe. El
      // estado de la suscripción (al día, impagada, cancelada) NO se guarda
      // aquí: hay que mirarlo en Stripe. La UI enlaza allí en vez de fingir.
      tieneClienteStripe: Boolean(studio.stripe_customer_id),
      clienteStripeId: (studio.stripe_customer_id as string | null) ?? null,
      cobraConStripeConnect: Boolean(studio.stripe_account_id),
    },
    suspension: {
      suspendido: Boolean(studio.suspendido_en),
      desde: (studio.suspendido_en as string | null) ?? null,
      motivo: (studio.suspendido_motivo as string | null) ?? null,
    },
    uso: {
      socias: nSocias.count ?? 0,
      clases: nClases.count ?? 0,
      reservas30d: reservas30.count ?? 0,
      facturacionPropia30d: Math.round(facturacion30d * 100) / 100,
    },
    equipo: equipoFilas,
    reviewBoost: {
      elegibleEn: (studio.review_boost_elegible_en as string | null) ?? null,
      mostradoEn: (studio.review_boost_mostrado_en as string | null) ?? null,
      feedback: reviewBoostFeedback.data
        ? { rating: reviewBoostFeedback.data.rating as number, creadoEn: reviewBoostFeedback.data.creado_en as string }
        : null,
      recompensaCanjeada: Boolean(reviewBoostRecompensa.data?.canjeada_en),
    },
  });
}
