import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { nombreCortoInstructora } from '@/lib/utils';
import { nombreEnElTablon } from '@/lib/comunidad/comentarios-reglas';

// «Personas bloqueadas» de la alumna en ESTE estudio (Perfil › Privacidad y
// datos; App Store 1.2): a quién bloqueó en el tablón y en sus mensajes, con el
// nombre con el que la vio, para poder desbloquearla. Solo lo que bloqueó ELLA:
// que alguien la bloqueó a ella no se le cuenta. Quién es sale del token y de
// su ficha en este estudio; desbloquear va por las rutas de siempre
// (`/social/companeras/[id]/desbloquear` y `/mensajeria/conversaciones/[id]/bloquear`).
export async function GET(req: NextRequest) {
  const studioId = new URL(req.url).searchParams.get('studioId');
  if (!studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const [tablon, misFilas] = await Promise.all([
      admin.from('socio_companeras').select('id, solicitante_id, destinataria_id, resuelto_en')
        .eq('studio_id', studioId).eq('estado', 'bloqueada').eq('bloqueada_por', socioId),
      admin.from('conversacion_participantes').select('conversacion_id, bloqueo_en')
        .eq('socio_id', socioId).eq('rol_en_conversacion', 'SOCIO').not('bloqueo_en', 'is', null),
    ]);
    if (tablon.error) throw tablon.error;
    if (misFilas.error) throw misFilas.error;

    const relaciones = (tablon.data ?? []) as { id: string; solicitante_id: string; destinataria_id: string; resuelto_en: string | null }[];
    const otras = relaciones.map((r) => (r.solicitante_id === socioId ? r.destinataria_id : r.solicitante_id));
    const bloqueos = (misFilas.data ?? []) as { conversacion_id: string; bloqueo_en: string }[];
    const idsConv = bloqueos.map((b) => b.conversacion_id);

    const [socias, convs] = await Promise.all([
      otras.length
        ? admin.from('socios').select('id, nombre, apellidos').eq('studio_id', studioId).in('id', otras)
        : Promise.resolve({ data: [], error: null }),
      idsConv.length
        ? admin.from('conversaciones').select('id, conversacion_participantes(rol_en_conversacion, auth_user_id)')
          .eq('studio_id', studioId).eq('tipo', 'ALUMNA_INSTRUCTORA').in('id', idsConv)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (socias.error) throw socias.error;
    if (convs.error) throw convs.error;

    const staffPorConv = new Map<string, string>();
    for (const c of (convs.data ?? []) as { id: string; conversacion_participantes: { rol_en_conversacion: string; auth_user_id: string | null }[] | null }[]) {
      const staff = (c.conversacion_participantes ?? []).find((p) => p.rol_en_conversacion === 'STAFF')?.auth_user_id;
      if (staff) staffPorConv.set(c.id, staff);
    }
    const cuentas = [...new Set(staffPorConv.values())];
    const { data: equipo, error: errEquipo } = cuentas.length
      ? await admin.from('instructores').select('auth_user_id, nombre').eq('studio_id', studioId).in('auth_user_id', cuentas)
      : { data: [], error: null };
    if (errEquipo) throw errEquipo;

    const nombreSocia = new Map(((socias.data ?? []) as { id: string; nombre: string | null; apellidos: string | null }[])
      .map((s) => [s.id, nombreEnElTablon(s).nombre]));
    const nombreEquipo = new Map(((equipo ?? []) as { auth_user_id: string; nombre: string | null }[])
      .map((e) => [e.auth_user_id, nombreCortoInstructora(e.nombre ?? '') || 'Tu instructora']));

    const personas = [
      ...relaciones.map((r, i) => ({
        tipo: 'TABLON' as const, id: r.id, nombre: nombreSocia.get(otras[i]) ?? 'Una compañera', desde: r.resuelto_en,
      })),
      // Solo los hilos con una instructora de este estudio (el del estudio no se bloquea).
      ...bloqueos.filter((b) => staffPorConv.has(b.conversacion_id)).map((b) => ({
        tipo: 'MENSAJES' as const, id: b.conversacion_id,
        nombre: nombreEquipo.get(staffPorConv.get(b.conversacion_id)!) ?? 'Tu instructora', desde: b.bloqueo_en,
      })),
    ];
    return NextResponse.json({ personas }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorInterno('public/bloqueos:GET', e, 'No se han podido cargar tus bloqueos.');
  }
}
