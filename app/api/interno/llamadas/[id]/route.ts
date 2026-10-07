import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { errorInterno } from '@/lib/errores-servidor';

export const runtime = 'nodejs';

// Marcar la llamada como hecha. Y con ella se BORRA el teléfono: una vez
// atendida no hay motivo para conservar un dato personal (lo exige también el
// CHECK de la tabla: una «hecha» no puede llevar teléfono).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirPermiso(req, 'crm.update');
  if ('error' in g) return g.error;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Llamada no válida.' }, { status: 400 });
  try {
    const { data, error } = await admin
      .from('solicitudes_llamada')
      .update({ estado: 'hecha', telefono: null, atendida_en: new Date().toISOString() })
      .eq('id', id).eq('estado', 'pendiente')
      .select('id, studio_id');
    if (error) throw new Error(error.code ?? 'update');
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Esta llamada ya estaba marcada como hecha.' }, { status: 404 });
    }
    await registrar(admin, req, {
      actor: g.admin, accion: 'llamadas.hecha', objetivoTipo: 'solicitud_llamada', objetivoId: id,
      resumen: 'Marcó una llamada de puesta en marcha como hecha',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno('interno/llamadas:POST', e, 'No se ha podido marcar la llamada. Inténtalo otra vez.');
  }
}
