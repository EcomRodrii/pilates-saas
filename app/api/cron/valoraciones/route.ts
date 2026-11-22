import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { inngest, EVENTS } from '@/lib/inngest/client';
import { estudiosConValoracionesPendientes } from '@/lib/valoraciones/estudios-pendientes';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Pedir valorar una clase JUSTO tras ella (21-nov-2026): antes la pedía un barrido de
// Inngest cada 12 h y el aviso llegaba entre 0 y 12 horas tarde. Lo dispara Postgres
// (pg_cron + pg_net, migración 20261121094512) cada 10 min y SOLO si hay una clase
// terminada hace más de 20 min con alguien que asistió y sin pedir: sin trabajo no se
// llama a nadie. Esta ruta no envía nada: avisa al worker de Inngest, que es quien lo
// hace (idempotente por clase: `valoracion_pedida_en` con compare-and-set).
// Autenticado con SUPABASE_CRON_SECRET (Vault), como el resto de crons de pg_cron.
const TAMANO_LOTE = 50;

export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  if (!secretoValido(req.headers.get('authorization'), secret)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const nowISO = new Date().toISOString();
    const estudios = await estudiosConValoracionesPendientes(admin, nowISO);
    for (let i = 0; i < estudios.length; i += TAMANO_LOTE) {
      await inngest.send(estudios.slice(i, i + TAMANO_LOTE).map(s => ({ name: EVENTS.VALORACIONES_ESTUDIO, data: { studioId: s.id, nowISO } })));
    }
    return NextResponse.json({ ejecutadoEn: nowISO, estudios: estudios.length });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'valoraciones' } });
    return errorInterno('cron/valoraciones:POST', err, 'Error pidiendo las valoraciones.');
  }
}
