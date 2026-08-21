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
  logoUrl?: string | null;
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
  },
  redesSociales?: Partial<Record<RedSocialId, string>> | null,
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
    logoUrl: (fila.logo_url as string | null) ?? null,
    slug: (fila.slug as string | null) ?? null,
    // Solo si hay alguno: una clave presente con array vacío obligaría a cada
    // consumidor a distinguir «sin canales» de «no me los han pasado».
    ...(canales.length ? { canales } : {}),
  };
}
