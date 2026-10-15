// «Pedir mi app»: la app de la App Store con el nombre y el icono del estudio
// (Apariencia de tu app). Lógica pura, sin imports de `@/`: la usan la ruta del
// estudio, la cola de /interno y la pantalla, y `node --test` la ejecuta.
//
// ⚠️ Nada de esto promete plazos ni avisos: Apple decide cuándo revisa, y esta fase
// no manda ningún aviso al estudio (lo ve al volver al panel).

export const ESTADOS_APP = ['PEDIDA', 'EN_PREPARACION', 'EN_PRUEBAS', 'EN_REVISION', 'PUBLICADA', 'PAUSADA'] as const;
export type EstadoApp = (typeof ESTADOS_APP)[number];

export const esEstadoApp = (v: unknown): v is EstadoApp => typeof v === 'string' && (ESTADOS_APP as readonly string[]).includes(v);

/** Lo mismo que `identidad-app.ts` y la restricción `apps_estudio_nombre`: el nombre bajo el icono. */
export function validarNombreApp(entrada: unknown): { ok: true; nombre: string } | { ok: false; error: string } {
  if (typeof entrada !== 'string') return { ok: false, error: 'Escribe el nombre de tu app.' };
  const nombre = entrada.trim().replace(/\s+/g, ' ');
  if (!nombre) return { ok: false, error: 'Escribe el nombre de tu app.' };
  if (letras(nombre) > 30) return { ok: false, error: 'El nombre de la app no puede pasar de 30 letras.' };
  if (CARACTER_NO_ADMITIDO.test(nombre)) return { ok: false, error: 'El nombre tiene un carácter que Apple no admite.' };
  return { ok: true, nombre };
}

/**
 * Lo que Apple no admite en el nombre y lo que no se ve pero cambia cómo se lee: controles, `$`, `//`,
 * caracteres invisibles o de dirección del texto (\p{Cf}: U+200B, U+202E…) y separadores de línea.
 */
const CARACTER_NO_ADMITIDO = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}$]|\/\//u;

/** Letras como las cuenta una persona: un emoji es una, no dos. */
const letras = (t: string): number => [...t].length;

/** El nombre del estudio, ya válido como nombre de app (recortado a 30 y sin caracteres raros). */
export function nombreSugerido(nombreEstudio: string): string {
  const limpio = nombreEstudio.replace(new RegExp(CARACTER_NO_ADMITIDO.source, 'gu'), '').trim().replace(/\s+/g, ' ');
  // Cortar por letras, nunca por unidades de código: partir un emoji deja un nombre inválido.
  return [...limpio].slice(0, 30).join('').trim() || 'Mi estudio';
}

/**
 * Cuántas letras caben bajo el icono de iOS antes de que lo recorte con «…». Es un aviso, no un
 * límite: el nombre puede llegar a 30 (Apple), pero en la pantalla de inicio se ve más corto.
 */
export const LETRAS_BAJO_EL_ICONO = 12;

/**
 * El bundle id de la app de un estudio a partir de su slug: `app.tentare.<slug>`. `intento` >1 añade
 * un sufijo (`-2`) si el anterior ya estaba cogido. `null` si el slug no da un identificador válido.
 */
export function bundleDeSlug(slug: string, intento = 1): string | null {
  const base = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
  if (!base) return null;
  const id = `app.tentare.${base}${intento > 1 ? `-${intento}` : ''}`;
  // Nunca el de un hueco del lote: esos solo los reparte `asignar_cupo_app`.
  if (esCupo(id)) return null;
  return id.length <= 155 && /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(id) ? id : null;
}

/**
 * En qué orden se intentan los identificadores al pedir la app: primero el HUECO del lote (la app ya
 * existe en App Store Connect y solo hay que ponerle nombre), y si no queda ninguno —o el lote aún no
 * está en esta base—, los sacados del slug (`app.tentare.<slug>`, `-2`…), que exigen crear la app a mano.
 * Sin repetidos y sin nulos.
 */
export function bundlesCandidatos(cupo: string | null, slug: string, intentosSlug = 5): string[] {
  const del = Array.from({ length: intentosSlug }, (_, i) => bundleDeSlug(slug, i + 1));
  return [...new Set([cupo, ...del].filter((b): b is string => typeof b === 'string' && b.length > 0))];
}

/** ¿Es un hueco del lote? (`app.tentare.cupo-NNN`) */
export const esCupo = (bundle: string): boolean => /^app\.tentare\.cupo-[0-9]{3}$/.test(bundle);

export function urlTiendaValida(u: unknown): u is string {
  // La ficha de una app: https://apps.apple.com/<país>/app/<nombre>/id<número> (o sin nombre).
  return typeof u === 'string' && u.length <= 300
    && /^https:\/\/apps\.apple\.com\/(?:[a-z]{2}\/)?app\/(?:[^\s/?#]+\/)?id[0-9]{6,12}(?:\?[^\s#]*)?$/.test(u);
}

/** El id numérico de la app en la App Store (para el aviso de Safari), sacado de su enlace. */
export function idDeTienda(u: string | null | undefined): string | null {
  return (u && urlTiendaValida(u) && u.match(/\/id([0-9]{6,12})/)?.[1]) || null;
}

/**
 * Por qué un estudio NO puede pedir su app ahora (o `null` si puede). Decisión del fundador
 * (15-oct-2026): solo con Estudio o Cadena PAGADO —ni en la prueba ni con un cobro pendiente—, y en una
 * cadena hay UNA app, que se pide desde su sede principal.
 *  · `planIncluye`: el PLAN la trae (`PLAN_ENTITLEMENTS[...].features.appPropia`), sin mirar si paga.
 */
export type BloqueoPedirApp = 'plan' | 'prueba' | 'cobro' | 'sin-plan' | 'sede';

export function bloqueoParaPedir(e: { planIncluye: boolean; estado: string | null; esSedeSecundaria: boolean }): BloqueoPedirApp | null {
  if (!e.planIncluye) return 'plan';
  if (e.estado === 'trialing') return 'prueba';
  if (e.estado === 'past_due' || e.estado === 'unpaid' || e.estado === 'incomplete') return 'cobro';
  if (e.estado !== 'active') return 'sin-plan';
  if (e.esSedeSecundaria) return 'sede';
  return null;
}

/** Cómo se le cuenta cada estado al estudio. Sin plazos y sin «te avisamos»: no lo prometemos. */
export function textoDeEstado(estado: EstadoApp): { titulo: string; detalle: string } {
  switch (estado) {
    case 'PEDIDA':
      return { titulo: 'Pedida', detalle: 'Hemos recibido tu petición. Vuelve aquí para ver cómo va.' };
    case 'EN_PREPARACION':
      return { titulo: 'En preparación', detalle: 'Estamos preparando tu app: su nombre, su icono y su ficha.' };
    case 'EN_PRUEBAS':
      return { titulo: 'En pruebas', detalle: 'Tu app ya está montada y la estamos probando antes de enviarla a Apple.' };
    case 'EN_REVISION':
      return { titulo: 'En revisión de Apple', detalle: 'Apple la está revisando. Ese plazo no lo controlamos, y puede pedir cambios.' };
    case 'PUBLICADA':
      return { titulo: 'Publicada', detalle: 'Tu app ya está en la App Store.' };
    case 'PAUSADA':
      return { titulo: 'En pausa', detalle: 'Tu app está en pausa. Escríbenos si quieres retomarla.' };
  }
}

/** Lo que el panel sabe de la app de su estudio (nunca el bundle crudo de otros ni notas internas). */
export interface AppDelEstudio {
  estado: EstadoApp;
  nombreApp: string;
  bundleId: string;
  urlTienda: string | null;
  pedidaEn: string | null;
}
