import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emitirClaseModificada } from '@/lib/notifications/emit';
import { sociasDeSesion } from '@/lib/notifications/recipients';
import { enviarEmailesCambioClase } from '@/lib/emails/enviar-cambio-clase';
import { clasesParaAviso, nombreDeCompanera } from '@/lib/avisos-clase-servidor';

// Avisa (email + in-app) a las socias apuntadas de un cambio de instructora
// y/o de horario/sala. A diferencia del viejo flujo (el panel filtraba su
// propio array `reservas`/`socios` en cliente para decidir a quién mandar el
// email), las destinatarias se resuelven aquí contra la BD en el momento del
// envío — mismo criterio para ambos motivos de cambio, en una sola llamada
// (evita mandar el in-app dos veces si además se llamara aparte a
// avisar-modificada; `emitirClaseModificada` es idempotente por dedupKey de
// todas formas, pero no hace falta la doble llamada).
//
// Lo que dice el aviso (clase, fecha, hora, sala, quién la da) también sale de
// la BD: los callers guardan el cambio antes de avisar. Del body solo cuentan
// QUÉ cambió (hora, sala, instructora) y el nombre de la instructora anterior,
// que se acepta únicamente si es alguien del equipo.
export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, skipped: true });

  const b = (await req.json().catch(() => null)) as {
    sesionId?: string; instructora?: string; instructorAnterior?: string;
    cambioHora?: boolean; cambioSala?: boolean;
  } | null;
  if (typeof b?.sesionId !== 'string' || !b.sesionId) return NextResponse.json({ error: 'Falta sesionId' }, { status: 400 });

  // Mostrador y manager cualquier clase; la instructora solo la suya.
  const r = await clasesParaAviso(admin, staff, [b.sesionId]);
  if (!r) return NextResponse.json({ error: 'No se ha podido comprobar la clase.' }, { status: 500 });
  if (r.ajenas > 0) return NextResponse.json({ error: 'No tienes permiso para avisar de esta clase.' }, { status: 403 });
  const clase = r.clases[0];
  if (!clase) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });
  if (clase.cancelada) return NextResponse.json({ error: 'Esa clase está cancelada.' }, { status: 409 });

  const destinatarias = await sociasDeSesion(admin, staff.studioId, clase.id);
  const conEmail = destinatarias
    .filter((d): d is typeof d & { email: string } => !!d.email)
    .map(d => ({ email: d.email, nombre: d.nombre ?? 'Socia' }));
  const sinEmailPrevio = destinatarias.length - conEmail.length;

  // El email siempre dice quién da la clase AHORA, aunque solo se haya movido
  // la hora o la sala; el in-app solo la nombra si cambió.
  const { enviados, sinEmail } = await enviarEmailesCambioClase(staff.studioId, conEmail, {
    claseNombre: clase.clase, fecha: clase.fecha, hora: clase.hora,
    sala: clase.sala, instructor: clase.instructor,
    instructorAnterior: await nombreDeCompanera(admin, staff.studioId, b.instructorAnterior),
    cambioHora: b.cambioHora === true, cambioSala: b.cambioSala === true,
  });

  const enApp = await emitirClaseModificada(admin, {
    studioId: staff.studioId, sesionId: clase.id,
    clase: clase.clase, cuando: clase.cuando, sala: clase.sala,
    instructora: b.instructora ? clase.instructor : '',
  });

  return NextResponse.json({ ok: true, enviados, sinEmail: sinEmailPrevio + sinEmail, enApp });
}
