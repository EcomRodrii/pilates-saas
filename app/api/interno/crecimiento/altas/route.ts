import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { altaDesdeFila, filaParaInterno, resumirAltas } from '@/lib/alta/abandono';

// Altas de estudio sin terminar: en qué paso se quedó cada una, si se le mandó
// el correo de las 24 h y si terminó después. `growth.read` («funnels de
// producto»), como Review Boost. La tabla no tiene políticas para el cliente:
// esto la lee con service-role DESPUÉS de comprobar el permiso aquí.
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'growth.read');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data, error } = await db.rpc('altas_estudio_detalle', { p_solo_pendientes: false, p_limite: 200 });
  if (error) return NextResponse.json({ error: 'No se han podido leer las altas' }, { status: 500 });

  const filas = ((data ?? []) as Record<string, unknown>[]).map((f) => filaParaInterno(altaDesdeFila(f)));
  return NextResponse.json({ filas, resumen: resumirAltas(filas) });
}
