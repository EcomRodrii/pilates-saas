import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import type { RowReservas, RowSocioCompaneras, RowSocios } from '@/lib/db-types';

// "Quién más va a esta clase" — lee `reservas` CONFIRMADA de la sesión,
// excluye a la propia socia, y decide qué nombre enseñar de cada compañera:
//
//   - relación `aceptada` con la socia de la sesión → nombre completo.
//   - si no hay relación aceptada pero `socios.visible_en_clase = true`
//     (opt-in general, no depende de conocerse) → solo nombre de pila.
//   - si no se cumple ninguna → NO se incluye ni con nombre ni "alguien
//     más" suelto; solo suma al contador `otrasSinNombre`. Decisión: dar la
//     sensación de "no estás sola" sin filtrar identidad de nadie que no dio
//     su opt-in ni aceptó la solicitud — enseñar aunque sea una silueta
//     anónima ya sería más de lo que esa socia consintió.
//
// Una relación `bloqueada` nunca cambia este cálculo respecto a "sin
// relación": si A bloqueó a B (o viceversa), esa fila simplemente no es
// `aceptada`, así que cae en la misma rama que "no se conocen" — ninguna de
// las dos partes ve nada raro, ni un hueco, ni un aviso.
export async function GET(req: NextRequest, { params }: { params: Promise<{ sesionId: string }> }) {
  const limited = await enforceRateLimit(req, 'public-social-clase', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const studioId = searchParams.get('studioId');
  if (!studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { sesionId } = await params;

  // La sesión tiene que ser de ESTE estudio — sin esto, `sesionId` de otro
  // estudio filtraría quién reservó una clase ajena.
  const { data: sesion } = await admin
    .from('sesiones')
    .select('id')
    .eq('id', sesionId)
    .eq('studio_id', studioId)
    .maybeSingle();
  if (!sesion) return errorPeticion('Esa clase no existe en este estudio.', 404);

  const { data: reservasData, error: errorReservas } = await admin
    .from('reservas')
    .select('socio_id')
    .eq('sesion_id', sesionId)
    .eq('estado', 'CONFIRMADA');
  if (errorReservas) {
    return errorInterno('public/social/clase:GET', errorReservas, 'No se ha podido cargar quién va a esta clase.');
  }

  const otrasSocioIds = Array.from(new Set(
    ((reservasData ?? []) as Pick<RowReservas, 'socio_id'>[])
      .map(r => r.socio_id)
      .filter((id): id is string => Boolean(id) && id !== socioId),
  ));

  if (otrasSocioIds.length === 0) {
    return NextResponse.json({ companeras: [], otrasSinNombre: 0 });
  }

  const [{ data: sociosData, error: errorSocios }, { data: relacionesData, error: errorRelaciones }] = await Promise.all([
    admin
      .from('socios')
      .select('id, nombre, apellidos, visible_en_clase')
      .in('id', otrasSocioIds),
    admin
      .from('socio_companeras')
      .select('*')
      .eq('studio_id', studioId)
      .eq('estado', 'aceptada')
      .or(`solicitante_id.eq.${socioId},destinataria_id.eq.${socioId}`),
  ]);
  if (errorSocios) return errorInterno('public/social/clase:GET', errorSocios, 'No se ha podido cargar quién va a esta clase.');
  if (errorRelaciones) return errorInterno('public/social/clase:GET', errorRelaciones, 'No se ha podido cargar quién va a esta clase.');

  const aceptadasConmigo = new Set(
    ((relacionesData ?? []) as RowSocioCompaneras[])
      .map(r => (r.solicitante_id === socioId ? r.destinataria_id : r.solicitante_id)),
  );

  const socios = (sociosData ?? []) as Pick<RowSocios, 'id' | 'nombre' | 'apellidos' | 'visible_en_clase'>[];

  const companeras: Array<{ socioId: string; nombre: string; nombreCompleto: boolean }> = [];
  let otrasSinNombre = 0;

  for (const otraId of otrasSocioIds) {
    const socio = socios.find(s => s.id === otraId);
    if (!socio) continue; // fila huérfana (socia borrada), no cuenta ni con nombre ni sin él.

    if (aceptadasConmigo.has(otraId)) {
      companeras.push({
        socioId: otraId,
        nombre: `${socio.nombre} ${socio.apellidos}`.trim(),
        nombreCompleto: true,
      });
    } else if (socio.visible_en_clase) {
      companeras.push({ socioId: otraId, nombre: socio.nombre, nombreCompleto: false });
    } else {
      otrasSinNombre += 1;
    }
  }

  return NextResponse.json({ companeras, otrasSinNombre });
}
