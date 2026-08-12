// Qué se ve al compartir el enlace público del estudio y en Google.
//
// Vive aparte del layout y sin React a propósito: es la única lógica de esta
// pantalla que tiene reglas de verdad (herencia, recorte, qué tarjeta social
// pedir) y merece probarse sin arrancar Next.
//
// El texto automático es EXACTAMENTE el que había antes de existir estos
// campos: mientras el estudio no escriba nada, no cambia ni un carácter de lo
// que hoy indexa Google.

/** Lo mínimo del estudio que hace falta para redactar el texto automático. */
export interface EstudioParaSeo {
  nombre: string;
  ciudad: string;
}

/** Lo que el tema publicado puede sobrescribir. */
export interface SeoDelTema {
  seoTitulo: string;
  seoDescripcion: string;
  seoImagenUrl: string | null;
}

export interface MetadatosPublicos {
  titulo: string;
  descripcion: string;
  imagen: string;
  /** Las tarjetas grandes solo se piden cuando hay imagen que enseñar. */
  tarjeta: 'summary' | 'summary_large_image';
}

/**
 * La foto que se ve al pegar el enlace del estudio en un grupo de WhatsApp
 * cuando nadie ha subido una.
 *
 * Se declara aquí y no se importa de `lib/imagenes-por-defecto.ts` a propósito:
 * este módulo vive sin React NI alias `@/` para poder probarse con
 * `node --test` sin arrancar Next, igual que el resto de su cabecera explica.
 * La ruta se comprueba contra la fuente real en el test.
 *
 * Es relativa: `metadataBase` (app/layout.tsx) la convierte en absoluta, que es
 * lo que exige Open Graph.
 */
export const IMAGEN_COMPARTIR_POR_DEFECTO = '/por-defecto/estudio-hero.webp';

/** El título que se genera solo cuando el estudio no ha escrito el suyo. */
export function tituloAutomatico(estudio: EstudioParaSeo): string {
  const enCiudad = estudio.ciudad ? ` en ${estudio.ciudad}` : '';
  return `${estudio.nombre} — Reserva tu clase de Pilates${enCiudad}`;
}

/** La descripción que se genera sola cuando el estudio no ha escrito la suya. */
export function descripcionAutomatica(estudio: EstudioParaSeo): string {
  const entreParentesis = estudio.ciudad ? ` (${estudio.ciudad})` : '';
  return `Reserva online tu clase de Pilates reformer en ${estudio.nombre}${entreParentesis}. Elige día, hora y tu sitio en segundos.`;
}

/**
 * Resuelve los metadatos finales.
 *
 * ⚠️ **Se compara con `.trim()`, no con `!== ''`.** Un campo con solo espacios
 * es lo que queda cuando alguien borra lo que había escrito y el cursor deja
 * un blanco: tratarlo como valor legítimo publicaría un `<title>` vacío en
 * Google, que es mucho peor que el automático que sustituye. Vacío o en
 * blanco significan lo mismo — «pon el mío».
 */
export function metadatosPublicos(
  estudio: EstudioParaSeo,
  tema: Partial<SeoDelTema> | null | undefined,
): MetadatosPublicos {
  const propio = (v: string | undefined) => (v ?? '').trim();
  const titulo = propio(tema?.seoTitulo) || tituloAutomatico(estudio);
  const descripcion = propio(tema?.seoDescripcion) || descripcionAutomatica(estudio);
  // Una URL vacía no es una imagen: sin la suya va la de por defecto. Antes
  // aquí salía `null` y la página no emitía NINGÚN `og:image` — el enlace del
  // estudio se pegaba en WhatsApp sin miniatura, que es lo que le pasaba a
  // cualquiera que no hubiera entrado a los ajustes de compartir.
  const imagen = propio(tema?.seoImagenUrl ?? undefined) || IMAGEN_COMPARTIR_POR_DEFECTO;
  return {
    titulo,
    descripcion,
    imagen,
    tarjeta: 'summary_large_image',
  };
}
