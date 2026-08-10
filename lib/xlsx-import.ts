// ─────────────────────────────────────────────────────────────────────────────
// Lector de Excel (.xlsx/.xls) para los asistentes de importación (SheetJS).
// Aislado en su propio módulo — no en `lib/csv.ts` — para que `xlsx` (pesada)
// solo entre al bundle del navegador cuando alguien sube de verdad un Excel:
// se carga con `import()` dinámico desde `lib/importar-archivo.ts`, nunca en
// el top-level de una página.
// ─────────────────────────────────────────────────────────────────────────────

import * as XLSX from 'xlsx';
import { detectarCabeceraYFilas, type ParsedCsv } from './csv.ts';

/**
 * Convierte un .xlsx/.xls a la MISMA forma { headers, rows } que produce
 * `parseCsv` — el resto del pipeline (autoMapear, validarFilas, la UI del
 * paso 2 de cada asistente) no sabe ni le importa si el archivo era CSV o
 * Excel.
 *
 * Si el libro tiene varias hojas, se usa la que tenga MÁS FILAS con datos: el
 * caso típico es una pestaña de datos real junto a alguna hoja de notas o
 * resumen casi vacía. No hay selector de hoja — si algún día hace falta
 * elegir a mano, es una pieza de UI aparte, no algo que se pueda colar gratis
 * aquí sin pantalla propia.
 *
 * Aplica la misma heurística de "saltar preámbulo/filas título antes de la
 * cabecera" que `parseCsv` (vía `detectarCabeceraYFilas`, compartida) — un
 * Excel exportado a mano tiene exactamente el mismo problema que un CSV.
 */
export function parseXlsx(data: ArrayBuffer): ParsedCsv {
  const libro = XLSX.read(data, { type: 'array' });

  let mejor: string[][] = [];
  for (const nombreHoja of libro.SheetNames) {
    const hoja = libro.Sheets[nombreHoja];
    if (!hoja) continue;
    const crudas = XLSX.utils.sheet_to_json<(string | number)[]>(hoja, {
      header: 1,
      raw: false,
      defval: '',
    });
    // `sheet_to_json({header:1})` PADEA cada fila hasta el ancho de la hoja
    // entera (el rango lo marca la celda más a la derecha usada en CUALQUIER
    // fila) — una fila de título de 1 celda real vuelve con celdas vacías de
    // relleno hasta igualar a la cabecera de al lado. Sin recortar esas
    // colas vacías, `detectarCabeceraYFilas` ve todas las filas con el MISMO
    // ancho y la heurística de "el título es más estrecho" nunca se dispara.
    const filas = crudas
      .map((fila) => {
        const trimeada = fila.map((celda) => String(celda ?? '').trim());
        while (trimeada.length > 0 && trimeada[trimeada.length - 1] === '') trimeada.pop();
        return trimeada;
      })
      .filter((fila) => fila.length > 0);
    if (filas.length > mejor.length) mejor = filas;
  }

  const { headers, rows } = detectarCabeceraYFilas(mejor);
  // El concepto de "delimitador" no aplica a un Excel; se deja vacío para que
  // la UI (que hoy muestra «delimitador «,»» solo para CSV) sepa omitirlo.
  return { headers, rows, delimiter: '' };
}
