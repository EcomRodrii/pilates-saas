// Veri*Factu — lectura de los registros de un estudio para exportarlos.
//
// Con service-role: el XML congelado (`xml_registro`) no lo lee nadie desde el
// cliente (migración 20260930030000). Quien llama comprueba antes el rol.

import type { SupabaseClient } from '@supabase/supabase-js';
import { numeroInstalacionDeEstudio } from './sif.ts';
import type { EstadoRegistroVerifactu, TipoRegistro } from './estado.ts';
import type { CabeceraExportacion, RegistroExportable } from './exportacion.ts';

/**
 * Por páginas y por `seq` (keyset), hasta que una página vuelva VACÍA. No se
 * para en «una página con menos filas de las pedidas»: si el proyecto tiene un
 * tope de filas por consulta más bajo que la página, eso cortaría la exportación
 * sin avisar, y una exportación incompleta que parece completa es peor que un
 * error.
 */
const PAGINA = 1000;

const COLS = 'seq, tipo, id_emisor, num_serie, fecha_expedicion, tipo_factura, cuota_total, importe_total, ' +
  'huella_anterior, huella, fecha_hora_huso_gen, estado, csv, codigo_error, descripcion_error';

interface Fila {
  seq: number;
  tipo: TipoRegistro;
  id_emisor: string;
  num_serie: string;
  fecha_expedicion: string;
  tipo_factura: string | null;
  cuota_total: number | null;
  importe_total: number | null;
  huella_anterior: string;
  huella: string | null;
  fecha_hora_huso_gen: string | null;
  estado: EstadoRegistroVerifactu;
  csv: string | null;
  codigo_error: string | null;
  descripcion_error: string | null;
  xml_registro?: string | null;
  xml_sha256?: string | null;
}

export async function leerRegistrosParaExportar(
  admin: SupabaseClient, studioId: string, conXml: boolean,
): Promise<RegistroExportable[]> {
  const cols = conXml ? `${COLS}, xml_registro, xml_sha256` : COLS;
  const registros: RegistroExportable[] = [];
  let desde = 0;
  for (;;) {
    const { data, error } = await admin.from('verifactu_registros').select(cols)
      .eq('studio_id', studioId).gt('seq', desde).order('seq', { ascending: true }).limit(PAGINA);
    if (error) throw new Error(`verifactu_registros: ${error.message}`);
    const filas = (data ?? []) as unknown as Fila[];
    if (filas.length === 0) return registros;
    for (const f of filas) {
      registros.push({
        seq: f.seq, tipo: f.tipo, idEmisor: f.id_emisor, numSerie: f.num_serie, fechaExpedicion: f.fecha_expedicion,
        tipoFactura: f.tipo_factura, cuotaTotal: f.cuota_total, importeTotal: f.importe_total,
        huellaAnterior: f.huella_anterior, huella: f.huella, fechaHoraHusoGen: f.fecha_hora_huso_gen,
        estado: f.estado, csv: f.csv, codigoError: f.codigo_error, descripcionError: f.descripcion_error,
        ...(conXml ? { xmlRegistro: f.xml_registro ?? null, xmlSha256: f.xml_sha256 ?? null } : {}),
      });
    }
    desde = filas[filas.length - 1].seq;
  }
}

/** Cuántos registros tiene el estudio: el panel solo ofrece exportar si hay alguno. */
export async function contarRegistros(admin: SupabaseClient, studioId: string): Promise<number> {
  const { count, error } = await admin.from('verifactu_registros')
    .select('id', { count: 'exact', head: true }).eq('studio_id', studioId);
  if (error) throw new Error(`verifactu_registros: ${error.message}`);
  return count ?? 0;
}

/**
 * Quién es el obligado tributario de la exportación: los datos del alta
 * Veri*Factu si la hay, y si no los fiscales del estudio.
 */
export async function cabeceraExportacion(
  admin: SupabaseClient, studioId: string, exportadoEn: Date,
): Promise<CabeceraExportacion> {
  const [{ data: vf, error: e1 }, { data: st, error: e2 }] = await Promise.all([
    admin.from('verifactu_estudios').select('nif, nombre_fiscal, numero_instalacion').eq('studio_id', studioId).maybeSingle(),
    admin.from('studios').select('nif, razon_social').eq('id', studioId).maybeSingle(),
  ]);
  if (e1) throw new Error(`verifactu_estudios: ${e1.message}`);
  if (e2) throw new Error(`studios: ${e2.message}`);
  return {
    nombreObligado: vf?.nombre_fiscal ?? st?.razon_social ?? '',
    nifObligado: vf?.nif ?? st?.nif ?? '',
    numeroInstalacion: vf?.numero_instalacion ?? numeroInstalacionDeEstudio(studioId),
    exportadoEn: exportadoEn.toISOString(),
  };
}
