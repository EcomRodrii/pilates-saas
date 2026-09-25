// ─────────────────────────────────────────────────────────────────────────────
// Artículos de /recursos escritos como DATOS, no como TSX.
//
// Las guías antiguas (lib/recursos/guias.ts + una page.tsx por guía) exigen una
// portada generada fuera del repo y ~150 líneas de TSX con estilos en línea.
// Eso no escala: para cubrir las búsquedas reales de propietarias (abrir un
// estudio, costes, permisos, precios, bonos, equipo…) hacen falta decenas de
// páginas, y cada una tiene que salir con las mismas garantías: su JSON-LD, su
// FAQ, su miga de pan, su enlazado y su llamada a la acción, sin depender de que
// alguien se acuerde de copiarlos. Aquí se escribe solo el CONTENIDO; el
// renderizado vive en components/recursos/ArticuloDatos.tsx.
//
// Reglas del contenido (las comprueba lib/recursos/articulos/validar.ts):
//  · Español de España, tuteando a la propietaria. Nada de relleno.
//  · Ningún dato externo sin fuente: precios, normativa, salarios… van con su
//    enlace en `fuentes` y la fecha en que se consultó. Si no se ha podido
//    verificar, no se escribe.
//  · Nada de Tentare que no esté en el registro de afirmaciones (validar.ts
//    tiene la lista de lo prohibido).
//  · Texto con marcado mínimo: **negrita** y [enlace](/ruta) o
//    [enlace](https://…). Nada más.
//
// Sin alias `@/`: lo leen `node --test` y los scripts.
// ─────────────────────────────────────────────────────────────────────────────

import type { CategoriaRecursos } from '../guias.ts';

export type Bloque =
  /** Párrafo. */
  | { t: 'p'; texto: string }
  /** Lista con viñetas (u ordenada). */
  | { t: 'lista'; items: string[]; ordenada?: boolean }
  /** Pasos numerados con título: procesos («cómo abrir…»). */
  | { t: 'pasos'; items: { titulo: string; texto: string }[] }
  /** Tabla. `nota` es obligatoria si hay cifras: de dónde salen. */
  | { t: 'tabla'; cabecera: string[]; filas: string[][]; nota?: string }
  /** Recuadro destacado. */
  | { t: 'nota'; titulo: string; texto: string }
  /** Cifras grandes. `nota` dice de dónde salen o que son de ejemplo. */
  | { t: 'cifras'; titulo: string; cifras: { valor: string; etiqueta: string }[]; nota: string }
  /** Herramienta interactiva (components/recursos). Solo las que existen. */
  | { t: 'herramienta'; id: 'calculadora-rentabilidad' };

export interface Seccion {
  /** Ancla (kebab-case). Sale en el índice. */
  id: string;
  /** El <h2>. */
  titulo: string;
  bloques: Bloque[];
}

export interface Fuente {
  titulo: string;
  url: string;
  /** AAAA-MM-DD en que se consultó. */
  consultada: string;
}

export interface Articulo {
  /** kebab-case: la URL es /recursos/<slug>. */
  slug: string;
  /** El <h1> y el titular de la tarjeta. */
  titulo: string;
  /** El <title>, sin « | Tentare» (se añade solo). 30-62 caracteres, con la consulta principal. */
  tituloSeo: string;
  /** Meta description: 110-160 caracteres, que invite a hacer clic. */
  descripcion: string;
  /** Texto de la tarjeta del listado: 1-2 frases. */
  resumen: string;
  categoria: CategoriaRecursos;
  /** Etiqueta de sección que se enseña en la cabecera (y `articleSection`). */
  seccion: string;
  /** AAAA-MM-DD. */
  publicado: string;
  /** AAAA-MM-DD, solo si se revisó después de publicarlo. */
  actualizado?: string;
  /** La búsqueda principal a la que responde (medición: GSC → página). */
  consultaPrincipal: string;
  /** Otras búsquedas reales que cubre. */
  consultas: string[];
  /**
   * La respuesta directa, arriba del todo («En resumen»): 40-90 palabras que
   * contesten la consulta principal sin rodeos. Es lo que citan los fragmentos
   * destacados y los buscadores con IA.
   */
  respuesta: string;
  /** Entradilla: 1-3 frases que enganchen. */
  entradilla: string;
  secciones: Seccion[];
  faq: { q: string; a: string }[];
  fuentes: Fuente[];
  /** Rutas internas relacionadas (tienen que existir). */
  relacionadas: string[];
  /** Llamada a la acción final, honesta y ligada al tema. */
  cta: { titulo: string; texto: string };
  /**
   * Lo que el revisor tiene que comprobar antes de publicar (dudas, cifras que
   * cambian a menudo…). No se pinta. Vacío = nada pendiente.
   */
  revision: string[];
}
