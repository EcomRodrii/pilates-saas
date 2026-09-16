// ─────────────────────────────────────────────────────────────────────────────
// La marca del estudio tal y como la consumen los emails. Vive aparte de
// plantillas-server.ts (que importa el cliente service-role y por tanto no se
// puede cargar desde `node --test`) para que la parte que se equivocó sea la
// parte que tiene test.
//
// El bug que justifica este módulo: `resolverMarcaEstudio` devolvía `nombre`,
// y las plantillas esperan la prop `estudioNombre`. Cada `{ ...marca }` dejaba
// esa prop sin poner, así que saltaba el default `estudioNombre = 'Tentare'` y
// el ENCABEZADO del correo salía "TENTARE" en mayúsculas — mientras el
// remitente salía bien, porque el From sí usa `.nombre`. La vista previa del
// panel pasaba `estudioNombre` a mano y tampoco lo destapaba.
// ─────────────────────────────────────────────────────────────────────────────

import { canalesDelEstudio, type CanalResuelto, type RedSocialId } from '../canales-estudio.ts';

export type MarcaEstudio = {
  // Para el remitente: `remitentePorMarca(marca.nombre)`.
  nombre?: string | null;
  // Para las plantillas: `<EmailLayout studioNombre={estudioNombre}>`. Mismo
  // dato que `nombre`, con el nombre de la prop. Sin `| null`: las plantillas
  // la declaran `estudioNombre?: string` con default, y un `null` explícito
  // mataría el default en vez de ceder a él.
  estudioNombre?: string;
  colorPrimario?: string | null;
  // El segundo color de su marca, el del tema publicado. En el correo pinta el
  // BOTÓN, igual que el terracota de la referencia sobre el verde salvia.
  // Ausente = el botón va del color principal.
  colorSecundario?: string | null;
  logoUrl?: string | null;
  // La portada del estudio (`studios.imagen_bienvenida_url`), la misma que ve
  // la alumna al abrir su app. Ausente = la de por defecto del producto.
  portadaUrl?: string | null;
  // El lema del estudio, bajo el logo del correo. Ausente = no se pinta.
  lema?: string | null;
  // Dirección postal ya compuesta para el pie. Es requisito de un correo
  // comercial (LSSI) y además dice de qué estudio físico viene esto.
  direccionPostal?: string | null;
  slug?: string | null;
  // A dónde va la respuesta de la clienta. NO es el remitente: la dirección
  // que firma sigue siendo la verificada de la plataforma (ver
  // remitentePorMarca), porque una dirección del estudio sin verificar en
  // Resend rebota. Reply-To no necesita verificación, así que es la pieza que
  // sí se puede dar al estudio.
  //
  // Mientras esto no existió, una clienta que contestaba a "Reserva
  // confirmada" —un correo cuyo remitente dice el nombre de SU estudio— le
  // escribía en realidad al buzón compartido de Tentare, y su estudio no se
  // enteraba nunca. Ninguno de los correos a clientas ponía Reply-To.
  replyTo?: string;
  // Los CANALES del estudio (su web y sus redes), ya resueltos a enlaces
  // seguros: `<EmailLayout canales={...}>` los pinta en el pie. Vienen de dos
  // sitios distintos —`studios.sitio_web` y el tema publicado— y `marcaDesdeFila`
  // es quien los junta, para que ninguna plantilla tenga que saberlo.
  // Ausente/vacío = el pie de siempre, sin una línea de más.
  canales?: CanalResuelto[];
};

// Fila de `studios` (+ las redes del tema publicado, que viven en otra tabla)
// → marca. Pura a propósito.
export function marcaDesdeFila(
  fila: {
    nombre?: unknown; color_primario?: unknown; logo_url?: unknown; slug?: unknown;
    email?: unknown; sitio_web?: unknown;
    imagen_bienvenida_url?: unknown; lema?: unknown;
    direccion?: unknown; ciudad?: unknown; codigo_postal?: unknown;
  },
  redesSociales?: Partial<Record<RedSocialId, string>> | null,
  colorSecundario?: string | null,
): MarcaEstudio {
  const nombre = (fila.nombre as string | null) ?? null;
  // Igual que `estudioNombre`: se omite si no hay valor, para no pisar con
  // `undefined` lo que traiga el caller en un spread.
  const email = ((fila.email as string | null) ?? '').trim();
  const canales = canalesDelEstudio({
    sitioWeb: (fila.sitio_web as string | null) ?? null,
    redesSociales,
  });
  return {
    nombre,
    ...(email ? { replyTo: email } : {}),
    // Solo si hay nombre de verdad: una clave presente con valor `undefined`
    // PISA igualmente el valor bueno en `{ ...datos, ...marca }`, y el correo
    // volvería al default 'Tentare' por la puerta de atrás.
    ...(nombre ? { estudioNombre: nombre } : {}),
    colorPrimario: (fila.color_primario as string | null) ?? undefined,
    colorSecundario: colorSecundario ?? null,
    logoUrl: (fila.logo_url as string | null) ?? null,
    portadaUrl: (fila.imagen_bienvenida_url as string | null) ?? null,
    lema: (fila.lema as string | null) ?? null,
    direccionPostal: direccionPostal(fila),
    slug: (fila.slug as string | null) ?? null,
    // Solo si hay alguno: una clave presente con array vacío obligaría a cada
    // consumidor a distinguir «sin canales» de «no me los han pasado».
    ...(canales.length ? { canales } : {}),
  };
}

/**
 * «Calle Larios 12, 29015 Málaga» a partir de las tres columnas sueltas.
 *
 * Se compone aquí y no en la plantilla porque las tres pueden faltar por
 * separado: sin esto, un estudio con ciudad pero sin calle acababa con una coma
 * suelta en el pie de todos sus correos. Sin ninguna de las tres devuelve
 * `null` y el pie sencillamente no la dice.
 */
function direccionPostal(fila: { direccion?: unknown; ciudad?: unknown; codigo_postal?: unknown }): string | null {
  const calle = ((fila.direccion as string | null) ?? '').trim();
  const cp = ((fila.codigo_postal as string | null) ?? '').trim();
  const ciudad = ((fila.ciudad as string | null) ?? '').trim();
  const localidad = [cp, ciudad].filter(Boolean).join(' ');
  return [calle, localidad].filter(Boolean).join(', ') || null;
}
