// ─────────────────────────────────────────────────────────────────────────────
// Carga de archivo compartida por los asistentes de importación
// (clientas/importar, citas/importar, calendario/importar…): valida la
// extensión y convierte CSV o Excel a la misma forma { headers, rows } que
// consume el resto del pipeline (autoMapear/validarFilas de `lib/csv.ts`).
// Antes cada página repetía esta lógica; con soporte a .xlsx se centraliza
// aquí para no triplicar el cambio.
// ─────────────────────────────────────────────────────────────────────────────

import { parseCsv, type ParsedCsv } from './csv.ts';

export const ACCEPT_ARCHIVO_TABULAR =
  '.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

export const MENSAJE_ARCHIVO_NO_VALIDO = 'Sube un archivo .csv o .xlsx.';

const RE_EXTENSION_EXCEL = /\.xlsx?$/i;
const RE_EXTENSION_CSV = /\.csv$/i;
const TIPOS_MIME_EXCEL = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

function esExcel(file: File): boolean {
  return RE_EXTENSION_EXCEL.test(file.name) || TIPOS_MIME_EXCEL.has(file.type);
}

/** Acepta .csv o .xlsx/.xls, por extensión o por `file.type` (drag&drop a veces no trae extensión fiable). */
export function esArchivoTabularValido(file: File): boolean {
  return esExcel(file) || RE_EXTENSION_CSV.test(file.name) || file.type === 'text/csv';
}

/**
 * Lee un archivo subido (CSV o Excel) y lo deja en la forma { headers, rows }
 * que ya consumía todo el pipeline. `xlsx` (SheetJS) es una librería pesada:
 * se importa con `import()` dinámico SOLO cuando el archivo es un Excel, para
 * no meterla en el bundle inicial de una página que la mayoría de sesiones ni
 * va a visitar.
 */
export async function leerArchivoTabular(file: File): Promise<ParsedCsv> {
  if (esExcel(file)) {
    const { parseXlsx } = await import('./xlsx-import.ts');
    const buffer = await file.arrayBuffer();
    return parseXlsx(buffer);
  }
  const texto = await file.text();
  return parseCsv(texto);
}
