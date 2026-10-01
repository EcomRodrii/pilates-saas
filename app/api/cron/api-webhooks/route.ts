import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { secretoValido } from '@/lib/salud/secreto';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { entregarPendientes, procesarEventos } from '@/lib/api-publica/webhooks/trabajador';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Webhooks de la API pública (F2): procesa los eventos nuevos y manda las
// entregas que tocan. Lo dispara pg_cron cada minuto, pero SOLO cuando hay algo
// que hacer (el `where` va antes del POST, migr 20261001162731). Autenticado con
// SUPABASE_CRON_SECRET (Vault), mismo patrón que el resto del bucket A.
//
// El presupuesto (25 s) deja margen de sobra bajo el `timeout_milliseconds`
// del cron (45 s): si esta ruta tardara más, el vigilante de jobs HTTP
// (AUT-10) lo contaría como fallo de infraestructura.
const PRESUPUESTO_ENTREGAS_MS = 25_000;

export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPABASE_CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!secretoValido(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Service role no configurada' }, { status: 503 });
  try {
    // Tandas hasta agotar el presupuesto o la cola: una sola tanda por minuto
    // (200 eventos, 30 entregas) dejaría a un estudio con una importación
    // masiva marcando el ritmo de todos. Primero los eventos de cada tanda:
    // así lo que acaba de pasar sale ya en esa misma pasada.
    const inicio = Date.now();
    const total = { tandas: 0, eventos: 0, entregasCreadas: 0, reclamadas: 0, entregadas: 0, reintentos: 0, fallidas: 0, descartadas: 0 };
    while (Date.now() - inicio < PRESUPUESTO_ENTREGAS_MS) {
      const ev = await procesarEventos(admin);
      const en = await entregarPendientes(admin, PRESUPUESTO_ENTREGAS_MS - (Date.now() - inicio));
      total.tandas++;
      total.eventos += ev.procesados;
      total.entregasCreadas += ev.entregasCreadas;
      total.reclamadas += en.reclamadas;
      total.entregadas += en.entregadas;
      total.reintentos += en.reintentos;
      total.fallidas += en.fallidas;
      total.descartadas += en.descartadas;
      if (ev.procesados === 0 && en.reclamadas === 0) break;
    }
    return NextResponse.json({ ejecutadoEn: new Date().toISOString(), ...total });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'api-webhooks' } });
    return errorInterno('cron/api-webhooks:POST', err, 'Error procesando los webhooks.');
  }
}
