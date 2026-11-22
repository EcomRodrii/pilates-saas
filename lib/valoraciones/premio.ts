// ─────────────────────────────────────────────────────────────────────────────
// Reseñas con premio (21-nov-2026): lo PURO — validar los ajustes del estudio,
// leer la respuesta de la función SQL y decir el premio con palabras. Sin
// imports ni `@/` (ver reglas.ts): `node --test` no resuelve ese alias.
//
// ⚠️ El premio es por la valoración INTERNA (la de `valoraciones`, solo de quien
// asistió), NUNCA por la reseña externa, y NO depende de la nota. El enlace de
// reseñas se ofrece a TODAS, sin mencionar el premio. Razones (migración
// 20261122004106): no se puede saber si alguien dejó una reseña en Google, Google
// prohíbe incentivarlas y filtrar a quién se le piden, y la normativa de consumo
// obliga a declarar las incentivadas. `premio-contrato.test.ts` lo vigila.
// ─────────────────────────────────────────────────────────────────────────────

/** Prefijo de los códigos de premio: los distingue del catálogo que crea una persona. */
export const PREFIJO_CODIGO_PREMIO_RESENA = 'GRACIAS-';

export type TipoPremio = 'PORCENTAJE' | 'IMPORTE_FIJO';

/** Los mismos topes que los CHECK de `studios` (migración): aquí se dicen antes de llegar a la base. */
export const LIMITES_PREMIO = {
  PORCENTAJE: { min: 1, max: 50 },
  IMPORTE_FIJO: { min: 1, max: 200 },
  dias: { min: 7, max: 365, porDefecto: 30 },
} as const;

export interface AjustesResenas {
  /** https, o `null` si el estudio no ha puesto ninguno. */
  enlace: string | null;
  premioTipo: TipoPremio | null;
  premioValor: number | null;
  /** Cuántos días vale el código desde que se regala. */
  premioDias: number;
}

export interface PremioResena {
  codigo: string;
  tipo: TipoPremio;
  valor: number;
  /** 'YYYY-MM-DD' (día del estudio) o null. */
  expira: string | null;
  /** Activo, sin caducar y sin usar: lo calcula la base con el «hoy» de Madrid. */
  vigente: boolean;
  canjeado: boolean;
  /** `true` solo en la llamada que lo ha creado. */
  nuevo: boolean;
}

export function esCodigoDePremioResena(codigo: { codigo: string }): boolean {
  return codigo.codigo.trim().toUpperCase().startsWith(PREFIJO_CODIGO_PREMIO_RESENA);
}

/**
 * ¿Es un enlace que se puede pintar como `href` en la app de una alumna?
 * https, sin espacios, sin usuario ni contraseña (`https://google.com@otro.sitio`
 * lleva a otro sitio), con un dominio de verdad y de 500 caracteres como mucho.
 */
export function esEnlaceDeResenasValido(url: string): boolean {
  if (url.length > 500 || /\s/.test(url) || !url.startsWith('https://')) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.');
  } catch {
    return false;
  }
}

export type ResultadoAjustes = { ok: true; ajustes: AjustesResenas } | { ok: false; error: string };

/**
 * Lo que llega del navegador → lo que se guarda. Todo lo dudoso se rechaza con
 * un mensaje que el estudio entienda (la base lo vuelve a exigir con CHECK).
 */
export function validarAjustesResenas(entrada: unknown): ResultadoAjustes {
  if (!entrada || typeof entrada !== 'object') return { ok: false, error: 'Faltan los ajustes.' };
  const { enlace, premio } = entrada as { enlace?: unknown; premio?: unknown };

  let enlaceFinal: string | null = null;
  if (enlace != null && enlace !== '') {
    if (typeof enlace !== 'string') return { ok: false, error: 'El enlace no es válido.' };
    const limpio = enlace.trim();
    if (limpio) {
      if (!esEnlaceDeResenasValido(limpio)) {
        return { ok: false, error: 'El enlace tiene que empezar por https:// y ser la dirección de tu página de reseñas.' };
      }
      enlaceFinal = limpio;
    }
  }

  if (premio == null) {
    return { ok: true, ajustes: { enlace: enlaceFinal, premioTipo: null, premioValor: null, premioDias: LIMITES_PREMIO.dias.porDefecto } };
  }
  if (typeof premio !== 'object') return { ok: false, error: 'El premio no es válido.' };
  const { tipo, valor, dias } = premio as { tipo?: unknown; valor?: unknown; dias?: unknown };
  if (tipo !== 'PORCENTAJE' && tipo !== 'IMPORTE_FIJO') return { ok: false, error: 'Elige si el premio es un porcentaje o un importe.' };
  const v = typeof valor === 'number' ? valor : Number.NaN;
  const lim = LIMITES_PREMIO[tipo];
  if (!Number.isFinite(v) || v < lim.min || v > lim.max) {
    return {
      ok: false,
      error: tipo === 'PORCENTAJE'
        ? `El descuento va del ${lim.min} % al ${lim.max} %.`
        : `El importe va de ${lim.min} € a ${lim.max} €.`,
    };
  }
  // Céntimos como mucho: un 12,345 € no se puede cobrar ni enseñar.
  if (Math.abs(Math.round(v * 100) - v * 100) > 1e-6) {
    return { ok: false, error: 'Usa como mucho dos decimales.' };
  }
  const d = dias == null ? LIMITES_PREMIO.dias.porDefecto : typeof dias === 'number' ? dias : Number.NaN;
  if (!Number.isInteger(d) || d < LIMITES_PREMIO.dias.min || d > LIMITES_PREMIO.dias.max) {
    return { ok: false, error: `El código vale entre ${LIMITES_PREMIO.dias.min} y ${LIMITES_PREMIO.dias.max} días.` };
  }
  return { ok: true, ajustes: { enlace: enlaceFinal, premioTipo: tipo, premioValor: v, premioDias: d } };
}

/** La respuesta de `otorgar_premio_resena` (jsonb), o `null` si no es un premio entero. */
export function leerPremio(crudo: unknown): PremioResena | null {
  if (!crudo || typeof crudo !== 'object') return null;
  const r = crudo as Record<string, unknown>;
  if (typeof r.codigo !== 'string' || !r.codigo) return null;
  if (r.tipo !== 'PORCENTAJE' && r.tipo !== 'IMPORTE_FIJO') return null;
  const valor = Number(r.valor);
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return {
    codigo: r.codigo,
    tipo: r.tipo,
    valor,
    expira: typeof r.expira === 'string' ? r.expira : null,
    vigente: r.vigente === true,
    canjeado: r.canjeado === true,
    nuevo: r.nuevo === true,
  };
}

const num = (n: number) => String(n).replace('.', ',');

/** «10 % de descuento» / «15 € de descuento». */
export function textoDelPremio(p: Pick<PremioResena, 'tipo' | 'valor'>): string {
  return p.tipo === 'PORCENTAJE' ? `${num(p.valor)} % de descuento` : `${num(p.valor)} € de descuento`;
}

/** 'YYYY-MM-DD' → «19 de diciembre de 2026». Sin pasar por `Date` local: el día es el del estudio. */
export function diaLargo(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(m[3])} de ${meses[Number(m[2]) - 1] ?? ''} de ${m[1]}`;
}

/** Lo que dice la fila de Configuración: cómo está de un vistazo. */
export function resumenResenas(a: Pick<AjustesResenas, 'enlace' | 'premioTipo' | 'premioValor'>): string {
  const enlace = a.enlace ? 'Enlace puesto' : 'Sin enlace';
  const premio = a.premioTipo && a.premioValor != null ? `premio de ${textoDelPremio({ tipo: a.premioTipo, valor: a.premioValor })}` : 'sin premio';
  return `${enlace} · ${premio}`;
}

/** Lo que ha pasado en los últimos 30 días: cuántas piden, cuántas valoran y cuántas pinchan. */
export interface EmbudoResenas {
  /** Valoraciones de clase recibidas. */
  valoraciones: number;
  /** Clientas a las que se les ha enseñado el enlace de reseñas. */
  mostrados: number;
  /** Toques en el enlace desde el botón de la app y desde el QR. No es lo mismo que reseñas publicadas: eso Google no lo dice. */
  clicsApp: number;
  clicsQr: number;
}

export interface RespuestaResenas {
  ajustes: AjustesResenas;
  regalados: number;
  canjeados: number;
  /** El slug del estudio: con él se arma el enlace del cartel con QR. */
  slug: string | null;
  embudo: EmbudoResenas;
}

const cuenta = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);

/**
 * La respuesta de `/api/estudio/resenas`, o `null` si no tiene la forma esperada. Nada
 * de dar por hecha la forma de una respuesta de API: un `{}` (un mock, un proxy, una
 * versión vieja del servidor) no puede romper la pantalla de Configuración.
 */
export function leerRespuestaResenas(crudo: unknown): RespuestaResenas | null {
  if (!crudo || typeof crudo !== 'object') return null;
  const { ajustes, regalados, canjeados, slug, embudo } = crudo as { ajustes?: unknown; regalados?: unknown; canjeados?: unknown; slug?: unknown; embudo?: unknown };
  if (!ajustes || typeof ajustes !== 'object') return null;
  const a = ajustes as Record<string, unknown>;
  const tipo = a.premioTipo === 'PORCENTAJE' || a.premioTipo === 'IMPORTE_FIJO' ? a.premioTipo : null;
  const valor = tipo && typeof a.premioValor === 'number' && Number.isFinite(a.premioValor) ? a.premioValor : null;
  const dias = typeof a.premioDias === 'number' && Number.isInteger(a.premioDias) ? a.premioDias : LIMITES_PREMIO.dias.porDefecto;
  return {
    ajustes: {
      enlace: typeof a.enlace === 'string' && a.enlace.startsWith('https://') ? a.enlace : null,
      // Un tipo sin valor (o al revés) no es un premio: se lee como «sin premio».
      premioTipo: valor == null ? null : tipo,
      premioValor: tipo ? valor : null,
      premioDias: dias,
    },
    regalados: cuenta(regalados),
    canjeados: cuenta(canjeados),
    slug: typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug) ? slug : null,
    embudo: {
      valoraciones: cuenta((embudo as Record<string, unknown> | null | undefined)?.valoraciones),
      mostrados: cuenta((embudo as Record<string, unknown> | null | undefined)?.mostrados),
      clicsApp: cuenta((embudo as Record<string, unknown> | null | undefined)?.clicsApp),
      clicsQr: cuenta((embudo as Record<string, unknown> | null | undefined)?.clicsQr),
    },
  };
}

/**
 * La ruta con seguimiento que se le pinta a la alumna (`/resena/<slug>?o=app`). Solo se
 * acepta una ruta DE ESTA MISMA APP con esa forma: nunca una URL entera, aunque el
 * servidor la mande (el destino real lo guarda el estudio y lo resuelve `/resena/…`).
 */
export function esRutaDeResenas(ruta: unknown): ruta is string {
  return typeof ruta === 'string' && /^\/resena\/[a-z0-9][a-z0-9-]{0,79}(\?o=app)?$/.test(ruta);
}
