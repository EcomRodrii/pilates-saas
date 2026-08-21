// ─────────────────────────────────────────────────────────────────────────────
// Canales del estudio: dónde puede encontrar una clienta al estudio FUERA de
// Tentare. Catálogo único (id, etiqueta, placeholder) + resolución del enlace.
//
// ⚠️ Los canales NO viven todos en el mismo sitio, y es a propósito:
//
//   · Las cuatro REDES SOCIALES (Instagram, Facebook, TikTok, WhatsApp) viven
//     en el TEMA (`studio_theme.config_*` → `redesSociales`, lib/theme-schema.ts).
//     Son parte de la apariencia del portal white-label: qué iconos salen en el
//     pie de la página pública. Es donde ya estaban las tres primeras desde la
//     Fase 3 del Theme Builder, y TikTok entra ahí exactamente igual — no una
//     estructura paralela.
//
//   · La WEB vive en `studios.sitio_web` (columna propia), junto a `email`,
//     `telefono` y `direccion`. Una web no es una red social: es el dato de
//     contacto del negocio, y lo necesitan consumidores que NO cargan el tema
//     (el pie de los correos, el SEO del estudio, la ficha pública). Meterla en
//     el tema la habría atado a `studio_theme`: cada uno de esos consumidores
//     tendría que pedir una tabla más para pintar un enlace de contacto.
//
// Este módulo es el ÚNICO sitio donde se reúnen las dos mitades, para que nadie
// tenga que saber dónde vive cada una. Puro y sin dependencias pesadas (no
// importa zod ni el esquema del tema) para que lo pueda importar tanto el
// editor de temas como el render del portal como los correos del servidor.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Redes sociales del estudio. Fuente de verdad del catálogo: `theme-schema.ts`
 * lo REEXPORTA en vez de tener su propia lista, para que añadir una red sea un
 * solo sitio. El orden es el de pintado en el pie.
 */
export const REDES_SOCIALES_IDS = ['instagram', 'facebook', 'tiktok', 'whatsapp'] as const;
export type RedSocialId = (typeof REDES_SOCIALES_IDS)[number];

/** Todos los canales, con la web primero: es la casa del estudio. */
export const CANALES_IDS = ['web', ...REDES_SOCIALES_IDS] as const;
export type CanalId = (typeof CANALES_IDS)[number];

export const CANALES: Record<CanalId, { label: string; placeholder: string }> = {
  web: { label: 'Web', placeholder: 'https://tuestudio.com' },
  instagram: { label: 'Instagram', placeholder: 'https://instagram.com/tu-estudio' },
  facebook: { label: 'Facebook', placeholder: 'https://facebook.com/tu-estudio' },
  tiktok: { label: 'TikTok', placeholder: 'https://tiktok.com/@tu-estudio' },
  whatsapp: { label: 'WhatsApp', placeholder: 'https://wa.me/34600000000' },
};

/** Un usuario/handle de red social. Deliberadamente estrecho: lo que salga de
 *  aquí se concatena dentro de una URL, así que nada de `/`, `:`, `?` ni `#`. */
const HANDLE = /^[A-Za-z0-9._-]{1,64}$/;
/** Dominio a secas («tuestudio.com», «tuestudio.com/reservas»). */
const DOMINIO = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s]*)?$/i;

function urlHttp(v: string): string | null {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Enlace final de un canal, o `null` si lo escrito no da para uno.
 *
 * Acepta a propósito MÁS que una URL completa. El campo lleva desde la Fase 3
 * guardando «tal cual lo escribe el estudio», y lo natural al rellenar una
 * casilla que dice «Instagram» es teclear `@miestudio` — que hasta ahora
 * `resolverHrefBloque()` resolvía a `null`: el estudio lo guardaba, veía
 * «guardado», y en el pie de su página pública no aparecía NADA, sin error y
 * sin aviso. Aquí se normaliza; lo que no encaje en ningún patrón conocido
 * sigue devolviendo `null` en vez de fabricar una URL inventada.
 *
 * La validación de protocolo se mantiene igual de estricta que
 * `resolverHrefBloque()` (solo http/https, nunca `javascript:`/`data:`): el
 * dato viene de jsonb tecleado por el estudio y se pinta como `href`.
 */
export function hrefCanal(id: CanalId, valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim();
  if (!v) return null;

  const absoluta = urlHttp(v);
  if (absoluta) return absoluta;

  if (id === 'whatsapp') {
    // «600 00 00 00», «+34 600 000 000» → wa.me quiere solo dígitos con prefijo.
    const digitos = v.replace(/[\s().-]/g, '').replace(/^\+/, '');
    return /^\d{6,15}$/.test(digitos) ? `https://wa.me/${digitos}` : null;
  }

  if (id === 'web') {
    return DOMINIO.test(v) ? `https://${v}` : null;
  }

  const handle = v.replace(/^@/, '');
  if (!HANDLE.test(handle)) return null;
  if (id === 'instagram') return `https://instagram.com/${handle}`;
  if (id === 'facebook') return `https://facebook.com/${handle}`;
  return `https://www.tiktok.com/@${handle}`;
}

export type CanalResuelto = { id: CanalId; label: string; href: string };

/**
 * Los canales que el estudio ha rellenado DE VERDAD (los que resuelven a un
 * enlace), en el orden del catálogo. Reúne las dos mitades del modelo: la
 * columna `studios.sitio_web` y el `redesSociales` del tema publicado.
 *
 * Quien lo llame no necesita saber de dónde sale cada uno — y si mañana un
 * canal cambia de sitio, cambia aquí y no en los cuatro sitios que los pintan.
 */
export function canalesDelEstudio(fuente: {
  sitioWeb?: string | null;
  redesSociales?: Partial<Record<RedSocialId, string>> | null;
}): CanalResuelto[] {
  return CANALES_IDS.flatMap((id) => {
    const valor = id === 'web' ? fuente.sitioWeb : fuente.redesSociales?.[id];
    const href = hrefCanal(id, valor);
    return href ? [{ id, label: CANALES[id].label, href }] : [];
  });
}

/** `redesSociales` con las cuatro claves siempre presentes — lo que necesita un
 *  formulario controlado (y lo que rellena los huecos de un tema guardado antes
 *  de que existiera TikTok). */
export function redesSocialesCompletas(
  parcial: Partial<Record<RedSocialId, string>> | null | undefined,
): Record<RedSocialId, string> {
  return Object.fromEntries(
    REDES_SOCIALES_IDS.map((id) => [id, typeof parcial?.[id] === 'string' ? parcial[id] : '']),
  ) as Record<RedSocialId, string>;
}
