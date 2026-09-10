// Descomprime un ZIP de tema y arma su manifest — SIN interpretar nada.
//
// ⚠️ Alcance de esta primera versión, dicho a las claras: solo el modo
// ESTÁTICO (HTML + CSS + assets + fuentes, servidos tal cual dentro de un
// iframe en sandbox). Un ZIP con componentes React sin compilar (.tsx/.jsx) o
// que dependa de un bundler (Next/Vite) entra como `estado: 'incompatible'`
// con el motivo explícito — nunca se "aproxima" en silencio (punto 14 del
// encargo). Compilar esos proyectos en servidor es la siguiente fase, no
// esta: es un subsistema aparte (sandbox de build, límites de CPU/tiempo,
// resolución de dependencias) que merece su propio diseño.
//
// `fflate` (~8 KB) por el mismo motivo que `aws4fetch` en lib/r2.ts: nada de
// peso en runtimes serverless con cold start.

import { unzipSync, strFromU8 } from 'fflate';
import { clasificarFichero, construirManifest, type FicheroImportado, type ImportedThemeManifest } from './manifest.ts';
import { rutaConTravesia } from '../ruta-segura.ts';

export const LIMITE_ZIP_BYTES = 25 * 1024 * 1024; // 25 MB — un tema estático no debería pesar más.
export const LIMITE_FICHEROS = 500;
// 46ª pasada de auditoría: LIMITE_ZIP_BYTES solo acota el ZIP COMPRIMIDO.
// Un ratio de compresión patológico (zip bomb) puede expandir 25 MB a
// decenas de GB en memoria antes de que se comprobara nada — `unzipSync`
// descomprimía el ZIP entero de una sola vez. Estos dos límites se aplican
// vía el `filter` de fflate, que fflate llama por entrada ANTES de inflarla
// (lee `originalSize` de la cabecera central del ZIP, sin descomprimir) —
// así que una entrada que los supere nunca llega a inflarse.
export const LIMITE_FICHERO_DESCOMPRIMIDO_BYTES = 20 * 1024 * 1024; // 20 MB por fichero ya descomprimido.
export const LIMITE_TOTAL_DESCOMPRIMIDO_BYTES = 100 * 1024 * 1024; // 100 MB acumulados del ZIP entero.

export interface ZipDescomprimido {
  manifest: ImportedThemeManifest;
  /** Ruta relativa → contenido crudo. Lo que se sube a R2 tal cual. */
  contenidos: Map<string, Uint8Array>;
}

export class ZipInvalidoError extends Error {}

/**
 * Descomprime el ZIP y arma su manifest. Lanza `ZipInvalidoError` con un
 * mensaje pensado para enseñarse a la propietaria (no un stacktrace) cuando
 * el fichero no es un ZIP válido o excede los límites.
 */
export function descomprimirTema(buffer: Uint8Array): ZipDescomprimido {
  if (buffer.byteLength > LIMITE_ZIP_BYTES) {
    throw new ZipInvalidoError(
      `El ZIP pesa ${Math.round(buffer.byteLength / 1024 / 1024)} MB — el límite son ` +
      `${LIMITE_ZIP_BYTES / 1024 / 1024} MB. Comprueba que no incluya vídeos o assets sin optimizar.`,
    );
  }

  let totalDescomprimido = 0;
  let entradas: Record<string, Uint8Array>;
  try {
    entradas = unzipSync(buffer, {
      filter(file) {
        if (file.originalSize > LIMITE_FICHERO_DESCOMPRIMIDO_BYTES) {
          throw new ZipInvalidoError(
            `"${file.name}" pesa ${Math.round(file.originalSize / 1024 / 1024)} MB ya descomprimido — ` +
            `el límite por fichero son ${LIMITE_FICHERO_DESCOMPRIMIDO_BYTES / 1024 / 1024} MB.`,
          );
        }
        totalDescomprimido += file.originalSize;
        if (totalDescomprimido > LIMITE_TOTAL_DESCOMPRIMIDO_BYTES) {
          throw new ZipInvalidoError(
            `El ZIP descomprime a más de ${LIMITE_TOTAL_DESCOMPRIMIDO_BYTES / 1024 / 1024} MB — ` +
            'revisa que no traiga un ratio de compresión anómalo.',
          );
        }
        return true;
      },
    });
  } catch (err) {
    // fflate llama al filter POR ENTRADA, leyendo su tamaño de la cabecera
    // central — ANTES de inflarla. Lanzar aquí dentro corta la descompresión
    // a mitad de ZIP, así que un ZipInvalidoError propio nunca llega a
    // inflar la entrada que lo disparó (ni las siguientes).
    if (err instanceof ZipInvalidoError) throw err;
    throw new ZipInvalidoError('El fichero no es un ZIP válido, o está dañado.');
  }

  const rutas = Object.keys(entradas)
    // fflate incluye las entradas de carpeta ("assets/") con contenido vacío.
    .filter((r) => !r.endsWith('/'))
    // El export de Claude Design (y de la mayoría de herramientas) mete todo
    // bajo una carpeta raíz con el nombre del proyecto. Se pela ese único
    // nivel para que `index.html` quede en la raíz del manifest y no
    // enterrado en "mi-proyecto/index.html" — sin esto, `entryPointsDe`
    // seguiría encontrándolo iaual, pero las rutas relativas dentro del HTML
    // ("./styles.css") dejarían de casar con las claves del manifest.
    .map((r) => r.replace(/^__MACOSX\//, ''))
    .filter((r) => !r.startsWith('__MACOSX/') && !r.split('/').pop()?.startsWith('.'));

  if (rutas.length === 0) {
    throw new ZipInvalidoError('El ZIP está vacío, o solo trae ficheros ocultos del sistema.');
  }
  if (rutas.length > LIMITE_FICHEROS) {
    throw new ZipInvalidoError(
      `El ZIP trae ${rutas.length} ficheros — el límite son ${LIMITE_FICHEROS}. ` +
      'Puede que incluya carpetas de dependencias (node_modules) que no hacen falta subir.',
    );
  }

  const raiz = carpetaRaizComun(rutas);
  const contenidos = new Map<string, Uint8Array>();
  const ficheros: FicheroImportado[] = [];
  for (const ruta of rutas) {
    const relativa = raiz ? ruta.slice(raiz.length) : ruta;
    if (!relativa) continue;
    // Zip-slip: se rechaza el ZIP ENTERO, no solo la entrada — un ZIP que
    // trae una travesía es hostil por construcción, no un fichero de más a
    // ignorar. Ver lib/ruta-segura.ts.
    if (rutaConTravesia(relativa)) {
      throw new ZipInvalidoError('El ZIP trae una ruta no válida — revisa que no incluya "..".');
    }
    const datos = entradas[ruta];
    contenidos.set(relativa, datos);
    ficheros.push({ ruta: relativa, clase: clasificarFichero(relativa), bytes: datos.byteLength });
  }

  const dependencias = leerDependencias(contenidos);
  const manifest = construirManifest(ficheros, dependencias);
  return { manifest, contenidos };
}

/** Si TODAS las rutas comparten una única carpeta de primer nivel, la pela. */
function carpetaRaizComun(rutas: readonly string[]): string {
  // ⚠️ Con UN solo fichero, "carpeta común" no significa nada — el propio
  // nombre del fichero es su único segmento, y pelarlo lo dejaría sin ruta.
  // Se comió un test real: un ZIP con un solo `index.html` (tras filtrar
  // `__MACOSX`/ocultos) desaparecía entero.
  if (rutas.length < 2) return '';
  const primeras = new Set(rutas.map((r) => r.split('/')[0]));
  if (primeras.size !== 1) return '';
  const [unica] = primeras;
  const prefijo = `${unica}/`;
  return rutas.every((r) => r.startsWith(prefijo)) ? prefijo : '';
}

/** `dependencies`+`devDependencies` de `package.json`, si el ZIP lo trae. */
function leerDependencias(contenidos: ReadonlyMap<string, Uint8Array>): string[] {
  const pkg = contenidos.get('package.json');
  if (!pkg) return [];
  try {
    const json = JSON.parse(strFromU8(pkg)) as {
      dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
    };
    return [...Object.keys(json.dependencies ?? {}), ...Object.keys(json.devDependencies ?? {})];
  } catch {
    return [];
  }
}
