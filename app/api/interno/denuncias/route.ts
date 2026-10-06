import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { errorInterno } from '@/lib/errores-servidor';
import { listarDenunciasParaTentare } from '@/lib/moderacion/denuncias-servidor';

export const runtime = 'nodejs';

// La cola de moderación de Tentare (App Store 1.2; decisión del fundador,
// 5-oct-2026): las denuncias contra el propio estudio (su hilo con la alumna, o
// algo escrito por una propietaria) y las que el estudio no revisó en 24 h.
// Se lee lo que escribieron alumnas e instructoras en chats privados, así que
// pide su propio permiso (`app.moderate`, no `network.moderate`) y cada lectura
// con algo dentro deja rastro en la auditoría.
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'app.moderate');
  if ('error' in g) return g.error;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    const denuncias = await listarDenunciasParaTentare(admin);
    if (denuncias.length > 0) {
      await registrar(admin, req, {
        actor: g.admin, accion: 'moderacion.denuncias.leidas',
        resumen: `Abrió la cola de denuncias (${denuncias.length} pendientes)`,
      });
    }
    return NextResponse.json({ denuncias });
  } catch (e) {
    return errorInterno('interno/denuncias:GET', e, 'No se han podido cargar las denuncias.');
  }
}
