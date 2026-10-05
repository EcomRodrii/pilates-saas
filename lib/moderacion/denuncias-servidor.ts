import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Recipient } from '@/lib/notifications/types';
import { emitirContenidoRetirado, emitirDenunciaNueva, emitirDenunciaResuelta } from '@/lib/notifications/emit';
import {
  accionesPosibles, ambitosQueRevisa, destinoDeDenuncia, errorDeResolver, puedeRevisarDenuncia, textoParaDenunciante,
  type AccionDenuncia, type AmbitoDenuncia, type DestinoDenuncia, type MotivoDenuncia, type ResultadoDenuncia, type RolEquipo,
} from './denuncias';

// Denuncias de la app, en el servidor: registrarlas, listarlas para quien revisa
// en el estudio, resolverlas y avisar a cada parte. Todo con service-role: la
// tabla `denuncias` no tiene políticas para el navegador (migr 20261005150100),
// así que cada función acota por `studio_id` y las rutas comprueban el rol.
// La decisión la toman y la aplican las RPC (`resolver_denuncia`,
// `ocultar_comentario_comunidad`); aquí solo se prepara y se avisa.

const ROLES_PANEL = ['PROPIETARIO', 'MANAGER', 'RECEPCION'] as const;

/** ¿Es esta cuenta propietaria del estudio (la dueña o una copropietaria activa)? */
export async function esPropietariaDelEstudio(admin: SupabaseClient, studioId: string, authUserId: string | null): Promise<boolean> {
  if (!authUserId) return false;
  const [{ data: studio }, { data: ficha }] = await Promise.all([
    admin.from('studios').select('owner_auth_user_id').eq('id', studioId).maybeSingle(),
    admin.from('instructores').select('id').eq('studio_id', studioId).eq('auth_user_id', authUserId)
      .eq('rol', 'PROPIETARIO').eq('activo', true).maybeSingle(),
  ]);
  return studio?.owner_auth_user_id === authUserId || Boolean(ficha);
}

/** Quien revisa este ámbito en el estudio, sin quien escribió lo denunciado. */
export async function revisoresDelEstudio(
  admin: SupabaseClient, studioId: string, ambito: AmbitoDenuncia, excluir: string | null,
): Promise<Recipient[]> {
  const roles = ROLES_PANEL.filter((r) => puedeRevisarDenuncia(r, ambito));
  if (roles.length === 0) return [];
  const [{ data: studio }, { data: fichas }] = await Promise.all([
    admin.from('studios').select('owner_auth_user_id').eq('id', studioId).maybeSingle(),
    admin.from('instructores').select('id, auth_user_id, rol').eq('studio_id', studioId)
      .in('rol', roles as unknown as string[]).eq('activo', true).not('auth_user_id', 'is', null),
  ]);
  const out = new Map<string, Recipient>();
  const duena = (studio?.owner_auth_user_id as string | null) ?? null;
  if (duena) out.set(duena, { role: 'PROPIETARIO', userId: duena });
  for (const f of (fichas ?? []) as { id: string; auth_user_id: string; rol: Recipient['role'] }[]) {
    if (!out.has(f.auth_user_id)) out.set(f.auth_user_id, { role: f.rol, userId: f.auth_user_id, instructorId: f.id });
  }
  if (excluir) out.delete(excluir);
  return [...out.values()];
}

/**
 * Para avisar a una persona en la app correcta: como alumna si se la conoce por
 * su ficha (o su cuenta es la de una ficha del estudio), si no como el rol de su
 * ficha de equipo, o la dueña. `null` si no es nadie del estudio.
 */
export async function destinatarioDe(
  admin: SupabaseClient, studioId: string, authUserId: string | null, socioId: string | null = null,
): Promise<Recipient | null> {
  if (socioId) {
    const { data: socia } = await admin.from('socios').select('id, auth_user_id').eq('id', socioId).eq('studio_id', studioId).is('borrado_en', null).maybeSingle();
    const cuenta = (socia?.auth_user_id as string | null | undefined) ?? null;
    if (socia && cuenta) return { role: 'SOCIA', userId: cuenta, socioId: socia.id as string };
    return null;
  }
  if (!authUserId) return null;
  const { data: ficha } = await admin.from('instructores').select('id, rol').eq('studio_id', studioId)
    .eq('auth_user_id', authUserId).eq('activo', true).maybeSingle();
  if (ficha) return { role: ficha.rol as Recipient['role'], userId: authUserId, instructorId: ficha.id as string };
  const { data: studio } = await admin.from('studios').select('owner_auth_user_id').eq('id', studioId).maybeSingle();
  if (studio?.owner_auth_user_id === authUserId) return { role: 'PROPIETARIO', userId: authUserId };
  const { data: socia } = await admin.from('socios').select('id').eq('studio_id', studioId).eq('auth_user_id', authUserId).is('borrado_en', null).maybeSingle();
  return socia ? { role: 'SOCIA', userId: authUserId, socioId: socia.id as string } : null;
}

export interface NuevaDenuncia {
  studioId: string;
  ambito: AmbitoDenuncia;
  motivo: MotivoDenuncia;
  conversacionId?: string | null;
  mensajeId?: string | null;
  comentarioId?: string | null;
  autorAuthUserId: string | null;
  denuncianteAuthUserId: string;
  /** La ficha de quien denuncia, si es una alumna. */
  socioId?: string | null;
  detalle?: string | null;
}

/**
 * Registra una denuncia (o un bloqueo) y avisa a quien la revisa en el estudio.
 * La misma persona denunciando lo mismo mientras sigue pendiente no duplica:
 * devuelve `nueva: false` (índice único `uq_denuncias_pendiente`).
 */
export async function registrarDenuncia(
  admin: SupabaseClient, d: NuevaDenuncia,
): Promise<{ id: string | null; destino: DestinoDenuncia; nueva: boolean }> {
  const destino = destinoDeDenuncia({
    ambito: d.ambito, autorEsPropietaria: await esPropietariaDelEstudio(admin, d.studioId, d.autorAuthUserId),
  });
  const detalle = d.detalle?.trim() ? d.detalle.trim().slice(0, 500) : null;
  const { data, error } = await admin.from('denuncias').insert({
    studio_id: d.studioId, ambito: d.ambito, motivo: d.motivo, destino,
    conversacion_id: d.conversacionId ?? null, mensaje_id: d.mensajeId ?? null, comentario_id: d.comentarioId ?? null,
    autor_auth_user_id: d.autorAuthUserId, denunciante_auth_user_id: d.denuncianteAuthUserId,
    socio_id: d.socioId ?? null, detalle,
  }).select('id').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') return { id: null, destino, nueva: false };
    throw new Error(`denuncias: ${error.message}`);
  }
  const id = (data as { id: string }).id;
  if (destino === 'ESTUDIO') {
    const recipients = await revisoresDelEstudio(admin, d.studioId, d.ambito, d.autorAuthUserId);
    await emitirDenunciaNueva(admin, { studioId: d.studioId, denunciaId: id, ambito: d.ambito, motivo: d.motivo, recipients });
  }
  return { id, destino, nueva: true };
}

// ── Lo que ve quien revisa ───────────────────────────────────────────────────

export interface DenunciaParaRevisar {
  id: string;
  ambito: AmbitoDenuncia;
  motivo: MotivoDenuncia;
  destino: DestinoDenuncia;
  creadaEn: string;
  /** Lo que contó quien denunció (puede faltar). */
  detalle: string | null;
  /** El texto denunciado, tal cual (quien revisa tiene que leerlo). `null` si es un bloqueo sin contenido o ya no existe. */
  contenido: string | null;
  /** Si ya está retirado (otra denuncia del mismo contenido, o el panel). */
  contenidoRetirado: boolean;
  autor: string | null;
  denunciante: string | null;
  conversacionId: string | null;
  postId: string | null;
  acciones: AccionDenuncia[];
}

type FilaDenuncia = {
  id: string; ambito: AmbitoDenuncia; motivo: MotivoDenuncia; destino: DestinoDenuncia; creada_en: string; detalle: string | null;
  conversacion_id: string | null; mensaje_id: string | null; comentario_id: string | null;
  autor_auth_user_id: string | null; denunciante_auth_user_id: string | null; socio_id: string | null;
};

const COLUMNAS_DENUNCIA = 'id, ambito, motivo, destino, creada_en, detalle, conversacion_id, mensaje_id, comentario_id, autor_auth_user_id, denunciante_auth_user_id, socio_id';

/** Nombres para el panel: «Lucía Martínez» (alumna), «Ana (equipo)». Nunca emails. */
async function nombresPorCuenta(admin: SupabaseClient, studioId: string, cuentas: string[]): Promise<Map<string, string>> {
  const unicas = [...new Set(cuentas.filter(Boolean))];
  const out = new Map<string, string>();
  if (unicas.length === 0) return out;
  const [{ data: socias }, { data: equipo }, { data: studio }] = await Promise.all([
    admin.from('socios').select('auth_user_id, nombre, apellidos').eq('studio_id', studioId).in('auth_user_id', unicas),
    admin.from('instructores').select('auth_user_id, nombre').eq('studio_id', studioId).in('auth_user_id', unicas),
    admin.from('studios').select('owner_auth_user_id, nombre').eq('id', studioId).maybeSingle(),
  ]);
  for (const s of (socias ?? []) as { auth_user_id: string; nombre: string | null; apellidos: string | null }[]) {
    out.set(s.auth_user_id, `${s.nombre ?? ''} ${s.apellidos ?? ''}`.trim() || 'Una alumna');
  }
  for (const e of (equipo ?? []) as { auth_user_id: string; nombre: string | null }[]) {
    if (!out.has(e.auth_user_id)) out.set(e.auth_user_id, `${e.nombre ?? 'Alguien'} (equipo)`);
  }
  const duena = studio?.owner_auth_user_id as string | null | undefined;
  if (duena && !out.has(duena)) out.set(duena, 'El estudio');
  return out;
}

/** Las denuncias pendientes que le tocan a este rol en este estudio, de la más antigua a la más nueva. */
export async function listarDenunciasDelEstudio(
  admin: SupabaseClient, studioId: string, rol: RolEquipo,
): Promise<DenunciaParaRevisar[]> {
  const ambitos = ambitosQueRevisa(rol);
  if (ambitos.length === 0) return [];
  const { data, error } = await admin.from('denuncias').select(COLUMNAS_DENUNCIA)
    .eq('studio_id', studioId).eq('estado', 'PENDIENTE').eq('destino', 'ESTUDIO').in('ambito', ambitos)
    .order('creada_en', { ascending: true }).limit(100);
  if (error) throw new Error(`denuncias: ${error.message}`);
  return enriquecer(admin, studioId, (data ?? []) as FilaDenuncia[], rol);
}

/** El contenido y los nombres de cada denuncia. Lo usa también /interno. */
export async function enriquecer(
  admin: SupabaseClient, studioId: string, filas: FilaDenuncia[], rol: RolEquipo | 'TENTARE',
): Promise<DenunciaParaRevisar[]> {
  if (filas.length === 0) return [];
  const idsMensaje = filas.map((f) => f.mensaje_id).filter((x): x is string => Boolean(x));
  const idsComentario = filas.map((f) => f.comentario_id).filter((x): x is string => Boolean(x));
  const [{ data: mensajes }, { data: comentarios }, nombres] = await Promise.all([
    idsMensaje.length
      ? admin.from('mensajes').select('id, cuerpo, oculto_en').eq('studio_id', studioId).in('id', idsMensaje)
      : Promise.resolve({ data: [] }),
    idsComentario.length
      ? admin.from('comentarios_comunidad').select('id, texto, oculto_en, post_id, autor_nombre').eq('studio_id', studioId).in('id', idsComentario)
      : Promise.resolve({ data: [] }),
    nombresPorCuenta(admin, studioId, filas.flatMap((f) => [f.autor_auth_user_id ?? '', f.denunciante_auth_user_id ?? ''])),
  ]);
  const mMensaje = new Map(((mensajes ?? []) as { id: string; cuerpo: string; oculto_en: string | null }[]).map((m) => [m.id, m]));
  const mComentario = new Map(((comentarios ?? []) as { id: string; texto: string; oculto_en: string | null; post_id: string; autor_nombre: string }[])
    .map((c) => [c.id, c]));
  return filas.map((f) => {
    const m = f.mensaje_id ? mMensaje.get(f.mensaje_id) : undefined;
    const c = f.comentario_id ? mComentario.get(f.comentario_id) : undefined;
    const contenido = m?.cuerpo ?? c?.texto ?? null;
    return {
      id: f.id, ambito: f.ambito, motivo: f.motivo, destino: f.destino, creadaEn: f.creada_en, detalle: f.detalle,
      contenido,
      contenidoRetirado: Boolean(m?.oculto_en ?? c?.oculto_en),
      autor: (f.autor_auth_user_id ? nombres.get(f.autor_auth_user_id) : null) ?? c?.autor_nombre ?? null,
      denunciante: f.denunciante_auth_user_id ? nombres.get(f.denunciante_auth_user_id) ?? null : null,
      conversacionId: f.conversacion_id,
      postId: c?.post_id ?? null,
      acciones: accionesPosibles(rol, { ambito: f.ambito, tieneContenido: Boolean(contenido) }),
    };
  });
}

// ── Decidir ──────────────────────────────────────────────────────────────────

export type RevisorDenuncia = { tipo: 'ESTUDIO'; rol: RolEquipo; userId: string } | { tipo: 'TENTARE'; userId: string };

export type ResultadoResolver =
  | { ok: true; resultado: ResultadoDenuncia }
  | { ok: false; status: number; error: string };

interface RespuestaRpc {
  resultado: ResultadoDenuncia; ambito: AmbitoDenuncia; mensajeId: string | null; comentarioId: string | null;
  conversacionId: string | null; autor: string | null;
  cerradas: { id: string; motivo: MotivoDenuncia; denunciante: string | null }[];
}

/**
 * Decide una denuncia (la RPC comprueba a quién le toca y aplica la decisión en
 * una transacción) y avisa: a quien denunció, la decisión; a quien escribió lo
 * retirado, que se ha retirado.
 */
export async function resolverDenuncia(
  admin: SupabaseClient, p: { studioId: string; denunciaId: string; accion: AccionDenuncia; revisor: RevisorDenuncia },
): Promise<ResultadoResolver> {
  // El estudio: el ámbito tiene que ser de los suyos y la acción, de las que su rol puede.
  if (p.revisor.tipo === 'ESTUDIO') {
    const { data: d, error } = await admin.from('denuncias').select('ambito, mensaje_id, comentario_id')
      .eq('id', p.denunciaId).eq('studio_id', p.studioId).maybeSingle();
    if (error) throw new Error(`denuncias: ${error.message}`);
    if (!d || !puedeRevisarDenuncia(p.revisor.rol, d.ambito as AmbitoDenuncia)) {
      return { ok: false, status: 404, error: 'Esta denuncia ya no está pendiente para ti.' };
    }
    const posibles = accionesPosibles(p.revisor.rol, { ambito: d.ambito as AmbitoDenuncia, tieneContenido: Boolean(d.mensaje_id || d.comentario_id) });
    if (!posibles.includes(p.accion)) return { ok: false, status: 403, error: 'Esa decisión no la puedes tomar tú.' };
  }
  const { data, error } = await admin.rpc('resolver_denuncia', {
    p_denuncia_id: p.denunciaId, p_studio_id: p.studioId, p_accion: p.accion, p_revisor: p.revisor.tipo, p_por: p.revisor.userId,
  });
  if (error) {
    const traducido = errorDeResolver(error);
    if (traducido) return { ok: false, ...traducido };
    throw new Error(`resolver_denuncia: ${error.message}`);
  }
  const r = data as RespuestaRpc;
  await avisarDecision(admin, p.studioId, r);
  return { ok: true, resultado: r.resultado };
}

/** Avisa a quien denunció (solo las denuncias, no los bloqueos) y a quien escribió lo retirado. */
async function avisarDecision(admin: SupabaseClient, studioId: string, r: RespuestaRpc): Promise<void> {
  const denuncias = (r.cerradas ?? []).filter((c) => c.motivo === 'DENUNCIA');
  if (denuncias.length > 0) {
    const { data: filas } = await admin.from('denuncias').select('id, socio_id, denunciante_auth_user_id')
      .eq('studio_id', studioId).in('id', denuncias.map((c) => c.id));
    for (const f of (filas ?? []) as { id: string; socio_id: string | null; denunciante_auth_user_id: string | null }[]) {
      const recipient = await destinatarioDe(admin, studioId, f.denunciante_auth_user_id, f.socio_id);
      if (!recipient) continue;
      await emitirDenunciaResuelta(admin, {
        studioId, denunciaId: f.id, ambito: r.ambito, conversacionId: r.conversacionId,
        resultado: textoParaDenunciante(r.resultado, r.ambito), recipient,
      });
    }
  }
  if (r.resultado === 'CONTENIDO_OCULTO') {
    await avisarAutorRetirado(admin, studioId, {
      ambito: r.ambito, autor: r.autor, conversacionId: r.conversacionId,
      contenidoId: r.mensajeId ?? r.comentarioId,
    });
  }
}

async function avisarAutorRetirado(
  admin: SupabaseClient, studioId: string,
  p: { ambito: AmbitoDenuncia; autor: string | null; conversacionId: string | null; contenidoId: string | null },
): Promise<void> {
  if (!p.contenidoId) return;
  let autor = p.autor;
  let socioId: string | null = null;
  if (p.ambito === 'TABLON') {
    // Un comentario dice de quién es por su ficha (alumna) o por su cuenta (`autor_id`).
    const { data: c } = await admin.from('comentarios_comunidad').select('autor_id, socio_id')
      .eq('id', p.contenidoId).eq('studio_id', studioId).maybeSingle();
    socioId = (c?.socio_id as string | null | undefined) ?? null;
    const cuenta = (c?.autor_id as string | null | undefined) ?? null;
    if (!autor && cuenta && /^[0-9a-f-]{36}$/i.test(cuenta)) autor = cuenta;
  } else if (p.conversacionId && autor) {
    // En un hilo, quien escribió es la alumna si su cuenta es la de la parte SOCIO.
    const { data: parte } = await admin.from('conversacion_participantes').select('socio_id')
      .eq('conversacion_id', p.conversacionId).eq('rol_en_conversacion', 'SOCIO').eq('auth_user_id', autor).maybeSingle();
    socioId = (parte?.socio_id as string | null | undefined) ?? null;
  }
  const recipient = await destinatarioDe(admin, studioId, autor, socioId);
  if (!recipient) return;
  await emitirContenidoRetirado(admin, { studioId, contenidoId: p.contenidoId, ambito: p.ambito, conversacionId: p.conversacionId, recipient });
}

/**
 * Retirar (o volver a mostrar) un comentario del tablón desde el panel, sin
 * esperar a que lo denuncien. Si tenía denuncias pendientes, quedan resueltas
 * («hemos retirado el comentario») y se avisa a quien las hizo y a quien lo
 * escribió. `false` si no había nada que cambiar.
 */
export async function retirarComentario(
  admin: SupabaseClient, p: { studioId: string; comentarioId: string; retirar: boolean; userId: string },
): Promise<boolean> {
  const { data, error } = await admin.rpc('ocultar_comentario_comunidad', {
    p_comentario_id: p.comentarioId, p_studio_id: p.studioId, p_ocultar: p.retirar, p_por: p.userId, p_revisor: 'ESTUDIO',
  });
  if (error) throw new Error(`ocultar_comentario_comunidad: ${error.message}`);
  const r = data as { cambiado: boolean; cerradas: RespuestaRpc['cerradas'] };
  if (!r.cambiado || !p.retirar) return r.cambiado;
  await avisarDecision(admin, p.studioId, {
    resultado: 'CONTENIDO_OCULTO', ambito: 'TABLON', mensajeId: null, comentarioId: p.comentarioId, conversacionId: null,
    autor: null, cerradas: r.cerradas ?? [],
  });
  return true;
}

/**
 * Cerrar (o reabrir) un hilo instructora–alumna desde el panel. Solo ese tipo:
 * el hilo con el estudio no se cierra nunca. `false` si no existe o ya estaba así.
 */
export async function cerrarConversacion(
  admin: SupabaseClient, p: { studioId: string; conversacionId: string; cerrar: boolean; userId: string },
): Promise<boolean> {
  let q = admin.from('conversaciones')
    .update(p.cerrar ? { cerrada_en: new Date().toISOString(), cerrada_por: p.userId } : { cerrada_en: null, cerrada_por: null })
    .eq('id', p.conversacionId).eq('studio_id', p.studioId).eq('tipo', 'ALUMNA_INSTRUCTORA');
  q = p.cerrar ? q.is('cerrada_en', null) : q.not('cerrada_en', 'is', null);
  const { data, error } = await q.select('id');
  if (error) throw new Error(`conversaciones: ${error.message}`);
  return (data ?? []).length > 0;
}
