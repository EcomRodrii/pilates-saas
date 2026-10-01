import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { ejecutarCancelacionReserva } from '@/lib/db/supabase-data-admin';
import { verificarSecretoWebhookUsc } from '@/lib/plataformas/usc-firma';
import { accionDeEstadoUsc, aplicableSobre, esMasReciente, leerWebhookReservaUsc } from '@/lib/plataformas/usc-webhook';
import { claveWebhook, fallarWebhookEvent, marcarWebhookProcesado, reclamarWebhookEvent } from '@/lib/webhook-idempotencia';

export const dynamic = 'force-dynamic';

// Webhooks de Urban Sports Club: lo que pasa con una reserva DESPUÉS del
// Instant Booking (Cancelled, LateCancellation, CheckedIn, NoShow). Un solo
// endpoint para todos los estudios: USC registra la URL por clientId.
//
// · Autenticación: cabecera `x-signature-256` = SHA-256 del secreto compartido
//   (`USC_WEBHOOK_SECRET`). Sin él, no se acepta nada.
// · USC reintenta 5 veces si no contestamos 200, y NO garantiza el orden: cada
//   webhook se reclama una vez (idempotencia por Id + estado + ModifiedDate) y
//   solo se aplica si es más reciente que el último aplicado a esa reserva.
// · Lo que no es nuestro o no entendemos (FreeTraining, avisos de integración,
//   una reserva que no tenemos) se acepta con 200 y se ignora: devolver error
//   solo provocaría reintentos inútiles.
export async function POST(req: NextRequest) {
  if (!verificarSecretoWebhookUsc(process.env.USC_WEBHOOK_SECRET, req.headers.get('x-signature-256'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const cuerpo = await req.json().catch(() => null) as Record<string, unknown> | null;
  // Avisos de integración (tipo 4: IntegratorAssociated…): aún no se automatizan.
  if (cuerpo && typeof cuerpo.Type === 'string' && !('BookingStatus' in cuerpo)) {
    return NextResponse.json({ ok: true, ignorado: 'integracion' });
  }
  const lectura = leerWebhookReservaUsc(cuerpo);
  if (!lectura.ok) {
    console.error('[usc/webhook] no se entiende el webhook:', lectura.error);
    return NextResponse.json({ ok: true, ignorado: 'formato' });
  }
  const evento = lectura.evento;
  if (evento.tipo !== 'Class') return NextResponse.json({ ok: true, ignorado: 'no-es-clase' });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'server' }, { status: 503 });

  const clave = claveWebhook('usc', `${evento.reservaExternaId}:${evento.estado}:${evento.modificado}`);
  if (!(await reclamarWebhookEvent(admin, clave, `usc:${evento.estado}`))) {
    return NextResponse.json({ ok: true, repetido: true });
  }

  try {
    const { data: reserva, error } = await admin
      .from('reservas')
      .select('id, studio_id, estado, estado_externo_en')
      .eq('origen', 'URBAN_SPORTS_CLUB')
      .eq('id_reserva_externa', evento.reservaExternaId)
      .maybeSingle();
    if (error) throw error;
    // No la tenemos (el Instant Booking falló o es de otro integrador): nada que hacer.
    if (!reserva || !esMasReciente(evento.modificado, reserva.estado_externo_en as string | null)) {
      await marcarWebhookProcesado(admin, clave);
      return NextResponse.json({ ok: true, ignorado: reserva ? 'antiguo' : 'desconocida' });
    }

    const accion = accionDeEstadoUsc(evento.estado);
    if (aplicableSobre(reserva.estado as string, accion)) {
      if (accion === 'cancelar') {
        // Sin penalización del estudio: la de quien cancela tarde la pone USC.
        const r = await ejecutarCancelacionReserva(admin, {
          studioId: reserva.studio_id as string, reservaId: reserva.id as string, socioId: null, omitirPenalizacion: true,
        });
        if ('error' in r) throw new Error(r.error);
      } else {
        const asistio = accion === 'asistio';
        const { error: errEstado } = await admin.from('reservas')
          .update({ estado: asistio ? 'ASISTIDA' : 'NO_ASISTIO', check_in_en: asistio ? new Date().toISOString() : null })
          .eq('id', reserva.id as string)
          .in('estado', asistio ? ['CONFIRMADA', 'NO_ASISTIO'] : ['CONFIRMADA', 'ASISTIDA']);
        if (errEstado) throw errEstado;
      }
    }
    const { error: errExterno } = await admin.from('reservas')
      .update({ estado_externo: evento.estado, estado_externo_en: evento.modificado })
      .eq('id', reserva.id as string);
    if (errExterno) throw errExterno;

    await marcarWebhookProcesado(admin, clave);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[usc/webhook]', e);
    await fallarWebhookEvent(admin, clave);
    // 500: que USC lo reintente.
    return NextResponse.json({ error: 'server' }, { status: 500 });
  }
}
