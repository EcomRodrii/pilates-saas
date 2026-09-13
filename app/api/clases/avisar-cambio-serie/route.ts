import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emitirClaseModificada } from '@/lib/notifications/emit';
import { sociasDeSesion } from '@/lib/notifications/recipients';
import { enviarEmailesCambioClase } from '@/lib/emails/enviar-cambio-clase';
import { avisoPorAlumna, type CambioClaseSerie } from '@/lib/avisos-serie';

// Aviso de una edición de SERIE («Guardar esta y las siguientes»). Hermano de
// avisar-cambio-clase, que avisa de UNA clase: llamarlo en bucle mandaba a una
// alumna con plaza en las 4 clases de la serie cuatro correos por un solo
// cambio (evaluación del 13-sep). Aquí cada alumna recibe un correo, el de su
// primera clase que cambia, y el correo dice si detrás hay más.
//
// El in-app se emite solo en las clases que son la primera de alguna alumna.
// `CLASE_MODIFICADA` avisa a TODAS las apuntadas de esa clase, así que quien
// está en la primera y también en otra que sea la primera de otra alumna puede
// recibir dos push — raro (hace falta alguien que no esté en la primera), y
// mucho menos que uno por clase.
const MAX_CLASES = 200;

export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, skipped: true });

  const b = (await req.json().catch(() => null)) as { cambios?: CambioClaseSerie[] } | null;
  const cambios = Array.isArray(b?.cambios)
    ? b.cambios.filter(c => c && typeof c.sesionId === 'string' && typeof c.inicio === 'string')
    : [];
  if (cambios.length === 0) return NextResponse.json({ error: 'Faltan clases' }, { status: 400 });
  if (cambios.length > MAX_CLASES) return NextResponse.json({ error: 'Demasiadas clases' }, { status: 400 });

  // Solo clases de SU estudio: los ids vienen del cliente.
  const ids = [...new Set(cambios.map(c => c.sesionId))];
  const { data: propias } = await admin.from('sesiones')
    .select('id').eq('studio_id', staff.studioId).in('id', ids);
  const validas = new Set((propias ?? []).map(s => s.id as string));
  const enOrden = cambios
    .filter(c => validas.has(c.sesionId))
    .sort((x, y) => x.inicio.localeCompare(y.inicio));
  if (enOrden.length === 0) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });

  // Destinatarias resueltas contra la BD en el momento del envío, igual que
  // avisar-cambio-clase. Clave de alumna: su id de socia.
  const porSesion = new Map<string, Awaited<ReturnType<typeof sociasDeSesion>>>();
  for (const c of enOrden) {
    porSesion.set(c.sesionId, await sociasDeSesion(admin, staff.studioId, c.sesionId));
  }
  const clave = (r: { socioId?: string | null; email?: string | null }) => r.socioId ?? r.email ?? '';
  const avisos = avisoPorAlumna(
    enOrden.map(c => c.sesionId),
    new Map([...porSesion].map(([id, rs]) => [id, rs.map(clave).filter(Boolean)])),
  );

  let enviados = 0;
  let sinEmail = 0;
  let enApp = 0;
  for (const c of enOrden) {
    const aqui = (porSesion.get(c.sesionId) ?? []).filter(r => avisos.get(clave(r))?.sesionId === c.sesionId);
    if (aqui.length === 0) continue;

    // Dos tandas de correo por clase como mucho: con y sin «y las siguientes».
    for (const mas of [true, false]) {
      const grupo = aqui.filter(r => avisos.get(clave(r))?.masClases === mas);
      if (grupo.length === 0) continue;
      const conEmail = grupo
        .filter((r): r is typeof r & { email: string } => !!r.email)
        .map(r => ({ email: r.email, nombre: r.nombre ?? 'Socia' }));
      sinEmail += grupo.length - conEmail.length;
      const r = await enviarEmailesCambioClase(staff.studioId, conEmail, {
        claseNombre: c.clase || 'tu clase', fecha: c.fecha || '', hora: c.hora || '',
        sala: c.sala || '', instructor: c.instructorActual || c.instructora || '',
        instructorAnterior: c.instructorAnterior, cambioHora: c.cambioHora, cambioSala: c.cambioSala,
        masClasesDeLaSerie: mas,
      });
      enviados += r.enviados;
      sinEmail += r.sinEmail;
    }

    enApp += await emitirClaseModificada(admin, {
      studioId: staff.studioId, sesionId: c.sesionId,
      clase: c.clase || 'tu clase', cuando: c.cuando || '', sala: c.sala || '',
      instructora: c.instructora || '',
    });
  }

  return NextResponse.json({ ok: true, alumnas: avisos.size, enviados, sinEmail, enApp });
}
