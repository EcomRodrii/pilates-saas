// La franja «Estudios que ya usan Tentare» de la home: QUÉ estudios salen. Pura y
// sin red, para probarla con `node --test`; la consulta y la caché viven en
// `logos-clientes-servidor.ts`.
//
// Decisión del fundador (19-oct-2026, tras mirar a Bsport, Momence y Mariana Tek):
// la franja enseña los logos de estudios clientes, pero NO «todos los que han
// subido un logo». Entre ellos hay la demo del propio equipo, estudios de prueba
// y estudios casi vacíos: presumir de «clientes» que no lo son es prueba social
// falsa, y usar la marca de un cliente en publicidad sin que lo sepa es un riesgo.
// Por eso sale solo quien tiene `mostrar_logo_en_landing = true` (consentimiento,
// apagado de serie, lo pone el equipo de Tentare por SQL: nunca el navegador) y,
// además, cumple lo de aquí abajo. Cada condición se repite en la consulta SQL y
// otra vez aquí: si una de las dos capas se rompe, la otra aguanta.

/** Cuántos logos como máximo. Más de doce deja de ser «una franja» y empieza a ser un muro. */
export const MAX_LOGOS = 12;

/** Con este número o más, la franja pasa de fila centrada a marquesina. */
export const LOGOS_PARA_MARQUESINA = 7;

/** Estados de suscripción de un estudio que de verdad usa Tentare hoy. */
export const ESTADOS_VIVOS = ['active', 'trialing', 'gratis'] as const;

/** Lo que Supabase Storage sirve del bucket donde los estudios suben su logo. */
const PREFIJO_BUCKET_LOGOS = '/storage/v1/object/public/avatars/';

export interface FilaLogoEstudio {
  nombre: string | null;
  logo_url: string | null;
  es_demo: boolean | null;
  subscription_status: string | null;
  mostrar_logo_en_landing: boolean | null;
  creado_en: string | null;
}

export interface LogoCliente {
  nombre: string;
  logoUrl: string;
}

/** Host (con puerto, si lo hay) de `NEXT_PUBLIC_SUPABASE_URL`, o null si no es una URL https válida. */
export function hostDeSupabase(urlProyecto: string | undefined | null): string | null {
  if (!urlProyecto) return null;
  try {
    const u = new URL(urlProyecto);
    return u.protocol === 'https:' ? u.host : null;
  } catch {
    return null;
  }
}

/**
 * ¿Es una URL que podemos pintar sin miedo? https, del host de NUESTRO proyecto de
 * Supabase y del bucket público de logos. Nada de URLs arbitrarias: este campo lo
 * escribe el navegador de la propietaria (`logo_url` está en su whitelist de UPDATE)
 * y la landing es lo más público que tenemos.
 */
export function logoUrlValida(url: string | null | undefined, hostPermitido: string | null): boolean {
  if (!url || !hostPermitido) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === 'https:'
    && u.host === hostPermitido
    && u.username === ''
    && u.password === ''
    && u.pathname.startsWith(PREFIJO_BUCKET_LOGOS)
    && u.pathname.length > PREFIJO_BUCKET_LOGOS.length;
}

function nombreLimpio(nombre: string | null): string | null {
  const n = (nombre ?? '').replace(/\s+/g, ' ').trim();
  return n.length > 0 && n.length <= 80 ? n : null;
}

/**
 * Filtra, ordena por antigüedad (el estudio más antiguo primero) y recorta a
 * `MAX_LOGOS`. Una fila que no pasa cualquiera de las condiciones no sale, y una
 * fila inválida no gasta un hueco de los doce.
 */
export function seleccionarLogos(filas: readonly FilaLogoEstudio[], hostPermitido: string | null): LogoCliente[] {
  const vivos: readonly string[] = ESTADOS_VIVOS;
  const candidatas = filas
    .filter((f) => f.mostrar_logo_en_landing === true)
    .filter((f) => f.es_demo === false)
    .filter((f) => f.subscription_status !== null && vivos.includes(f.subscription_status))
    .filter((f) => logoUrlValida(f.logo_url, hostPermitido))
    .map((f) => ({ f, nombre: nombreLimpio(f.nombre) }))
    .filter((c): c is { f: FilaLogoEstudio; nombre: string } => c.nombre !== null);

  // Orden estable por `creado_en` (sin fecha, al final) y, a igualdad, por nombre.
  candidatas.sort((a, b) => {
    const ta = a.f.creado_en ? Date.parse(a.f.creado_en) : Number.POSITIVE_INFINITY;
    const tb = b.f.creado_en ? Date.parse(b.f.creado_en) : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  const vistos = new Set<string>();
  const logos: LogoCliente[] = [];
  for (const { f, nombre } of candidatas) {
    const logoUrl = f.logo_url as string;
    // Dos fichas con el mismo archivo (la misma marca dos veces) cuentan como una.
    if (vistos.has(logoUrl)) continue;
    vistos.add(logoUrl);
    logos.push({ nombre, logoUrl });
    if (logos.length >= MAX_LOGOS) break;
  }
  return logos;
}

/**
 * ¿Marquesina (true) o fila (false)? Desde el 20-oct-2026, SIEMPRE marquesina en cuanto hay
 * un logo (decisión del fundador: «que se vayan desplazando como en Mariana Tek; puedes
 * repetirlos»). Con pocos logos, las copias repiten los mismos hasta cubrir la franja.
 * Con `prefers-reduced-motion`, el CSS la para y la deja en una fila quieta.
 */
export function usaMarquesina(cuantos: number): boolean {
  return cuantos >= 1;
}
