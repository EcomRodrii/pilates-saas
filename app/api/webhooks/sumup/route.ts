// Aviso del datáfono SumUp Solo (`solo.transaction.updated`).
//
// SumUp lo manda a la `return_url` que le dimos al cobrar (lib/pos/sumup-aviso.ts),
// que lleva el estudio, qué se cobraba y una firma nuestra. El cuerpo NO va
// firmado: solo dice por qué cobro preguntar. Lo que pasa después (cerrar,
// soltar, anotar para reconciliar) lo decide lo que responde la API de SumUp con
// el token del propio estudio, en lib/pos/cobro-sumup.ts — lo mismo que hace el
// barrido horario si este aviso no llega.
//
// Nada que dar de alta en SumUp: la URL viaja en cada cobro. Hace falta
// SUMUP_WEBHOOK_SECRET (la firma de esa URL) en Vercel.
import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { leerAviso } from '@/lib/pos/sumup-aviso';
import { leerCuerpoAviso, referenciaSumup } from '@/lib/pos/sumup';
import { prepararCobroExistente } from '@/lib/pos/cobro-del-estudio';
import { cobroSumupHuerfano, resolverCobroSumup } from '@/lib/pos/cobro-sumup';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Sin secreto no se puede saber si la URL es nuestra. 503: es configuración
  // nuestra, y el barrido horario cubre lo que se pierda mientras tanto.
  const secreto = process.env.SUMUP_WEBHOOK_SECRET;
  if (!secreto) {
    Sentry.captureMessage('[sumup webhook] SUMUP_WEBHOOK_SECRET no configurado', { level: 'warning' });
    return NextResponse.json({ error: 'No configurado' }, { status: 503 });
  }
  const aviso = leerAviso(secreto, req.nextUrl.searchParams);
  if (!aviso) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const cuerpo = leerCuerpoAviso(await req.json().catch(() => null));
  // Otro tipo de evento, o sin id: nada que preguntar.
  if (!cuerpo) return NextResponse.json({ received: true });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const { studioId, objeto } = aviso;
    const r = await resolverCobroSumup(admin, { studioId, objeto, soloSi: cuerpo.clientTransactionId });
    if (r.tipo !== 'nada') {
      // `esperar` = SumUp aún no lo da por terminado o no contestó; el siguiente
      // aviso, el sondeo del mostrador o el barrido lo cerrarán.
      return NextResponse.json({ received: true, resultado: r.tipo });
    }

    // No es el cobro en vuelo de ese objeto: ¿entró dinero que nada espera?
    const preparado = await prepararCobroExistente(admin, studioId,
      referenciaSumup(cuerpo.clientTransactionId, new Date()), 'DATAFONO', { origen: '' });
    if (!preparado.ok) return NextResponse.json({ received: true, resultado: 'esperar' });
    const h = await cobroSumupHuerfano(admin, {
      studioId, objeto, clientTransactionId: cuerpo.clientTransactionId, cobro: preparado.cobro,
    });
    return NextResponse.json({ received: true, resultado: h.tipo });
  } catch (e) {
    Sentry.captureException(e instanceof Error ? e : new Error('sumup webhook'), {
      level: 'error', tags: { area: 'cobros', proveedor: 'sumup' },
      extra: { studioId: aviso.studioId, objeto: `${aviso.objeto.tipo}:${aviso.objeto.id}` },
    });
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
