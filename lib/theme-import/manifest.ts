// La forma del manifest de un tema ZIP ya importado — qué contiene, sin
// transformarlo. Es lo que vive en `theme_imports.manifest` y lo que leen el
// editor de código y quien sirve el tema (`servir.ts`).
//
// Solo tipos: el importador que lo construía a partir de un ZIP (clasificar
// ficheros, detectar framework, marcar incompatibilidades) se borró el
// 30-sep-2026 por decisión del fundador. El tema ZIP publicado que ya existía
// se sigue sirviendo y editando; no se pueden subir temas nuevos.

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
   * cual, no se instalan ni se resuelven.
   */
  dependencias: string[];
  /**
   * Ninguna: el ZIP encajaba en el modo estático (HTML/CSS/assets). Con algo
   * aquí, la importación quedó en `estado: 'incompatible'` — nunca se
   * aproximó en silencio.
   */
  incompatibilidades: string[];
}
