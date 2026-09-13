import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emitirClaseModificada } from '@/lib/notifications/emit';
import { clasesParaAviso } from '@/lib/avisos-clase-servidor';

// Avisa (in-app/push) a las socias apuntadas de que su clase ha cambiado de
// horario/sala. Best-effort.
//
// Clase, hora, sala e instructora salen de la BD, no del body: quien llama ya
// ha guardado el cambio antes de avisar. Del cliente solo cuenta si cambió la
// instructora (`instructora` no vacía), que decide si el texto la nombra.
export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, skipped: true });

  const b = (await req.json().catch(() => null)) as { sesionId?: string; instructora?: string } | null;
  if (typeof b?.sesionId !== 'string' || !b.sesionId) return NextResponse.json({ error: 'Falta sesionId' }, { status: 400 });

  const r = await clasesParaAviso(admin, staff, [b.sesionId]);
  if (!r) return NextResponse.json({ error: 'No se ha podido comprobar la clase.' }, { status: 500 });
  if (r.ajenas > 0) return NextResponse.json({ error: 'No tienes permiso para avisar de esta clase.' }, { status: 403 });
  const clase = r.clases[0];
  if (!clase) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });
  if (clase.cancelada) return NextResponse.json({ error: 'Esa clase está cancelada.' }, { status: 409 });

  const avisadas = await emitirClaseModificada(admin, {
    studioId: staff.studioId, sesionId: clase.id,
    clase: clase.clase, cuando: clase.cuando, sala: clase.sala,
    instructora: b.instructora ? clase.instructor : '',
  });
  // `avisadas` = socias a las que se ha creado el aviso de verdad. El panel lo
  // usa para no cantar "avisadas 3" cuando no se ha avisado a nadie.
  return NextResponse.json({ ok: true, avisadas });
}
