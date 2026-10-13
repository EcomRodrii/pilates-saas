// «Importar pegando» (P3.16, diseño en investigacion-bonsai 21): lo que se copia
// de una hoja (Excel, Numbers, Google Sheets) y se pega en el importador llega
// como texto separado por tabuladores. Acaba en el MISMO paso de mapeo y vista
// previa que un fichero: pegar no escribe nada, solo lleva a revisar.
//
// ⚠️ Tiene su propio lector, más estricto que `parseCsv` (que es para FICHEROS):
//   · con un tabulador en el texto, el separador es el tabulador y punto. Adivinar
//     partía por las comas de «García López, Ana» o «martes, jueves» (Excel no
//     entrecomilla esas celdas al copiar), y la tabla salía inservible;
//   · las comillas solo abren al PRINCIPIO de una celda, que es como entrecomilla
//     una hoja (una celda con un salto de línea dentro). Un «pantalla 5"» en mitad
//     de una celda es texto: si abriera comillas, se tragaría las filas de debajo;
//   · `\r` suelto es un salto de línea (Excel de Mac antiguo), no se ignora: si no,
//     «Ana\rBea» se fundía en una sola clienta falsa;
//   · no se saltan filas de «preámbulo»: en una hoja copiada no hay título, y saltar
//     la primera fila porque sea más corta perdía a una clienta sin avisar.
//
// Lo demás:
//   · la cabecera puede no venir (se copia a menudo solo el bloque de datos): se
//     adivina y la pantalla deja corregirlo con una casilla;
//   · sin cabecera, las columnas se llaman «Columna 1…N»; el correo, el teléfono y
//     el nombre se proponen por su contenido (también con títulos que no se
//     reconocen, como «Correu» o «Courriel»);
//   · una columna que parece de SALUD no se propone nunca para ningún campo, y si
//     alguien la relaciona a mano la pantalla no deja importar (un «VIP;
//     embarazada» acabaría en las etiquetas, que ve todo el equipo);
//   · avisos que no bloquean: una fecha como número de serie de Excel, unas
//     comillas sin cerrar.
//
// ⚠️ Lo pegado no se guarda en ningún sitio (ni localStorage, ni Sentry, ni
// logs): vive en la memoria de la pantalla. Y lo que no se relaciona con un
// campo de la clienta no sale del navegador (`FilaSocia` es una lista cerrada).
// Puro, sin `@/`.

import {
  autoMapear, detectarDelimitador, emailValido, nombraCampoSocia, telefonoValido,
  type CampoSocia, type ParsedCsv,
} from './csv.ts';
import { columnaPareceDeSalud } from './migracion/muestras-anonimas.ts';

/** El tope del servidor (`app/api/socios/import`), en filas que se envían: se dice ANTES de importar, no con un 413 al final. */
export const MAX_FILAS_PEGADAS = 5000;
/** Más que esto ni se lee: no es una lista de clientas y colgaría la pestaña. */
export const MAX_FILAS_LEIDAS = 20000;

export interface Pegado {
  /** Todas las filas no vacías, cabecera incluida si la hay. */
  filas: string[][];
  /** ¿Parece que la primera fila son los títulos? Lo que marca la casilla al empezar. */
  cabeceraAdivinada: boolean;
  /** Se acabó el texto dentro de unas comillas: una celda puede haberse tragado a las siguientes. */
  comillasSinCerrar: boolean;
  /** Había más de `MAX_FILAS_LEIDAS` filas: no se leen. */
  demasiadas: boolean;
}

const vacia = (fila: string[]) => fila.every((c) => c.trim() === '');

/** Tokeniza con un separador conocido. Comillas solo al principio de una celda. */
function tokenizar(texto: string, sep: string): { filas: string[][]; enComillas: boolean } {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;
  let alInicio = true; // ¿estamos al principio de una celda?
  const cerrarCampo = () => { fila.push(campo.trim()); campo = ''; alInicio = true; };
  const cerrarFila = () => { cerrarCampo(); filas.push(fila); fila = []; };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else enComillas = false;
      } else campo += c;
    } else if (c === '"' && alInicio) {
      enComillas = true;
      alInicio = false;
    } else if (c === sep) {
      cerrarCampo();
    } else if (c === '\n') {
      cerrarFila();
    } else {
      campo += c;
      alInicio = false;
    }
  }
  if (campo !== '' || fila.length > 0) cerrarFila();
  return { filas, enComillas };
}

/** Lee lo pegado. `null` si no trae ninguna fila con algo. */
export function leerPegado(texto: string): Pegado | null {
  if (!texto.trim()) return null;
  // BOM fuera; `\r\n` y `\r` sueltos, saltos de línea.
  const limpio = (texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto).replace(/\r\n?/g, '\n');
  // Una hoja copiada siempre trae tabuladores. Sin ninguno (una sola columna, o
  // un CSV pegado desde un fichero de texto), se adivina como con un fichero.
  const sep = limpio.includes('\t') ? '\t' : detectarDelimitador(limpio);
  const lineas = limpio.split('\n').length;
  if (lineas > MAX_FILAS_LEIDAS + 1) {
    return { filas: [], cabeceraAdivinada: false, comillasSinCerrar: false, demasiadas: true };
  }
  const { filas: crudas, enComillas } = tokenizar(limpio, sep);
  const filas = crudas.filter((f) => f.length > 0 && !vacia(f));
  if (filas.length === 0) return null;
  return {
    filas,
    cabeceraAdivinada: pareceCabecera(filas[0], filas.slice(1)),
    comillasSinCerrar: enComillas,
    demasiadas: false,
  };
}

/**
 * ¿La primera fila son los títulos? Nunca si trae un correo o un teléfono (es una
 * clienta). Si no, sí cuando una celda nombra tal cual un campo («Email») o
 * cuando las filas de debajo traen correos y ella no: una fila sin correo no se
 * podría importar de todas formas, así que tomarla por títulos no pierde a nadie.
 */
export function pareceCabecera(fila: string[], resto: string[][] = []): boolean {
  if (fila.some((c) => emailValido(c) || telefonoValido(c))) return false;
  if (fila.some(nombraCampoSocia)) return true;
  return resto.slice(0, 20).some((r) => r.some((c) => emailValido(c)));
}

/** Lo pegado, en la forma que ya usa todo el importador. */
export function tablaPegada(pegado: Pegado, conCabecera: boolean): ParsedCsv {
  // Con un bucle: `Math.max(...filas)` revienta la pila con cientos de miles de filas.
  let ancho = 0;
  for (const f of pegado.filas) if (f.length > ancho) ancho = f.length;
  if (conCabecera && pegado.filas.length > 0) {
    const [cab, ...rows] = pegado.filas;
    const headers = Array.from({ length: ancho }, (_, i) => (cab[i] ?? '').trim() || `Columna ${i + 1}`);
    return { headers, rows, delimiter: '\t' };
  }
  return { headers: Array.from({ length: ancho }, (_, i) => `Columna ${i + 1}`), rows: pegado.filas, delimiter: '\t' };
}

const valoresDe = (rows: string[][], col: number) =>
  rows.map((f) => (f[col] ?? '').trim()).filter((v) => v !== '');

/** La columna en la que la mayoría de valores cumplen `test`, o -1. */
function columnaQue(rows: string[][], ancho: number, test: (v: string) => boolean, usadas: Set<number>): number {
  let mejor = -1;
  let mejorProp = 0.5;
  for (let c = 0; c < ancho; c++) {
    if (usadas.has(c)) continue;
    const vals = valoresDe(rows, c);
    if (vals.length === 0) continue;
    const prop = vals.filter(test).length / vals.length;
    if (prop > mejorProp) { mejor = c; mejorProp = prop; }
  }
  return mejor;
}

const pareceNombre = (v: string) => v.length <= 60 && /\p{L}/u.test(v) && !/\d/.test(v) && !emailValido(v);

/**
 * El mapeo de partida: el de siempre por los títulos (`autoMapear`), y lo que se
 * quede sin asignar entre correo, teléfono y nombre, por el contenido. Una columna
 * de salud no se propone para nada. Es solo una propuesta: la pantalla deja
 * cambiarlo todo antes de importar.
 */
export function mapeoPegado(tabla: ParsedCsv, conCabecera: boolean): Record<CampoSocia, number> {
  const m = autoMapear(conCabecera ? tabla.headers : tabla.headers.map(() => ''));
  const deSalud = new Set(columnasDeSalud(tabla).map((c) => c.indice));
  for (const campo of Object.keys(m) as CampoSocia[]) if (deSalud.has(m[campo])) m[campo] = -1;
  const usadas = new Set<number>([...deSalud, ...Object.values(m).filter((i) => i >= 0)]);
  const ancho = tabla.headers.length;
  const porContenido = (campo: CampoSocia, test: (v: string) => boolean) => {
    if (m[campo] >= 0) return;
    m[campo] = columnaQue(tabla.rows, ancho, test, usadas);
    if (m[campo] >= 0) usadas.add(m[campo]);
  };
  porContenido('email', emailValido);
  porContenido('telefono', telefonoValido);
  porContenido('nombre', pareceNombre);
  return m;
}

/**
 * Al marcar o quitar «La primera fila son los títulos» los índices de columna no
 * cambian: se conserva lo que la persona ya había relacionado y solo se proponen
 * los campos que siguen sin asignar.
 */
export function mapeoConservado(
  anterior: Record<CampoSocia, number>, tabla: ParsedCsv, conCabecera: boolean,
): Record<CampoSocia, number> {
  const nuevo = mapeoPegado(tabla, conCabecera);
  const usadas = new Set(Object.values(anterior).filter((i) => i >= 0));
  const out = { ...anterior };
  for (const campo of Object.keys(out) as CampoSocia[]) {
    if (out[campo] < 0 && nuevo[campo] >= 0 && !usadas.has(nuevo[campo])) {
      out[campo] = nuevo[campo];
      usadas.add(nuevo[campo]);
    }
  }
  return out;
}

/** Número de serie de Excel (días desde 1900, con la hora como decimal). 20.000–80.000 = 1954–2119. */
const SERIAL_EXCEL = /^\d{5}(?:[.,]\d+)?$/;
const esSerialExcel = (v: string) => SERIAL_EXCEL.test(v) && Number(v.replace(',', '.')) >= 20000 && Number(v.replace(',', '.')) <= 80000;

/** Las columnas en las que la mitad o más de los valores son fechas como número de serie de Excel. */
export function columnasConFechaDeExcel(tabla: ParsedCsv): Set<number> {
  const out = new Set<number>();
  for (let c = 0; c < tabla.headers.length; c++) {
    const vals = valoresDe(tabla.rows, c);
    if (vals.length > 0 && vals.filter(esSerialExcel).length / vals.length >= 0.5) out.add(c);
  }
  return out;
}

export interface ColumnaDeSalud { indice: number; nombre: string }

/**
 * Las columnas que parecen de salud, por su título o por lo que traen. Una columna
 * de correos o de teléfonos no lo es aunque alguien se llame «mariadolores@…».
 */
export function columnasDeSalud(tabla: ParsedCsv): ColumnaDeSalud[] {
  const out: ColumnaDeSalud[] = [];
  for (let c = 0; c < tabla.headers.length; c++) {
    const vals = valoresDe(tabla.rows, c);
    const deContacto = vals.length > 0
      && vals.filter((v) => emailValido(v) || telefonoValido(v)).length / vals.length > 0.5;
    if (deContacto) continue;
    if (columnaPareceDeSalud(tabla.headers[c] ?? '', vals)) out.push({ indice: c, nombre: tabla.headers[c] || `Columna ${c + 1}` });
  }
  return out;
}

/** Los campos de la clienta que apuntan a una columna de salud: con alguno, no se importa. */
export function camposConSalud(mapeo: Record<CampoSocia, number>, salud: ColumnaDeSalud[]): { campo: CampoSocia; columna: string }[] {
  const porIndice = new Map(salud.map((c) => [c.indice, c.nombre]));
  return (Object.keys(mapeo) as CampoSocia[])
    .filter((campo) => porIndice.has(mapeo[campo]))
    .map((campo) => ({ campo, columna: porIndice.get(mapeo[campo])! }));
}
