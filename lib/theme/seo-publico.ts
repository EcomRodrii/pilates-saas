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
  imagen: string | null;
  /** Las tarjetas grandes solo se piden cuando hay imagen que enseñar. */
  tarjeta: 'summary' | 'summary_large_image';
}

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
  // Una URL vacía no es una imagen. `?? null` la normaliza para que el
  // llamador solo tenga que preguntar por `null`.
  const imagen = propio(tema?.seoImagenUrl ?? undefined) || null;
  return {
    titulo,
    descripcion,
    imagen,
    tarjeta: imagen ? 'summary_large_image' : 'summary',
  };
}
