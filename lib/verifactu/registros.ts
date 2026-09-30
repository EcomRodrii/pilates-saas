// Veri*Factu — crear y preparar registros de facturación en la base.
//
// SOLO SERVIDOR (service-role).
//
//  · `crearSubsanacion` / `crearAnulacion`: un registro NUEVO que ocupa la
//    siguiente posición de la cadena. El original no se toca nunca.
//  · `completarReserva`: la reserva (RPC `reservar_registro_verifactu`) deja la
//    fila sin huella; aquí se calcula con `lib/verifactu.ts` (la única
//    implementación que manda) y se completa. Si el proceso muere entre medias,
//    el cron la completa en la siguiente pasada (la fila bloquea la cadena
//    mientras tanto, igual que una factura a medio sellar).
//  · `prepararRegistros`: PENDIENTE → LISTO congelando el XML. Una sola vez.
//
// ⚠️ Subsanar o anular es una decisión FISCAL (¿procede subsanación o hace falta
// una rectificativa?). Estas funciones no la toman: la ejecutan cuando alguien
// con permiso la ha tomado.

import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularHuellaAlta, calcularHuellaAnulacion } from '../verifactu.ts';
import { fechaHoraHusoMadrid } from '../verifactu-qr.ts';
import { descripcionAeatDeFactura } from '../facturas/concepto.ts';
import { marcasSubsanacion, marcasAnulacion } from './subsanacion.ts';
import { ESTADOS_EN_AEAT, ESTADOS_FINALES, type EstadoRegistroVerifactu, type TipoRegistro } from './estado.ts';
import { construirXmlRegistro, type DatosCorregidos, type RegistroParaXml, type FacturaParaXml } from './construir.ts';
import { RegistroInvalidoError, type SistemaInformatico } from './xml.ts';
import { sha256Texto } from './envio.ts';

/** Columnas de `verifactu_registros` que se leen aquí y en transmitir.ts. */
export const COLS_REGISTRO =
  'id, studio_id, factura_id, tipo, seq, id_emisor, num_serie, fecha_expedicion, tipo_factura, cuota_total, importe_total, ' +
  'huella_anterior, fecha_hora_huso_gen, huella, anterior_id_emisor, anterior_num_serie, anterior_fecha_expedicion, ' +
  'subsanacion, rechazo_previo, sin_registro_previo, registro_origen_id, datos_corregidos, xml_registro, xml_sha256, ' +
  'estado, intentos, proximo_intento_en, envio_id, codigo_error, creado_en';

export interface FilaRegistro {
  id: string;
  studio_id: string;
  factura_id: string;
  tipo: TipoRegistro;
  seq: number;
  id_emisor: string;
  num_serie: string;
  fecha_expedicion: string;
  tipo_factura: string | null;
  cuota_total: number | string | null;
  importe_total: number | string | null;
  huella_anterior: string;
  fecha_hora_huso_gen: string | null;
  huella: string | null;
  anterior_id_emisor: string | null;
  anterior_num_serie: string | null;
  anterior_fecha_expedicion: string | null;
  subsanacion: boolean;
  rechazo_previo: 'N' | 'S' | 'X' | null;
  sin_registro_previo: boolean;
  registro_origen_id: string | null;
  datos_corregidos: DatosCorregidos | null;
  xml_registro: string | null;
  xml_sha256: string | null;
  estado: EstadoRegistroVerifactu;
  intentos: number;
  proximo_intento_en: string | null;
  envio_id: string | null;
  codigo_error: string | null;
  creado_en: string;
}

const num = (v: number | string | null): number | null => (v === null ? null : typeof v === 'number' ? v : Number(v));

export class OperacionVerifactuError extends Error {
  constructor(mensaje: string) { super(mensaje); this.name = 'OperacionVerifactuError'; }
}

async function registrosDeFactura(admin: SupabaseClient, facturaId: string): Promise<FilaRegistro[]> {
  const { data, error } = await admin.from('verifactu_registros').select(COLS_REGISTRO)
    .eq('factura_id', facturaId).order('seq', { ascending: true });
  if (error) throw new OperacionVerifactuError(`No se pudieron leer los registros de la factura: ${error.message}`);
  return (data ?? []) as unknown as FilaRegistro[];
}

/**
 * Completa una reserva: calcula la huella con TS y deja el registro PENDIENTE.
 * Idempotente: solo escribe si seguía RESERVADO y sin huella.
 */
export async function completarReserva(admin: SupabaseClient, registroId: string, ahora: Date = new Date()): Promise<void> {
  const { data, error } = await admin.from('verifactu_registros').select(COLS_REGISTRO).eq('id', registroId).maybeSingle();
  if (error || !data) throw new OperacionVerifactuError('Reserva de registro no encontrada');
  const r = data as unknown as FilaRegistro;
  if (r.estado !== 'RESERVADO' || r.huella) return;

  const ts = fechaHoraHusoMadrid(ahora);
  const huella = r.tipo === 'ANULACION'
    ? calcularHuellaAnulacion({
        idEmisorFacturaAnulada: r.id_emisor,
        numSerieFacturaAnulada: r.num_serie,
        fechaExpedicionFacturaAnulada: r.fecha_expedicion,
        fechaHoraHusoGenRegistro: ts,
      }, r.huella_anterior)
    : calcularHuellaAlta({
        idEmisorFactura: r.id_emisor,
        numSerieFactura: r.num_serie,
        fechaExpedicionFactura: r.fecha_expedicion,
        tipoFactura: r.tipo_factura ?? '',
        cuotaTotal: num(r.cuota_total) ?? 0,
        importeTotal: num(r.importe_total) ?? 0,
        fechaHoraHusoGenRegistro: ts,
      }, r.huella_anterior);

  const { error: e2 } = await admin.from('verifactu_registros')
    .update({ huella, fecha_hora_huso_gen: ts, estado: 'PENDIENTE', actualizado_en: new Date().toISOString() })
    .eq('id', registroId).eq('estado', 'RESERVADO').is('huella', null);
  if (e2) throw new OperacionVerifactuError(`No se pudo completar la reserva: ${e2.message}`);
}

/**
 * Alta de subsanación de un registro de alta (normal o de subsanación).
 *
 * Marcas según el cuadro de operativas de la AEAT (`subsanacion.ts`):
 *  · ninguno de los registros de la factura está en la AEAT → S + RechazoPrevio X
 *  · está en la AEAT → S (+ RechazoPrevio S si la última subsanación fue rechazada)
 */
export async function crearSubsanacion(
  admin: SupabaseClient,
  p: { studioId: string; registroOrigenId: string; correcciones?: DatosCorregidos | null },
): Promise<{ registroId: string }> {
  const { data: origen } = await admin.from('verifactu_registros').select(COLS_REGISTRO)
    .eq('id', p.registroOrigenId).eq('studio_id', p.studioId).maybeSingle();
  if (!origen) throw new OperacionVerifactuError('Registro no encontrado en este estudio');
  const o = origen as unknown as FilaRegistro;
  if (o.tipo === 'ANULACION') throw new OperacionVerifactuError('Una anulación no se subsana con un alta');
  if (!(['RECHAZADA', 'ACEPTADA_CON_ERRORES', 'REGISTRADA', 'HISTORICO'] as EstadoRegistroVerifactu[]).includes(o.estado)) {
    throw new OperacionVerifactuError(`Solo se subsana un registro terminado; este está ${o.estado}`);
  }

  const todos = await registrosDeFactura(admin, o.factura_id);
  if (todos.some(r => !ESTADOS_FINALES.has(r.estado))) {
    throw new OperacionVerifactuError('Esta factura ya tiene un registro en curso: espera a que termine');
  }
  const altas = todos.filter(r => r.tipo !== 'ANULACION');
  const existeEnAeat = altas.some(r => ESTADOS_EN_AEAT.has(r.estado));
  const ultimaSub = [...altas].reverse().find(r => r.tipo === 'ALTA_SUBSANACION');
  const marcas = marcasSubsanacion({ existeEnAeat, subsanacionAnteriorRechazada: existeEnAeat && ultimaSub?.estado === 'RECHAZADA' });

  const { data: reserva, error } = await admin.rpc('reservar_registro_verifactu', {
    p_studio_id: p.studioId,
    p_factura_id: o.factura_id,
    p_tipo: 'ALTA_SUBSANACION',
    p_rechazo_previo: marcas.rechazoPrevio,
    p_sin_registro_previo: false,
    p_registro_origen_id: o.id,
    p_datos_corregidos: p.correcciones ?? null,
  }).single<{ id: string }>();
  if (error || !reserva) throw new OperacionVerifactuError(`No se pudo reservar la subsanación: ${error?.message ?? 'sin respuesta'}`);
  await completarReserva(admin, reserva.id);
  await admin.from('facturas').update({ verifactu_estado: 'PENDIENTE' }).eq('id', o.factura_id);
  return { registroId: reserva.id };
}

/** Registro de anulación de una factura sellada. */
export async function crearAnulacion(
  admin: SupabaseClient,
  p: { studioId: string; facturaId: string },
): Promise<{ registroId: string }> {
  const todos = await registrosDeFactura(admin, p.facturaId);
  if (todos.length === 0) throw new OperacionVerifactuError('La factura no tiene registro de alta');
  if (todos.some(r => !ESTADOS_FINALES.has(r.estado))) {
    throw new OperacionVerifactuError('Esta factura ya tiene un registro en curso: espera a que termine');
  }
  const altas = todos.filter(r => r.tipo !== 'ANULACION');
  const anulaciones = todos.filter(r => r.tipo === 'ANULACION');
  if (anulaciones.some(r => ESTADOS_EN_AEAT.has(r.estado))) throw new OperacionVerifactuError('Esta factura ya está anulada');
  const marcas = marcasAnulacion({
    existeEnAeat: altas.some(r => ESTADOS_EN_AEAT.has(r.estado)),
    anulacionAnteriorRechazada: anulaciones.at(-1)?.estado === 'RECHAZADA',
  });

  const { data: reserva, error } = await admin.rpc('reservar_registro_verifactu', {
    p_studio_id: p.studioId,
    p_factura_id: p.facturaId,
    p_tipo: 'ANULACION',
    p_rechazo_previo: marcas.rechazoPrevio ? 'S' : null,
    p_sin_registro_previo: marcas.sinRegistroPrevio,
    p_registro_origen_id: altas.at(-1)?.id ?? null,
    p_datos_corregidos: null,
  }).single<{ id: string }>();
  if (error || !reserva) throw new OperacionVerifactuError(`No se pudo reservar la anulación: ${error?.message ?? 'sin respuesta'}`);
  await completarReserva(admin, reserva.id);
  return { registroId: reserva.id };
}

/** Las reservas que alguien dejó a medias hace más de `margenMs`. */
export async function completarReservasHuerfanas(admin: SupabaseClient, studioId: string, margenMs = 30_000): Promise<number> {
  const antes = new Date(Date.now() - margenMs).toISOString();
  const { data } = await admin.from('verifactu_registros').select('id')
    .eq('studio_id', studioId).eq('estado', 'RESERVADO').lt('creado_en', antes);
  for (const r of data ?? []) await completarReserva(admin, r.id as string);
  return data?.length ?? 0;
}

/**
 * El nombre del obligado tal y como lo confirmó la propietaria al dar de alta
 * Veri*Factu (`verifactu_estudios.nombre_fiscal`). Si no lo hay, la razón
 * social; el nombre comercial solo como último recurso (la AEAT puede no
 * reconocerlo: se vería en la respuesta).
 */
export async function nombreFiscalDeEstudio(admin: SupabaseClient, studioId: string): Promise<string> {
  const [{ data: vf }, { data: studio }] = await Promise.all([
    admin.from('verifactu_estudios').select('nombre_fiscal').eq('studio_id', studioId).maybeSingle(),
    admin.from('studios').select('razon_social, nombre').eq('id', studioId).maybeSingle(),
  ]);
  return ((vf?.nombre_fiscal as string | null) || (studio?.razon_social as string | null) || (studio?.nombre as string | null) || '').trim();
}

export function registroParaXml(r: FilaRegistro): RegistroParaXml {
  return {
    tipo: r.tipo,
    idEmisor: r.id_emisor,
    numSerie: r.num_serie,
    fechaExpedicion: r.fecha_expedicion,
    tipoFactura: r.tipo_factura,
    cuotaTotal: num(r.cuota_total),
    importeTotal: num(r.importe_total),
    huella: r.huella ?? '',
    huellaAnterior: r.huella_anterior,
    anterior: r.anterior_num_serie && r.anterior_fecha_expedicion
      ? { idEmisor: r.anterior_id_emisor ?? r.id_emisor, numSerie: r.anterior_num_serie, fechaExpedicion: r.anterior_fecha_expedicion }
      : null,
    fechaHoraHusoGen: r.fecha_hora_huso_gen ?? '',
    rechazoPrevio: r.rechazo_previo,
    sinRegistroPrevio: r.sin_registro_previo,
    datosCorregidos: r.datos_corregidos,
  };
}

/**
 * PENDIENTE → LISTO: construye el XML y lo congela. Lo que no pasa la
 * validación local queda RECHAZADA (no llega a la AEAT; se subsana con
 * RechazoPrevio=X). Devuelve cuántos preparó y cuántos rechazó.
 */
export async function prepararRegistros(
  admin: SupabaseClient,
  studioId: string,
  sistema: SistemaInformatico,
  /** Solo los generados desde esta hora (la activación). Lo anterior no se toca: barrera-activacion.ts. */
  creadosDesde: string,
): Promise<{ preparados: number; rechazados: { id: string; numSerie: string; motivo: string }[] }> {
  const { data } = await admin.from('verifactu_registros').select(COLS_REGISTRO)
    .eq('studio_id', studioId).eq('estado', 'PENDIENTE').is('xml_registro', null).gte('creado_en', creadosDesde)
    .order('seq', { ascending: true }).limit(1000);
  const filas = (data ?? []) as unknown as FilaRegistro[];
  if (filas.length === 0) return { preparados: 0, rechazados: [] };

  const nombreEmisor = await nombreFiscalDeEstudio(admin, studioId);

  const facturaIds = [...new Set(filas.map(f => f.factura_id))];
  const { data: facturas } = await admin.from('facturas')
    .select('id, base_imponible, tipo_iva, cuota_iva, receptor_nombre, receptor_nif, tipo_rectificativa, concepto, rectifica_a')
    .in('id', facturaIds);
  const porId = new Map((facturas ?? []).map(f => [f.id as string, f]));
  const originalesIds = [...new Set((facturas ?? []).map(f => f.rectifica_a as string | null).filter((x): x is string => !!x))];
  const { data: originales } = originalesIds.length
    ? await admin.from('facturas').select('id, numero_completo, fecha_emision, base_imponible, cuota_iva').in('id', originalesIds)
    : { data: [] as Record<string, unknown>[] };
  const { data: altasOriginales } = originalesIds.length
    ? await admin.from('verifactu_registros').select('factura_id, id_emisor').in('factura_id', originalesIds).eq('tipo', 'ALTA')
    : { data: [] as Record<string, unknown>[] };
  const origPorId = new Map((originales ?? []).map(o => [o.id as string, o]));
  const emisorOrig = new Map((altasOriginales ?? []).map(o => [o.factura_id as string, o.id_emisor as string]));

  let preparados = 0;
  const rechazados: { id: string; numSerie: string; motivo: string }[] = [];
  for (const r of filas) {
    const f = porId.get(r.factura_id);
    let xml: string | null = null;
    let motivo: string | null = null;
    try {
      if (!f) throw new Error('Factura no encontrada');
      const orig = f.rectifica_a ? origPorId.get(f.rectifica_a as string) : undefined;
      const datos: FacturaParaXml = {
        baseImponible: Number(f.base_imponible),
        tipoIva: Number(f.tipo_iva),
        cuotaIva: Number(f.cuota_iva),
        receptorNombre: (f.receptor_nombre as string | null) ?? null,
        receptorNif: (f.receptor_nif as string | null) ?? null,
        tipoRectificativa: (f.tipo_rectificativa as 'S' | 'I' | null) ?? null,
        descripcion: descripcionAeatDeFactura({ concepto: (f.concepto as string | null) ?? null }),
        rectificada: orig ? {
          idEmisor: emisorOrig.get(orig.id as string) ?? r.id_emisor,
          numSerie: orig.numero_completo as string,
          fechaExpedicion: (() => { const [y, m, d] = String(orig.fecha_emision).slice(0, 10).split('-'); return `${d}-${m}-${y}`; })(),
          baseImponible: Number(orig.base_imponible),
          cuotaIva: Number(orig.cuota_iva),
        } : null,
      };
      xml = construirXmlRegistro(registroParaXml(r), datos, nombreEmisor, sistema);
    } catch (e) {
      motivo = e instanceof RegistroInvalidoError ? e.errores.join('; ') : e instanceof Error ? e.message : String(e);
    }

    if (xml) {
      // Solo si seguía PENDIENTE y sin XML: el XML se escribe UNA vez.
      const { data: ok } = await admin.from('verifactu_registros')
        .update({ xml_registro: xml, xml_sha256: sha256Texto(xml), estado: 'LISTO', actualizado_en: new Date().toISOString() })
        .eq('id', r.id).eq('estado', 'PENDIENTE').is('xml_registro', null).select('id');
      if (ok?.length) preparados += 1;
    } else {
      await admin.from('verifactu_registros')
        .update({ estado: 'RECHAZADA', codigo_error: 'VALIDACION_LOCAL', descripcion_error: motivo, actualizado_en: new Date().toISOString() })
        .eq('id', r.id).eq('estado', 'PENDIENTE');
      rechazados.push({ id: r.id, numSerie: r.num_serie, motivo: motivo ?? 'inválido' });
    }
  }
  return { preparados, rechazados };
}
