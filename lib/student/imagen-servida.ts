// Servir una foto al tamaño en que se VE, no al tamaño en que se subió.
//
// El problema, medido: `lib/imagen-cliente.ts` redimensiona al SUBIR a 1280 px
// (fotos de clase) o 1600 px (banners), y a partir de ahí ese es el único
// tamaño que existe. La app de la alumna las pinta con `<img>` crudo —no hay
// `images:` en `next.config.ts` ni optimizador por medio— así que un móvil de
// 393 px de ancho descarga 1600 px y los descodifica enteros. Y la
// descodificación de una imagen sin `decoding="async"` ocurre en el HILO
// PRINCIPAL, que es el mismo que tiene que dibujar el scroll: de ahí que la app
// se sienta pastosa justo al abrir una pantalla con foto.
//
// Supabase Storage sabe redimensionar al vuelo. Verificado contra producción
// sobre un objeto real: `?width=420&quality=70` devolvió 35 KB donde el
// original pesaba 84 KB, con la misma pinta a ese tamaño.

/** La ruta de un objeto público de Storage, y la de su versión transformada. */
const OBJETO = '/storage/v1/object/public/';
const RENDER = '/storage/v1/render/image/public/';

/** Tope de ancho pedido. Por encima del mayor original (1600) solo se
 *  conseguiría que Storage AMPLÍE la imagen y pese más que el original. */
const ANCHO_MAX = 1600;

/** Calidad. 70 es donde deja de notarse la diferencia en una foto de estudio. */
const CALIDAD = 70;

/**
 * ¿Esta URL la sirve nuestro Storage y por tanto se puede redimensionar?
 *
 * Las que NO: las fotos por defecto (`/por-defecto/…`, estáticos de Next, ya
 * optimizados) y cualquier URL que haya pegado un estudio a mano. Esas se
 * devuelven intactas — nunca se rompe una imagen por intentar mejorarla.
 */
export function esTransformable(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.includes(OBJETO);
}

/**
 * La misma imagen, pedida a `ancho` píxeles.
 *
 * ⚠️ **Conserva la query que ya trajera.** No es cosmético: las fotos de
 * producto y de clase llevan un `?v=<timestamp>` que es su rompe-cachés
 * (`subirFotoClase` sobrescribe siempre el mismo path). Tirarlo dejaría a la
 * propietaria cambiando una foto que nadie vuelve a ver.
 */
export function urlServida(url: string, ancho: number): string {
  if (!esTransformable(url)) return url;
  const w = Math.min(Math.max(Math.round(ancho), 16), ANCHO_MAX);
  const [base, query = ''] = url.replace(OBJETO, RENDER).split('?');
  const p = new URLSearchParams(query);
  p.set('width', String(w));
  p.set('quality', String(CALIDAD));
  return `${base}?${p.toString()}`;
}

/**
 * El `srcset` para un hueco de `ancho` píxeles CSS.
 *
 * Se dan densidades (`1x/2x/3x`) y no anchos (`w`) a propósito: el hueco lo fija
 * el diseño y no cambia con el viewport (las tarjetas tienen ancho fijo y el
 * héroe vive dentro de un `shell` acotado), así que lo único que varía entre
 * dispositivos es la densidad de pantalla. Con densidades el navegador elige
 * UNA y no hace falta un `sizes` que habría que mantener a mano en cada sitio
 * —y que, mal puesto, hace descargar la más grande siempre.
 *
 * `null` si la imagen no es transformable: repetir la misma URL tres veces no
 * aporta nada y engorda el HTML.
 */
export function srcSetServido(url: string, ancho: number): string | null {
  if (!esTransformable(url)) return null;
  const densidades = [1, 2, 3];
  const vistos = new Set<string>();
  const partes: string[] = [];
  for (const d of densidades) {
    const u = urlServida(url, ancho * d);
    // Pasado el tope, 2x y 3x devuelven la MISMA url que 1x. Repetirla haría
    // que el navegador creyera que tiene tres opciones cuando tiene una.
    if (vistos.has(u)) continue;
    vistos.add(u);
    partes.push(`${u} ${d}x`);
  }
  return partes.length > 1 ? partes.join(', ') : null;
}
