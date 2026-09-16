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
