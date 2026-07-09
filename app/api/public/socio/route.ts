import { NextRequest, NextResponse } from 'next/server';
import { registrarSociaPublica, actualizarSociaPublica, guardarPreferenciasPublica, socioAutenticado } from '@/lib/supabase-data';
import { verificarUsuarioSupabase } from '@/lib/auth-server';

// Operaciones de la propia socia desde el portal/reserva. SEGURIDAD: todas
// exigen sesión real de socia (JWT de Supabase Auth); la identidad se deriva del
// token, no del body. `registrar` es el alta de un walk-in ya autenticado por
// magic link: se crea su ficha vinculada a su usuario de auth.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    accion?: 'registrar' | 'actualizar' | 'preferencias';
    studioId?: string;
    id?: string;
    nombre?: string;
    aceptacion?: { fecha: string; firma: string; versionTexto: string };
    referidoPor?: string | null;
    cambios?: Record<string, unknown>;
  } | null;

  if (!body?.studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    // Alta de walk-in: autenticado por magic link pero aún sin ficha de socia.
    // El email lo pone el JWT (no el body) y se vincula auth_user_id.
    if (body.accion === 'registrar') {
      if (!body.id || !body.nombre) {
        return NextResponse.json({ error: 'Faltan datos de la socia' }, { status: 400 });
      }
      const r = await registrarSociaPublica({
        studioId: body.studioId, id: body.id, nombre: body.nombre, email: user.email,
        authUserId: user.userId, aceptacion: body.aceptacion, referidoPor: body.referidoPor ?? null,
      });
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json(r);
    }

    // Acciones sobre una socia ya existente: su id sale del token, no del body.
    const socioId = await socioAutenticado(user.userId, body.studioId);
    if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const common = { studioId: body.studioId, socioId, email: user.email, cambios: body.cambios ?? {} };

    if (body.accion === 'actualizar') {
      const r = await actualizarSociaPublica(common);
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
      return NextResponse.json(r);
    }
    if (body.accion === 'preferencias') {
      const r = await guardarPreferenciasPublica(common);
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
      return NextResponse.json(r);
    }
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error al procesar la operación';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
