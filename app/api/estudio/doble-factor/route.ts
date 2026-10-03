import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { nivelAutenticacion } from '@/lib/interno/mfa';

// «Exigir la verificación en dos pasos a todo el equipo» (2-oct-2026,
// lib/auth/doble-factor-reglas.ts, regla B). Solo la propietaria.
//
// Para encenderlo, ella tiene que tenerla activada Y haber entrado con ella en
// esta sesión (`aal2`): si no, se dejaría fuera a sí misma del panel. La
// columna solo la cambia el servidor (trigger, migr 20261003102845).

async function propietaria(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (sesion.rol !== 'PROPIETARIO') {
    return { error: NextResponse.json({ error: 'Solo la propietaria puede cambiar esto' }, { status: 403 }) };
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }) };
  return { sesion, admin };
}

export async function GET(req: NextRequest) {
  const g = await propietaria(req);
  if ('error' in g) return g.error;
  const { data, error } = await g.admin.from('studios').select('exigir_doble_factor').eq('id', g.sesion.studioId).single();
  if (error || !data) return errorInterno('estudio/doble-factor:GET', error, 'No se ha podido leer el ajuste.');
  return NextResponse.json({ exigir: data.exigir_doble_factor === true });
}

export async function PUT(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'estudio-doble-factor', { max: 10, windowSeconds: 60 });
  if (limited) return limited;
  const g = await propietaria(req);
  if ('error' in g) return g.error;
  const body = await req.json().catch(() => null) as { exigir?: unknown } | null;
  if (typeof body?.exigir !== 'boolean') return NextResponse.json({ error: 'Falta «exigir» (sí o no)' }, { status: 400 });

  if (body.exigir) {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
    if (nivelAutenticacion(token) !== 'aal2') {
      return NextResponse.json({
        error: 'Actívala primero para ti en «Mi perfil» y entra con ella: así no te quedas fuera del panel.',
      }, { status: 409 });
    }
  }

  const { data, error } = await g.admin.from('studios').update({ exigir_doble_factor: body.exigir })
    .eq('id', g.sesion.studioId).select('exigir_doble_factor').single();
  if (error || !data) return errorInterno('estudio/doble-factor:PUT', error, 'No se ha podido guardar. Inténtalo de nuevo.');
  return NextResponse.json({ exigir: data.exigir_doble_factor === true });
}
