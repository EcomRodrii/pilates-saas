// ═══════════════════════════════════════════════════════════════════════════
// Capa de datos del tema por estudio (Fase 1 · backbone)
// ═══════════════════════════════════════════════════════════════════════════
//
// Tabla `studio_theme` (una fila por estudio): `config_draft` (borrador que se
// edita) y `config_published` (lo que ve producción). El runtime lee SIEMPRE
// `published`; el editor y el preview leen `draft`.
//
// Lecturas de runtime: service-role + React `cache()` (mismo patrón que
// `lib/studio-seo.ts`; la tabla es una fila pequeña por request). La caché
// persistente cross-request (unstable_cache/Cache Components) queda como
// optimización DIFERIDA — no se introduce aquí para no añadir un paradigma de
// caché que el resto del repo no usa.
//
// Escrituras (guardarBorrador/publicar): usadas por el route handler del editor
// en la Fase 3, que verifica antes que el llamante es PROPIETARIO del estudio.

import { cache } from 'react';
import { invalidarCatalogoPublico } from '@/lib/cache/catalogo-estudio';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  resolveTheme,
  themeDraftSchema,
  type ThemeConfig,
  type ThemeDraft,
  DEFAULT_THEME,
} from '@/lib/theme-schema';
import { presetAThemeConfig, validarContrasteTheme, type ErrorContraste } from '@/lib/theme-runtime';
import {
  esFaviconDeBorrador,
  fusionarCampos,
  siguienteVersionTheme,
  soloLoEnviado,
  type CamposPublicables,
} from '@/lib/theme-publicar-campos';
import { esFaviconDelEstudio } from '@/lib/theme-favicon';

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * Tema derivado del preset viejo del estudio (`studios.tema_portal`). Se usa
 * como fallback cuando aún no hay fila en `studio_theme`, para no regresionar
 * el color de estudios existentes. Si no se puede leer, cae al default.
 */
async function themeDesdePreset(admin: Admin, studioId: string): Promise<ThemeConfig> {
  const { data } = await admin
    .from('studios')
    .select('tema_portal')
    .eq('id', studioId)
    .maybeSingle();
  return data ? presetAThemeConfig(data.tema_portal) : DEFAULT_THEME;
}

// ── Favicon: solo ficheros de marca de este estudio ─────────────────────────
// La regla vive en lib/theme-favicon.ts. Aquí se aplica en los dos sentidos:
// al ESCRIBIR se rechaza (quien llama responde 400) y al LEER se ignora, para
// que un valor guardado antes de existir la regla no llegue a pintarse en la
// página pública — sin romper nada: sin favicon entra el monograma.

export const MENSAJE_FAVICON_AJENO = 'El favicon tiene que ser una imagen subida desde el panel.';

/** `null`/ausente vale siempre (sin favicon); una URL, solo si es de este estudio. */
export function faviconPermitido(url: string | null | undefined, studioId: string): boolean {
  return url == null || esFaviconDelEstudio(url, studioId, process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function sanearFavicon(theme: ThemeConfig, studioId: string): ThemeConfig {
  return faviconPermitido(theme.faviconUrl, studioId) ? theme : { ...theme, faviconUrl: null };
}

/** Tema PUBLICADO de un estudio (runtime). Fallback: preset viejo → default. */
export const getThemePublicado = cache(async (studioId: string): Promise<ThemeConfig> => {
  const admin = getSupabaseAdmin();
  if (!admin || !studioId) return DEFAULT_THEME;
  const { data } = await admin
    .from('studio_theme')
    .select('config_published')
    .eq('studio_id', studioId)
    .maybeSingle();
  if (data?.config_published) return sanearFavicon(resolveTheme(data.config_published), studioId);
  return themeDesdePreset(admin, studioId);
});

/** Tema BORRADOR de un estudio (editor/preview). Fallback: publicado → preset → default. */
export const getThemeBorrador = cache(async (studioId: string): Promise<ThemeConfig> => {
  const admin = getSupabaseAdmin();
  if (!admin || !studioId) return DEFAULT_THEME;
  const { data } = await admin
    .from('studio_theme')
    .select('config_draft, config_published')
    .eq('studio_id', studioId)
    .maybeSingle();
  const guardado = data?.config_draft ?? data?.config_published;
  if (guardado) return sanearFavicon(resolveTheme(guardado), studioId);
  return themeDesdePreset(admin, studioId);
});

// ── Escribir sin pisar lo que otra pestaña acaba de guardar ─────────────────
//
// Toda escritura del tema es leer → fusionar → escribir, y entre medias puede
// haber un `await` largo (copiar el favicon en Storage). Con un `upsert` a
// secas, lo que otra pestaña guardara en ese hueco —Configuración › Marca y el
// editor del portal escriben la MISMA fila— se perdía sin aviso. Ahora la
// escritura solo entra si `actualizado_en` sigue siendo el que se leyó; si no,
// se relee y se vuelve a fusionar sobre lo nuevo. Sin migración: la columna ya
// existía y todos los que escriben la fila la actualizan.

const INTENTOS_ESCRITURA = 3;

export const MENSAJE_CONFLICTO_THEME =
  'La marca acaba de cambiar desde otra pestaña. Recarga la página y vuelve a intentarlo.';

/** Otra escritura ganó todos los intentos. Quien llama responde 409. */
export class ConflictoTheme extends Error {
  constructor() {
    super('THEME_CONFLICTO');
    this.name = 'ConflictoTheme';
  }
}

type FilaTheme = { config_draft: unknown; config_published: unknown; actualizado_en: string | null };

async function leerFila(admin: Admin, studioId: string): Promise<FilaTheme | null> {
  const { data, error } = await admin
    .from('studio_theme')
    .select('config_draft, config_published, actualizado_en')
    .eq('studio_id', studioId)
    .maybeSingle();
  // Antes un fallo de lectura se tomaba por «no hay fila» y se escribía encima
  // desde los valores por defecto.
  if (error) throw new Error(`THEME_LEER: ${error.message}`);
  return data;
}

/**
 * Escribe `columnas` solo si la fila sigue como se leyó. `false` = otra
 * escritura llegó antes; quien llama relee y reintenta.
 */
async function escribirSiNoHaCambiado(
  admin: Admin,
  studioId: string,
  leida: FilaTheme | null,
  columnas: { config_draft?: ThemeConfig; config_published?: ThemeConfig; publicado_en?: string },
): Promise<boolean> {
  const actualizado_en = siguienteVersionTheme(leida?.actualizado_en ?? null);
  if (!leida) {
    const { error } = await admin
      .from('studio_theme')
      .insert({ studio_id: studioId, ...columnas, actualizado_en });
    if (!error) return true;
    if (error.code === '23505') return false; // la creó otra escritura a la vez
    throw new Error(`THEME_ESCRIBIR: ${error.message}`);
  }
  const update = admin
    .from('studio_theme')
    .update({ ...columnas, actualizado_en })
    .eq('studio_id', studioId);
  const condicionado = leida.actualizado_en === null
    ? update.is('actualizado_en', null)
    : update.eq('actualizado_en', leida.actualizado_en);
  const { data, error } = await condicionado.select('studio_id');
  if (error) throw new Error(`THEME_ESCRIBIR: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Guarda (fusiona) un parche parcial en el BORRADOR. Valida el parche con zod;
 * lanza si es inválido. No toca lo publicado. Devuelve el borrador resuelto.
 */
export async function guardarBorradorTheme(
  studioId: string,
  parche: ThemeDraft,
): Promise<ThemeConfig> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('THEME_SIN_ADMIN');
  // Solo las claves del parche: zod rellenaría el resto con sus valores por
  // defecto y el borrador perdería lo que no venía (ver `soloLoEnviado`).
  const validado = soloLoEnviado(parche, themeDraftSchema.parse(parche));
  if (!faviconPermitido(validado.faviconUrl, studioId)) throw new Error('THEME_FAVICON_AJENO');

  for (let intento = 0; intento < INTENTOS_ESCRITURA; intento++) {
    const fila = await leerFila(admin, studioId);
    const baseActual = sanearFavicon(resolveTheme(fila?.config_draft ?? fila?.config_published ?? null), studioId);
    const fusionado: ThemeConfig = { ...baseActual, ...validado };
    if (await escribirSiNoHaCambiado(admin, studioId, fila, { config_draft: fusionado })) return fusionado;
  }
  throw new ConflictoTheme();
}

// Bucket público donde vive el favicon (mismo que logo/avatares, ver
// lib/portal-storage.ts). El editor sube/borra SIEMPRE contra el path de
// BORRADOR (`favicon-borrador-<studioId>`) — nunca toca el publicado
// directamente (I-6): sin esto, cambiar el favicon mientras se edita ya lo
// cambiaba en producción, saltándose "Publicar" por completo.
const AVATARS_BUCKET = 'avatars';

/**
 * Copia el favicon de BORRADOR (`favicon-borrador-<studioId>`) al path
 * PUBLICADO (`favicon-<studioId>`) al publicar el tema. Devuelve la URL pública
 * final (con cache-bust) para dejarla en `config_published.faviconUrl`, o null.
 * Best-effort: si falla, el tema se publica igual (mismo criterio que ya usa
 * el resto de subidas de marca — no bloquear una publicación por el storage).
 * Quitarlo NO borra aquí: ver `retirarFaviconPublicado`.
 */
async function publicarFavicon(admin: Admin, studioId: string, faviconBorradorUrl: string | null): Promise<string | null> {
  if (!faviconBorradorUrl) return null;
  // Un favicon ya publicado, o el logo, sale tal cual: copiar el archivo de
  // borrador en su lugar publicaría otra imagen.
  if (!esFaviconDeBorrador(faviconBorradorUrl, studioId)) return faviconBorradorUrl;
  const pathBorrador = `favicon-borrador-${studioId}`;
  const pathPublicado = `favicon-${studioId}`;
  const { error } = await admin.storage.from(AVATARS_BUCKET).copy(pathBorrador, pathPublicado);
  if (error) return faviconBorradorUrl; // best-effort: deja la URL de borrador antes que perder la referencia
  const { data } = admin.storage.from(AVATARS_BUCKET).getPublicUrl(pathPublicado);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** La copia se hace UNA vez por petición aunque la escritura se reintente. */
function publicadorDeFavicon(admin: Admin, studioId: string) {
  const hechas = new Map<string | null, Promise<string | null>>();
  return (url: string | null): Promise<string | null> => {
    let copia = hechas.get(url);
    if (!copia) {
      copia = publicarFavicon(admin, studioId, url);
      hechas.set(url, copia);
    }
    return copia;
  };
}

/**
 * Borra el fichero publicado DESPUÉS de dejar escrita la fila sin favicon.
 * Antes se borraba primero, y si la escritura fallaba lo publicado apuntaba a
 * un fichero que ya no existía. Si lo que falla es este borrado queda un
 * fichero huérfano que nadie enseña, que es mucho mejor que un icono roto.
 */
async function retirarFaviconPublicado(admin: Admin, studioId: string): Promise<void> {
  const { error } = await admin.storage.from(AVATARS_BUCKET).remove([`favicon-${studioId}`]);
  if (error) console.error('[theme:retirar-favicon]', error.message);
}

export type ResultadoPublicacion =
  | { ok: true; theme: ThemeConfig }
  | { ok: false; errores: ErrorContraste[] };

/**
 * Publica el borrador: copia `config_draft` → `config_published`. El gate de
 * contraste WCAG se aplica AQUÍ, sobre el borrador que se va a escribir (no
 * sobre una lectura anterior del route handler, que otra pestaña podía dejar
 * vieja). El favicon no entra en ese chequeo, así que sustituir su URL por la
 * publicada después no cambia el veredicto (lo fija un test de theme-runtime).
 */
export async function publicarTheme(studioId: string): Promise<ResultadoPublicacion> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('THEME_SIN_ADMIN');
  const favicon = publicadorDeFavicon(admin, studioId);

  for (let intento = 0; intento < INTENTOS_ESCRITURA; intento++) {
    const fila = await leerFila(admin, studioId);
    const borrador = sanearFavicon(resolveTheme(fila?.config_draft ?? null), studioId);
    const contraste = validarContrasteTheme(borrador);
    if (!contraste.ok) return { ok: false, errores: contraste.errores };

    const publicado: ThemeConfig = { ...borrador, faviconUrl: await favicon(borrador.faviconUrl) };
    const escrito = await escribirSiNoHaCambiado(admin, studioId, fila, {
      config_draft: publicado,
      config_published: publicado,
      publicado_en: new Date().toISOString(),
    });
    if (!escrito) continue;
    if (!publicado.faviconUrl) await retirarFaviconPublicado(admin, studioId);
    // El tema publicado viaja dentro del catálogo público cacheado: sin esto,
    // publicar deja la base de datos correcta y el portal sirviendo el tema
    // anterior hasta un minuto. Ver `invalidarCatalogoPublico`.
    invalidarCatalogoPublico(studioId);
    return { ok: true, theme: publicado };
  }
  throw new ConflictoTheme();
}

/**
 * Publica SOLO unos campos (el color, el favicon) encima de lo PUBLICADO y deja
 * ese mismo cambio en el borrador, sin tocar nada más de él. Lo usa
 * Configuración › Marca: publicar el borrador entero sacaría a producción lo que
 * el editor del portal dejara a medias, y reescribir el borrador desde lo
 * publicado borraba el favicon pendiente. El contraste se comprueba aquí, sobre
 * lo que se va a publicar, fusionado desde la misma lectura que se escribe.
 */
export async function publicarCamposTheme(studioId: string, campos: CamposPublicables): Promise<ResultadoPublicacion> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('THEME_SIN_ADMIN');
  if (!faviconPermitido(campos.faviconUrl, studioId)) throw new Error('THEME_FAVICON_AJENO');
  const favicon = publicadorDeFavicon(admin, studioId);

  for (let intento = 0; intento < INTENTOS_ESCRITURA; intento++) {
    const fila = await leerFila(admin, studioId);
    const publicadoActual = fila?.config_published
      ? sanearFavicon(resolveTheme(fila.config_published), studioId)
      : await themeDesdePreset(admin, studioId);
    const borradorActual = fila?.config_draft
      ? sanearFavicon(resolveTheme(fila.config_draft), studioId)
      : publicadoActual;

    const contraste = validarContrasteTheme(fusionarCampos(publicadoActual, borradorActual, campos).publicado);
    if (!contraste.ok) return { ok: false, errores: contraste.errores };

    const cambios: Partial<ThemeConfig> = { ...campos };
    if (campos.faviconUrl !== undefined) cambios.faviconUrl = await favicon(campos.faviconUrl);
    const { publicado, borrador } = fusionarCampos(publicadoActual, borradorActual, cambios);

    const escrito = await escribirSiNoHaCambiado(admin, studioId, fila, {
      config_draft: borrador,
      config_published: publicado,
      publicado_en: new Date().toISOString(),
    });
    if (!escrito) continue;
    if (campos.faviconUrl === null) await retirarFaviconPublicado(admin, studioId);
    invalidarCatalogoPublico(studioId);
    return { ok: true, theme: publicado };
  }
  throw new ConflictoTheme();
}

/**
 * Pone `url` como favicon, publicado y en el borrador, SOLO si el estudio aún no
 * tiene uno. Lo usa el asistente de bienvenida con el logo recién subido:
 * elegir un favicon a mano gana siempre. Sin fila parte del preset viejo del
 * estudio y no de un tema vacío, para no cambiarle los colores del portal por
 * poner un favicon. Un logo que no sea un fichero de nuestro Storage no vale
 * como favicon y se salta. Devuelve si lo ha puesto.
 */
export async function ponerFaviconSiNoHay(studioId: string, url: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('THEME_SIN_ADMIN');
  if (!faviconPermitido(url, studioId)) return false;

  for (let intento = 0; intento < INTENTOS_ESCRITURA; intento++) {
    const fila = await leerFila(admin, studioId);
    const publicado = fila?.config_published
      ? sanearFavicon(resolveTheme(fila.config_published), studioId)
      : await themeDesdePreset(admin, studioId);
    if (publicado.faviconUrl) return false;
    const borrador = fila?.config_draft
      ? sanearFavicon(resolveTheme(fila.config_draft), studioId)
      : publicado;
    const escrito = await escribirSiNoHaCambiado(admin, studioId, fila, {
      config_draft: { ...borrador, faviconUrl: url },
      config_published: { ...publicado, faviconUrl: url },
    });
    if (escrito) return true;
  }
  throw new ConflictoTheme();
}
