// Validación del enlace de imagen que la propietaria pega a mano.
//
// Sin alias `@/` ni React: es lógica pura y se prueba con `node --test`.
//
// El campo existe porque no toda foto vive en el ordenador desde el que se
// entra al panel: muchas están ya en la web del estudio, en un Drive público o
// en la galería que le montó su diseñadora. Obligarla a descargar y volver a
// subir para eso es trabajo inventado.

export type UrlImagen = { url: string } | { error: string };

/**
 * Normaliza y valida un enlace pegado.
 *
 * ⚠️ **Solo `https://`, y no por purismo.** El portal se sirve por HTTPS, así
 * que una imagen `http://` la bloquea el navegador como contenido mixto: no da
 * error, no avisa, simplemente no se pinta. Aceptarla aquí sería dejarle
 * guardar algo que nunca va a verse, y encima con la sensación de que sí.
 *
 * Lo mismo por el otro lado: `javascript:` y `file:` no llegan ni a intentarlo.
 * `new URL()` los parsea sin problema —no basta con que la cadena sea válida—,
 * así que el filtro va sobre el protocolo, no sobre el texto.
 */
export function normalizarUrlImagen(texto: string | null | undefined): UrlImagen {
  const limpio = (texto ?? '').trim();
  if (!limpio) return { error: 'Pega el enlace de la imagen.' };

  let url: URL;
  try {
    url = new URL(limpio);
  } catch {
    // El caso real es pegar «www.estudio.com/foto.jpg» sin el esquema.
    return { error: 'No parece un enlace completo. Tiene que empezar por https://' };
  }

  if (url.protocol !== 'https:') {
    return { error: 'El enlace tiene que empezar por https:// — si no, el navegador no llega a pintar la imagen.' };
  }
  return { url: url.toString() };
}

/** `true` si el enlace se puede guardar tal cual. Para habilitar el botón. */
export function esUrlImagenValida(texto: string | null | undefined): boolean {
  return 'url' in normalizarUrlImagen(texto);
}
