import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { ejecutarCancelacionReserva } from '@/lib/db/supabase-data-admin';

// A-3/A-4: baja de una socia con RETENCIÓN FISCAL. No se borra la fila (eso
// destruía recibos/facturas con obligación de conservación, o fallaba a medias
// por las FK RESTRICT). En su lugar:
//   · se ELIMINAN los datos personales sin base de retención: ficha clínica
//     (dato de salud), respuestas del cuestionario de salud, respuestas de
//     sesión, notas internas y de progreso, preferencias, documentos subidos
//     (fila + objeto en Storage);
//   · se CANCELAN (no se borran) las suscripciones — están referenciadas por
//     recibos fiscales (FK RESTRICT);
//   · se ANONIMIZA el PII de la socia y se marca `borrado_en`;
//   · se CONSERVAN recibos, facturas, ventas_pos (registro fiscal) y
//     `lecturas_ficha_salud` (auditoría de QUIÉN del estudio leyó su ficha
//     clínica y cuándo — es evidencia sobre el acceso del staff, no un dato
//     de salud de la socia en sí; borrarla destruiría esa trazabilidad sin
//     ninguna base de retención que lo exija en sentido contrario).
// El panel filtra `borrado_en IS NULL`, así la socia desaparece de los listados.
// Solo PROPIETARIO/RECEPCIÓN del propio estudio.
//
// I-14 (auditoría 29-ago): `respuestas_cuestionario_salud` y
// `documentos_socio` (+ sus objetos en Storage) no se tocaban — dato de
// salud y documentos personales (posible DNI/contrato con nombre) que
// sobrevivían al "borrado" RGPD sin ninguna base de retención que lo
// justificara.
//
// F-3 (auditoría 22ª pasada, 3-sep-2026): esta ruta nunca mencionaba
// `reservas` — sus reservas futuras (CONFIRMADA/LISTA_ESPERA/
// PENDIENTE_APROBACION) se quedaban ocupando aforo para siempre, la lista de
// espera nunca se promocionaba al liberarse el hueco, y nadie del estudio ni
// de la cola se enteraba. Se cancelan ANTES de anonimizar (paso 1c, antes del
// paso 3): `ejecutarCancelacionReserva` dispara notificaciones reales a otras
// socias (promoción de lista de espera, ofertas) que tienen que salir con el
// nombre de quien libera la plaza, no con "Socia eliminada". Reutiliza el
// mismo núcleo que ya usan `/api/reservas/cancelar` y las sustituciones —
// nunca un UPDATE directo sobre `reservas`, que se saltaría la promoción de
// espera y la devolución de bono. `omitirPenalizacion: true`: la socia no
// pulsó "cancelar", así que no se le puede aplicar cancelación tardía —
// mismo criterio que ya usa el corte automático por riesgo de plantón.

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
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
  //    Todas las tablas tienen (socio_id, studio_id) → se scopean por ambos.
  for (const tabla of [
    'condiciones_salud', 'respuestas_cuestionario_salud', 'respuestas_sesion',
    'notas_internas', 'notas_progreso', 'preferencias_socio',
  ]) {
    const { error } = await admin.from(tabla).delete().eq('socio_id', socioId).eq('studio_id', sesion.studioId);
    if (error) return NextResponse.json({ error: `No se pudo limpiar ${tabla}` }, { status: 500 });
  }

  // 1b) Documentos subidos: primero los objetos en Storage (por su
  // `storage_path` real), luego las filas. Si el borrado de Storage falla a
  // medias, la fila se queda para reintentar — nunca al revés (fila borrada
  // con el objeto todavía colgando y sin ninguna referencia que lo encuentre).
  const { data: documentos, error: errDocsLeer } = await admin
    .from('documentos_socio').select('id, storage_path')
    .eq('socio_id', socioId).eq('studio_id', sesion.studioId);
  if (errDocsLeer) return NextResponse.json({ error: 'No se pudieron leer los documentos' }, { status: 500 });
  if (documentos && documentos.length > 0) {
    const { error: errStorage } = await admin.storage
      .from('documentos-socio')
      .remove(documentos.map(d => d.storage_path as string));
    if (errStorage) return NextResponse.json({ error: 'No se pudieron borrar los documentos del almacenamiento' }, { status: 500 });
    const { error: errDocsBorrar } = await admin
      .from('documentos_socio').delete()
      .eq('socio_id', socioId).eq('studio_id', sesion.studioId);
    if (errDocsBorrar) return NextResponse.json({ error: 'No se pudo limpiar documentos_socio' }, { status: 500 });
  }

  // 2) Cancelar suscripciones (no borrar: las referencian recibos fiscales).
  const { error: errSus } = await admin
    .from('suscripciones')
    .update({ estado: 'CANCELADA' })
    .eq('socio_id', socioId)
    .eq('studio_id', sesion.studioId)
    .neq('estado', 'CANCELADA');
  if (errSus) return NextResponse.json({ error: 'No se pudieron cancelar las suscripciones' }, { status: 500 });

  // 1c) Cancelar sus reservas FUTURAS antes de anonimizar (ver cabecera, F-3).
  //     Solo clases que no han empezado — una reserva de una clase ya pasada
  //     no ocupa nada que liberar. Secuencial a propósito, igual que el resto
  //     de cancelaciones en lote de este repo: cada llamada libera un hueco y
  //     puede promocionar a la siguiente de la lista de espera, y dos
  //     promociones concurrentes de la misma cola competirían entre sí.
  const { data: reservasFuturas, error: errReservasLeer } = await admin
    .from('reservas')
    .select('id, sesiones!inner(inicio)')
    .eq('socio_id', socioId)
    .eq('studio_id', sesion.studioId)
    .in('estado', ['CONFIRMADA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION'])
    .gt('sesiones.inicio', new Date().toISOString());
  if (errReservasLeer) return NextResponse.json({ error: 'No se pudieron leer sus reservas' }, { status: 500 });
  for (const r of reservasFuturas ?? []) {
    const res = await ejecutarCancelacionReserva(admin, {
      studioId: sesion.studioId, reservaId: r.id as string, socioId, omitirPenalizacion: true,
    });
    // Best-effort a propósito: una reserva que no se pudo cancelar (carrera
    // rarísima, o ya la canceló otra vía justo antes) no debe bloquear la
    // baja RGPD de la socia — quedaría visible en logs, no en un 500 al
    // staff que solo está intentando borrar una ficha.
    if ('error' in res) {
      console.error('[socios/eliminar] no se pudo cancelar una reserva futura', socioId, r.id, res.error);
    }
  }

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
      // Fila 12 del informe estratégico: el consentimiento de datos de salud
      // deja de estar vigente aquí — condiciones_salud ya se borró por
      // completo en el paso 1, así que ya no queda ningún dato que ampare.
      consentimiento_salud_revocado_en: new Date().toISOString(),
    })
    .eq('id', socioId)
    .eq('studio_id', sesion.studioId);
  if (errAnon) return NextResponse.json({ error: 'No se pudo anonimizar la socia' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
