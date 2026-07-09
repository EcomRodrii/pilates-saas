import { NextRequest, NextResponse } from 'next/server';
import { registrarSociaPublica, actualizarSociaPublica, guardarPreferenciasPublica, socioAutenticado } from '@/lib/supabase-data';
import { verificarUsuarioSupabase } from '@/lib/auth-server';

// Operaciones de la propia socia desde el portal/reserva (service-role +
// validación). Sustituye las escrituras anónimas directas sobre socios/prefs.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    accion?: 'registrar' | 'actualizar' | 'preferencias';
    studioId?: string;
    socioId?: string;
    id?: string;
    nombre?: string;
    email?: string;
    aceptacion?: { fecha: string; firma: string; versionTexto: string };
    referidoPor?: string | null;
    cambios?: Record<string, unknown>;
  } | null;

  if (!body?.studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  try {
    if (body.accion === 'registrar') {
      if (!body.id || !body.nombre || !body.email) {
        return NextResponse.json({ error: 'Faltan datos de la socia' }, { status: 400 });
      }
      const r = await registrarSociaPublica({
        studioId: body.studioId, id: body.id, nombre: body.nombre, email: body.email,
        aceptacion: body.aceptacion, referidoPor: body.referidoPor ?? null,
      });
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json(r);
    }

    if (!body.socioId || !body.email) {
      return NextResponse.json({ error: 'Falta identidad de la socia' }, { status: 400 });
    }
    const common = { studioId: body.studioId, socioId: body.socioId, email: body.email, cambios: body.cambios ?? {} };

    if (body.accion === 'actualizar') {
      const r = await actualizarSociaPublica(common);
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
      return NextResponse.json(r);
    }
    if (body.accion === 'preferencias') {
      // Preferencias: solo desde el portal con sesión real de socia (JWT). La
      // identidad sale del token, no del body (que aquí se ignora).
      const user = await verificarUsuarioSupabase(req);
      if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      const sid = await socioAutenticado(user.userId, body.studioId);
      if (!sid) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      const r = await guardarPreferenciasPublica({ studioId: body.studioId, socioId: sid, email: user.email, cambios: body.cambios ?? {} });
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
      return NextResponse.json(r);
    }
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error al procesar la operación';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
