// De la marca que resuelve el servidor (`MarcaEstudio`) a la que pinta el
// correo (`MarcaCorreo`). Pura y con test propio: es donde se decide qué foto
// de portada acaba viajando a la bandeja de una alumna.

import { LEGAL } from '../../legal-info.ts';
import { IMAGENES_POR_DEFECTO } from '../../imagenes-por-defecto.ts';
import type { MarcaEstudio } from '../marca.ts';
import type { MarcaCorreo } from './plantilla.ts';

/**
 * ⚠️ Con `www`, y por el mismo motivo que lo documenta `LEGAL.url`: el ápice
 * devuelve un 308 hacia él y hay proxys de imágenes de correo (el de Gmail,
 * entre otros) que no siguen la redirección. Una portada servida desde el
 * ápice llegaría rota. `NEXT_PUBLIC_APP_URL` NO sirve aquí: en previews apunta
 * a un despliegue efímero que un correo real sobrevive.
 */
export const BASE_IMAGENES_CORREO = LEGAL.url;

/**
 * La portada del correo: la que subió el estudio, o la del producto.
 *
 * Su propia foto puede ser cualquier cosa que admita el subidor —incluido
 * WEBP, que Outlook de Windows no pinta—; se usa igualmente, porque una foto
 * suya que falla en un cliente es mejor que no enseñar la suya en ninguno. La
 * pantalla de Configuración lo dice para que pueda elegir con conocimiento.
 */
export function portadaDeCorreo(propia?: string | null, base = BASE_IMAGENES_CORREO): string {
  const suya = (propia ?? '').trim();
  if (suya) return suya;
  return `${base}${IMAGENES_POR_DEFECTO.correo[0]}`;
}

/**
 * El logo tal y como viaja en un correo: si vive en nuestro Storage, la copia
 * que sirve el transformador de imágenes de Supabase, a 400×144 como mucho.
 *
 * Medido en producción: dos de los cinco logos eran fotos de móvil de 0,6 y
 * 1,1 MB, y el correo las mandaba enteras para pintarlas a 30 px. Por esa URL
 * la de 1,1 MB llega en 4,7 KB. `format=origin` no es opcional: sin él Supabase
 * sirve WEBP a quien lo acepte, y Outlook de Windows no lo pinta.
 *
 * La caja es el doble de la que ocupa en pantalla (200×72, ver `cabecera`):
 * con `resize=contain` el logo cabe entero sea cual sea su forma, y la plantilla
 * lo reduce a la mitad para que se vea nítido en una pantalla retina.
 *
 * Una URL de fuera se deja tal cual: no hay nada que transformar.
 */
export function logoDeCorreo(url?: string | null): string | null {
  const limpio = (url ?? '').trim();
  if (!limpio) return null;
  const m = limpio.match(/^(https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1)\/object\/public\/([^?#]+)(\?[^#]*)?$/);
  if (!m) return limpio;
  const consulta = new URLSearchParams(m[3] ? m[3].slice(1) : '');
  consulta.set('width', '400');
  consulta.set('height', '144');
  consulta.set('resize', 'contain');
  consulta.set('format', 'origin');
  return `${m[1]}/render/image/public/${m[2]}?${consulta.toString()}`;
}

export function marcaCorreoDesde(marca: MarcaEstudio, estudioNombreFallback: string): MarcaCorreo {
  return {
    estudioNombre: marca.estudioNombre || marca.nombre || estudioNombreFallback,
    logoUrl: marca.logoUrl || null,
    colorPrimario: marca.colorPrimario ?? null,
    colorSecundario: marca.colorSecundario ?? null,
    portadaUrl: portadaDeCorreo(marca.portadaUrl),
    lema: marca.lema ?? null,
    direccionPostal: marca.direccionPostal ?? null,
    canales: marca.canales ?? [],
  };
}

/**
 * La app de la alumna en SU estudio, que es adonde lleva el botón de los
 * correos de clase. `null` sin slug: un botón que no lleva a ninguna parte es
 * peor que no tener botón, y el sistema simplemente no lo pinta.
 *
 * Aquí sí manda `NEXT_PUBLIC_APP_URL` y no `LEGAL.url` —al revés que las
 * imágenes—: un enlace tiene que apuntar al despliegue desde el que se manda
 * el correo, y en una preview eso es la preview.
 */
export function urlAppSocia(slug?: string | null): string | null {
  const limpio = (slug ?? '').trim();
  if (!limpio) return null;
  return `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'}/portal/${limpio}`;
}
