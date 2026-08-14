// El manifest de un ZIP de tema importado — qué contiene, sin transformarlo.
//
// Puro (sin Next, sin Supabase, sin R2): recibe la lista de rutas del ZIP ya
// descomprimido y clasifica, no interpreta. "Clasificar" es "es un .css", no
// "esto es un Hero" — la regla del encargo es que el importador ANALIZA y
// PRESERVA, nunca "reconstruye". Testeable con `node --test`.

/** Cada fichero del ZIP, clasificado por lo que ES, no por lo que hace. */
export type ClaseFichero =
  | 'html' | 'css' | 'javascript' | 'typescript'
  | 'imagen' | 'fuente' | 'video' | 'config' | 'otro';

export interface FicheroImportado {
  /** Ruta relativa a la raíz del ZIP, con `/` siempre. */
  ruta: string;
  clase: ClaseFichero;
  bytes: number;
}

export interface ImportedThemeManifest {
  /**
   * Pista de framework, solo para AVISAR — nunca para decidir si se importa.
   * `'estatico'` = no se detectó ningún framework (el caso más compatible:
   * HTML/CSS/JS sueltos, que es justo lo que exporta Claude Design).
   */
  framework: 'estatico' | 'next' | 'vite' | 'desconocido';
  ficheros: FicheroImportado[];
  /**
   * Los HTML de nivel raíz o de una carpeta de primer nivel — candidatos a
   * entrada del iframe. El primero (`index.html` si existe, si no el primer
   * HTML encontrado) es el que se sirve; el resto queda listado por si el ZIP
   * trae varias páginas.
   */
  entryPoints: string[];
  stylesheets: string[];
  assets: string[];
  fonts: string[];
  /**
   * Dependencias declaradas en `package.json`, si lo trae. Se listan tal
   * cual, no se instalan ni se resuelven — sirven para que la pantalla de
   * importación pueda avisar de una dependencia que Tentare no puede
   * ejecutar en el iframe (punto 14 del encargo: avisar, no aproximar).
   */
  dependencias: string[];
  /**
   * Ninguna: el ZIP encaja en el modo estático (HTML/CSS/assets, sin
   * ejecutar JS del propio ZIP en esta primera versión — ver el comentario
   * de cabecera de `zip-parser.ts`). Con algo aquí, la importación entra en
   * `estado: 'incompatible'` — nunca se aproxima en silencio.
   */
  incompatibilidades: string[];
}

const EXT_IMAGEN = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'ico']);
const EXT_FUENTE = new Set(['woff', 'woff2', 'ttf', 'otf', 'eot']);
const EXT_VIDEO = new Set(['mp4', 'webm', 'mov']);
const EXT_CONFIG = new Set(['json', 'yaml', 'yml', 'toml']);

function extensionDe(ruta: string): string {
  const i = ruta.lastIndexOf('.');
  return i === -1 ? '' : ruta.slice(i + 1).toLowerCase();
}

/** Clasifica UN fichero por su extensión. Sin heurísticas de contenido. */
export function clasificarFichero(ruta: string): ClaseFichero {
  const ext = extensionDe(ruta);
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'css') return 'css';
  if (ext === 'ts' || ext === 'tsx') return 'typescript';
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs') return 'javascript';
  if (EXT_IMAGEN.has(ext)) return 'imagen';
  if (EXT_FUENTE.has(ext)) return 'fuente';
  if (EXT_VIDEO.has(ext)) return 'video';
  if (EXT_CONFIG.has(ext)) return 'config';
  return 'otro';
}

/**
 * Detecta el framework por la PRESENCIA de sus ficheros de configuración, no
 * por adivinar el contenido. Es solo informativo: no decide si se importa.
 */
function detectarFramework(rutas: readonly string[]): ImportedThemeManifest['framework'] {
  const nombres = new Set(rutas.map((r) => r.split('/').pop() ?? ''));
  if ([...nombres].some((n) => /^next\.config\.(js|ts|mjs)$/.test(n))) return 'next';
  if ([...nombres].some((n) => /^vite\.config\.(js|ts|mjs)$/.test(n))) return 'vite';
  const tieneHtml = rutas.some((r) => extensionDe(r) === 'html');
  const tieneCodigoDeApp = rutas.some((r) => {
    const c = clasificarFichero(r);
    return (c === 'javascript' || c === 'typescript') && !/\.config\./.test(r);
  });
  if (tieneHtml && !tieneCodigoDeApp) return 'estatico';
  return 'desconocido';
}

/** Los HTML candidatos a entrada, `index.html` primero si existe. */
function entryPointsDe(rutas: readonly string[]): string[] {
  const htmls = rutas.filter((r) => extensionDe(r) === 'html');
  return [...htmls].sort((a, b) => {
    const aEsIndex = a.split('/').pop() === 'index.html';
    const bEsIndex = b.split('/').pop() === 'index.html';
    if (aEsIndex !== bEsIndex) return aEsIndex ? -1 : 1;
    // A menor profundidad, antes: la entrada casi siempre está en la raíz.
    return a.split('/').length - b.split('/').length;
  });
}

/**
 * Lo que hace que este ZIP no se pueda servir tal cual en el modo estático de
 * esta primera versión. Explícito, no una aproximación silenciosa (punto 14).
 */
function incompatibilidadesDe(
  ficheros: readonly FicheroImportado[],
  framework: ImportedThemeManifest['framework'],
  dependencias: readonly string[],
): string[] {
  const motivos: string[] = [];
  if (framework === 'next' || framework === 'vite') {
    motivos.push(
      `El ZIP es un proyecto ${framework === 'next' ? 'Next.js' : 'Vite'} — necesita un paso de ` +
      'compilación (bundler) que esta versión del importador todavía no ejecuta. Exporta el ' +
      'diseño como HTML/CSS estático desde Claude Design, o pide el modo "compilar en servidor" ' +
      '(fuera de esta primera versión).',
    );
  }
  const tieneTsxOJsx = ficheros.some((f) => /\.(tsx|jsx)$/.test(f.ruta));
  if (tieneTsxOJsx) {
    motivos.push(
      'El ZIP trae componentes React (.tsx/.jsx) sin compilar. El iframe sirve HTML/CSS/JS tal ' +
      'cual — un .tsx no es HTML válido y el navegador no lo entiende sin compilarlo antes.',
    );
  }
  if (!ficheros.some((f) => f.clase === 'html')) {
    motivos.push('El ZIP no trae ningún fichero .html: no hay una página que servir en el iframe.');
  }
  if (dependencias.length > 0) {
    motivos.push(
      `Declara ${dependencias.length} dependencia${dependencias.length === 1 ? '' : 's'} de ` +
      `npm (${dependencias.slice(0, 5).join(', ')}${dependencias.length > 5 ? '…' : ''}) que esta ` +
      'versión no instala ni resuelve.',
    );
  }
  return motivos;
}

/** Construye el manifest a partir de la lista de ficheros del ZIP ya leído. */
export function construirManifest(
  ficheros: readonly FicheroImportado[],
  dependencias: readonly string[] = [],
): ImportedThemeManifest {
  const rutas = ficheros.map((f) => f.ruta);
  const framework = detectarFramework(rutas);
  return {
    framework,
    ficheros: [...ficheros],
    entryPoints: entryPointsDe(rutas),
    stylesheets: ficheros.filter((f) => f.clase === 'css').map((f) => f.ruta),
    assets: ficheros.filter((f) => f.clase === 'imagen' || f.clase === 'video').map((f) => f.ruta),
    fonts: ficheros.filter((f) => f.clase === 'fuente').map((f) => f.ruta),
    dependencias: [...dependencias],
    incompatibilidades: incompatibilidadesDe(ficheros, framework, dependencias),
  };
}
