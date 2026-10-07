import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { errorInterno } from '@/lib/errores-servidor';

export const runtime = 'nodejs';

// Las llamadas de puesta en marcha que han pedido los estudios nuevos
// («Prefiero que me llamen» en el asistente de bienvenida). Pendientes primero,
// las más antiguas arriba (llevan más esperando), y las hechas al final.
//
// El teléfono es un dato personal: solo se lee con `crm.update` y cada lectura
// con algo pendiente deja rastro en la auditoría (sin el número). Una vez hecha
// la llamada, el teléfono ya no existe (ver la ruta [id]).
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'crm.update');
  if ('error' in g) return g.error;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    const { data, error } = await admin
      .from('solicitudes_llamada')
      .select('id, studio_id, telefono, hora_preferida, consentimiento_en, estado, creada_en, atendida_en')
      .order('creada_en', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.code ?? 'consulta');
    const filas = data ?? [];
    const ids = [...new Set(filas.map((f) => f.studio_id as string))];
    const nombres = new Map<string, string>();
    if (ids.length > 0) {
      const { data: estudios } = await admin.from('studios').select('id, nombre').in('id', ids);
      for (const e of estudios ?? []) nombres.set(e.id as string, (e.nombre as string | null) ?? '');
    }
    const llamadas = filas
      .map((f) => ({
        id: f.id as string,
        studioId: f.studio_id as string,
        estudio: nombres.get(f.studio_id as string) || 'Estudio sin nombre',
        telefono: (f.telefono as string | null) ?? null,
        horaPreferida: (f.hora_preferida as string | null) ?? null,
        estado: f.estado as 'pendiente' | 'hecha',
        creadaEn: f.creada_en as string,
        atendidaEn: (f.atendida_en as string | null) ?? null,
      }))
      .sort((a, b) =>
        a.estado === b.estado
          ? (a.estado === 'pendiente' ? a.creadaEn.localeCompare(b.creadaEn) : b.creadaEn.localeCompare(a.creadaEn))
          : (a.estado === 'pendiente' ? -1 : 1));
    const pendientes = llamadas.filter((l) => l.estado === 'pendiente').length;
    if (pendientes > 0) {
      await registrar(admin, req, {
        actor: g.admin, accion: 'llamadas.leidas',
        resumen: `Abrió las llamadas de puesta en marcha (${pendientes} pendientes)`,
      });
    }
    return NextResponse.json({ llamadas });
  } catch (e) {
    return errorInterno('interno/llamadas:GET', e, 'No se han podido cargar las llamadas.');
  }
}
