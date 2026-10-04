import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { MENSAJE_NO_BORRABLE, PALABRA_BORRAR_CUENTA, confirmaBorrarCuenta } from '@/lib/cuenta/borrar-cuenta';
import { borrarMiCuenta } from '@/lib/cuenta/borrar-cuenta-servidor';

export const dynamic = 'force-dynamic';

// POST /api/public/cuenta/borrar — «Borrar mi cuenta de Tentare» desde la app de
// la alumna (App Store 5.1.1(v)). Borra la CUENTA de acceso al momento; las fichas
// de los estudios se quedan, desvinculadas. La supresión de los datos de un
// estudio sigue siendo una solicitud a ese estudio (/api/public/solicitud-derechos).
//
// La identidad sale SOLO del JWT (con su segundo paso, si lo tiene): del cuerpo se
// lee únicamente la palabra de confirmación, que se exige también aquí porque el
// botón desactivado es la UI y la UI nunca es el límite. Quién puede y quién no,
// en lib/cuenta/borrar-cuenta.ts; los pasos, en lib/cuenta/borrar-cuenta-servidor.ts.
export async function POST(req: NextRequest) {
  const limitado = await enforceRateLimit(req, 'public-cuenta-borrar', { max: 5, windowSeconds: 600 });
  if (limitado) return limitado;

  const body = (await req.json().catch(() => null)) as { confirmacion?: unknown } | null;
  if (!confirmaBorrarCuenta(body?.confirmacion)) {
    return errorPeticion(`Escribe ${PALABRA_BORRAR_CUENTA} para confirmar.`);
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const r = await borrarMiCuenta(admin, user.userId);
    if (r.ok) return NextResponse.json({ borrada: true }, { headers: { 'Cache-Control': 'no-store' } });
    if (r.motivo === 'no_verificable') {
      return errorInterno('public/cuenta/borrar:vinculos', new Error(`sin comprobar: ${r.vinculos?.join(', ')}`), MENSAJE_NO_BORRABLE.no_verificable, 503);
    }
    if (r.motivo === 'fallo') {
      return errorInterno(`public/cuenta/borrar:${r.paso}`, new Error(r.error), 'No hemos podido borrar tu cuenta. Inténtalo de nuevo en unos minutos.');
    }
    return errorPeticion(MENSAJE_NO_BORRABLE[r.motivo], 409, { codigo: r.motivo });
  } catch (err) {
    return errorInterno('public/cuenta/borrar', err, 'No hemos podido borrar tu cuenta. Inténtalo de nuevo en unos minutos.');
  }
}
