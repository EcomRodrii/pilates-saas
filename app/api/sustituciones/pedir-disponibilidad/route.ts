import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { obtenerOFirmarEnlace, marcarEnlaceEnviadoPorEmail } from '@/lib/sustituciones/enlaces';
import { enviarEmailSolicitudDisponibilidad } from '@/lib/emails/solicitud-disponibilidad-server';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';

// P2-10. "Con 18 personas es inviable" copiar y reenviar un enlace uno a uno
// por WhatsApp. Esta ruta manda el email de disponibilidad a VARIAS
// instructoras de una vez — el mismo enlace de siempre
// (obtenerOFirmarEnlace, compartido con /api/sustituciones/enlace-instructora
// para que las dos vías nunca reconozcan enlaces distintos como "vigentes"),
// solo que entregado por la app en vez de copiado a mano.
//
// Resultado por instructora, no todo-o-nada: que una ficha sin email no
// pueda recibirlo no debe impedir que las otras 17 sí lo reciban.
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para pedir disponibilidad' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { instructorIds?: unknown } | null;
  const instructorIds = Array.isArray(body?.instructorIds)
    ? body.instructorIds.filter((v): v is string => typeof v === 'string')
    : null;
  if (!instructorIds || instructorIds.length === 0) {
    return NextResponse.json({ error: 'Falta a quién pedirle la disponibilidad' }, { status: 400 });
  }

  // Acotado al estudio de quien pide: un id ajeno simplemente no aparece en
  // `instructoras` y su resultado sale como "no encontrada", nunca se le manda
  // nada a otro estudio.
  const [{ data: instructoras }, { data: studio }] = await Promise.all([
    admin.from('instructores').select('id, nombre, email')
      .eq('studio_id', sesion.studioId).in('id', instructorIds),
    admin.from('studios').select('nombre, color_primario, logo_url').eq('id', sesion.studioId).maybeSingle(),
  ]);
  const porId = new Map((instructoras ?? []).map(i => [i.id as string, i]));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

  const resultados = await Promise.all(instructorIds.map(async (id) => {
    const instructora = porId.get(id);
    if (!instructora) return { id, ok: false as const, error: 'Ya no está en tu equipo' };
    if (!instructora.email) return { id, ok: false as const, error: 'Sin email en su ficha' };

    const token = await obtenerOFirmarEnlace(admin, sesion.studioId, id, 'disponibilidad');
    const r = await enviarEmailSolicitudDisponibilidad({
      to: instructora.email as string,
      nombre: (instructora.nombre as string) ?? '',
      propietariaNombre: sesion.nombre,
      estudioNombre: studio?.nombre ?? 'tu estudio',
      colorPrimario: studio?.color_primario as string | null | undefined,
      logoUrl: studio?.logo_url as string | null | undefined,
      url: `${appUrl}/disponibilidad/${token}`,
    });
    if (!r.ok) return { id, ok: false as const, error: r.skipped ? 'Email no configurado' : (r.error ?? 'No se pudo enviar') };

    await marcarEnlaceEnviadoPorEmail(admin, id, 'disponibilidad');
    return { id, ok: true as const };
  }));

  return NextResponse.json({ resultados });
}
