import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emitirClaseModificada } from '@/lib/notifications/emit';
import { sociasDeSesion } from '@/lib/notifications/recipients';
import { enviarEmailesCambioClase } from '@/lib/emails/enviar-cambio-clase';
import { avisoPorAlumna, type CambioClaseSerie } from '@/lib/avisos-serie';
import { clasesParaAviso, nombreDeCompanera } from '@/lib/avisos-clase-servidor';

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
//
// Igual que avisar-cambio-clase: lo que dice cada aviso sale de la BD, y solo
// se avisa de las clases que quien llama puede tocar. Una serie editada por su
// instructora puede incluir clases que da otra (una sustitución puntual): esas
// se saltan, no tumban el aviso de las suyas.
const MAX_CLASES = 200;

export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, skipped: true });

  const b = (await req.json().catch(() => null)) as { cambios?: CambioClaseSerie[] } | null;
  const cambios = Array.isArray(b?.cambios)
    ? b.cambios.filter(c => c && typeof c.sesionId === 'string')
    : [];
  if (cambios.length === 0) return NextResponse.json({ error: 'Faltan clases' }, { status: 400 });
  if (cambios.length > MAX_CLASES) return NextResponse.json({ error: 'Demasiadas clases' }, { status: 400 });

  const r = await clasesParaAviso(admin, staff, cambios.map(c => c.sesionId));
  if (!r) return NextResponse.json({ error: 'No se ha podido comprobar la clase.' }, { status: 500 });
  const claseDe = new Map(r.clases.filter(c => !c.cancelada).map(c => [c.id, c]));
  const vistos = new Set<string>();
  const enOrden = cambios
    .filter(c => claseDe.has(c.sesionId) && !vistos.has(c.sesionId) && vistos.add(c.sesionId))
    .sort((x, y) => claseDe.get(x.sesionId)!.inicio.localeCompare(claseDe.get(y.sesionId)!.inicio));
  if (enOrden.length === 0) {
    return r.ajenas > 0
      ? NextResponse.json({ error: 'No tienes permiso para avisar de estas clases.' }, { status: 403 })
      : NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });
  }

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

  const anteriores = new Map<string, string | undefined>();
  let enviados = 0;
  let sinEmail = 0;
  let enApp = 0;
  for (const c of enOrden) {
    const aqui = (porSesion.get(c.sesionId) ?? []).filter(r => avisos.get(clave(r))?.sesionId === c.sesionId);
    if (aqui.length === 0) continue;
    const clase = claseDe.get(c.sesionId)!;
    const nombreAnterior = typeof c.instructorAnterior === 'string' ? c.instructorAnterior : '';
    if (!anteriores.has(nombreAnterior)) {
      anteriores.set(nombreAnterior, await nombreDeCompanera(admin, staff.studioId, nombreAnterior));
    }

    // Dos tandas de correo por clase como mucho: con y sin «y las siguientes».
    for (const mas of [true, false]) {
      const grupo = aqui.filter(r => avisos.get(clave(r))?.masClases === mas);
      if (grupo.length === 0) continue;
      const conEmail = grupo
        .filter((r): r is typeof r & { email: string } => !!r.email)
        .map(r => ({ email: r.email, nombre: r.nombre ?? 'Socia' }));
      sinEmail += grupo.length - conEmail.length;
      const envio = await enviarEmailesCambioClase(staff.studioId, conEmail, {
        claseNombre: clase.clase, fecha: clase.fecha, hora: clase.hora,
        sala: clase.sala, instructor: clase.instructor,
        instructorAnterior: anteriores.get(nombreAnterior),
        cambioHora: c.cambioHora === true, cambioSala: c.cambioSala === true,
        masClasesDeLaSerie: mas,
      });
      enviados += envio.enviados;
      sinEmail += envio.sinEmail;
    }

    enApp += await emitirClaseModificada(admin, {
      studioId: staff.studioId, sesionId: c.sesionId,
      clase: clase.clase, cuando: clase.cuando, sala: clase.sala,
      instructora: c.instructora ? clase.instructor : '',
    });
  }

  return NextResponse.json({ ok: true, alumnas: avisos.size, enviados, sinEmail, enApp });
}
