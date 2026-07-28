import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';

export const runtime = 'nodejs';

// Registro de auditoría. Solo lectura — la tabla rechaza UPDATE y DELETE por
// trigger, así que ni existiendo una ruta para borrar serviría de nada.
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'logs.read');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const objetivoId = req.nextUrl.searchParams.get('objetivoId');
  const limite = Math.min(Number(req.nextUrl.searchParams.get('limite') ?? 100), 300);

  let consulta = db.from('plataforma_auditoria')
    .select('id, ocurrido_en, actor_nombre, accion, objetivo_tipo, objetivo_id, resumen, antes, despues, ip, user_agent')
    .order('ocurrido_en', { ascending: false })
    .limit(limite);
  if (objetivoId) consulta = consulta.eq('objetivo_id', objetivoId);

  const { data, error } = await consulta;
  if (error) return NextResponse.json({ error: 'No se ha podido leer la auditoría.' }, { status: 500 });

  return NextResponse.json({ entradas: data ?? [] });
}
