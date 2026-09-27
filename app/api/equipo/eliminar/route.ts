import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { borrarCuentaSiQuedaSuelta } from '@/lib/socios/cuenta-acceso-servidor';
import { conReintentos, type TerceroPendiente } from '@/lib/socios/terceros-supresion';
import {
  avisoNombreSinReconocer, avisoPendientesEquipo, interpretarErrorEliminarPersona, puedeEliminarDefinitivamente,
} from '@/lib/equipo/eliminar-persona-reglas';

export const dynamic = 'force-dynamic';

// Eliminar definitivamente a una persona del equipo (art. 17 RGPD). Hasta ahora «dar de baja»
// solo la desactivaba: su ficha y su cuenta seguían enteras.
//
// Solo la PROPIETARIA, y solo sobre alguien YA de baja (`lib/equipo/eliminar-persona-reglas.ts`).
// Lo que se borra y lo que se conserva por ley: la función SQL `anonimizar_instructor` (migración
// 20260927024813 y su revisión 20260927030914), con su test de contrato. Es el equivalente por persona de lo que
// `purgar_estudio_vencido` hace con todo un estudio, y de `app/api/socios/eliminar` con una socia.
//
// Orden, y por qué:
//   1. Guardas en TS (rol, no una misma, no la dueña, ya de baja). La base de datos repite las que
//      protegen a la PERSONA (que esté de baja, que no sea la propietaria, y las de no dejar nada a
//      medias): esta ruta usa service-role, así que la cerradura real tiene que estar también dentro.
//      Quién puede pedirlo (solo la propietaria) y «no una misma» solo se comprueban aquí.
//   2. `anonimizar_instructor` (RPC, service_role), en UNA transacción. Si falla, 4xx/5xx y no se
//      ha tocado ningún tercero NI la foto: una ficha que sigue activa no puede quedarse con la foto rota.
//   3. La foto del bucket PÚBLICO `avatars` (el objeto es `instructor-<id>`), DESPUÉS y solo si ninguna
//      otra ficha apunta a ella: la misma persona en otra sede de la cadena comparte la URL. Con reintentos;
//      si aun así falla (o no se pudo comprobar si otra ficha la usa) queda como pendiente, igual que la
//      cuenta: una foto que nadie borra seguiría pública en una ruta predecible, sin ninguna ficha detrás.
//   4. La cuenta de acceso (auth.users), FUERA de la transacción y solo si no le queda ningún otro
//      vínculo (`decidirBorradoCuenta`, fail-closed): puede ser socia en otro estudio, dueña, o
//      trabajar en otra sede de la cadena. Lo que falle se guarda en `supresiones_equipo` y la
//      respuesta lo dice. Volver a llamar a esta ruta sobre alguien ya eliminado reaplica la
//      limpieza y reintenta lo pendiente: la pantalla de Equipo sigue mostrando a esa persona («Persona
//      eliminada») mientras quede algo, y ofrece «Completar la eliminación».
export async function POST(req: NextRequest) {
  const limitado = await enforceRateLimit(req, 'equipo-eliminar', { max: 10, windowSeconds: 60 });
  if (limitado) return limitado;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { instructorId?: unknown } | null;
  const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : null;
  if (!instructorId) return NextResponse.json({ error: 'Falta la persona' }, { status: 400 });

  // La persona debe existir y ser de ESTE estudio (autoridad: la sesión, nunca el cuerpo).
  const { data: ficha, error: errLeer } = await admin
    .from('instructores')
    .select('id, rol, activo, auth_user_id, foto_url')
    .eq('id', instructorId)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (errLeer) return NextResponse.json({ error: 'No se pudo leer a la persona' }, { status: 500 });
  if (!ficha) return NextResponse.json({ error: 'No encontramos a esa persona en tu equipo.' }, { status: 404 });

  // ¿Ya eliminada antes? Entonces solo se reaplica y se reintentan sus pendientes.
  // Sin poder leerlo no se sigue: se perderían los pendientes de la vez anterior al guardar los nuevos.
  const { data: previa, error: errPrevia } = await admin
    .from('supresiones_equipo')
    .select('auth_user_id, terceros_pendientes')
    .eq('studio_id', sesion.studioId)
    .eq('instructor_id', instructorId)
    .maybeSingle();
  if (errPrevia) return NextResponse.json({ error: 'No se pudo leer a la persona' }, { status: 500 });

  const veredicto = puedeEliminarDefinitivamente({
    rolActor: sesion.rol,
    esPropia: ficha.auth_user_id != null && ficha.auth_user_id === sesion.userId,
    rolDeLaPersona: (ficha.rol as string | null) ?? null,
    activa: ficha.activo !== false,
  });
  if (!veredicto.ok) return NextResponse.json({ error: veredicto.mensaje, motivo: veredicto.motivo }, { status: veredicto.http });

  // 2) La supresión en sí, en una transacción.
  const { data: resumen, error: errRpc } = await admin.rpc('anonimizar_instructor', {
    p_studio_id: sesion.studioId, p_instructor_id: instructorId, p_ejecutada_por: sesion.userId,
  });
  if (errRpc) {
    const { error, http } = interpretarErrorEliminarPersona(errRpc.message);
    if (http >= 500) console.error('[equipo/eliminar] anonimizar_instructor falló', errRpc);
    return NextResponse.json({ error }, { status: http });
  }

  // 3) La foto, del almacenamiento y no solo de la columna (bucket público). Ya con la ficha anonimizada
  //    (su `foto_url` es NULL), cualquier ficha que aún apunte a esa URL es de OTRA sede de la misma persona.
  //    Además de la de esta pasada, las que quedaron pendientes de una anterior (la URL ya no está en la ficha).
  const previos = Array.isArray(previa?.terceros_pendientes) ? (previa.terceros_pendientes as TerceroPendiente[]) : [];
  const pendientes: TerceroPendiente[] = [];
  const fotos = new Set<string>(previos.filter(p => p.tercero === 'foto_avatar').map(p => p.ref));
  const foto = (ficha.foto_url as string | null) ?? null;
  if (foto) fotos.add(foto);
  for (const url of fotos) {
    const p = await borrarFotoSiNadieMasLaUsa(admin, instructorId, url);
    if (p) pendientes.push(p);
  }

  // 4) La cuenta de acceso. La de la ficha en este momento, o la que quedó registrada si ya estaba eliminada.
  const cuenta = (resumen as { auth_user_id?: unknown } | null)?.auth_user_id;
  const authUserId = typeof cuenta === 'string' ? cuenta : ((previa?.auth_user_id as string | null) ?? null);
  let cuentaConservada = false;
  const cuentasPorBorrar = new Set<string>([...(authUserId ? [authUserId] : []), ...previos.filter(p => p.tercero === 'cuenta_acceso').map(p => p.ref)]);
  for (const uid of cuentasPorBorrar) {
    const r = await borrarCuentaSiQuedaSuelta(admin, uid, 'equipo/eliminar');
    if (r.pendiente) pendientes.push(r.pendiente);
    if (r.conservada) cuentaConservada = true;
  }
  await guardarPendientes(admin, sesion.studioId, instructorId, pendientes);

  // Lo que la propietaria tiene que saber: lo que falta por borrar, y si su nombre no se pudo buscar en los textos libres.
  const motivoNombre = (resumen as { motivo_nombre_sin_reconocer?: unknown } | null)?.motivo_nombre_sin_reconocer;
  const avisos = [avisoPendientesEquipo(pendientes), avisoNombreSinReconocer(motivoNombre)].filter((a): a is string => a !== null);

  return NextResponse.json({
    ok: true,
    yaEstaba: previa != null,
    cuentaConservada,
    completa: pendientes.length === 0,
    aviso: avisos.length > 0 ? avisos.join(' ') : null,
  });
}

/**
 * Borra del bucket la foto de la persona si ninguna otra ficha apunta a la misma URL (otra sede de la misma persona).
 * Devuelve el pendiente si no se pudo (tampoco si no se pudo comprobar): ese caso se reintenta, no se da por hecho.
 */
async function borrarFotoSiNadieMasLaUsa(admin: SupabaseClient, instructorId: string, url: string): Promise<TerceroPendiente | null> {
  const pendiente = (motivo: string): TerceroPendiente => ({ tercero: 'foto_avatar', ref: url, motivo, en: new Date().toISOString() });
  const { count, error } = await admin.from('instructores').select('id', { count: 'exact', head: true }).eq('foto_url', url);
  if (error) return pendiente(`No se pudo comprobar si otra ficha usa la foto: ${error.message}`);
  if (count) return null;
  const r = await conReintentos(async () => {
    const { error: errFoto } = await admin.storage.from('avatars').remove([`instructor-${instructorId}`]);
    if (errFoto) throw errFoto;
  });
  if (r.ok) return null;
  console.error('[equipo/eliminar] no se pudo borrar la foto', r.error);
  return pendiente(`Foto: ${r.error}`);
}

async function guardarPendientes(admin: SupabaseClient, studioId: string, instructorId: string, pendientes: TerceroPendiente[]) {
  const { error } = await admin
    .from('supresiones_equipo')
    .update({ terceros_pendientes: pendientes })
    .eq('studio_id', studioId)
    .eq('instructor_id', instructorId);
  // No se oculta: la respuesta ya lleva el aviso. Pero sin la fila actualizada nadie los reintentará.
  if (error) console.error('[equipo/eliminar] no se pudieron registrar los terceros pendientes', instructorId, error);
}
