import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { leerExito } from '@/lib/interno/exito/servidor';

export const runtime = 'nodejs';
// Habla con Stripe (bajas, renovaciones, tarjetas): nunca cacheado.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Customer Success ligado a billing: alertas internas con su contexto y la acción que haría una
// persona. Solo LEE. Ninguna de estas alertas contacta con un estudio ni cobra nada.
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'billing.read');
  if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const r = await leerExito(db);
  if (!r) return NextResponse.json({ error: 'No se han podido leer los estudios.' }, { status: 500 });
  return NextResponse.json(r);
}
