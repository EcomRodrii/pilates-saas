import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// A-3/A-4: baja de una socia con RETENCIÓN FISCAL. No se borra la fila (eso
// destruía recibos/facturas con obligación de conservación, o fallaba a medias
// por las FK RESTRICT). En su lugar:
//   · se ELIMINAN los datos personales sin base de retención: ficha clínica
//     (dato de salud), respuestas de sesión, notas internas y de progreso,
//     preferencias;
//   · se CANCELAN (no se borran) las suscripciones — están referenciadas por
//     recibos fiscales (FK RESTRICT);
//   · se ANONIMIZA el PII de la socia y se marca `borrado_en`;
//   · se CONSERVAN recibos, facturas y ventas_pos (registro fiscal).
// El panel filtra `borrado_en IS NULL`, así la socia desaparece de los listados.
// Solo PROPIETARIO/RECEPCIÓN del propio estudio.

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO' && sesion.rol !== 'RECEPCION') {
    return NextResponse.json({ error: 'No tienes permiso para dar de baja a una socia' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { socioId?: unknown } | null;
  const socioId = typeof body?.socioId === 'string' ? body.socioId : null;
  if (!socioId) return NextResponse.json({ error: 'Falta el socioId' }, { status: 400 });

  // La socia debe existir y ser de este estudio (autoridad: el JWT, no el body).
  const { data: socia, error: errLeer } = await admin
    .from('socios')
    .select('id, studio_id, borrado_en')
    .eq('id', socioId)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (errLeer) return NextResponse.json({ error: 'No se pudo leer la socia' }, { status: 500 });
  if (!socia) return NextResponse.json({ error: 'Socia no encontrada' }, { status: 404 });
  if (socia.borrado_en) return NextResponse.json({ ok: true, yaEstaba: true }); // idempotente

  // 1) Borrar datos personales SIN base de retención. Idempotente (re-ejecutable).
  //    La ficha clínica es dato de salud sensible: se elimina, no se conserva.
  //    Las cinco tablas tienen (socio_id, studio_id) → se scopean por ambos.
  for (const tabla of ['condiciones_salud', 'respuestas_sesion', 'notas_internas', 'notas_progreso', 'preferencias_socio']) {
    const { error } = await admin.from(tabla).delete().eq('socio_id', socioId).eq('studio_id', sesion.studioId);
    if (error) return NextResponse.json({ error: `No se pudo limpiar ${tabla}` }, { status: 500 });
  }

  // 2) Cancelar suscripciones (no borrar: las referencian recibos fiscales).
  const { error: errSus } = await admin
    .from('suscripciones')
    .update({ estado: 'CANCELADA' })
    .eq('socio_id', socioId)
    .eq('studio_id', sesion.studioId)
    .neq('estado', 'CANCELADA');
  if (errSus) return NextResponse.json({ error: 'No se pudieron cancelar las suscripciones' }, { status: 500 });

  // 3) Anonimizar el PII y marcar el borrado lógico. Se conservan recibos,
  //    facturas y ventas_pos (fiscal). El email lleva el id para no colisionar.
  const { error: errAnon } = await admin
    .from('socios')
    .update({
      nombre: 'Socia',
      apellidos: 'eliminada',
      email: `borrado+${socioId}@anon.invalid`,
      telefono: null,
      nif: null,
      direccion: null,
      fecha_nacimiento: null,
      foto_url: null,
      avatar: null,
      auth_user_id: null,
      stripe_customer_id: null,
      stripe_payment_method_id: null,
      tags: [],
      lead_stage: null,
      activo: false,
      borrado_en: new Date().toISOString(),
    })
    .eq('id', socioId)
    .eq('studio_id', sesion.studioId);
  if (errAnon) return NextResponse.json({ error: 'No se pudo anonimizar la socia' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
