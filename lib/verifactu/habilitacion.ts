// Veri*Factu — ¿puede Tentare transmitir los registros de ESTE estudio?
//
// SOLO SERVIDOR. Es el bloqueo duro: sin esto en `true`, el cron no manda nada
// del estudio, esté como esté configurado el certificado.
//
// Se habilita solo con TODO esto (reglas puras en `apoderamiento.ts`,
// `habilitacionDe`):
//   · `verifactu_estudios.estado = 'PRODUCCION'` (lo activa Tentare, a mano);
//   · un poder IZ860 (o general) VERIFICADO y vigente en `verifactu_representaciones`;
//   · para el NIF que tiene HOY el estudio y para el apoderado configurado;
//   · y no es el estudio de demostración.

import type { SupabaseClient } from '@supabase/supabase-js';
import { apoderadoDeEntorno, habilitacionDe, revisionCaducidad, siguienteEstadoEstudio, type AccionEstudio, type EstadoEstudioVerifactu, type EstadoRepresentacion } from './apoderamiento.ts';

export type MotivoNoHabilitado =
  | 'SIN_AUTORIZACION_VERIFICADA'
  | 'ESTUDIO_DE_DEMOSTRACION'
  | 'PAUSADO'
  | 'SUSPENDIDO_AEAT'
  | 'NO_EN_PRODUCCION'
  | 'PODER_CADUCADO';

export type Habilitacion = { habilitado: true } | { habilitado: false; motivo: MotivoNoHabilitado };

type Env = Record<string, string | undefined>;

export async function estudioHabilitado(admin: SupabaseClient, studioId: string, env: Env = process.env, hoy: Date = new Date()): Promise<Habilitacion> {
  const [{ data: studio }, { data: estudio }, { data: repr }] = await Promise.all([
    admin.from('studios').select('nif, es_demo').eq('id', studioId).maybeSingle(),
    admin.from('verifactu_estudios').select('estado, nif').eq('studio_id', studioId).maybeSingle(),
    admin.from('verifactu_representaciones').select('estado, vigente_hasta, nif_representado, apoderado_nif')
      .eq('studio_id', studioId).eq('estado', 'VERIFICADA').maybeSingle(),
  ]);
  return habilitacionDe({
    estudio: estudio ? { estado: estudio.estado as EstadoEstudioVerifactu, nif: estudio.nif as string } : null,
    representacion: repr ? {
      estado: repr.estado as EstadoRepresentacion, vigenteHasta: repr.vigente_hasta as string,
      nifRepresentado: repr.nif_representado as string, apoderadoNif: repr.apoderado_nif as string,
    } : null,
    esDemo: Boolean(studio?.es_demo),
    nifActual: (studio?.nif as string | null) ?? '',
    apoderadoNif: apoderadoDeEntorno(env)?.nif ?? null,
    hoy,
  });
}

export async function registrarEvento(admin: SupabaseClient, e: {
  studioId: string; representacionId?: string | null; evento: string;
  actorTipo: 'propietaria' | 'tentare' | 'sistema'; actorUserId?: string | null;
  ip?: string | null; userAgent?: string | null; datos?: Record<string, unknown> | null;
}): Promise<void> {
  await admin.from('verifactu_representacion_eventos').insert({
    studio_id: e.studioId, representacion_id: e.representacionId ?? null, evento: e.evento,
    actor_tipo: e.actorTipo, actor_user_id: e.actorUserId ?? null, ip: e.ip ?? null,
    user_agent: e.userAgent ?? null, datos: e.datos ?? null,
  });
}

/**
 * Cambia el estado del estudio SOLO si la transición es válida desde el estado
 * que tiene ahora (compare-and-set). Devuelve el estado nuevo o null.
 */
export async function transitarEstudio(
  admin: SupabaseClient, studioId: string, accion: AccionEstudio, motivo: string | null,
  extra: Record<string, unknown> = {},
): Promise<EstadoEstudioVerifactu | null> {
  const { data: actual } = await admin.from('verifactu_estudios').select('estado').eq('studio_id', studioId).maybeSingle();
  if (!actual) return null;
  const de = actual.estado as EstadoEstudioVerifactu;
  const a = siguienteEstadoEstudio(de, accion);
  if (!a) return null;
  const { data } = await admin.from('verifactu_estudios')
    .update({ estado: a, estado_motivo: motivo, actualizado_en: new Date().toISOString(), ...extra })
    .eq('studio_id', studioId).eq('estado', de).select('estado');
  return data?.length ? a : null;
}

/**
 * La AEAT ha dicho que el titular del certificado no está apoderado (4112/4140)
 * u otro problema del estudio: se pausa, se deja constancia y se avisa.
 * Con `sinPoder`, la representación verificada deja de valer: hará falta
 * volver a verificar el poder.
 */
export async function pausarEstudio(admin: SupabaseClient, studioId: string, motivo: string, opciones: { sinPoder?: boolean } = {}): Promise<void> {
  const nuevo = await transitarEstudio(admin, studioId, 'PAUSAR', motivo);
  if (opciones.sinPoder) {
    await admin.from('verifactu_representaciones')
      .update({ estado: 'SIN_PODER_AEAT', estado_motivo: motivo, actualizado_en: new Date().toISOString() })
      .eq('studio_id', studioId).eq('estado', 'VERIFICADA');
  }
  await registrarEvento(admin, { studioId, evento: opciones.sinPoder ? 'aeat.sin_poder' : 'envio.pausado', actorTipo: 'sistema', datos: { motivo } });
  if (nuevo) {
    const { emitirVerifactuEnvioPausado } = await import('@/lib/notifications/emit');
    await emitirVerifactuEnvioPausado(admin, { studioId, motivo: opciones.sinPoder
      ? 'La AEAT indica que no hay un poder vigente a favor del apoderado para tu NIF.'
      : motivo });
  }
}

/** 4141/4139: la AEAT suspende o no habilita a quien remite. Afecta a todos. */
export async function suspenderPorAeat(admin: SupabaseClient, motivo: string): Promise<number> {
  const { data } = await admin.from('verifactu_estudios')
    .update({ estado: 'SUSPENDIDO_AEAT', estado_motivo: motivo, actualizado_en: new Date().toISOString() })
    .eq('estado', 'PRODUCCION').select('studio_id');
  for (const e of data ?? []) {
    await registrarEvento(admin, { studioId: e.studio_id as string, evento: 'aeat.suspendido', actorTipo: 'sistema', datos: { motivo } });
  }
  return data?.length ?? 0;
}

/**
 * Poderes verificados que caducan: aviso 60 días antes (la prórroga solo se
 * puede hacer en los dos meses previos) y, pasada la fecha, se dan por
 * caducados y el estudio vuelve a pedir autorización.
 */
export async function revisarCaducidades(admin: SupabaseClient, hoy: Date = new Date()): Promise<{ avisados: number; caducados: number }> {
  const { data } = await admin.from('verifactu_representaciones')
    .select('id, studio_id, vigente_hasta, aviso_caducidad_en').eq('estado', 'VERIFICADA');
  let avisados = 0;
  let caducados = 0;
  for (const r of data ?? []) {
    const que = revisionCaducidad({ vigenteHasta: r.vigente_hasta as string, avisoCaducidadEn: (r.aviso_caducidad_en as string | null) ?? null }, hoy);
    if (que === 'AVISAR') {
      const { data: ok } = await admin.from('verifactu_representaciones')
        .update({ aviso_caducidad_en: new Date().toISOString() }).eq('id', r.id).is('aviso_caducidad_en', null).select('id');
      if (ok?.length) {
        avisados += 1;
        await registrarEvento(admin, { studioId: r.studio_id as string, representacionId: r.id as string, evento: 'poder.aviso_caducidad', actorTipo: 'sistema', datos: { vigenteHasta: r.vigente_hasta } });
        const { emitirVerifactuPoderCaduca } = await import('@/lib/notifications/emit');
        await emitirVerifactuPoderCaduca(admin, { studioId: r.studio_id as string, representacionId: r.id as string, vigenteHasta: r.vigente_hasta as string });
      }
    } else if (que === 'CADUCADA') {
      const { data: ok } = await admin.from('verifactu_representaciones')
        .update({ estado: 'CADUCADA', actualizado_en: new Date().toISOString() }).eq('id', r.id).eq('estado', 'VERIFICADA').select('id');
      if (ok?.length) {
        caducados += 1;
        await transitarEstudio(admin, r.studio_id as string, 'CADUCAR', 'El poder IZ860 ha caducado');
        await registrarEvento(admin, { studioId: r.studio_id as string, representacionId: r.id as string, evento: 'poder.caducado', actorTipo: 'sistema', datos: { vigenteHasta: r.vigente_hasta } });
        const { emitirVerifactuEnvioPausado } = await import('@/lib/notifications/emit');
        await emitirVerifactuEnvioPausado(admin, { studioId: r.studio_id as string, motivo: 'El poder que diste en la AEAT ha caducado: renuévalo para seguir enviando.' });
      }
    }
  }
  return { avisados, caducados };
}
