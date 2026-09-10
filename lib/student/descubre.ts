// «Descubre» — las tarjetas con foto que el estudio publica en la home de la
// alumna.
//
// ⚠️ NO es una entidad nueva. La tabla (`contenido_portal_banners`), su tipo
// (`BannerPortal`), su CRUD y su editor en el panel («Apariencia → Contenido
// del portal») existen desde antes: se quedaron HUÉRFANOS al borrar el portal
// viejo (#1591), que era quien los pintaba. En producción hay cero filas y
// ningún consumidor. Esto es la pantalla que faltaba, no un esquema nuevo.
//
// El servidor ya filtra en SQL por `activo` y por ubicación `home`, y ordena
// por `orden` (ver `fetchPublicStudioData`). Aquí queda lo que allí no se puede
// hacer: la ventana de fechas —«hoy» depende del momento de carga, no de cuándo
// se llenó ese caché de 60 s— y el saneado de lo que tecleó el estudio.
//
// Puro y sin React: se prueba con `node --test`.

import { resolverHrefBloque } from '../theme/enlaces.ts';
import { esUrlImagenValida } from '../imagen-url.ts';

/** Lo que necesita una tarjeta, ya saneado. */
export interface TarjetaDescubre {
  id: string;
  imagenUrl: string;
  titulo: string | null;
  texto: string | null;
  /**
   * A dónde lleva, ya validado. `null` = no lleva a ninguna parte y la tarjeta
   * se pinta SIN chevron: una flecha que no hace nada es una promesa rota.
   */
  enlace: { interno: boolean; valor: string } | null;
}

/** La forma del banner tal y como llega en el payload público. */
export interface BannerMin {
  id: string;
  imagenUrl: string;
  titulo?: string | null;
  texto?: string | null;
  linkTipo?: string | null;
  linkValor?: string | null;
  orden?: number | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
}

/**
 * Las tarjetas que tocan HOY, en orden.
 *
 * `hoy` en formato 'YYYY-MM-DD' y en la zona del estudio — lo pasa quien llama,
 * igual que el resto de proyecciones de la app.
 */
export function tarjetasDescubre(banners: BannerMin[] | undefined | null, hoy: string): TarjetaDescubre[] {
  return (banners ?? [])
    // Ventana de fechas. Las dos son inclusivas: un banner con
    // `fecha_fin = hoy` se ve hoy — el estudio escribió el último día en que lo
    // quiere, no el primero en que ya no.
    .filter((b) => (!b.fechaInicio || b.fechaInicio <= hoy) && (!b.fechaFin || b.fechaFin >= hoy))
    // ⚠️ La imagen se valida aquí, no solo en el editor: el dato lo tecleó o lo
    // pegó el estudio y esto acaba en un `src`. Y sin imagen no hay tarjeta que
    // pintar — en este bloque la foto ES la tarjeta, no un adorno.
    .filter((b) => esUrlImagenValida(b.imagenUrl))
    .map((b) => {
      // ⚠️ El enlace también se sanea en el RENDER y no solo al guardar. Lo dice
      // el propio editor («solo se sanea al renderizar el link en el portal») y
      // quien lo hacía era el portal viejo, que ya no existe: `javascript:` y
      // `data:` se quedaron sin nadie que los parase. Se reutiliza
      // `resolverHrefBloque`, que es el que ya decide esto para los bloques del
      // tema — no una segunda regla que acabaría divergiendo.
      const r = b.linkValor ? resolverHrefBloque(b.linkValor) : null;
      return {
        id: b.id,
        imagenUrl: b.imagenUrl,
        titulo: b.titulo ?? null,
        texto: b.texto ?? null,
        enlace: r ? { interno: r.interno, valor: r.valor } : null,
      };
    })
    // El SQL ya ordena por `orden`, pero esta función también se llama con
    // datos de caché y de test: que el orden lo garantice ella misma cuesta una
    // línea. Empate por id para que sea estable.
    .sort((a, b) => {
      const oa = (banners ?? []).find((x) => x.id === a.id)?.orden ?? 0;
      const ob = (banners ?? []).find((x) => x.id === b.id)?.orden ?? 0;
      return oa - ob || a.id.localeCompare(b.id);
    });
}
