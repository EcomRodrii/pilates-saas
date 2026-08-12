import { NextRequest, NextResponse } from 'next/server';
import {
  crearPlazaFijaPublica, pausarPlazaFijaPublica, reanudarPlazaFijaPublica, darDeBajaPlazaFijaPublica,
  socioAutenticado,
} from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Autoservicio de plaza fija desde el portal (Feature #2, ficha Lorari-vs-Tentare):
// la socia crea/pausa/reanuda/da de baja su propio hueco semanal recurrente.
// Antes era gestión exclusiva de staff (FichaPlazaFija, panel).
// SEGURIDAD: igual que /api/public/reserva, la identidad sale del JWT
// verificado, nunca del body — nadie puede tocar la plaza fija de otra socia
// conociendo su id.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-plaza-fija', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    accion?: 'crear' | 'pausar' | 'reanudar' | 'dar_de_baja';
    studioId?: string;
    sesionId?: string;
    plazaId?: string;
  } | null;

  if (!body?.studioId) {
    return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    if (body.accion === 'crear') {
      if (!body.sesionId) return NextResponse.json({ error: 'Falta la sesión' }, { status: 400 });
      const r = await crearPlazaFijaPublica({ studioId: body.studioId, sesionId: body.sesionId, socioId, email: user.email });
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
      return NextResponse.json(r);
    }
    if (body.accion === 'pausar' || body.accion === 'reanudar' || body.accion === 'dar_de_baja') {
      if (!body.plazaId) return NextResponse.json({ error: 'Falta la plaza fija' }, { status: 400 });
      const fn = body.accion === 'pausar' ? pausarPlazaFijaPublica
        : body.accion === 'reanudar' ? reanudarPlazaFijaPublica
        : darDeBajaPlazaFijaPublica;
      const r = await fn({ studioId: body.studioId, plazaId: body.plazaId, socioId, email: user.email });
      if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 });
      return NextResponse.json(r);
    }
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err) {
    return errorInterno('public/plaza-fija:POST', err, 'No se ha podido procesar la plaza fija.');
  }
}
