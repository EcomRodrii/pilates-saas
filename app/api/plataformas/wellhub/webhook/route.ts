import { after, NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarFirmaWellhub } from '@/lib/plataformas/wellhub-firma';
import { leerEventoWellhub } from '@/lib/plataformas/wellhub-eventos';
import { credencialesWellhub } from '@/lib/plataformas/wellhub/cliente';
import {
  aplicarCancelacionWellhub, rechazarReservaWellhub, registrarCancelacionWellhub, registrarCheckinWellhub,
  registrarReservaPedidaWellhub, resolverCheckinWellhub, sincronizarReservaWellhub,
} from '@/lib/plataformas/wellhub/servidor';
import { trasReservaExterna } from '@/lib/plataformas/tras-reserva-externa';

export const dynamic = 'force-dynamic';

// Webhooks de Wellhub (Booking API y Access Control): reservas, cancelaciones
// y check-ins de sus socias en las clases que publicamos allí
// (lib/plataformas/wellhub/horario-servidor.ts). Docs: developers.wellhub.com.
//
// · Firma `X-Gympass-Signature` (HMAC-SHA1 del cuerpo) con nuestro secreto: sin
//   él no se acepta nada (falla cerrado).
// · Wellhub da 1 s para contestar y, tras un 200, no reintenta nunca. Por eso,
//   ANTES de contestar, una escritura durable con su clave natural (la plaza, la
//   cancelación marcada o el check-in pendiente) y lo que habla con Wellhub va
//   después, en `after()`. Lo que quede a medias lo rehace el cron
//   (lib/plataformas/wellhub/servidor.ts, `conciliarWellhub`).
// · Si la base de datos no contesta: 500, para que Wellhub reintente.
// · Lo que no es nuestro o no entendemos se acepta con 200 y se ignora: un error
//   solo provocaría reintentos inútiles. ⚠️ Nunca el cuerpo en un log: lleva
//   datos personales de la socia.

/** Más viejo que esto es una repetición, no un aviso (la firma no caduca). */
const ANTIGUEDAD_MAXIMA_MS = 7 * 86_400_000;

const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra });
const reintentar = (donde: string, detalle: string) => {
  console.error(`[wellhub/webhook] ${donde}:`, detalle);
  return NextResponse.json({ error: 'server' }, { status: 500 });
};

function enSegundoPlano(donde: string, tarea: () => Promise<unknown>) {
  after(async () => {
    try { await tarea(); } catch (e) {
      Sentry.captureException(e, { tags: { area: 'plataformas', plataforma: 'wellhub', paso: donde } });
    }
  });
}

export async function POST(req: NextRequest) {
  const cred = credencialesWellhub();
  const cuerpoCrudo = await req.text();
  const variante = cred ? verificarFirmaWellhub(cred.secretosWebhook, req.headers.get('x-gympass-signature'), cuerpoCrudo) : null;
  if (!cred || !variante) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (variante === 'reserializado') {
    // Su doc no dice qué se firma: si casa así, se sabrá y se quitará la otra variante.
    Sentry.captureMessage('[wellhub/webhook] la firma casa con el cuerpo reserializado, no con el crudo', {
      level: 'info', tags: { area: 'plataformas', plataforma: 'wellhub' }, fingerprint: ['wellhub-firma-reserializada'],
    });
  }

  let cuerpo: unknown;
  try { cuerpo = JSON.parse(cuerpoCrudo); } catch { cuerpo = null; }
  const lectura = leerEventoWellhub(cuerpo);
  if (!lectura.ok) {
    Sentry.captureMessage('[wellhub/webhook] no se entiende el webhook', {
      level: 'warning', tags: { area: 'plataformas', plataforma: 'wellhub' }, extra: { motivo: lectura.error },
    });
    return ok({ ignorado: 'formato' });
  }
  const e = lectura.evento;
  if (Date.now() - e.momento > ANTIGUEDAD_MAXIMA_MS) return ok({ ignorado: 'antiguo' });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'server' }, { status: 503 });

  switch (e.tipo) {
    case 'reserva-pedida': {
      const r = await registrarReservaPedidaWellhub(admin, e, Date.now());
      if (r.tipo === 'error') return reintentar('reserva', r.detalle);
      if (r.tipo === 'rechazada') {
        enSegundoPlano('rechazar', () => rechazarReservaWellhub(cred, e.gymId, e.bookingNumber, r.rechazo));
      } else if (r.tipo === 'aceptada') {
        // Si este aviso es una repetición (el primero tardó más de 1 s), el
        // primero ya la tiene cogida: esta no manda un segundo RESERVED.
        enSegundoPlano('confirmar', () => sincronizarReservaWellhub(admin, cred, r.reservaId));
        // Una repetición no es un hecho nuevo: sin efectos otra vez.
        if (!r.repetida) enSegundoPlano('tras-reserva', () => trasReservaExterna(admin, { studioId: r.studioId, sesionId: r.sesionId }));
      }
      return ok({ resultado: r.tipo });
    }
    case 'reserva-cancelada':
    case 'reserva-cancelada-tarde': {
      const r = await registrarCancelacionWellhub(admin, e);
      if (r.tipo === 'error') return reintentar('cancelacion', r.detalle);
      if (r.tipo === 'registrada') enSegundoPlano('cancelar', () => aplicarCancelacionWellhub(admin, r.studioId, r.reservaId));
      return ok({ resultado: r.tipo });
    }
    case 'checkin': {
      const r = await registrarCheckinWellhub(admin, e);
      if (r.tipo === 'error') return reintentar('checkin', r.detalle);
      if (r.tipo === 'sin-estudio') return ok({ ignorado: 'gym-sin-estudio' });
      enSegundoPlano('validar', () => resolverCheckinWellhub(admin, cred, r.id));
      return ok({ resultado: 'registrado' });
    }
    case 'integracion-pedida':
      // Un gym ha elegido Tentare en su portal de Wellhub. El estudio aún no
      // está vinculado (se vincula su gym desde /interno): se avisa para hacerlo.
      Sentry.captureMessage('[wellhub] un gym ha elegido Tentare en Wellhub', {
        level: 'info', tags: { area: 'plataformas', plataforma: 'wellhub' }, extra: { gymId: e.gymId, gym: e.nombreGym },
      });
      return ok({ resultado: 'integracion' });
  }
}
