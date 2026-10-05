import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { resolverDenuncia } from '@/lib/moderacion/denuncias-servidor';
import type { AccionDenuncia } from '@/lib/moderacion/denuncias';

const ACCIONES: AccionDenuncia[] = ['MANTENER', 'OCULTAR', 'CERRAR_CONVERSACION'];

// Decidir una denuncia desde el panel: mantener, retirar el contenido o cerrar
// la conversación. Comprueba aquí el rol (`resolverDenuncia`: el ámbito y la
// acción tienen que ser de los suyos) y la base de datos vuelve a comprobar que
// le toca al estudio y que quien decide no escribió lo denunciado.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const limited = await enforceRateLimit(req, 'moderacion-denuncias', { max: 60, windowSeconds: 60 }, sesion.userId);
  if (limited) return limited;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = await req.json().catch(() => null) as { accion?: unknown } | null;
  const accion = body?.accion as AccionDenuncia;
  if (!ACCIONES.includes(accion)) return errorPeticion('Decisión no válida.');
  const { id } = await params;

  try {
    const r = await resolverDenuncia(admin, {
      studioId: sesion.studioId, denunciaId: id, accion,
      revisor: { tipo: 'ESTUDIO', rol: sesion.rol, userId: sesion.userId },
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ resultado: r.resultado });
  } catch (e) {
    return errorInterno('moderacion/denuncias:POST', e, 'No se ha podido guardar la decisión. Inténtalo otra vez.');
  }
}
