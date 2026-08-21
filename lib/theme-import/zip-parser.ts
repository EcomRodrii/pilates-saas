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
import { rutaConTravesia } from '../ruta-segura.ts';
import { clasificarFichero, construirManifest, type FicheroImportado, type ImportedThemeManifest } from './manifest.ts';

export const LIMITE_ZIP_BYTES = 25 * 1024 * 1024; // 25 MB — un tema estático no debería pesar más.
export const LIMITE_FICHEROS = 500;

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

  let entradas: Record<string, Uint8Array>;
  try {
    entradas = unzipSync(buffer);
  } catch {
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

  // 🔴 AUDITORÍA 21-ago — ZIP-SLIP CROSS-TENANT.
  //
  // Los nombres de entrada del ZIP se usaban tal cual para componer la clave de
  // R2 (`temas-importados/${studioId}/${id}/${ruta}`, app/api/theme/importar-zip)
  // y esa clave acaba dentro de un `new URL(...)` en lib/r2.ts, que COLAPSA los
  // `..` antes de firmar Y antes de enviar el PUT. Comprobado:
  //
  //   temas-importados/S/ID/../../OTRO/ID2/index.html  → /temas-importados/OTRO/ID2/index.html
  //   temas-importados/S/ID/../../../backups/O/b.json  → /backups/O/b.json
  //
  // Es decir: una propietaria con plan Estudio podía subir un ZIP "compatible"
  // (basta HTML+CSS) con entradas `..` y sobrescribir el tema publicado —o el
  // snapshot de backup, mismo bucket— de OTRO estudio. El único saneado que
  // había era el de `__MACOSX/` y ficheros ocultos, que no mira los `..`.
  //
  // Se rechaza el ZIP entero en vez de filtrar la entrada: un ZIP con rutas así
  // no es un export legítimo de ninguna herramienta, y aceptarlo a medias
  // dejaría un tema roto sin explicar por qué. Ver la defensa en profundidad en
  // subirObjetoR2 (lib/r2.ts), que rechaza la misma clase de clave.
  const sospechosa = rutas.find(rutaConTravesia);
  if (sospechosa) {
    throw new ZipInvalidoError(
      'El ZIP contiene rutas no válidas (fuera de su propia carpeta). ' +
      'Vuelve a exportarlo desde la herramienta de diseño sin comprimir a mano.',
    );
  }

  const raiz = carpetaRaizComun(rutas);
  const contenidos = new Map<string, Uint8Array>();
  const ficheros: FicheroImportado[] = [];
  for (const ruta of rutas) {
    const relativa = raiz ? ruta.slice(raiz.length) : ruta;
    if (!relativa) continue;
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
