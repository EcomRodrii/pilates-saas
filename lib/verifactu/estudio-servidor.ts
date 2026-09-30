// Veri*Factu — el alta de un estudio y la verificación de su poder IZ860.
//
// SOLO SERVIDOR (service-role). Lo llaman las rutas, que ya comprobaron quién
// pide: la propietaria (su estudio) o Tentare (`admin.full`).
//
// Orden del alta:
//   1. La propietaria confirma NIF (el de Datos fiscales) y nombre fiscal EXACTO.
//   2. Tentare le enseña a quién y qué apoderar (IZ860) y le manda a la sede.
//   3. Ella otorga el poder EN LA AEAT con su certificado o Cl@ve. Tentare no ve
//      ni pide sus credenciales.
//   4. Pega aquí el CSV que le da la sede y los datos del poder, y acepta el
//      mandato (evidencia adicional).
//   5. El apoderado lo comprueba en «Consulta de apoderamientos recibidos» y
//      coteja el CSV → VERIFICADO.
//   6. Tentare activa la producción (a mano). Hasta entonces no se envía nada.

import type { SupabaseClient } from '@supabase/supabase-js';
import { nifEmisorValido } from '../nif.ts';
import { numeroInstalacionDeEstudio } from './sif.ts';
import {
  apoderadoDeEntorno, erroresAutorizacion, textoMandato, MANDATO_VERSION, TRAMITE_IZ860,
  URL_REGISTRO_APODERAMIENTOS, URL_AYUDA_ALTA_PODER, habilitacionDe,
  type AutorizacionEntrante, type TipoEmisor, type EstadoEstudioVerifactu, type EstadoRepresentacion, type Apoderado,
} from './apoderamiento.ts';
import { registrarEvento, transitarEstudio } from './habilitacion.ts';
import { declaracionVigente } from './declaracion.ts';
import { sha256Texto } from './envio.ts';
import { ESTADOS_ADMITIDOS_EN_AEAT, registrosQueBloqueanActivacion, mensajeBloqueoActivacion } from './barrera-activacion.ts';
import type { EstadoRegistroVerifactu } from './estado.ts';

type Env = Record<string, string | undefined>;

/**
 * Cuántos registros de este estudio impiden activarlo: anteriores a su primera
 * activación y que la AEAT no tiene (ver barrera-activacion.ts). Si no se puede
 * leer, no se activa: la barrera falla cerrada.
 */
export async function contarBloqueoActivacion(admin: SupabaseClient, studioId: string, activadoEn: string | null): Promise<number> {
  const { data, error } = await admin.from('verifactu_registros').select('estado, creado_en')
    .eq('studio_id', studioId).not('estado', 'in', `(${ESTADOS_ADMITIDOS_EN_AEAT.join(',')})`).limit(20000);
  if (error) throw new AltaVerifactuError(['No se pudo comprobar si el estudio tiene facturas anteriores a la activación.'], 500);
  return registrosQueBloqueanActivacion(
    (data ?? []).map(r => ({ estado: r.estado as EstadoRegistroVerifactu, creadoEn: r.creado_en as string })),
    activadoEn,
  );
}

export class AltaVerifactuError extends Error {
  readonly errores: string[];
  readonly status: number;
  constructor(errores: string[], status = 400) {
    super(errores.join(' '));
    this.name = 'AltaVerifactuError';
    this.errores = errores;
    this.status = status;
  }
}

export interface Actor { userId: string; ip: string | null; userAgent: string | null }

const COLS_REPR = 'id, studio_id, nif_representado, nombre_representado, otorgante_nombre, otorgante_nif, otorgante_cargo, apoderado_nombre, apoderado_nif, tramite, via_aeat, csv_aeat, otorgado_en, vigente_hasta, mandato_version, aceptado_en, referencia_aeat, csv_cotejado, verificado_en, estado, estado_motivo, revocada_en, aviso_caducidad_en, creado_en';

export interface EstadoAltaPropietaria {
  estado: EstadoEstudioVerifactu;
  motivo: string | null;
  nifEstudio: string | null;
  nifValido: boolean;
  nombreFiscal: string | null;
  tipoEmisor: TipoEmisor | null;
  esDemo: boolean;
  apoderado: Apoderado | null;
  tramite: typeof TRAMITE_IZ860;
  urls: { registro: string; ayuda: string };
  mandato: { version: string; texto: string } | null;
  representacion: Record<string, unknown> | null;
  habilitadoParaEnviar: boolean;
  /** Primera activación del envío. Solo desde entonces emite facturas (facturacion-activa.ts). */
  activadoEn: string | null;
}

export async function estadoAltaPropietaria(admin: SupabaseClient, studioId: string, env: Env = process.env): Promise<EstadoAltaPropietaria> {
  const [{ data: studio }, { data: vf }, { data: reprs }] = await Promise.all([
    admin.from('studios').select('nif, razon_social, es_demo').eq('id', studioId).maybeSingle(),
    admin.from('verifactu_estudios').select('estado, estado_motivo, nif, nombre_fiscal, tipo_emisor, activado_produccion_en').eq('studio_id', studioId).maybeSingle(),
    admin.from('verifactu_representaciones').select(COLS_REPR).eq('studio_id', studioId).order('creado_en', { ascending: false }).limit(1),
  ]);
  const nif = ((studio?.nif as string | null) ?? '').trim().toUpperCase() || null;
  const apoderado = apoderadoDeEntorno(env);
  const nombreFiscal = (vf?.nombre_fiscal as string | null) ?? (studio?.razon_social as string | null) ?? null;
  const repr = reprs?.[0] ?? null;
  const tramite = (repr?.tramite as 'IZ860' | 'GENERAL_46_2' | undefined) ?? 'IZ860';
  const hab = habilitacionDe({
    estudio: vf ? { estado: vf.estado as EstadoEstudioVerifactu, nif: vf.nif as string } : null,
    representacion: repr ? { estado: repr.estado as EstadoRepresentacion, vigenteHasta: repr.vigente_hasta as string, nifRepresentado: repr.nif_representado as string, apoderadoNif: repr.apoderado_nif as string } : null,
    esDemo: Boolean(studio?.es_demo), nifActual: nif ?? '', apoderadoNif: apoderado?.nif ?? null, hoy: new Date(),
  });
  return {
    estado: (vf?.estado as EstadoEstudioVerifactu | undefined) ?? 'SIN_CONFIGURAR',
    motivo: (vf?.estado_motivo as string | null) ?? null,
    nifEstudio: nif,
    nifValido: !!nif && nifEmisorValido(nif),
    nombreFiscal,
    tipoEmisor: (vf?.tipo_emisor as TipoEmisor | undefined) ?? null,
    esDemo: Boolean(studio?.es_demo),
    apoderado,
    tramite: TRAMITE_IZ860,
    urls: { registro: URL_REGISTRO_APODERAMIENTOS, ayuda: URL_AYUDA_ALTA_PODER },
    mandato: apoderado && nif && nombreFiscal
      ? { version: MANDATO_VERSION, texto: textoMandato({ estudio: { nombreFiscal, nif }, apoderado, tramite }) }
      : null,
    representacion: repr,
    habilitadoParaEnviar: hab.habilitado,
    activadoEn: (vf?.activado_produccion_en as string | null | undefined) ?? null,
  };
}

/** Paso 1: la propietaria confirma sus datos fiscales exactos. */
export async function configurarDatosFiscales(
  admin: SupabaseClient, studioId: string,
  p: { nombreFiscal: string; tipoEmisor: TipoEmisor }, actor: Actor,
): Promise<void> {
  const { data: studio } = await admin.from('studios').select('nif, es_demo').eq('id', studioId).maybeSingle();
  if (studio?.es_demo) throw new AltaVerifactuError(['El estudio de demostración no envía nada a la AEAT.'], 409);
  const nif = ((studio?.nif as string | null) ?? '').trim().toUpperCase();
  const errores: string[] = [];
  if (!nifEmisorValido(nif)) errores.push('Configura primero un NIF válido en Configuración → Datos fiscales.');
  const nombre = p.nombreFiscal.trim().replace(/\s+/g, ' ');
  if (!nombre || nombre.length > 120) errores.push('Escribe tu nombre o razón social exactos, como constan en la AEAT (máx. 120).');
  if (!['persona_fisica', 'sociedad', 'otra'].includes(p.tipoEmisor)) errores.push('Elige si facturas como persona física, sociedad u otra entidad.');
  if (errores.length) throw new AltaVerifactuError(errores);

  const { data: existente } = await admin.from('verifactu_estudios').select('estado, nif, numero_instalacion').eq('studio_id', studioId).maybeSingle();
  if (!existente) {
    const { error } = await admin.from('verifactu_estudios').insert({
      studio_id: studioId, nif, nombre_fiscal: nombre, tipo_emisor: p.tipoEmisor,
      numero_instalacion: numeroInstalacionDeEstudio(studioId), estado: 'PENDIENTE_AUTORIZACION',
    });
    if (error) throw new AltaVerifactuError([`No se pudo guardar: ${error.message}`], 500);
  } else {
    if (existente.estado === 'PRODUCCION') {
      throw new AltaVerifactuError(['Ya envías a la AEAT. Para cambiar tus datos fiscales, pide a Tentare que pause el envío.'], 409);
    }
    // Cambiar datos fiscales invalida el poder: es de un NIF concreto.
    await admin.from('verifactu_estudios').update({ nif, nombre_fiscal: nombre, tipo_emisor: p.tipoEmisor, actualizado_en: new Date().toISOString() }).eq('studio_id', studioId);
    await transitarEstudio(admin, studioId, 'CONFIGURAR', 'Datos fiscales confirmados de nuevo');
    await admin.from('verifactu_representaciones').update({ estado: 'RECHAZADA_REVISION', estado_motivo: 'Se cambiaron los datos fiscales', actualizado_en: new Date().toISOString() })
      .eq('studio_id', studioId).in('estado', ['EN_REVISION', 'VERIFICADA']);
  }
  await registrarEvento(admin, { studioId, evento: 'alta.datos_fiscales', actorTipo: 'propietaria', actorUserId: actor.userId, ip: actor.ip, userAgent: actor.userAgent, datos: { nif, tipoEmisor: p.tipoEmisor } });
}

/** Paso 4: la propietaria entrega la evidencia del poder otorgado en la AEAT. */
export async function enviarAutorizacion(
  admin: SupabaseClient, studioId: string, a: AutorizacionEntrante, actor: Actor, env: Env = process.env, hoy: Date = new Date(),
): Promise<{ representacionId: string }> {
  const { data: vf } = await admin.from('verifactu_estudios').select('estado, nif, nombre_fiscal, tipo_emisor').eq('studio_id', studioId).maybeSingle();
  if (!vf) throw new AltaVerifactuError(['Confirma primero tus datos fiscales.'], 409);
  if (vf.estado !== 'PENDIENTE_AUTORIZACION') throw new AltaVerifactuError(['Ahora mismo no hay ninguna autorización pendiente de enviar.'], 409);
  const apoderado = apoderadoDeEntorno(env);
  if (!apoderado) throw new AltaVerifactuError(['Tentare todavía no ha configurado a quién apoderar. Vuelve más tarde.'], 503);

  const errores = erroresAutorizacion(a, { tipoEmisor: vf.tipo_emisor as TipoEmisor }, hoy);
  if (errores.length) throw new AltaVerifactuError(errores);

  const mandato = textoMandato({ estudio: { nombreFiscal: vf.nombre_fiscal as string, nif: vf.nif as string }, apoderado, tramite: a.tramite });
  const { data, error } = await admin.from('verifactu_representaciones').insert({
    studio_id: studioId,
    nif_representado: vf.nif, nombre_representado: vf.nombre_fiscal,
    otorgante_nombre: a.otorgante.nombre.trim(), otorgante_nif: a.otorgante.nif.trim().toUpperCase(), otorgante_cargo: a.otorgante.cargo,
    apoderado_nombre: apoderado.nombre, apoderado_nif: apoderado.nif,
    tramite: a.tramite, via_aeat: 'internet', csv_aeat: a.csv.replace(/\s+/g, ''),
    otorgado_en: a.otorgadoEn, vigente_hasta: a.vigenteHasta,
    mandato_version: MANDATO_VERSION, mandato_sha256: sha256Texto(mandato),
    aceptado_por: actor.userId, aceptado_ip: actor.ip, aceptado_user_agent: actor.userAgent,
    estado: 'EN_REVISION',
  }).select('id').single();
  if (error || !data) throw new AltaVerifactuError([`No se pudo guardar la autorización: ${error?.message ?? ''}`.trim()], 500);
  await transitarEstudio(admin, studioId, 'ENVIAR_AUTORIZACION', null);
  await registrarEvento(admin, {
    studioId, representacionId: data.id as string, evento: 'autorizacion.enviada', actorTipo: 'propietaria',
    actorUserId: actor.userId, ip: actor.ip, userAgent: actor.userAgent,
    datos: { tramite: a.tramite, otorgadoEn: a.otorgadoEn, vigenteHasta: a.vigenteHasta, mandatoVersion: MANDATO_VERSION },
  });
  return { representacionId: data.id as string };
}

/** La propietaria avisa de que ha revocado el poder en la AEAT. Se deja de enviar al instante. */
export async function revocarAutorizacion(admin: SupabaseClient, studioId: string, actor: Actor): Promise<void> {
  const { data } = await admin.from('verifactu_representaciones')
    .update({ estado: 'REVOCADA', revocada_en: new Date().toISOString(), estado_motivo: 'Revocado por la propietaria', actualizado_en: new Date().toISOString() })
    .eq('studio_id', studioId).in('estado', ['EN_REVISION', 'VERIFICADA']).select('id');
  await transitarEstudio(admin, studioId, 'REVOCAR', 'Poder revocado por la propietaria');
  await registrarEvento(admin, { studioId, representacionId: (data?.[0]?.id as string | undefined) ?? null, evento: 'autorizacion.revocada', actorTipo: 'propietaria', actorUserId: actor.userId, ip: actor.ip, userAgent: actor.userAgent });
}

// ── Lado Tentare (/interno, admin.full) ──────────────────────────────────────

export async function listarParaTentare(admin: SupabaseClient): Promise<{ estudios: Record<string, unknown>[]; representaciones: Record<string, unknown>[] }> {
  const [{ data: estudios }, { data: representaciones }] = await Promise.all([
    admin.from('verifactu_estudios').select('studio_id, nif, nombre_fiscal, tipo_emisor, numero_instalacion, estado, estado_motivo, activado_produccion_en, actualizado_en').order('actualizado_en', { ascending: false }).limit(500),
    admin.from('verifactu_representaciones').select(COLS_REPR).in('estado', ['EN_REVISION', 'VERIFICADA', 'SIN_PODER_AEAT']).order('creado_en', { ascending: false }).limit(500),
  ]);
  // Cuántas facturas anteriores a la activación bloquean cada estudio, para
  // verlo antes de pulsar «Activar» (la barrera la impone activarProduccion).
  const ids = (estudios ?? []).map(e => e.studio_id as string);
  const { data: sinAeat } = ids.length
    ? await admin.from('verifactu_registros').select('studio_id, estado, creado_en').in('studio_id', ids)
      .not('estado', 'in', `(${ESTADOS_ADMITIDOS_EN_AEAT.join(',')})`).limit(20000)
    : { data: [] };
  const conBloqueo = (estudios ?? []).map(e => ({
    ...e,
    facturas_anteriores_sin_decidir: registrosQueBloqueanActivacion(
      (sinAeat ?? []).filter(r => r.studio_id === e.studio_id).map(r => ({ estado: r.estado as EstadoRegistroVerifactu, creadoEn: r.creado_en as string })),
      (e.activado_produccion_en as string | null) ?? null,
    ),
  }));
  return { estudios: conBloqueo, representaciones: representaciones ?? [] };
}

/**
 * Paso 5: el apoderado ha comprobado el poder en «Consulta de apoderamientos
 * recibidos» de la sede y ha cotejado el CSV. Sin esas dos cosas, no se verifica.
 */
export async function verificarRepresentacion(
  admin: SupabaseClient, representacionId: string,
  p: { referenciaAeat: string; csvCotejado: boolean; tramiteComprobado: 'IZ860' | 'GENERAL_46_2' }, userId: string,
): Promise<void> {
  const referencia = p.referenciaAeat.trim();
  const errores: string[] = [];
  if (!referencia) errores.push('Anota la referencia del apoderamiento que ves en la sede.');
  if (!p.csvCotejado) errores.push('Coteja el CSV en la sede antes de verificar.');
  if (errores.length) throw new AltaVerifactuError(errores);
  const { data: r } = await admin.from('verifactu_representaciones').select('studio_id, tramite, estado').eq('id', representacionId).maybeSingle();
  if (!r || r.estado !== 'EN_REVISION') throw new AltaVerifactuError(['Esa autorización no está pendiente de revisión.'], 409);
  if (r.tramite !== p.tramiteComprobado) throw new AltaVerifactuError(['El trámite que ves en la sede no coincide con el que declaró el estudio.'], 409);
  const { data: ok } = await admin.from('verifactu_representaciones').update({
    estado: 'VERIFICADA', referencia_aeat: referencia, csv_cotejado: true, verificado_por: userId,
    verificado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
  }).eq('id', representacionId).eq('estado', 'EN_REVISION').select('id');
  if (!ok?.length) throw new AltaVerifactuError(['No se pudo verificar (¿ha cambiado mientras tanto?).'], 409);
  await transitarEstudio(admin, r.studio_id as string, 'VERIFICAR', null);
  await registrarEvento(admin, { studioId: r.studio_id as string, representacionId, evento: 'autorizacion.verificada', actorTipo: 'tentare', actorUserId: userId, datos: { referenciaAeat: referencia } });
}

export async function rechazarRepresentacion(admin: SupabaseClient, representacionId: string, motivo: string, userId: string): Promise<void> {
  const texto = motivo.trim();
  if (!texto) throw new AltaVerifactuError(['Explica a la propietaria por qué no se ha podido verificar.']);
  const { data: r } = await admin.from('verifactu_representaciones')
    .update({ estado: 'RECHAZADA_REVISION', estado_motivo: texto, actualizado_en: new Date().toISOString() })
    .eq('id', representacionId).eq('estado', 'EN_REVISION').select('studio_id');
  const studioId = r?.[0]?.studio_id as string | undefined;
  if (!studioId) throw new AltaVerifactuError(['Esa autorización no está pendiente de revisión.'], 409);
  await transitarEstudio(admin, studioId, 'RECHAZAR_REVISION', texto);
  await registrarEvento(admin, { studioId, representacionId, evento: 'autorizacion.rechazada', actorTipo: 'tentare', actorUserId: userId, datos: { motivo: texto } });
}

/**
 * Paso 6: producción. Solo con declaración responsable suscrita, poder
 * verificado y vigente para el NIF de hoy, y fuera del estudio de demostración.
 */
export async function activarProduccion(admin: SupabaseClient, studioId: string, userId: string, env: Env = process.env): Promise<void> {
  if (!(await declaracionVigente(admin))) throw new AltaVerifactuError(['Falta suscribir la declaración responsable de esta versión.'], 409);
  const [{ data: studio }, { data: vf }, { data: repr }] = await Promise.all([
    admin.from('studios').select('nif, es_demo').eq('id', studioId).maybeSingle(),
    admin.from('verifactu_estudios').select('estado, nif, activado_produccion_en').eq('studio_id', studioId).maybeSingle(),
    admin.from('verifactu_representaciones').select('estado, vigente_hasta, nif_representado, apoderado_nif').eq('studio_id', studioId).eq('estado', 'VERIFICADA').maybeSingle(),
  ]);
  if (!vf || vf.estado !== 'VERIFICADO') throw new AltaVerifactuError(['El estudio no está verificado.'], 409);
  // Barrera de activación (lib/verifactu/barrera-activacion.ts): con facturas
  // anteriores a la activación que la AEAT no tiene, no se activa.
  const activadoEn = (vf.activado_produccion_en as string | null) ?? null;
  const bloquean = await contarBloqueoActivacion(admin, studioId, activadoEn);
  if (bloquean > 0) throw new AltaVerifactuError([mensajeBloqueoActivacion(bloquean)], 409);
  // Se comprueba como si ya estuviera en producción: si así no pudiera enviar, no se activa.
  const hab = habilitacionDe({
    estudio: { estado: 'PRODUCCION', nif: vf.nif as string },
    representacion: repr ? { estado: repr.estado as EstadoRepresentacion, vigenteHasta: repr.vigente_hasta as string, nifRepresentado: repr.nif_representado as string, apoderadoNif: repr.apoderado_nif as string } : null,
    esDemo: Boolean(studio?.es_demo), nifActual: (studio?.nif as string | null) ?? '', apoderadoNif: apoderadoDeEntorno(env)?.nif ?? null, hoy: new Date(),
  });
  if (!hab.habilitado) throw new AltaVerifactuError([`No se puede activar: ${hab.motivo}`], 409);
  // La fecha que cuenta es la de la PRIMERA activación: si se reactiva, no se mueve.
  const nuevo = await transitarEstudio(admin, studioId, 'ACTIVAR_PRODUCCION', null, { activado_produccion_en: activadoEn ?? new Date().toISOString(), activado_por: userId });
  if (!nuevo) throw new AltaVerifactuError(['No se pudo activar (¿ha cambiado el estado?).'], 409);
  await registrarEvento(admin, { studioId, evento: 'envio.produccion_activada', actorTipo: 'tentare', actorUserId: userId });
}

export async function pausarPorTentare(admin: SupabaseClient, studioId: string, motivo: string, userId: string): Promise<void> {
  const nuevo = await transitarEstudio(admin, studioId, 'PAUSAR', motivo.trim() || 'Pausado por Tentare');
  if (!nuevo) throw new AltaVerifactuError(['Ese estudio no se puede pausar ahora.'], 409);
  await registrarEvento(admin, { studioId, evento: 'envio.pausado', actorTipo: 'tentare', actorUserId: userId, datos: { motivo } });
}

export async function reanudarPorTentare(admin: SupabaseClient, studioId: string, userId: string): Promise<void> {
  const nuevo = await transitarEstudio(admin, studioId, 'REANUDAR', null);
  if (!nuevo) throw new AltaVerifactuError(['Ese estudio no está pausado ni suspendido.'], 409);
  await registrarEvento(admin, { studioId, evento: 'envio.reanudado', actorTipo: 'tentare', actorUserId: userId });
}
