import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { estudioDeDenuncia, resolverDenuncia } from '@/lib/moderacion/denuncias-servidor';
import type { AccionDenuncia } from '@/lib/moderacion/denuncias';

export const runtime = 'nodejs';

const ACCIONES: AccionDenuncia[] = ['MANTENER', 'OCULTAR', 'CERRAR_CONVERSACION'];

// Tentare decide una denuncia: mantener, retirar el contenido o cerrar la
// conversación. El estudio sale de la propia denuncia, nunca del navegador; la
// RPC vuelve a comprobar que le toca a Tentare (contra el estudio, o 24 h sin
// revisar) y se avisa a cada parte igual que cuando decide el estudio.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirPermiso(req, 'app.moderate');
  if ('error' in g) return g.error;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = await req.json().catch(() => null) as { accion?: unknown } | null;
  const accion = body?.accion as AccionDenuncia;
  if (!ACCIONES.includes(accion)) return errorPeticion('Decisión no válida.');
  const { id } = await params;

  try {
    const studioId = await estudioDeDenuncia(admin, id);
    if (!studioId) return NextResponse.json({ error: 'Esta denuncia ya no existe.' }, { status: 404 });
    const r = await resolverDenuncia(admin, {
      studioId, denunciaId: id, accion,
      revisor: { tipo: 'TENTARE', userId: g.admin.userId },
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    await registrar(admin, req, {
      actor: g.admin, accion: 'moderacion.denuncia.decidida', objetivoTipo: 'denuncia', objetivoId: id,
      resumen: `Denuncia decidida: ${accion}`, despues: { resultado: r.resultado, studioId },
    });
    return NextResponse.json({ resultado: r.resultado });
  } catch (e) {
    return errorInterno('interno/denuncias:POST', e, 'No se ha podido guardar la decisión. Inténtalo otra vez.');
  }
}
