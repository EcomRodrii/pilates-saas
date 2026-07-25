import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { PLANES } from '@/lib/billing/entitlements';

export const runtime = 'nodejs';

// Acciones del panel interno sobre un estudio. Todas comparten tres reglas:
//
//   1. Exigen `studios.update` (Meri no las tiene: solo lee).
//   2. Leen el estado ANTES, escriben, y auditan ambos con un resumen legible.
//      Sin el "antes" la auditoría no sirve para reconstruir qué pasó.
//   3. Nada de acciones que solo Stripe sabe hacer bien (reembolsar, reenviar
//      factura, meses gratis). Ahí el panel enlaza a Stripe en vez de duplicar
//      una superficie por la que se pierde dinero.
type Accion =
  | { accion: 'cambiar-plan'; plan: string }
  | { accion: 'suspender'; motivo: string }
  | { accion: 'reactivar' };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirPermiso(req, 'studios.update');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { id } = await params;
  const cuerpo = (await req.json().catch(() => null)) as Accion | null;
  if (!cuerpo?.accion) return NextResponse.json({ error: 'Falta la acción' }, { status: 400 });

  const { data: antes } = await db.from('studios')
    .select('id, slug, nombre, plan, suspendido_en, suspendido_motivo')
    .eq('id', id).maybeSingle();
  if (!antes) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });

  const nombre = (antes.nombre as string | null) ?? (antes.slug as string);

  if (cuerpo.accion === 'cambiar-plan') {
    // Contra la lista real de planes: un plan inventado dejaría al estudio con
    // entitlements que no existen y sin forma de comprar nada.
    if (!PLANES.includes(cuerpo.plan as (typeof PLANES)[number])) {
      return NextResponse.json({ error: `Plan no válido. Son: ${PLANES.join(', ')}.` }, { status: 400 });
    }
    if (cuerpo.plan === antes.plan) {
      return NextResponse.json({ error: `Ya está en el plan ${cuerpo.plan}.` }, { status: 409 });
    }

    const { error } = await db.from('studios').update({ plan: cuerpo.plan }).eq('id', id);
    if (error) return NextResponse.json({ error: 'No se ha podido cambiar el plan.' }, { status: 500 });

    await registrar(db, req, {
      actor: g.admin,
      accion: 'estudio.plan.cambiado',
      objetivoTipo: 'studio', objetivoId: id,
      resumen: `${nombre}: plan ${antes.plan} → ${cuerpo.plan}`,
      antes: { plan: antes.plan }, despues: { plan: cuerpo.plan },
    });
    // El plan aquí NO toca la suscripción de Stripe: cambia lo que el producto
    // deja hacer, no lo que se le cobra. Si además hay que cobrar distinto, eso
    // se hace en Stripe. La respuesta lo dice para que la UI lo avise.
    return NextResponse.json({ ok: true, plan: cuerpo.plan, avisoStripe: Boolean(antes.plan) });
  }

  if (cuerpo.accion === 'suspender') {
    const motivo = (cuerpo.motivo ?? '').trim();
    // Obligatorio y con sustancia: este texto se le enseña al cliente cuando
    // intente entrar, y es lo que queda en la auditoría meses después.
    if (motivo.length < 10) {
      return NextResponse.json(
        { error: 'Escribe un motivo de al menos 10 caracteres: se le muestra al cliente.' },
        { status: 400 },
      );
    }
    if (antes.suspendido_en) return NextResponse.json({ error: 'Ya está suspendido.' }, { status: 409 });

    const { error } = await db.from('studios').update({
      suspendido_en: new Date().toISOString(),
      suspendido_motivo: motivo,
      suspendido_por: g.admin.userId,
    }).eq('id', id);
    if (error) return NextResponse.json({ error: 'No se ha podido suspender.' }, { status: 500 });

    await registrar(db, req, {
      actor: g.admin,
      accion: 'estudio.suspendido',
      objetivoTipo: 'studio', objetivoId: id,
      resumen: `${nombre} suspendido: ${motivo}`,
      antes: { suspendido: false }, despues: { suspendido: true, motivo },
    });
    return NextResponse.json({ ok: true, suspendido: true });
  }

  if (cuerpo.accion === 'reactivar') {
    if (!antes.suspendido_en) return NextResponse.json({ error: 'No está suspendido.' }, { status: 409 });

    const { error } = await db.from('studios').update({
      suspendido_en: null, suspendido_motivo: null, suspendido_por: null,
    }).eq('id', id);
    if (error) return NextResponse.json({ error: 'No se ha podido reactivar.' }, { status: 500 });

    await registrar(db, req, {
      actor: g.admin,
      accion: 'estudio.reactivado',
      objetivoTipo: 'studio', objetivoId: id,
      resumen: `${nombre} reactivado (estaba suspendido por: ${antes.suspendido_motivo ?? 'sin motivo'})`,
      antes: { suspendido: true, motivo: antes.suspendido_motivo }, despues: { suspendido: false },
    });
    return NextResponse.json({ ok: true, suspendido: false });
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
}
