import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uid } from '@/lib/utils';
import { registrarDenuncia } from '@/lib/moderacion/denuncias-servidor';
import { audienciaDelPost, socioEnLaAudiencia } from './audiencia';
import { esSuyo, filtrarComentariosParaSocia, nombreEnElTablon } from './comentarios-reglas';

// Lo que la alumna puede hacer con los comentarios del tablón, en el servidor
// (App Store 1.2). Service-role: la RLS no actúa, así que cada función parte de
// la socia que dice el token (`socioId`, ya resuelto por la ruta), comprueba que
// el comentario es de ESTE estudio y que su publicación va dirigida a ella, y
// solo entonces escribe. Lo que no cumple responde como si no existiera.

export interface ComentarioDeLaSocia {
  id: string; post_id: string; socio_id: string | null; autor_id: string | null; oculto_en: string | null;
}

/**
 * El comentario, si es de este estudio y la socia lo puede VER: su publicación
 * va dirigida a ella y el comentario pasa el mismo filtro que la lista
 * (`filtrarComentariosParaSocia`: lo retirado, lo de un bloqueo y, en una
 * publicación para un grupo, lo de otras alumnas, no). `null` si no (misma
 * respuesta para «no existe» y «no es para ti»).
 */
export async function comentarioVisible(
  admin: SupabaseClient, p: { studioId: string; socioId: string; authUserId: string; comentarioId: string },
): Promise<ComentarioDeLaSocia | null> {
  const { data, error } = await admin.from('comentarios_comunidad')
    .select('id, post_id, socio_id, autor_id, oculto_en')
    .eq('id', p.comentarioId).eq('studio_id', p.studioId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const audiencia = await audienciaDelPost(admin, { postId: data.post_id as string, studioId: p.studioId });
  if (!audiencia) return null;
  if (!await socioEnLaAudiencia(admin, { studioId: p.studioId, socioId: p.socioId, audiencia })) return null;
  const c = data as ComentarioDeLaSocia;
  const bloqueadas = c.socio_id && !esSuyo(c, p) ? await bloqueadasConmigo(admin, p.studioId, p.socioId) : new Set<string>();
  return filtrarComentariosParaSocia([c], { socioId: p.socioId, authUserId: p.authUserId, audiencia, bloqueadas })[0] ?? null;
}

/** Las socias con las que hay un bloqueo, en cualquiera de los dos sentidos: ni las ve ni la ven. */
export async function bloqueadasConmigo(admin: SupabaseClient, studioId: string, socioId: string): Promise<Set<string>> {
  const { data, error } = await admin.from('socio_companeras')
    .select('solicitante_id, destinataria_id')
    .eq('studio_id', studioId).eq('estado', 'bloqueada')
    .or(`solicitante_id.eq.${socioId},destinataria_id.eq.${socioId}`);
  if (error) throw error;
  const out = new Set<string>();
  for (const f of (data ?? []) as { solicitante_id: string; destinataria_id: string }[]) {
    out.add(f.solicitante_id === socioId ? f.destinataria_id : f.solicitante_id);
  }
  return out;
}

/** Borra un comentario suyo. `null` si no existe o no es suyo. */
export async function borrarComentarioPropio(
  admin: SupabaseClient, p: { studioId: string; socioId: string; authUserId: string; comentarioId: string },
): Promise<{ ok: true } | null> {
  const c = await comentarioVisible(admin, p);
  if (!c || !esSuyo(c, p)) return null;
  const { data, error } = await admin.from('comentarios_comunidad').delete()
    .eq('id', c.id).eq('studio_id', p.studioId).select('id');
  if (error) throw error;
  // Lo retirado ya no contaba (`ocultar_comentario_comunidad` restó uno).
  if ((data ?? []).length > 0 && !c.oculto_en) {
    await admin.rpc('ajustar_comentarios_count', { p_post_id: c.post_id, p_studio_id: p.studioId, p_delta: -1 });
  }
  return { ok: true };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Denuncia un comentario de otra persona. `null` si no lo puede ver. */
export async function denunciarComentario(
  admin: SupabaseClient, p: { studioId: string; socioId: string; authUserId: string; comentarioId: string; detalle?: string | null },
): Promise<{ ok: true } | { ok: false; status: number; error: string } | null> {
  const c = await comentarioVisible(admin, p);
  if (!c) return null;
  if (esSuyo(c, p)) return { ok: false, status: 400, error: 'No puedes denunciar un comentario tuyo.' };
  await registrarDenuncia(admin, {
    studioId: p.studioId, ambito: 'TABLON', motivo: 'DENUNCIA', comentarioId: c.id,
    autorAuthUserId: c.autor_id && UUID.test(c.autor_id) ? c.autor_id : null,
    denuncianteAuthUserId: p.authUserId, socioId: p.socioId, detalle: p.detalle ?? null,
  });
  return { ok: true };
}

/**
 * Bloquea a la alumna que escribió el comentario, con el mismo bloqueo que ya
 * usan las compañeras (`socio_companeras`): desde ese momento ni ve sus
 * comentarios ni ella los suyos. Al estudio le llega para revisarlo. Al equipo
 * no se le bloquea (no es una compañera): su comentario se denuncia.
 */
export async function bloquearAutoraDelComentario(
  admin: SupabaseClient, p: { studioId: string; socioId: string; authUserId: string; comentarioId: string },
): Promise<{ ok: true } | { ok: false; status: number; error: string } | null> {
  const c = await comentarioVisible(admin, p);
  if (!c) return null;
  if (esSuyo(c, p)) return { ok: false, status: 400, error: 'No puedes bloquearte a ti misma.' };
  if (!c.socio_id) return { ok: false, status: 400, error: 'Este comentario es del estudio. Si algo no está bien, denúncialo.' };
  const otra = c.socio_id;

  const { data: existente, error } = await admin.from('socio_companeras').select('id, estado, bloqueada_por')
    .eq('studio_id', p.studioId)
    .or(`and(solicitante_id.eq.${p.socioId},destinataria_id.eq.${otra}),and(solicitante_id.eq.${otra},destinataria_id.eq.${p.socioId})`)
    .maybeSingle();
  if (error) throw error;
  const ahora = new Date().toISOString();
  let nuevo = false;
  if (!existente) {
    const { error: e } = await admin.from('socio_companeras').insert({
      id: `comp-${uid()}`, studio_id: p.studioId, solicitante_id: p.socioId, destinataria_id: otra,
      estado: 'bloqueada', bloqueada_por: p.socioId, resuelto_en: ahora,
    });
    // Otra petición a la vez ya lo creó: el bloqueo existe igual.
    if (e && (e as { code?: string }).code !== '23505') throw e;
    nuevo = !e;
  } else if (existente.estado !== 'bloqueada') {
    const { error: e } = await admin.from('socio_companeras')
      .update({ estado: 'bloqueada', bloqueada_por: p.socioId, resuelto_en: ahora })
      .eq('id', existente.id as string);
    if (e) throw e;
    nuevo = true;
  }
  // Si ya estaba bloqueada (por ella o por la otra), no se dice nada más ni se avisa otra vez.
  if (nuevo) {
    await registrarDenuncia(admin, {
      studioId: p.studioId, ambito: 'TABLON', motivo: 'BLOQUEO', comentarioId: c.id,
      autorAuthUserId: c.autor_id && UUID.test(c.autor_id) ? c.autor_id : null,
      denuncianteAuthUserId: p.authUserId, socioId: p.socioId,
    });
  }
  return { ok: true };
}

/** La fila nueva de un comentario de la alumna: con nombre e inicial, nunca sus apellidos. */
export function filaComentarioDeSocia(p: {
  studioId: string; postId: string; authUserId: string; socioId: string; texto: string;
  socio: { nombre: string | null; apellidos: string | null };
}) {
  const nombre = nombreEnElTablon(p.socio);
  return {
    id: `com-${uid()}`,
    studio_id: p.studioId,
    post_id: p.postId,
    autor_id: p.authUserId,
    // La ficha: la exportación y la supresión de sus datos la buscan por aquí.
    socio_id: p.socioId,
    autor_nombre: nombre.nombre,
    autor_inicial: nombre.inicial,
    texto: p.texto,
    creado_en: new Date().toISOString(),
  };
}
